import type { BlockBorder } from '@aster-editor/core';
import { childNamed } from '../preprocess/xml-utils.js';
import { escapeAttr, pt, styleAttr } from './html.js';
import { tabStopsOf, type DocxParagraphProps } from './properties.js';
import { convertRuns, PAGE_BREAK } from './runs.js';
import { docDefaultsOf, tableParagraphDefaultsOf } from './styles.js';
import type {
  ConverterContext,
  ParagraphBlock,
  ResolvedParagraphProps,
  ResolvedRunProps,
  TableStyleProps,
} from './types.js';

/**
 * Paragraphe Word → `<p …>` ou `<hN …>` avec la sérialisation exacte du contrat
 * (`packages/core/src/api/layout.ts`). Les valeurs égales aux `docDefaults` ne sont pas
 * écrites. Un `w:br w:type="page"` au milieu du paragraphe coupe le bloc : le `html` du
 * `ParagraphBlock` contient alors plusieurs frères (`<p>a</p><hr data-page-break><p>b</p>`),
 * que le rendu concatène tels quels (décision figée, L25 les laisse hors liste).
 */

type ParagraphBase = Omit<ResolvedParagraphProps, 'runDefaults' | 'styleId'>;

const INHERITABLE_PARAGRAPH_KEYS = [
  'align',
  'spacingBeforePt',
  'spacingAfterPt',
  'indentLeftPt',
  'indentRightPt',
  'indentFirstLinePt',
] as const;

const INHERITABLE_RUN_KEYS = ['fontFamily', 'fontSizePt', 'bold', 'italic', 'color'] as const;

/**
 * Approximation du style de tableau : ses défauts de paragraphe et de run s'intercalent
 * entre `docDefaults` et le style de paragraphe. Faute de savoir ce que le style de
 * paragraphe a posé lui-même, on ne prend la valeur du tableau que là où le paragraphe
 * est encore égal aux `docDefaults` (même règle pour les taquets, R42-07 : ceux du style
 * de tableau quand le paragraphe n'en a pas d'autres que ceux des `docDefaults`).
 * `tableStyle` est le style vu par la cellule, formats conditionnels compris. Exportée
 * pour que le comparateur (`compare/model-paragraph.ts`) résolve comme le lecteur (L46).
 */
export function applyTableStyle(
  props: ResolvedParagraphProps,
  tableStyle: TableStyleProps | null,
  defaults: { paragraph: ResolvedParagraphProps; run: ResolvedRunProps },
): ResolvedParagraphProps {
  if (!tableStyle) return props;
  const paragraph: { -readonly [K in keyof DocxParagraphProps]?: DocxParagraphProps[K] } = {
    ...props,
  };
  const tableParagraph = tableParagraphDefaultsOf(tableStyle);
  if (tableParagraph) {
    for (const key of INHERITABLE_PARAGRAPH_KEYS) {
      const value = tableParagraph[key];
      if (value !== undefined && props[key] === defaults.paragraph[key]) {
        (paragraph as Record<string, unknown>)[key] = value;
      }
    }
    const tableTabs = tableParagraph.tabStops;
    if (
      tableTabs &&
      tableTabs.length > 0 &&
      JSON.stringify(tabStopsOf(props)) === JSON.stringify(tabStopsOf(defaults.paragraph))
    ) {
      paragraph.tabStops = tableTabs;
    }
    const lineUnchanged =
      props.lineHeight === defaults.paragraph.lineHeight &&
      props.lineHeightPt === defaults.paragraph.lineHeightPt;
    if (lineUnchanged && (tableParagraph.lineHeight ?? tableParagraph.lineHeightPt) !== undefined) {
      delete paragraph.lineHeight;
      delete paragraph.lineHeightPt;
      if (tableParagraph.lineHeightPt !== undefined)
        paragraph.lineHeightPt = tableParagraph.lineHeightPt;
      else paragraph.lineHeight = tableParagraph.lineHeight;
    }
  }
  const tableRun = tableStyle.runDefaults;
  if (tableRun) {
    const run: { -readonly [K in keyof ResolvedRunProps]?: ResolvedRunProps[K] } = {
      ...props.runDefaults,
    };
    for (const key of INHERITABLE_RUN_KEYS) {
      const value = tableRun[key];
      if (value !== undefined && props.runDefaults[key] === defaults.run[key]) {
        (run as Record<string, unknown>)[key] = value;
      }
    }
    paragraph.runDefaults = run;
  }
  return paragraph as ResolvedParagraphProps;
}

/**
 * Retrait venant du niveau de liste (`numbering.xml`) quand le paragraphe n'a pas de
 * `w:ind` direct : Word le place entre le style et les propriétés directes. Le bloc
 * reçoit alors `data-docx-num-indent`, pour que L25 retire `margin-left`/`text-indent`
 * en regroupant les items.
 */
