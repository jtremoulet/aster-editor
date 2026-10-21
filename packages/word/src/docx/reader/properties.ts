import type { BlockBorder, BorderSide, TabAlign, TabLeader } from '@aster-editor/core';
import { childNamed, childrenNamed, wordAttribute } from '../preprocess/xml-utils.js';
import { distanceAttr, readShadingFill } from './properties-run.js';
import type { ParagraphAlign, ResolvedParagraphProps, ResolvedRunProps } from './types.js';
import {
  bounded,
  lineToMultiple,
  numberAttr,
  onOff,
  readBorderElement,
  twipsToPt,
  WORD_LIMITS,
} from './units.js';

/**
 * Lecture des propriétés de paragraphe (`w:pPr`) et de run (`w:rPr`) dans des
 * accumulateurs mutables. Chaque appel **applique** un élément sur l'état hérité : une
 * propriété explicitement désactivée (`w:b w:val="0"`, `w:u w:val="none"`, bordure
 * `nil`, `w:numId` 0) efface la valeur héritée. Les éléments du paquet ne sont jamais
 * modifiés. `styles.ts` enchaîne `docDefaults` → styles `basedOn` → propriétés directes ;
 * `tables.ts` (L25) peut réutiliser `readBorder` et `readShadingFill`. Les runs
 * (`properties-run.ts`) sont ré-exportés d'ici : l'API du module est celle d'avant le
 * découpage (L45).
 */

export {
  applyRunProperties,
  finalizeRun,
  mergeRunDelta,
  readShadingFill,
  type MutableRun,
  type ThemeFonts,
} from './properties-run.js';

/**
 * Un seul lecteur de bordure pour tout le paquet (R42-05, après la fusion L45a) :
 * `readBorder` est `units.readBorderElement`. Un `w:sz` nul, absent ou hors bornes avec un
 * style visible donne le filet fin de Word (½ pt), sur un paragraphe comme sur une cellule.
 */
export { readBorderElement as readBorder } from './units.js';

/**
 * Taquet de tabulation résolu (`w:tab` de `w:tabs`), en points : position, alignement
 * (`w:val`, `left` et `bar` → absent, non sérialisé) et points de suite (`w:leader`,
 * `none` → absent). Session 4 : `align` et `leader` suivent `TabAttrs` du contrat.
 */
export interface TabStop {
  readonly positionPt: number;
  readonly align?: Exclude<TabAlign, 'left'>;
  readonly leader?: TabLeader;
}

/** Alignement et points de suite d'un taquet, sans sa position (valeur de la carte). */
type TabStopFormat = Omit<TabStop, 'positionPt'>;

/** Accumulateur de paragraphe. `outlineLevel` est en base 0 comme dans le XML. */
export interface MutableParagraph {
  align?: ParagraphAlign;
  lineHeight?: number;
  lineHeightPt?: number;
  /**
   * Règle de l'interligne en points (`w:lineRule`), posée avec `lineHeightPt` : `exact`
   * ou `atLeast`. Le contrat ne distingue pas les deux (`lineHeightPt` = exact) ; la
   * règle sert à ne pas transporter un « au moins » dans `layout.defaultParagraph` (R53-04).
   */
  lineRule?: 'exact' | 'atLeast';
  spacingBeforePt?: number;
  spacingAfterPt?: number;
  indentLeftPt?: number;
  indentRightPt?: number;
  indentFirstLinePt?: number;
  borders: Map<BorderSide, BlockBorder>;
  shading?: string;
  keepWithNext?: boolean;
  pageBreakBefore?: boolean;
  numbering?: { readonly numId: string; readonly level: number };
  outlineLevel?: number;
  /** Taquets de tabulation, clé = position en points (`w:tabs`, `w:clear` retire). */
  tabStops?: Map<number, TabStopFormat>;
}

/**
 * Propriétés de paragraphe d'Aster : le contrat plus les taquets de tabulation résolus
 * (style puis direct), positions croissantes en points, avec leur alignement et leurs
 * points de suite. `runs.ts` attribue le n-ième taquet à la n-ième tabulation du
 * paragraphe (approximation sans mesure du texte).
 */
export interface DocxParagraphProps extends ResolvedParagraphProps {
  readonly tabStops?: readonly TabStop[];
}

/** Taquets d'un paragraphe résolu quelconque, vide pour un résolveur tiers ou stub. */
export function tabStopsOf(props: ResolvedParagraphProps): readonly TabStop[] {
  return 'tabStops' in props ? ((props as DocxParagraphProps).tabStops ?? []) : [];
}

export function emptyParagraph(): MutableParagraph {
  return { borders: new Map() };
}

export function cloneParagraph(source: MutableParagraph): MutableParagraph {
  return {
    ...source,
    borders: new Map(source.borders),
    ...(source.tabStops ? { tabStops: new Map(source.tabStops) } : {}),
  };
}

