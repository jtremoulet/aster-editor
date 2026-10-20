import type { Footer, Header, Paragraph, Table } from 'docx';
import type { HtmlParser } from '../docx/types';
import { convertChildren, type BlockScope } from './blocks';
import type { ExportContext } from './context';
import type { ParagraphAlignment } from './css';
import { parseFragment, resolveParser } from './dom';
import type { DocxFooterOptions, DocxHeaderAlign, DocxHeaderOptions } from './types';

/** Échappe un texte brut pour le passer au convertisseur HTML. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** `align` de l'option → alignement de paragraphe `docx`, `undefined` pour `left`. */
function alignmentOf(align: DocxHeaderAlign | undefined): ParagraphAlignment | undefined {
  return align === 'center' || align === 'right' ? align : undefined;
}

/** Forme normalisée : une chaîne vaut `{ text }`. */
function normalize(option: string | DocxHeaderOptions): DocxHeaderOptions {
  return typeof option === 'string' ? { text: option } : option;
}

/**
 * Paragraphes d'un en-tête ou d'un pied : le fragment `html`, ou le `text` brut
 * (échappé, sauts de ligne → `<br>`), passés au convertisseur du corps. Les paragraphes
 * sans alignement propre prennent celui de l'option. Variables, marques et liens y
 * sont traités comme dans le corps ; les appels de note non (`notesAllowed: false`) :
 * Word refuse un `w:footnoteReference` hors du corps et répare le fichier.
 */
async function blocksOf(
  options: DocxHeaderOptions,
  ctx: ExportContext,
  parse: HtmlParser | undefined,
): Promise<Array<Paragraph | Table>> {
  const html =
    options.html ??
    (options.text === undefined ? '' : escapeHtml(options.text).replace(/\r?\n/g, '<br>'));
  if (html.trim() === '') return [];
  const scope: BlockScope = { quote: false, list: null, inline: {}, notesAllowed: false };
  const alignment = alignmentOf(options.align);
  const body = parseFragment(html, resolveParser(parse));
  const children = await convertChildren(body, alignment ? { ...scope, alignment } : scope, ctx);
  return children.filter(
    (child): child is Paragraph | Table =>
      child instanceof ctx.docx.Paragraph || child instanceof ctx.docx.Table,
  );
}

/**
 * Paragraphe de numérotation : champ `PAGE`, suivi de ` / NUMPAGES` en `x-of-y`. Centré
 * sans `align` ; `align: 'left'` est honoré, pas confondu avec l'absence d'option.
 */
function pageNumberParagraph(
  mode: true | 'x-of-y',
  align: DocxHeaderAlign | undefined,
  ctx: ExportContext,
): Paragraph {
  const { AlignmentType, PageNumber, Paragraph, TextRun } = ctx.docx;
  const children = [new TextRun({ children: [PageNumber.CURRENT] })];
  if (mode === 'x-of-y') {
    children.push(
      new TextRun({ text: ' / ' }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
    );
  }
  const alignment =
    align === undefined ? AlignmentType.CENTER : (alignmentOf(align) ?? AlignmentType.LEFT);
  return new Paragraph({ alignment, children });
}

/** `options.header` → `Header`, `undefined` si rien à afficher. */
export async function buildHeader(
  option: string | DocxHeaderOptions | undefined,
  ctx: ExportContext,
  parse: HtmlParser | undefined,
): Promise<Header | undefined> {
  if (option === undefined) return undefined;
  const children = await blocksOf(normalize(option), ctx, parse);
  return children.length === 0 ? undefined : new ctx.docx.Header({ children });
}

/** `options.footer` → `Footer` avec, en dernier paragraphe, la numérotation demandée. */
export async function buildFooter(
  option: string | DocxFooterOptions | undefined,
  ctx: ExportContext,
  parse: HtmlParser | undefined,
): Promise<Footer | undefined> {
  if (option === undefined) return undefined;
  const options: DocxFooterOptions = normalize(option);
  const children = await blocksOf(options, ctx, parse);
  if (options.pageNumbers) {
    children.push(pageNumberParagraph(options.pageNumbers, options.align, ctx));
  }
  return children.length === 0 ? undefined : new ctx.docx.Footer({ children });
}
