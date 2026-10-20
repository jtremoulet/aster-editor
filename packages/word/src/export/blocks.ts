import type { FileChild, IParagraphOptions, Paragraph } from 'docx';
import { registerList, resolveDocxStyle, type ExportContext } from './context';
import {
  parseAlignment,
  parseBorder,
  parseBorders,
  parseColor,
  parseLineHeight,
  parsePoints,
  parseStyle,
  pointsToTwips,
  type ParagraphAlignment,
} from './css';
import {
  BLOCK_TAGS,
  PAGE_BREAK_ATTRIBUTE,
  SECTION_BREAK_ATTRIBUTE,
  XSD_INT_MAX,
  childElements,
  hasBlockChild,
  isElement,
  isText,
  positiveIntAttribute,
  tagOf,
} from './dom';
import { inlineChildren, type InlineCollector, type InlineState } from './inline';
import { sanitizeXmlText } from './sanitize';
import {
  DOCX_NUM_ID_ATTRIBUTE,
  DOCX_STYLE_ATTRIBUTE,
  HEADING_NUMBERING_REFERENCE,
  LIST_INDENT,
  NIL_BORDER,
  NUM_INDENT_ATTRIBUTE,
  STYLE_IDS,
  borderOptions,
  listKindFromType,
  type ListKind,
} from './styles';
import { convertTable } from './tables';

/** `data-keep-next` : garder avec le paragraphe suivant (`w:keepNext`). */
const KEEP_NEXT_ATTRIBUTE = 'data-keep-next';

/** `data-page-break-before` : propriété de paragraphe `w:pageBreakBefore`. */
const PAGE_BREAK_BEFORE_ATTRIBUTE = 'data-page-break-before';

/** `data-border-between` : bordure entre deux paragraphes bordés consécutifs. */
const BORDER_BETWEEN_ATTRIBUTE = 'data-border-between';

/** Position dans une liste : référence de numérotation dédiée à la liste et niveau Word. */
export interface ListScope {
  readonly reference: string;
  readonly level: number;
}

/** Contexte structurel hérité par les blocs : citation, liste, marques initiales (en-tête de table). */
export interface BlockScope {
  readonly quote: boolean;
  readonly list: ListScope | null;
  readonly inline: InlineState;
  /** Alignement des paragraphes sans `text-align` propre (en-têtes et pieds de page). */
  readonly alignment?: ParagraphAlignment;
  /** Style de paragraphe par défaut hors citation (`FootnoteText` dans une note). */
  readonly paragraphStyle?: string;
  /**
   * Faux dans un en-tête, un pied de page ou une note : Word y refuse les appels de
   * note, qui sont alors dégradés en exposant `[n]`. Vrai (corps) par défaut.
   */
  readonly notesAllowed?: boolean;
}

/** Scope racine : ni citation, ni liste, aucune marque. */
export const ROOT_SCOPE: BlockScope = { quote: false, list: null, inline: {} };

type MutableParagraphOptions = { -readonly [K in keyof IParagraphOptions]: IParagraphOptions[K] };

/** `HeadingLevel` pour `h1`..`h6`, `undefined` pour tout autre tag. */
function headingLevel(tag: string, ctx: ExportContext): IParagraphOptions['heading'] | undefined {
  const { HeadingLevel } = ctx.docx;
  switch (tag) {
    case 'h1':
      return HeadingLevel.HEADING_1;
    case 'h2':
      return HeadingLevel.HEADING_2;
    case 'h3':
      return HeadingLevel.HEADING_3;
    case 'h4':
      return HeadingLevel.HEADING_4;
    case 'h5':
      return HeadingLevel.HEADING_5;
    case 'h6':
      return HeadingLevel.HEADING_6;
    default:
      return undefined;
  }
}

/**
 * Vrai si le bloc doit commencer sur une nouvelle page : `data-page-break`,
 * `page-break-before: always` ou `break-before: page`.
 */
function hasPageBreakBefore(element: Element, style: ReadonlyMap<string, string>): boolean {
  if (element.hasAttribute(PAGE_BREAK_ATTRIBUTE)) return true;
  return (
    style.get('page-break-before')?.toLowerCase() === 'always' ||
    style.get('break-before')?.toLowerCase() === 'page'
  );
}