const BORDER_SIDES: readonly BorderSide[] = ['top', 'right', 'bottom', 'left', 'between'];

/** `w:val` d'un taquet → alignement du contrat ; `left`, `start`, `num`, `bar` → aucun. */
const TAB_ALIGNS: ReadonlyMap<string, Exclude<TabAlign, 'left'>> = new Map([
  ['center', 'center'],
  ['right', 'right'],
  ['end', 'right'],
  ['decimal', 'decimal'],
]);

/**
 * `w:leader` d'un taquet → points de suite du contrat. `heavy` (trait épais) est ramené à
 * `underscore`, `middleDot` à `dot` : approximations vers les trois valeurs du contrat ;
 * `none` et une valeur inconnue → aucun.
 */
const TAB_LEADERS: ReadonlyMap<string, TabLeader> = new Map([
  ['dot', 'dot'],
  ['middleDot', 'dot'],
  ['hyphen', 'hyphen'],
  ['underscore', 'underscore'],
  ['heavy', 'underscore'],
]);

/**
 * Applique un `w:tabs` sur les taquets hérités : `w:clear` retire le taquet à cette
 * position (c'est ainsi qu'un paragraphe annule un taquet de son style), tout autre
 * `w:val` en pose un (ou remplace celui de la position), avec son alignement et ses
 * points de suite. La position `w:pos` est en twips, bornée à 1584 pt ; une position
 * négative (`ST_SignedTwipsMeasure`, Word l'accepte) est ignorée : le `core` ne relit que
 * des positions ≥ 0 (`sanitizeTabStop`), un `data-stop="-36pt"` serait perdu (R42-03).
 */
function applyTabStops(tabs: Element, acc: MutableParagraph): void {
  for (const tab of childrenNamed(tabs, 'tab')) {
    const position = distanceAttr(wordAttribute(tab, 'pos'));
    if (position === undefined || position < 0) continue;
    const stops = acc.tabStops ?? new Map<number, TabStopFormat>();
    const val = wordAttribute(tab, 'val');
    if (val === 'clear') {
      stops.delete(position);
    } else {
      const align = TAB_ALIGNS.get(val);
      const leader = TAB_LEADERS.get(wordAttribute(tab, 'leader'));
      stops.set(position, { ...(align ? { align } : {}), ...(leader ? { leader } : {}) });
    }
    acc.tabStops = stops;
  }
}

/** Applique les côtés d'un conteneur de bordures sur la carte héritée (`nil` efface). */
export function applyBorders(container: Element, borders: Map<BorderSide, BlockBorder>): void {
  for (const side of BORDER_SIDES) {
    const element = childNamed(container, side);
    if (!element) continue;
    const border = readBorderElement(element, side);
    if (border) borders.set(side, border);
    else borders.delete(side);
  }
}

/** Bordures ordonnées comme le contrat les sérialise : haut, droite, bas, gauche, entre. */
export function orderedBorders(borders: ReadonlyMap<BorderSide, BlockBorder>): BlockBorder[] {
  const out: BlockBorder[] = [];
  for (const side of BORDER_SIDES) {
    const border = borders.get(side);
    if (border) out.push(border);
  }
  return out;
}

function readAlign(jc: Element): ParagraphAlign | undefined {
  switch (wordAttribute(jc, 'val')) {
    case 'left':
    case 'start':
      return 'left';
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    case 'both':
    case 'distribute':
      return 'justify';
    default:
      return undefined;
  }
}

/**
 * `w:spacing` : `w:before` / `w:after` sont des `ST_TwipsMeasure`, non signés — une valeur
 * négative vient d'un producteur cassé et est ignorée (R53-03) ; `w:line` vaut un multiple
 * (`auto`, en 240e) ou des points (`exact`, `atLeast`), strictement positifs ; un
 * `w:lineRule` inconnu est ignoré, comme Word ignore un attribut hors schéma (R53-04).
 */
function applySpacing(spacing: Element, acc: MutableParagraph): void {
  const before = distanceAttr(wordAttribute(spacing, 'before'));
  if (before !== undefined && before >= 0) acc.spacingBeforePt = before;
  const after = distanceAttr(wordAttribute(spacing, 'after'));
  if (after !== undefined && after >= 0) acc.spacingAfterPt = after;
  const line = numberAttr(wordAttribute(spacing, 'line'));
  if (line === undefined) return;
  const rule = wordAttribute(spacing, 'lineRule') || 'auto';
  if (rule === 'auto') {
    const multiple = bounded(lineToMultiple(line), 0, WORD_LIMITS.lineMultipleMax);
    if (multiple === undefined || multiple <= 0) return;
    acc.lineHeight = multiple;
    delete acc.lineHeightPt;
    delete acc.lineRule;
  } else if (rule === 'exact' || rule === 'atLeast') {
    const exact = bounded(twipsToPt(line), 0, WORD_LIMITS.distanceMaxPt);
    if (exact === undefined || exact <= 0) return;
    acc.lineHeightPt = exact;
    acc.lineRule = rule;
    delete acc.lineHeight;
  }
}