function applyListIndent(
  props: ResolvedParagraphProps,
  pPr: Element | null,
  ctx: ConverterContext,
): { props: ResolvedParagraphProps; fromList: boolean } {
  if (!props.numbering || (pPr && childNamed(pPr, 'ind'))) return { props, fromList: false };
  const definition = ctx.numbering.definition(props.numbering.numId);
  const level = definition?.levels.find((candidate) => candidate.level === props.numbering?.level);
  if (!level || (level.indentLeftPt === undefined && level.hangingPt === undefined)) {
    return { props, fromList: false };
  }
  const patched: { -readonly [K in keyof ResolvedParagraphProps]?: ResolvedParagraphProps[K] } = {
    ...props,
  };
  if (level.indentLeftPt !== undefined) patched.indentLeftPt = level.indentLeftPt;
  if (level.hangingPt !== undefined) patched.indentFirstLinePt = -level.hangingPt;
  return { props: patched as ResolvedParagraphProps, fromList: true };
}

function borderCss(border: BlockBorder): string {
  return `${pt(border.widthPt)} ${border.style} ${border.color}`;
}

function sameBorders(
  a: readonly BlockBorder[] | undefined,
  b: readonly BlockBorder[] | undefined,
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Attributs du bloc dans l'ordre du contrat : `style`, `data-docx-style`, puis les drapeaux. */
export function paragraphAttributes(
  props: ResolvedParagraphProps,
  base: ParagraphBase,
  indentFromList = false,
): string {
  const differs = <K extends keyof ParagraphBase>(key: K): ParagraphBase[K] | undefined =>
    props[key] !== undefined && props[key] !== base[key] ? props[key] : undefined;
  const ptOrNone = (value: number | undefined): string | undefined =>
    value === undefined ? undefined : pt(value);

  let lineHeight: string | undefined;
  if (props.lineHeightPt !== undefined) {
    if (props.lineHeightPt !== base.lineHeightPt) lineHeight = pt(props.lineHeightPt);
  } else if (props.lineHeight !== undefined && props.lineHeight !== base.lineHeight) {
    lineHeight = String(props.lineHeight);
  }

  const borders = sameBorders(props.borders, base.borders) ? [] : (props.borders ?? []);
  const sides = borders.filter((border) => border.side !== 'between');
  const between = borders.find((border) => border.side === 'between');

  const style = styleAttr([
    ['text-align', props.align && props.align !== 'left' ? props.align : undefined],
    ['line-height', lineHeight],
    ['margin-top', ptOrNone(differs('spacingBeforePt'))],
    ['margin-bottom', ptOrNone(differs('spacingAfterPt'))],
    ['margin-left', ptOrNone(differs('indentLeftPt'))],
    ['margin-right', ptOrNone(differs('indentRightPt'))],
    ['text-indent', ptOrNone(differs('indentFirstLinePt'))],
    ...sides.map((border): readonly [string, string] => [
      `border-${border.side}`,
      borderCss(border),
    ]),
    // `w:space` des bordures (`BlockBorder.spacePt`), juste après les `border-*`, dans le
    // même ordre de côtés, seulement pour les côtés bordés qui le précisent.
    ...sides
      .filter((border) => border.spacePt !== undefined)
      .map((border): readonly [string, string] => [
        `padding-${border.side}`,
        pt(border.spacePt ?? 0),
      ]),
    ['background-color', differs('shading')],
  ]);

  const attrs: string[] = [style];
  if (props.styleId) attrs.push(` data-docx-style="${escapeAttr(props.styleId)}"`);
  if (indentFromList) attrs.push(' data-docx-num-indent');
  if (between) attrs.push(` data-border-between="${escapeAttr(borderCss(between))}"`);
  if (props.keepWithNext) attrs.push(' data-keep-next');
  if (props.pageBreakBefore) attrs.push(' data-page-break-before');
  return attrs.join('');
}

/** Vrai si le HTML inline n'a ni texte, ni image, ni saut, ni tabulation, ni appel de note. */
function isEmptyInline(inline: string): boolean {
  if (/<(?:img|br|hr|sup)\b|<span data-tab\b/.test(inline)) return false;
  return /^[ \t\r\n]*$/.test(inline.replace(/<[^>]*>/g, ''));
}

/** Convertit un `w:p` en bloc. Signature figée par la phase 0. */
export async function convertParagraph(
  paragraph: Element,
  ctx: ConverterContext,
): Promise<ParagraphBlock> {
  const pPr = childNamed(paragraph, 'pPr');
  const defaults = docDefaultsOf(ctx.styles);
  const resolved = applyTableStyle(ctx.styles.paragraph(pPr), ctx.tableStyle, defaults);
  const { props, fromList } = applyListIndent(resolved, pPr, ctx);
  const inline = await convertRuns(paragraph, ctx, props);
  const tag = props.headingLevel ? `h${String(props.headingLevel)}` : 'p';
  const attrs = paragraphAttributes(props, defaults.paragraph, fromList);
  const wrap = (content: string): string => `<${tag}${attrs}>${content}</${tag}>`;

  const pieces = inline.split(PAGE_BREAK);
  const parts: string[] = [];
  pieces.forEach((piece, index) => {
    if (index > 0) parts.push(PAGE_BREAK);
    if (piece !== '' || pieces.length === 1) parts.push(wrap(piece));
  });

  return {
    kind: 'paragraph',
    html: parts.join(''),
    ...(props.numbering ? { numbering: props.numbering } : {}),
    isEmpty: isEmptyInline(inline),
  };
}
