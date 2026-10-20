import type { BlockBorder, BorderSide } from '@aster-editor/core';
import { childNamed, childrenNamed, wordAttribute } from '../preprocess/xml-utils';
import { distanceAttr, readShadingFill } from './properties-run';
import type { ParagraphAlign, ResolvedParagraphProps, ResolvedRunProps } from './types';
import {
  borderColor,
  borderStyleOf,
  bounded,
  eighthPointsToPt,
  lineToMultiple,
  numberAttr,
  onOff,
  twipsToPt,
  WORD_LIMITS,
} from './units';

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
} from './properties-run';

/** Accumulateur de paragraphe. `outlineLevel` est en base 0 comme dans le XML. */
export interface MutableParagraph {
  align?: ParagraphAlign;
  lineHeight?: number;
  lineHeightPt?: number;
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
  /** Taquets de tabulation en points, clé = position (`w:tabs`, `w:clear` retire). */
  tabStops?: Map<number, true>;
}

/**
 * Propriétés de paragraphe d'Aster : le contrat plus les taquets de tabulation résolus
 * (style puis direct), positions croissantes en points. `runs.ts` attribue le n-ième
 * taquet à la n-ième tabulation du paragraphe. L'alignement du taquet (`left`, `center`,
 * `right`, `decimal`) est hors contrat et n'est pas conservé.
 */
export interface DocxParagraphProps extends ResolvedParagraphProps {
  readonly tabStopsPt?: readonly number[];
}

/** Taquets d'un paragraphe résolu quelconque, vide pour un résolveur tiers ou stub. */
export function tabStopsOf(props: ResolvedParagraphProps): readonly number[] {
  return 'tabStopsPt' in props ? ((props as DocxParagraphProps).tabStopsPt ?? []) : [];
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

/** Largeur de bordure par défaut de Word quand `w:sz` est absent ou irrecevable : ½ pt. */
const DEFAULT_BORDER_WIDTH_PT = 0.5;

/**
 * Une bordure OOXML (`w:top`, `w:left`… de `w:pBdr`, `w:tcBorders`, `w:tblBorders`) :
 * `w:val` → style, `w:sz` en huitièmes de point → `widthPt` (au plus 12 pt, sinon la
 * largeur par défaut), `w:color` (`auto` ou absent → noir, toute couleur hexadécimale
 * conservée telle quelle : `BFBFBF` reste `#bfbfbf`), `w:space` en points → `spacePt`
 * (seulement s'il est présent et dans les bornes). `null` pour `nil`/`none` : la bordure
 * est explicitement absente.
 */
export function readBorder(element: Element, side: BorderSide): BlockBorder | null {
  const style = borderStyleOf(wordAttribute(element, 'val'));
  if (style === null) return null;
  const size = numberAttr(wordAttribute(element, 'sz'));
  const widthPt =
    size === undefined ? undefined : bounded(eighthPointsToPt(size), 0, WORD_LIMITS.borderMaxPt);
  const spacePt = bounded(
    numberAttr(wordAttribute(element, 'space')),
    0,
    WORD_LIMITS.distanceMaxPt,
  );
  return {
    side,
    style,
    widthPt: widthPt ?? DEFAULT_BORDER_WIDTH_PT,
    color: borderColor(wordAttribute(element, 'color')),
    ...(spacePt !== undefined ? { spacePt } : {}),
  };
}

/**
 * Applique un `w:tabs` sur les taquets hérités : `w:clear` retire le taquet à cette
 * position (c'est ainsi qu'un paragraphe annule un taquet de son style), tout autre
 * `w:val` en pose un. La position `w:pos` est en twips, bornée à ±1584 pt.
 */
function applyTabStops(tabs: Element, acc: MutableParagraph): void {
  for (const tab of childrenNamed(tabs, 'tab')) {
    const position = distanceAttr(wordAttribute(tab, 'pos'));
    if (position === undefined) continue;
    const stops = acc.tabStops ?? new Map<number, true>();
    if (wordAttribute(tab, 'val') === 'clear') stops.delete(position);
    else stops.set(position, true);
    acc.tabStops = stops;
  }
}

/** Applique les côtés d'un conteneur de bordures sur la carte héritée (`nil` efface). */
export function applyBorders(container: Element, borders: Map<BorderSide, BlockBorder>): void {
  for (const side of BORDER_SIDES) {
    const element = childNamed(container, side);
    if (!element) continue;
    const border = readBorder(element, side);
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

function applySpacing(spacing: Element, acc: MutableParagraph): void {
  const before = distanceAttr(wordAttribute(spacing, 'before'));
  if (before !== undefined) acc.spacingBeforePt = before;
  const after = distanceAttr(wordAttribute(spacing, 'after'));
  if (after !== undefined) acc.spacingAfterPt = after;
  const line = numberAttr(wordAttribute(spacing, 'line'));
  if (line === undefined) return;
  const rule = wordAttribute(spacing, 'lineRule') || 'auto';
  if (rule === 'auto') {
    const multiple = bounded(lineToMultiple(line), 0, WORD_LIMITS.lineMultipleMax);
    if (multiple === undefined) return;
    acc.lineHeight = multiple;
    delete acc.lineHeightPt;
  } else {
    const exact = bounded(twipsToPt(line), 0, WORD_LIMITS.distanceMaxPt);
    if (exact === undefined) return;
    acc.lineHeightPt = exact;
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
    out.tabStopsPt = Array.from(acc.tabStops.keys()).sort((a, b) => a - b);
  }
  return { ...out, runDefaults };
}