function applyIndent(ind: Element, acc: MutableParagraph): void {
  const left = distanceAttr(wordAttribute(ind, 'left') || wordAttribute(ind, 'start'));
  if (left !== undefined) acc.indentLeftPt = left;
  const right = distanceAttr(wordAttribute(ind, 'right') || wordAttribute(ind, 'end'));
  if (right !== undefined) acc.indentRightPt = right;
  // `hanging` l'emporte sur `firstLine` quand les deux sont posés (comportement Word).
  const hanging = distanceAttr(wordAttribute(ind, 'hanging'));
  const firstLine = distanceAttr(wordAttribute(ind, 'firstLine'));
  if (hanging !== undefined) acc.indentFirstLinePt = -hanging;
  else if (firstLine !== undefined) acc.indentFirstLinePt = firstLine;
}

function applyNumbering(numPr: Element, acc: MutableParagraph): void {
  const numId = childNamed(numPr, 'numId');
  if (!numId) return;
  const id = wordAttribute(numId, 'val');
  if (id === '' || id === '0') {
    delete acc.numbering;
    return;
  }
  const ilvl = childNamed(numPr, 'ilvl');
  const level = numberAttr(ilvl ? wordAttribute(ilvl, 'val') : undefined) ?? 0;
  acc.numbering = { numId: id, level };
}

/** Applique un `w:pPr` (de style ou direct) sur l'accumulateur. `w:pStyle` n'est pas lu ici. */
export function applyParagraphProperties(pPr: Element, acc: MutableParagraph): void {
  for (const child of Array.from(pPr.children)) {
    switch (child.localName) {
      case 'jc': {
        const align = readAlign(child);
        if (align) acc.align = align;
        break;
      }
      case 'spacing':
        applySpacing(child, acc);
        break;
      case 'ind':
        applyIndent(child, acc);
        break;
      case 'pBdr':
        applyBorders(child, acc.borders);
        break;
      case 'tabs':
        applyTabStops(child, acc);
        break;
      case 'shd': {
        const fill = readShadingFill(child);
        if (fill) acc.shading = fill;
        else delete acc.shading;
        break;
      }
      case 'keepNext':
        acc.keepWithNext = onOff(wordAttribute(child, 'val'));
        break;
      case 'pageBreakBefore':
        acc.pageBreakBefore = onOff(wordAttribute(child, 'val'));
        break;
      case 'numPr':
        applyNumbering(child, acc);
        break;
      case 'outlineLvl': {
        const level = numberAttr(wordAttribute(child, 'val'));
        if (level !== undefined) acc.outlineLevel = level;
        break;
      }
      default:
        break;
    }
  }
}

/** Propriétés de paragraphe figées, sans le niveau de plan (converti par `styles.ts`). */
export function finalizeParagraph(
  acc: MutableParagraph,
  runDefaults: ResolvedRunProps,
): Omit<DocxParagraphProps, 'styleId' | 'headingLevel'> {
  const out: {
    -readonly [K in keyof DocxParagraphProps]?: DocxParagraphProps[K];
  } = {};
  if (acc.align) out.align = acc.align;
  if (acc.lineHeightPt !== undefined) out.lineHeightPt = acc.lineHeightPt;
  else if (acc.lineHeight !== undefined) out.lineHeight = acc.lineHeight;
  if (acc.spacingBeforePt !== undefined) out.spacingBeforePt = acc.spacingBeforePt;
  if (acc.spacingAfterPt !== undefined) out.spacingAfterPt = acc.spacingAfterPt;
  if (acc.indentLeftPt !== undefined) out.indentLeftPt = acc.indentLeftPt;
  if (acc.indentRightPt !== undefined) out.indentRightPt = acc.indentRightPt;
  if (acc.indentFirstLinePt !== undefined) out.indentFirstLinePt = acc.indentFirstLinePt;
  const borders = orderedBorders(acc.borders);
  if (borders.length > 0) out.borders = borders;
  if (acc.shading) out.shading = acc.shading;
  if (acc.keepWithNext) out.keepWithNext = true;
  if (acc.pageBreakBefore) out.pageBreakBefore = true;
  if (acc.numbering) out.numbering = acc.numbering;
  if (acc.tabStops && acc.tabStops.size > 0) {
    out.tabStops = Array.from(acc.tabStops.entries())
      .sort(([a], [b]) => a - b)
      .map(([positionPt, format]): TabStop => ({ positionPt, ...format }));
  }
  return { ...out, runDefaults };
}