type MutableSpacing = {
  -readonly [K in keyof NonNullable<IParagraphOptions['spacing']>]: NonNullable<
    IParagraphOptions['spacing']
  >[K];
};
type MutableIndent = {
  -readonly [K in keyof NonNullable<IParagraphOptions['indent']>]: NonNullable<
    IParagraphOptions['indent']
  >[K];
};
type MutableBorders = {
  -readonly [K in keyof NonNullable<IParagraphOptions['border']>]: NonNullable<
    IParagraphOptions['border']
  >[K];
};

/**
 * Mise en page du contrat (`ParagraphLayoutAttrs`, sérialisée en `style` inline et
 * `data-*`) → propriétés directes du paragraphe : interligne et espacements
 * (`w:spacing`), retraits (`w:ind`, sauf `data-docx-num-indent` : la numérotation les
 * porte), bordures (`w:pBdr`), fond (`w:shd`), `w:keepNext`, `w:pageBreakBefore`. Les
 * longueurs sont lues en `pt` (ou toute unité absolue), les couleurs en `#hex` ou `rgb()`.
 */
function applyParagraphLayout(
  options: MutableParagraphOptions,
  element: Element,
  style: ReadonlyMap<string, string>,
): void {
  const spacing: MutableSpacing = {};
  const lineHeight = parseLineHeight(style.get('line-height'));
  if (lineHeight?.kind === 'multiple') {
    spacing.line = Math.round(lineHeight.value * 240);
    spacing.lineRule = 'auto';
  } else if (lineHeight?.kind === 'exact') {
    spacing.line = pointsToTwips(lineHeight.points);
    spacing.lineRule = 'exact';
  }
  const before = parsePoints(style.get('margin-top'));
  if (before !== null && before >= 0) spacing.before = pointsToTwips(before);
  const after = parsePoints(style.get('margin-bottom'));
  if (after !== null && after >= 0) spacing.after = pointsToTwips(after);
  if (Object.keys(spacing).length > 0) options.spacing = spacing;

  if (!element.hasAttribute(NUM_INDENT_ATTRIBUTE)) {
    const indent: MutableIndent = { ...options.indent };
    const left = parsePoints(style.get('margin-left'));
    if (left !== null) indent.left = pointsToTwips(left);
    const right = parsePoints(style.get('margin-right'));
    if (right !== null) indent.right = pointsToTwips(right);
    const first = parsePoints(style.get('text-indent'));
    if (first !== null && first < 0) indent.hanging = pointsToTwips(-first);
    else if (first !== null && first > 0) indent.firstLine = pointsToTwips(first);
    if (Object.keys(indent).length > 0) options.indent = indent;
  }

  // Un côté déclaré sans trait (`border-top: none`, `0pt solid transparent` du lecteur pour
  // un `nil` explicite) est écrit `w:val="nil"` : il annule la bordure que le style apporte.
  const borders: MutableBorders = {};
  const parsed = Array.from(parseBorders(style));
  const sides = new Set(parsed.filter(([, border]) => border !== null).map(([side]) => side));
  for (const [side, border] of parsed) {
    borders[side] = border ? borderOptions(border, side, sides) : NIL_BORDER;
  }
  const between = parseBorder(element.getAttribute(BORDER_BETWEEN_ATTRIBUTE) ?? undefined);
  if (between) borders.between = borderOptions(between, 'between', sides);
  if (Object.keys(borders).length > 0) options.border = borders;

  const shading = parseColor(style.get('background-color'));
  if (shading) options.shading = { fill: shading, type: 'clear', color: 'auto' };
  if (element.hasAttribute(KEEP_NEXT_ATTRIBUTE)) options.keepNext = true;
  if (element.hasAttribute(PAGE_BREAK_BEFORE_ATTRIBUTE)) options.pageBreakBefore = true;
}

/**
 * Options de paragraphe communes : alignement lu sur `text-align` (ou celui du scope),
 * style Word d'origine (`data-docx-style`, s'il est défini dans le document final), sinon
 * `Quote` dans une citation ou style du scope, numérotation ou retrait dans une liste,
 * mise en page du contrat, saut de page avant.
 */
