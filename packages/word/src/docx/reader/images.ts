import type { DocxLostObject } from '../types.js';
import { allNamed, childNamed } from '../preprocess/xml-utils.js';
import { escapeAttr, escapeHtml } from './html.js';
import { alternateContentChoice, detectLostInline, textboxLost } from './lost.js';
import type { ConverterContext, DocxPackage, ImageConverter, ReaderOptions } from './types.js';
import { emuToPxInt, ptToPx } from './units.js';

/**
 * Conversion des dessins Word en `<img>` : `w:drawing` (`wp:inline` et `wp:anchor`,
 * image `pic:pic/…/a:blip r:embed`), `w:pict` (VML `v:imagedata r:id`) et leur enveloppe
 * `mc:AlternateContent` (contenu du `mc:Choice`). Les octets viennent du paquet via les
 * relations de la partie courante ; sans hook `upload`, ils deviennent une data URL base64.
 * Un dessin sans image (zone de texte, forme, graphique) est délégué à `detectLostInline`
 * et remplacé par son texte ; un dessin qui porte une image **et** une zone de texte rend
 * l'image, puis le texte de la zone, signalée comme perdue.
 */

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Plafond des dimensions écrites sur `<img>` : au-delà, c'est une valeur hostile ou absurde. */
export const MAX_IMAGE_PX = 20000;

/** Schémas d'URL acceptés du hook `upload` (`data:` seulement pour une image). */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'blob']);
const URL_SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** Vrai si la chaîne contient un caractère de contrôle C0 ou DEL. */
function hasControlChar(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * URL de `src` acceptable : `http(s):`, `blob:`, `data:image/…` ou URL relative (sans
 * schéma). Tout autre schéma (`javascript:`, `vbscript:`, `data:text/html`…) ou un
 * caractère de contrôle (que les navigateurs retirent avant d'analyser le schéma) est
 * refusé : défense en profondeur, `word` est le seul producteur de ce HTML.
 */
export function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '' || hasControlChar(trimmed)) return false;
  const scheme = URL_SCHEME.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === undefined) return true;
  if (scheme === 'data') return /^data:image\//i.test(trimmed);
  return SAFE_URL_SCHEMES.has(scheme);
}

/** Dimension en pixels entiers bornée à `MAX_IMAGE_PX`, `undefined` si nulle, négative ou non finie. */
function boundedPx(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(Math.round(value), MAX_IMAGE_PX);
}

/** Types MIME par extension des images que l'éditeur affiche. */
const MIME_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['bmp', 'image/bmp'],
  ['svg', 'image/svg+xml'],
  ['webp', 'image/webp'],
]);

/** Formats que les navigateurs n'affichent pas : image ignorée avec avertissement. */
const UNSUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['emf', 'wmf', 'tif', 'tiff']);

const ALIGNMENTS: ReadonlySet<string> = new Set(['left', 'center', 'right']);

/** Attribut `r:…` (espace de noms des relations), avec repli sur le nom préfixé. */
export function relationshipAttribute(element: Element, name: string): string {
  return element.getAttributeNS(R_NS, name) ?? element.getAttribute(`r:${name}`) ?? '';
}

/** Attribut par nom local quel que soit son préfixe (`o:title` VML), `null` si absent. */
function attributeByLocalName(element: Element | null, localName: string): string | null {
  if (!element) return null;
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === localName) return attribute.value;
  }
  return null;
}

function extensionOf(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match?.[1]?.toLowerCase() ?? '';
}

/** Nom de fichier passé au hook `upload` : `image-1.png`, dérivé du type MIME. */
function imageFileName(mime: string, index: number): string {
  const subtype = mime.split('/')[1] ?? 'bin';
  const extension = subtype.split('+')[0] ?? 'bin';
  return `image-${String(index)}.${extension}`;
}

/**
 * Data URL base64 depuis des octets, par morceaux pour ne pas dépasser la taille maximale
 * d'arguments de `String.fromCharCode`. `btoa` et non `Buffer` : le lecteur tourne dans
 * le navigateur.
 */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Longueur CSS d'un `style` VML (`width:72pt`) en pixels entiers ; l'exposant (`1e9pt`) est lu. */
