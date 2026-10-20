import { allNamed, childNamed } from '../preprocess/xml-utils';
import { escapeAttr, escapeHtml } from './html';
import { detectLostInline } from './lost';
import type { ConverterContext, DocxPackage, ImageConverter, ReaderOptions } from './types';
import { emuToPx, ptToPx } from './units-blocks';

/**
 * Conversion des dessins Word en `<img>` : `w:drawing` (`wp:inline` et `wp:anchor`,
 * image `a:blip r:embed`) et `w:pict` (VML `v:imagedata r:id`). Les octets viennent du
 * paquet via les relations de la partie courante ; sans hook `upload`, ils deviennent une
 * data URL base64. Un dessin sans image (zone de texte, forme, graphique) est délégué à
 * `detectLostInline` et remplacé par son texte.
 */

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

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

/** Longueur CSS d'un `style` VML (`width:72pt`) en pixels entiers. */
function vmlLengthPx(style: string, property: 'width' | 'height'): number | undefined {
  const match = new RegExp(
    `(?:^|;)\\s*${property}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)(pt|px|in|cm|mm)?`,
    'i',
  ).exec(style);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
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

/** Lit un `w:drawing` : image `a:blip`, dimensions `wp:extent`, `wp:docPr`, alignement d'ancre. */
function readDrawing(drawing: Element): ImageSpec | null {
  const blip = allNamed(drawing, 'blip')[0];
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
  if (cx > 0) spec.width = emuToPx(cx);
  if (cy > 0) spec.height = emuToPx(cy);
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
  const width = vmlLengthPx(style, 'width');
  const height = vmlLengthPx(style, 'height');
  if (width && width > 0) spec.width = width;
  if (height && height > 0) spec.height = height;
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
      return url;
    } catch (error) {
      ctx.warnings.push({
        code: 'image-upload-failed',
        message: `Upload de l'image ${String(index)} échoué, repli en base64 : ${describeError(error)}`,
      });
      return bytesToDataUrl(bytes, mime);
    }
  };

  /** Dessin sans image : objet perdu signalé ici, remplacé par son texte éventuel. */
  const lostDrawing = (drawing: Element, ctx: ConverterContext): string => {
    const lost = detectLostInline(drawing, ctx);
    if (!lost) return '';
    const duplicate = ctx.lost.some(
      (entry) =>
        entry.kind === lost.kind &&
        entry.where === lost.where &&
        entry.detail === lost.detail &&
        entry.text === lost.text,
    );
    if (!duplicate) {
      ctx.lost.push(lost);
      ctx.warnings.push({
        code: 'object-lost',
        message: `Objet non représentable ignoré (${lost.kind})${lost.detail ? ` : ${lost.detail}` : ''}.`,
      });
    }
    return lost.text ? escapeHtml(lost.text) : '';
  };

  return {
    async drawing(drawing, ctx) {
      const spec = drawing.localName === 'pict' ? readPict(drawing) : readDrawing(drawing);
      if (!spec) return lostDrawing(drawing, ctx);
      index += 1;
      const rel = (await pkg.rels(ctx.part)).get(spec.relId);
      if (!rel) return skip(ctx, `relation ${spec.relId} introuvable dans ${ctx.part}`);
      if (rel.external) return skip(ctx, `image externe non embarquée (${rel.target})`);
      const extension = extensionOf(rel.target);
      if (UNSUPPORTED_EXTENSIONS.has(extension)) {
        return skip(ctx, `format ${extension} non affichable (${rel.target})`);
      }
      const mime = MIME_BY_EXTENSION.get(extension);
      if (!mime) return skip(ctx, `format inconnu (${rel.target})`);
      const bytes = await pkg.binary(rel.target);
      if (!bytes) return skip(ctx, `partie ${rel.target} absente du paquet`);
      return renderImg(await resolveSrc(bytes, mime, ctx), spec);
    },
  };
}