function paragraphOptions(
  element: Element | null,
  scope: BlockScope,
  ctx: ExportContext,
  numbered: boolean,
): MutableParagraphOptions {
  const options: MutableParagraphOptions = {};
  const style = parseStyle(element?.getAttribute('style') ?? null);
  const alignment = parseAlignment(style.get('text-align')) ?? scope.alignment;
  if (alignment) options.alignment = alignment;
  const docxStyle = element
    ? resolveDocxStyle(ctx, element.getAttribute(DOCX_STYLE_ATTRIBUTE), 'paragraphe')
    : null;
  if (docxStyle) options.style = docxStyle;
  else if (scope.quote) options.style = STYLE_IDS.quote;
  else if (scope.paragraphStyle) options.style = scope.paragraphStyle;
  if (scope.list) {
    if (numbered) {
      options.numbering = { reference: scope.list.reference, level: scope.list.level };
    } else {
      options.indent = { left: LIST_INDENT * (scope.list.level + 1) };
    }
  }
  if (element) applyParagraphLayout(options, element, style);
  if (element && hasPageBreakBefore(element, style)) options.pageBreakBefore = true;
  return options;
}

/**
 * Enfants inline d'un paragraphe, et ses taquets (`w:tabs`) : un taquet `left` par position
 * déclarée par une tabulation (`data-stop`), dédoublonnés et triés.
 */
async function inlineContent(
  nodes: readonly Node[],
  options: MutableParagraphOptions,
  scope: BlockScope,
  ctx: ExportContext,
): Promise<void> {
  const collector: InlineCollector = { tabStopsTwips: new Set() };
  options.children = await inlineChildren(
    nodes,
    ctx,
    scope.inline,
    scope.notesAllowed ?? true,
    collector,
  );
  if (collector.tabStopsTwips.size > 0) {
    options.tabStops = Array.from(collector.tabStopsTwips)
      .sort((a, b) => a - b)
      .map((position) => ({ type: ctx.docx.TabStopType.LEFT, position }));
  }
}

/** Paragraphe de texte à partir d'une liste de nœuds inline. */
async function inlineParagraph(
  nodes: readonly Node[],
  element: Element | null,
  scope: BlockScope,
  ctx: ExportContext,
  numbered: boolean,
): Promise<Paragraph> {
  const options = paragraphOptions(element, scope, ctx, numbered);
  await inlineContent(nodes, options, scope, ctx);
  return new ctx.docx.Paragraph(options);
}

/** Rang d'un titre `h1`..`h6` (0-5), `-1` pour tout autre tag. */
function headingIndex(tag: string): number {
  return /^h[1-6]$/.test(tag) ? Number(tag.slice(1)) - 1 : -1;
}

/**
 * Titre `h1`..`h6`. Numéroté quand il ouvre un `li`, pour que la puce ne soit pas perdue.
 * En export dans le gabarit avec `numberedHeadings`, la numérotation des titres est
 * posée en `w:numPr` direct sur le paragraphe (`ctx.headingNumbering`) : les styles
 * `Heading n` du gabarit ne sont jamais modifiés, elle ne peut pas y vivre.
 */
async function heading(
  element: Element,
  scope: BlockScope,
  ctx: ExportContext,
  numbered = false,
): Promise<Paragraph> {
  const options = paragraphOptions(element, scope, ctx, numbered);
  const tag = tagOf(element);
  // Un style Word d'origine (`data-docx-style`) prime sur le style `Heading n` de l'export.
  if (!options.style) options.heading = headingLevel(tag, ctx);
  const index = headingIndex(tag);
  if (!options.numbering && ctx.headingNumbering && index < ctx.headingNumbering.levels) {
    options.numbering = { reference: HEADING_NUMBERING_REFERENCE, level: index };
  }
  await inlineContent(Array.from(element.childNodes), options, scope, ctx);
  return new ctx.docx.Paragraph(options);
}

/**
 * `<pre>` : une ligne = un paragraphe de style `HTMLPreformatted` (Consolas), que
 * mammoth réassemble en un seul `<pre>` à l'import. Le saut de ligne final est ignoré.
 */
function preformatted(element: Element, scope: BlockScope, ctx: ExportContext): Paragraph[] {
  const { Paragraph, TextRun } = ctx.docx;
  const lines = sanitizeXmlText(element.textContent ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n');
  return lines.map(
    (line) =>
      new Paragraph({
        ...paragraphOptions(null, scope, ctx, false),
        style: STYLE_IDS.preformatted,
        children: line === '' ? [] : [new TextRun({ text: line })],
      }),
  );
}

/** `<hr>` : paragraphe vide à bordure basse, le rendu usuel du filet horizontal dans Word. */
function horizontalRule(ctx: ExportContext): Paragraph {
  const { BorderStyle, Paragraph } = ctx.docx;
  return new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A0A0A0', space: 1 } },
  });
}