function vmlLengthPx(style: string, property: 'width' | 'height'): number | undefined {
  const match = new RegExp(
    `(?:^|;)\\s*${property}\\s*:\\s*(-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)(pt|px|in|cm|mm)?`,
    'i',
  ).exec(style);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  switch ((match[2] ?? 'pt').toLowerCase()) {
    case 'px':
      return Math.round(value);
    case 'in':
      return Math.round(value * 96);
    case 'cm':
      return Math.round((value / 2.54) * 96);
    case 'mm':
      return Math.round((value / 25.4) * 96);
    default:
      return ptToPx(value);
  }
}

interface ImageSpec {
  readonly relId: string;
  readonly width?: number;
  readonly height?: number;
  readonly alt: string;
  readonly title?: string;
  readonly align?: string;
}

/**
 * Lit un `w:drawing` : image `pic:pic/pic:blipFill/a:blip` (un `a:blip` ailleurs est le
 * fond d'une forme, pas une image), dimensions `wp:extent`, `wp:docPr`, alignement d'ancre.
 */
function readDrawing(drawing: Element): ImageSpec | null {
  const pic = allNamed(drawing, 'pic')[0];
  const blip = pic ? allNamed(pic, 'blip')[0] : undefined;
  if (!blip) return null;
  const relId = relationshipAttribute(blip, 'embed');
  if (!relId) return null;
  const container = childNamed(drawing, 'anchor') ?? childNamed(drawing, 'inline') ?? drawing;
  const extent = childNamed(container, 'extent');
  const cx = Number(extent?.getAttribute('cx') ?? '');
  const cy = Number(extent?.getAttribute('cy') ?? '');
  const docPr = childNamed(container, 'docPr');
  const spec: { -readonly [K in keyof ImageSpec]: ImageSpec[K] } = {
    relId,
    alt: docPr?.getAttribute('descr') ?? '',
  };
  const width = boundedPx(cx > 0 ? emuToPxInt(cx) : undefined);
  const height = boundedPx(cy > 0 ? emuToPxInt(cy) : undefined);
  if (width !== undefined) spec.width = width;
  if (height !== undefined) spec.height = height;
  const title = docPr?.getAttribute('title');
  if (title) spec.title = title;
  if (container.localName === 'anchor') {
    const positionH = childNamed(container, 'positionH');
    const align = positionH ? childNamed(positionH, 'align')?.textContent?.trim() : undefined;
    if (align && ALIGNMENTS.has(align)) spec.align = align;
  }
  return spec;
}

/** Lit un `w:pict` VML : `v:imagedata r:id`, dimensions du `style` de la forme. */
function readPict(pict: Element): ImageSpec | null {
  const imagedata = allNamed(pict, 'imagedata')[0];
  if (!imagedata) return null;
  const relId = relationshipAttribute(imagedata, 'id');
  if (!relId) return null;
  const shape = imagedata.parentElement;
  const style = shape?.getAttribute('style') ?? '';
  const spec: { -readonly [K in keyof ImageSpec]: ImageSpec[K] } = {
    relId,
    alt: attributeByLocalName(imagedata, 'title') ?? attributeByLocalName(shape, 'alt') ?? '',
  };
  const width = boundedPx(vmlLengthPx(style, 'width'));
  const height = boundedPx(vmlLengthPx(style, 'height'));
  if (width !== undefined) spec.width = width;
  if (height !== undefined) spec.height = height;
  return spec;
}

