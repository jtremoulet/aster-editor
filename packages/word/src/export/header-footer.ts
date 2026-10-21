import type { HeaderFooterSet } from '@aster-editor/core';
import type { Footer, Header, Paragraph, Table } from 'docx';
import type { HtmlParser } from '../docx/types.js';
import { convertChildren, type BlockScope } from './blocks.js';
import type { ExportContext } from './context.js';
import type { ParagraphAlignment } from './css.js';
import { parseFragment, resolveParser } from './dom.js';
import type {
  DocxExportOptions,
  DocxFooterOptions,
  DocxHeaderAlign,
  DocxHeaderOptions,
} from './types.js';

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

/** Jeu d'en-têtes ou de pieds d'une section `docx`, par type de page. */
export interface HeaderFooterGroup<T> {
  readonly default?: T;
  readonly first?: T;
  readonly even?: T;
}

/** `HeaderFooterSet` du contrat → option d'en-tête par type, `undefined` si le fragment est vide. */
function layoutOption(
  set: HeaderFooterSet | undefined,
  key: keyof HeaderFooterSet,
): DocxHeaderOptions | undefined {
  const html = set?.[key]?.html;
  return html === undefined || html.trim() === '' ? undefined : { html };
}

/**
 * En-têtes de la dernière section : `options.header` pour les pages courantes (il prime),
 * sinon `sets.default` (`layout.headers` par défaut) ; `first` et `even` viennent du jeu
 * seul (contrat `HeaderFooterSet`, en général lu par l'import). Vide si rien n'est demandé.
 */
export async function buildHeaders(
  options: DocxExportOptions,
  ctx: ExportContext,
  sets: HeaderFooterSet | undefined = options.layout?.headers,
): Promise<HeaderFooterGroup<Header>> {
  const group: { -readonly [K in keyof HeaderFooterGroup<Header>]: Header | undefined } = {
    default: await buildHeader(options.header ?? layoutOption(sets, 'default'), ctx, options.parse),
    first: await buildHeader(layoutOption(sets, 'first'), ctx, options.parse),
    even: await buildHeader(layoutOption(sets, 'even'), ctx, options.parse),
  };
  return compact(group);
}

/** Pieds de la dernière section, mêmes règles que `buildHeaders` (numérotation via `options.footer`). */
export async function buildFooters(
  options: DocxExportOptions,
  ctx: ExportContext,
  sets: HeaderFooterSet | undefined = options.layout?.footers,
): Promise<HeaderFooterGroup<Footer>> {
  const group: { -readonly [K in keyof HeaderFooterGroup<Footer>]: Footer | undefined } = {
    default: await buildFooter(options.footer ?? layoutOption(sets, 'default'), ctx, options.parse),
    first: await buildFooter(layoutOption(sets, 'first'), ctx, options.parse),
    even: await buildFooter(layoutOption(sets, 'even'), ctx, options.parse),
  };
  return compact(group);
}

/**
 * En-têtes d'une section intermédiaire (`layout.sections[n].headers`) : le jeu du contrat,
 * `options.header` en **repli** du type `default` quand la section n'en déclare pas
 * (R43-03 : les options explicites portent sur tout le document, comme en 0.5, mais une
 * section qui a son propre en-tête le garde).
 */
export async function buildSectionHeaders(
  sets: HeaderFooterSet | undefined,
  options: DocxExportOptions,
  ctx: ExportContext,
): Promise<HeaderFooterGroup<Header>> {
  const { parse } = options;
  const group: { -readonly [K in keyof HeaderFooterGroup<Header>]: Header | undefined } = {
    default: await buildHeader(layoutOption(sets, 'default') ?? options.header, ctx, parse),
    first: await buildHeader(layoutOption(sets, 'first'), ctx, parse),
    even: await buildHeader(layoutOption(sets, 'even'), ctx, parse),
  };
  return compact(group);
}

/** Pieds d'une section intermédiaire (`layout.sections[n].footers`), `options.footer` en repli `default`. */
export async function buildSectionFooters(
  sets: HeaderFooterSet | undefined,
  options: DocxExportOptions,
  ctx: ExportContext,
): Promise<HeaderFooterGroup<Footer>> {
  const { parse } = options;
  const group: { -readonly [K in keyof HeaderFooterGroup<Footer>]: Footer | undefined } = {
    default: await buildFooter(layoutOption(sets, 'default') ?? options.footer, ctx, parse),
    first: await buildFooter(layoutOption(sets, 'first'), ctx, parse),
    even: await buildFooter(layoutOption(sets, 'even'), ctx, parse),
  };
  return compact(group);
}

/** Retire les entrées `undefined` : `docx` n'accepte pas `{ first: undefined }`. */
function compact<T>(group: {
  readonly default?: T | undefined;
  readonly first?: T | undefined;
  readonly even?: T | undefined;
}): HeaderFooterGroup<T> {
  return {
    ...(group.default !== undefined ? { default: group.default } : {}),
    ...(group.first !== undefined ? { first: group.first } : {}),
    ...(group.even !== undefined ? { even: group.even } : {}),
  };
}
