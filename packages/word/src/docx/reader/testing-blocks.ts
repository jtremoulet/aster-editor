import JSZip from 'jszip';
import { childNamed, wordAttribute } from '../preprocess/xml-utils.js';
import { escapeHtml } from './html.js';
import { createImageConverter } from './images.js';
import { createNumberingResolver, registerListItem, renderBlocks } from './lists.js';
import { alternateContentChoice, detectLost, detectLostInline } from './lost.js';
import { createNoteRegistry } from './notes.js';
import { openPackage } from './package.js';
import { convertTable } from './tables.js';
import type {
  Block,
  ConverterContext,
  DocxPackage,
  HeadingLevel,
  ParagraphBlock,
  ReaderOptions,
  ResolvedParagraphProps,
  StyleResolver,
} from './types.js';
import { numericAttribute, twipsToPt } from './units.js';

/**
 * Harnais de test du lot L25 : fragments XML Word, paquets minimaux et contexte de
 * conversion autonome. Les convertisseurs de paragraphes et de runs sont ici des versions
 * minimales (texte brut, titres, numérotation, retrait, dessins, notes, objets perdus
 * inline) pour que les tests de structure ne dépendent pas des modules de L24.
 * Aucune utilité en production.
 */

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Déclarations d'espaces de noms des fragments de test. */
export const NAMESPACES =
  `xmlns:w="${W_NS}" xmlns:r="${R_NS}" ` +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
  'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"';

export function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.documentElement.localName === 'parsererror') {
    throw new Error(`XML invalide : ${doc.documentElement.textContent ?? ''}`);
  }
  return doc;
}

/** Premier élément d'un fragment Word, parsé avec tous les espaces de noms utiles. */
export function fragment(xml: string): Element {
  const doc = parseXml(`<w:document ${NAMESPACES}>${xml}</w:document>`);
  const first = doc.documentElement.firstElementChild;
  if (!first) throw new Error('fragment vide');
  return first;
}

/** Corps complet (`w:body`) d'un fragment, pour convertir plusieurs blocs. */
export function body(xml: string): Element {
  return fragment(`<w:body>${xml}</w:body>`);
}

export function paragraphXml(text: string, pPr = ''): string {
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

export function numberedXml(text: string, numId: string, level = 0, extraPPr = ''): string {
  return paragraphXml(
    text,
    `<w:pPr><w:numPr><w:ilvl w:val="${String(level)}"/><w:numId w:val="${numId}"/></w:numPr>${extraPPr}</w:pPr>`,
  );
}

export interface TestRelationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
}