/** Saut de page explicite : paragraphe réduit à un `w:br w:type="page"`. */
function pageBreak(ctx: ExportContext): Paragraph {
  const { PageBreak, Paragraph } = ctx.docx;
  return new Paragraph({ children: [new PageBreak()] });
}

/**
 * `<li>` : le premier paragraphe porte la numérotation, les suivants un simple retrait,
 * les sous-listes descendent d'un niveau. Un `li` sans bloc devient un paragraphe numéroté.
 */
async function listItem(
  item: Element,
  scope: BlockScope,
  ctx: ExportContext,
): Promise<FileChild[]> {
  const nodes = Array.from(item.childNodes);
  if (!hasBlockChild(item)) return [await inlineParagraph(nodes, item, scope, ctx, true)];
  const children: FileChild[] = [];
  let numbered = false;
  let bucket: Node[] = [];
  const flush = async (): Promise<void> => {
    if (bucket.some((node) => !isIgnorable(node))) {
      children.push(await inlineParagraph(bucket, null, scope, ctx, !numbered));
      numbered = true;
    }
    bucket = [];
  };
  for (const node of nodes) {
    if (!isElement(node, ...BLOCK_TAGS)) {
      bucket.push(node);
      continue;
    }
    await flush();
    const tag = tagOf(node);
    if (tag === 'p' || tag === 'div') {
      children.push(
        await inlineParagraph(Array.from(node.childNodes), node, scope, ctx, !numbered),
      );
      numbered = true;
    } else if (headingLevel(tag, ctx) !== undefined) {
      children.push(await heading(node, scope, ctx, !numbered));
      numbered = true;
    } else {
      children.push(...(await convertBlock(node, scope, ctx)));
      // Une sous-liste ne porte pas la puce du li : elle reste à poser sur le premier paragraphe suivant.
      if (tag !== 'ul' && tag !== 'ol') numbered = true;
    }
  }
  await flush();
  if (!numbered) children.unshift(await inlineParagraph([], null, scope, ctx, true));
  return children;
}

/** Format de niveau du gabarit (contrat du lecteur) attendu pour un `<ol type>` / `<ul>`. */
function expectedListFormat(kind: ListKind): string {
  switch (kind) {
    case 'bullet':
      return 'bullet';
    case 'lowerLetter':
      return 'a';
    case 'upperLetter':
      return 'A';
    case 'lowerRoman':
      return 'i';
    case 'upperRoman':
      return 'I';
    default:
      return '1';
  }
}

/**
 * Niveau d'une liste qui réutilise une numérotation du gabarit. La profondeur HTML donne
 * le niveau usuel ; mais une liste Word au niveau 1 sans parent est relue à plat, et son
 * format (`type`, `data-bullet`) ne correspond alors pas au niveau 0. On prend le premier
 * niveau de la définition dont le format (et la puce) correspond, sinon la profondeur.
 */
function templateListLevel(
  element: Element,
  templateNumId: string,
  kind: ListKind,
  depth: number,
  ctx: ExportContext,
): number {
  const definition = ctx.templateNumbering?.definition(templateNumId);
  if (!definition) return depth;
  const format = expectedListFormat(kind);
  const bullet = element.getAttribute('data-bullet');
  const matches = (level: { format: string; text: string }): boolean =>
    level.format === format && (format !== 'bullet' || bullet === null || level.text === bullet);
  const current = definition.levels.find((level) => level.level === depth);
  if (current && matches(current)) return depth;
  const alternative = definition.levels.find(matches);
  return alternative ? Math.min(alternative.level, 8) : depth;
}

/**
 * `<ul>`/`<ol>` : chaque liste, racine ou imbriquée, reçoit sa propre référence de
 * numérotation (donc son propre `abstractNum`) : la numérotation repart à 1 (ou au
 * `start` de l'`<ol>`) et deux sous-listes de même format ne partagent jamais leur compteur.
 */