function renderImg(src: string, spec: ImageSpec): string {
  const attrs = [`src="${escapeAttr(src)}"`, `alt="${escapeAttr(spec.alt)}"`];
  if (spec.title) attrs.push(`title="${escapeAttr(spec.title)}"`);
  if (spec.width) attrs.push(`width="${String(spec.width)}"`);
  if (spec.height) attrs.push(`height="${String(spec.height)}"`);
  if (spec.align) attrs.push(`data-align="${spec.align}"`);
  return `<img ${attrs.join(' ')}>`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fabrique le convertisseur d'images du document. Même contrat que le chemin mammoth :
 * avec `upload`, un `File` est construit depuis les octets et l'URL retournée devient
 * `src` ; en cas d'échec (rejet, valeur non chaîne, vide) on avertit
 * (`image-upload-failed`) et on replie en base64. Les formats non affichables (`emf`,
 * `wmf`, `tiff`) et les images introuvables sont ignorés avec `image-skipped`.
 */
export function createImageConverter(pkg: DocxPackage, options: ReaderOptions): ImageConverter {
  let index = 0;

  const skip = (ctx: ConverterContext, reason: string): string => {
    ctx.warnings.push({ code: 'image-skipped', message: `Image ignorée : ${reason}.` });
    return '';
  };

  const resolveSrc = async (
    bytes: Uint8Array,
    mime: string,
    ctx: ConverterContext,
  ): Promise<string> => {
    const { upload } = options;
    if (!upload) return bytesToDataUrl(bytes, mime);
    try {
      // `slice()` donne une vue sur un `ArrayBuffer` propre, ce que `File` exige (pas de `SharedArrayBuffer`).
      const file = new File([bytes.slice()], imageFileName(mime, index), { type: mime });
      // Typé `unknown` : un hook JavaScript peut résoudre n'importe quoi malgré la signature.
      const url: unknown = await upload(file);
      if (typeof url !== 'string' || url.trim() === '') {
        throw new Error("le hook upload n'a pas renvoyé d'URL");
      }
      if (!isSafeImageUrl(url)) {
        throw new Error(`URL refusée (schéma non autorisé) : ${url.trim().slice(0, 40)}`);
      }
      return url.trim();
    } catch (error) {
      ctx.warnings.push({
        code: 'image-upload-failed',
        message: `Upload de l'image ${String(index)} échoué, repli en base64 : ${describeError(error)}`,
      });
      return bytesToDataUrl(bytes, mime);
    }
  };

  /**
   * Signale un objet perdu et rend son texte éventuel. Chaque dessin est signalé : deux
   * formes anonymes ou deux zones de texte au même contenu sont deux pertes (le
   * dédoublonnage ne vaut que pour ce qui est unique par document, dans `lost.ts`).
   */
  const report = (lost: DocxLostObject, ctx: ConverterContext): string => {
    ctx.lost.push(lost);
    ctx.warnings.push({
      code: 'object-lost',
      message: `Objet non représentable ignoré (${lost.kind})${lost.detail ? ` : ${lost.detail}` : ''}.`,
    });
    return lost.text ? escapeHtml(lost.text) : '';
  };

  /** Dessin sans image : objet perdu, remplacé par son texte éventuel. */
  const lostDrawing = (drawing: Element, ctx: ConverterContext): string => {
    const lost = detectLostInline(drawing, ctx);
    return lost ? report(lost, ctx) : '';
  };

  /** Rend l'image du dessin ; une zone de texte qui l'accompagne est signalée et son texte conservé. */
  const convertImage = async (
    drawing: Element,
    spec: ImageSpec,
    ctx: ConverterContext,
  ): Promise<string> => {
    const textbox = textboxLost(drawing, ctx);
    const trailing = textbox ? report(textbox, ctx) : '';
    index += 1;
    const rel = (await pkg.rels(ctx.part)).get(spec.relId);
    if (!rel) return skip(ctx, `relation ${spec.relId} introuvable dans ${ctx.part}`) + trailing;
    if (rel.external) {
      return skip(ctx, `image externe non embarquée (${rel.target})`) + trailing;
    }
    const extension = extensionOf(rel.target);
    if (UNSUPPORTED_EXTENSIONS.has(extension)) {
      return skip(ctx, `format ${extension} non affichable (${rel.target})`) + trailing;
    }
    const mime = MIME_BY_EXTENSION.get(extension);
    if (!mime) return skip(ctx, `format inconnu (${rel.target})`) + trailing;
    const bytes = await pkg.binary(rel.target);
    if (!bytes) return skip(ctx, `partie ${rel.target} absente du paquet`) + trailing;
    return renderImg(await resolveSrc(bytes, mime, ctx), spec) + trailing;
  };

  return {
    async drawing(element, ctx) {
      // `mc:AlternateContent` : on convertit le contenu retenu (`mc:Choice`), jamais les deux.
      const drawing = alternateContentChoice(element) ?? element;
      const spec = drawing.localName === 'pict' ? readPict(drawing) : readDrawing(drawing);
      if (!spec) return lostDrawing(drawing, ctx);
      return convertImage(drawing, spec, ctx);
    },
  };
}