/** Partie `.rels` à partir d'une liste de relations (type = suffixe usuel : `image`, `header`…). */
export function relsXml(rels: readonly TestRelationship[]): string {
  const entries = rels
    .map(
      (rel) =>
        `<Relationship Id="${rel.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${rel.type}" Target="${rel.target}"${rel.external ? ' TargetMode="External"' : ''}/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries}</Relationships>`;
}

/** Partie XML Word (`w:document`, `w:hdr`, `w:footnotes`…) avec les espaces de noms. */
export function partXml(root: string, content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><w:${root} ${NAMESPACES}>${content}</w:${root}>`;
}

/**
 * Paquet minimal : `document.xml` avec le corps donné, relations du document, parties
 * supplémentaires (texte ou binaire). Lisible par `openPackage`.
 */
export async function buildPackage(
  bodyXml: string,
  options: {
    readonly rels?: readonly TestRelationship[];
    readonly parts?: Readonly<Record<string, string | Uint8Array>>;
  } = {},
): Promise<DocxPackage> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    relsXml([{ id: 'rId1', type: 'officeDocument', target: 'word/document.xml' }]),
  );
  zip.file('word/document.xml', partXml('document', `<w:body>${bodyXml}</w:body>`));
  if (options.rels) zip.file('word/_rels/document.xml.rels', relsXml(options.rels));
  for (const [path, content] of Object.entries(options.parts ?? {})) zip.file(path, content);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return openPackage(buffer, parseXml);
}

const HEADING_STYLE = /^Heading([1-6])$/;

/** Résolveur de styles minimal : titre, numérotation et retrait gauche directs, rien d'hérité. */
export function stubStyles(overrides: Partial<StyleResolver> = {}): StyleResolver {
  return {
    paragraph(pPr) {
      const props: { -readonly [K in keyof ResolvedParagraphProps]: ResolvedParagraphProps[K] } = {
        runDefaults: {},
      };
      if (!pPr) return props;
      const pStyle = childNamed(pPr, 'pStyle');
      const styleId = pStyle ? wordAttribute(pStyle, 'val') : '';
      if (styleId) props.styleId = styleId;
      const heading = HEADING_STYLE.exec(styleId);
      if (heading) props.headingLevel = Number(heading[1]) as HeadingLevel;
      const numPr = childNamed(pPr, 'numPr');
      if (numPr) {
        const numId = childNamed(numPr, 'numId');
        const ilvl = childNamed(numPr, 'ilvl');
        if (numId) {
          props.numbering = {
            numId: wordAttribute(numId, 'val'),
            level: ilvl ? (numericAttribute(ilvl, 'val') ?? 0) : 0,
          };
        }
      }
      const left = numericAttribute(childNamed(pPr, 'ind'), 'left');
      if (left !== undefined) props.indentLeftPt = twipsToPt(left);
      return props;
    },
    run(_rPr, paragraph) {
      return paragraph.runDefaults;
    },
    tableStyle() {
      return null;
    },
    defaultFont() {
      return {};
    },
    ...overrides,
  };
}

/** Éléments inline signalés comme perdus par le convertisseur de runs de test. */
const INLINE_LOST: ReadonlySet<string> = new Set([
  'oMath',
  'oMathPara',
  'commentRangeStart',
  'commentRangeEnd',
  'commentReference',
  'ins',
  'del',
  'fldSimple',
  'object',
]);

function reportLost(element: Element, ctx: ConverterContext, parts: string[]): boolean {
  const lost = detectLostInline(element, ctx);
  if (!lost) return false;
  ctx.lost.push(lost);
  ctx.warnings.push({ code: 'object-lost', message: `Objet non représentable (${lost.kind})` });
  if (lost.text) parts.push(escapeHtml(lost.text));
  return true;
}

/** Convertisseur de paragraphe de test : texte brut, dessins, notes, objets perdus inline. */
export async function testParagraph(
  paragraph: Element,
  ctx: ConverterContext,
): Promise<ParagraphBlock> {
  const props = ctx.styles.paragraph(childNamed(paragraph, 'pPr'));
  const parts: string[] = [];
  const walk = async (element: Element): Promise<void> => {
    switch (element.localName) {
      case 't':
        parts.push(escapeHtml(element.textContent ?? ''));
        return;
      case 'tab':
        parts.push(' ');
        return;
      case 'br':
        parts.push('<br>');
        return;
      case 'drawing':
      case 'pict':
        parts.push(await ctx.images.drawing(element, ctx));
        return;
      case 'AlternateContent': {
        // Enveloppe Word 2010+ : seul le contenu retenu (`mc:Choice`) est converti.
        const chosen = alternateContentChoice(element);
        if (!chosen) return;
        if (chosen.localName === 'drawing' || chosen.localName === 'pict') {
          parts.push(await ctx.images.drawing(chosen, ctx));
        } else {
          await walk(chosen);
        }
        return;
      }
      case 'footnoteReference':
      case 'endnoteReference': {
        const id = wordAttribute(element, 'id');
        const kind = element.localName === 'footnoteReference' ? 'footnote' : 'endnote';
        if (id) parts.push(ctx.notes.reference(id, kind, ctx));
        return;
      }
      case 'pPr':
      case 'rPr':
        return;
      default:
        break;
    }
    if (INLINE_LOST.has(element.localName)) {
      const reported = reportLost(element, ctx, parts);
      // Texte inséré conservé, texte supprimé retiré, champ connu rendu par son résultat.
      if (element.localName === 'del' || (reported && element.localName !== 'ins')) return;
    }
    for (const child of Array.from(element.children)) await walk(child);
  };
  for (const child of Array.from(paragraph.children)) await walk(child);
  const inline = parts.join('');
  const tag = props.headingLevel ? `h${String(props.headingLevel)}` : 'p';
  const style =
    props.indentLeftPt !== undefined ? ` style="margin-left: ${String(props.indentLeftPt)}pt"` : '';
  const block: { -readonly [K in keyof ParagraphBlock]: ParagraphBlock[K] } = {
    kind: 'paragraph',
    html: `<${tag}${style}>${inline}</${tag}>`,
    isEmpty: inline.trim() === '',
  };
  if (props.numbering) block.numbering = props.numbering;
  return block;
}

/** Réplique de `convertBlocks` d'`index.ts` : `p` (enregistré), `tbl`, `sdt`, `customXml`, sinon `detectLost`. */
export async function testBlocks(container: Element, ctx: ConverterContext): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const child of Array.from(container.children)) {
    switch (child.localName) {
      case 'p': {
        const block = await ctx.convert.paragraph(child, ctx);
        registerListItem(block, ctx);
        blocks.push(block);
        break;
      }
      case 'tbl':
        blocks.push(await ctx.convert.table(child, ctx));
        break;
      case 'sdt': {
        const content = childNamed(child, 'sdtContent');
        if (content) blocks.push(...(await testBlocks(content, ctx)));
        break;
      }
      case 'customXml':
        blocks.push(...(await testBlocks(child, ctx)));
        break;
      case 'customXmlPr':
      case 'sectPr':
      case 'bookmarkStart':
      case 'bookmarkEnd':
      case 'proofErr':
        break;
      default: {
        const lost = detectLost(child, ctx);
        if (lost) {
          ctx.lost.push(lost);
          ctx.warnings.push({
            code: 'object-lost',
            message: `Objet non représentable (${lost.kind})`,
          });
          if (lost.text) blocks.push({ kind: 'raw', html: `<p>${escapeHtml(lost.text)}</p>` });
        }
      }
    }
  }
  return blocks;
}

/** Contexte de conversion complet sur un paquet, avec les vrais modules de L25. */
export async function createTestContext(
  pkg: DocxPackage,
  options: Partial<ReaderOptions> = {},
  overrides: Partial<ConverterContext> = {},
): Promise<ConverterContext> {
  const readerOptions: ReaderOptions = {
    footnotes: true,
    emptyParagraphs: 'keep',
    parseXml,
    ...options,
  };
  return {
    pkg,
    part: pkg.mainPart,
    where: 'body',
    styles: stubStyles(),
    numbering: await createNumberingResolver(pkg),
    images: createImageConverter(pkg, readerOptions),
    notes: await createNoteRegistry(pkg, readerOptions),
    convert: {
      paragraph: testParagraph,
      table: convertTable,
      blocks: testBlocks,
      render: renderBlocks,
    },
    options: readerOptions,
    warnings: [],
    lost: [],
    tableStyle: null,
    ...overrides,
  };
}

/** Convertit et rend un corps entier avec le contexte donné. */
export async function renderBody(xml: string, ctx: ConverterContext): Promise<string> {
  return ctx.convert.render(await ctx.convert.blocks(body(xml), ctx), ctx);
}

/** PNG 1×1 rouge, le plus petit fichier valide pour les tests d'images. */
export const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);