async function list(element: Element, scope: BlockScope, ctx: ExportContext): Promise<FileChild[]> {
  const ordered = tagOf(element) === 'ol';
  const kind = ordered ? listKindFromType(element.getAttribute('type')) : 'bullet';
  let level = Math.min(scope.list ? scope.list.level + 1 : 0, 8);
  // `w:start` / `w:startOverride` sont des `ST_DecimalNumber` (xsd:int) : borné à 2^31 - 1.
  const start = ordered ? (positiveIntAttribute(element, 'start', XSD_INT_MAX) ?? 1) : 1;
  // `data-docx-num-id` : numérotation du gabarit à réutiliser (export dans le gabarit seulement).
  const templateNumId = element.getAttribute(DOCX_NUM_ID_ATTRIBUTE)?.trim() || undefined;
  if (templateNumId && ctx.template) {
    level = templateListLevel(element, templateNumId, kind, level, ctx);
  }
  const listScope: BlockScope = {
    ...scope,
    list: {
      reference: registerList(ctx, kind, level, start, ctx.template ? templateNumId : undefined),
      level,
    },
  };
  const children: FileChild[] = [];
  for (const child of childElements(element)) {
    if (tagOf(child) === 'li') children.push(...(await listItem(child, listScope, ctx)));
    else children.push(...(await convertBlock(child, listScope, ctx)));
  }
  return children;
}

/** Blancs au sens HTML : espace, tabulation, LF, CR, FF. NBSP et espaces Unicode sont du contenu. */
const HTML_BLANK = /^[ \t\n\r\f]*$/;

/** Vrai pour un commentaire ou un texte blanc (au sens HTML), sans valeur en contexte de bloc. */
function isIgnorable(node: Node): boolean {
  if (node.nodeType === 8) return true;
  return isText(node) && HTML_BLANK.test(node.data);
}

/**
 * Convertit un élément de bloc en enfants de section `docx`. Les conteneurs sans
 * sémantique Word (`div`, `section`…) sont traversés ; les inline nus rencontrés en
 * contexte de bloc sont regroupés en paragraphes.
 */
export async function convertBlock(
  element: Element,
  scope: BlockScope,
  ctx: ExportContext,
): Promise<FileChild[]> {
  const tag = tagOf(element);
  // `<div data-page-break>` / `<hr data-page-break>` : saut de page seul, le filet n'est pas rendu.
  if ((tag === 'div' || tag === 'hr') && element.hasAttribute(PAGE_BREAK_ATTRIBUTE)) {
    const rest = tag === 'div' ? await convertChildren(element, scope, ctx) : [];
    return [pageBreak(ctx), ...rest];
  }
  // Un saut de section hors du premier niveau (`sections.ts` découpe le corps) : rien à rendre.
  if (tag === 'hr' && element.hasAttribute(SECTION_BREAK_ATTRIBUTE)) return [];
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return [await heading(element, scope, ctx)];
    case 'p':
      return [await inlineParagraph(Array.from(element.childNodes), element, scope, ctx, false)];
    case 'ul':
    case 'ol':
      return list(element, scope, ctx);
    case 'li':
      return listItem(element, scope, ctx);
    case 'blockquote':
      return convertChildren(element, { ...scope, quote: true }, ctx);
    case 'pre':
      return preformatted(element, scope, ctx);
    case 'hr':
      return [horizontalRule(ctx)];
    case 'table':
      return [await convertTable(element, scope, ctx, convertChildren)];
    default:
      return convertChildren(element, scope, ctx);
  }
}

/**
 * Convertit les enfants d'un conteneur : les blocs sont délégués à `convertBlock`, les
 * suites d'inline nus deviennent des paragraphes. Point d'entrée du corps du document,
 * des citations et des cellules.
 */
export async function convertChildren(
  container: Element,
  scope: BlockScope,
  ctx: ExportContext,
): Promise<FileChild[]> {
  if (!hasBlockChild(container)) {
    const nodes = Array.from(container.childNodes);
    if (nodes.every(isIgnorable)) return [];
    return [await inlineParagraph(nodes, container, scope, ctx, false)];
  }
  const children: FileChild[] = [];
  let bucket: Node[] = [];
  const flush = async (): Promise<void> => {
    if (bucket.some((node) => !isIgnorable(node))) {
      children.push(await inlineParagraph(bucket, null, scope, ctx, false));
    }
    bucket = [];
  };
  for (const node of Array.from(container.childNodes)) {
    if (isElement(node, ...BLOCK_TAGS)) {
      await flush();
      children.push(...(await convertBlock(node, scope, ctx)));
    } else {
      bucket.push(node);
    }
  }
  await flush();
  return children;
}
