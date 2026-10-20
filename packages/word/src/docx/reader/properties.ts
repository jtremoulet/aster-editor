import type { BlockBorder, BorderSide, DecorationStyle } from '@aster-editor/core';
import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import type { ParagraphAlign, ResolvedParagraphProps, ResolvedRunProps } from './types';
import {
  borderColor,
  borderStyleOf,
  bounded,
  boundedDistancePt,
  eighthPointsToPt,
  fontName,
  halfPointsToPt,
  hexColor,
  highlightColor,
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
 * `tables.ts` (L25) peut réutiliser `readBorder` et `readShadingFill`.
 */

/** Polices du thème (`theme1.xml`), pour `w:asciiTheme="minorHAnsi"` et consorts. */
export interface ThemeFonts {
  readonly major?: string;
  readonly minor?: string;
}

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
}

/** Accumulateur de run ; `underline`/`strike` à `null` = explicitement sans trait. */
export interface MutableRun {
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: DecorationStyle | null;
  strike?: DecorationStyle | null;
  color?: string;
  highlight?: string;
  superscript?: boolean;
  subscript?: boolean;
  letterSpacingPt?: number;
  caps?: 'all' | 'small';
  runStyle?: string;
  lang?: string;
}

export function emptyParagraph(): MutableParagraph {
  return { borders: new Map() };
}

export function cloneParagraph(source: MutableParagraph): MutableParagraph {
  return { ...source, borders: new Map(source.borders) };
}

const BORDER_SIDES: readonly BorderSide[] = ['top', 'right', 'bottom', 'left', 'between'];

/** Largeur de bordure par défaut de Word quand `w:sz` est absent ou irrecevable : ½ pt. */
const DEFAULT_BORDER_WIDTH_PT = 0.5;

/**
 * Une bordure OOXML (`w:top`, `w:left`… de `w:pBdr`, `w:tcBorders`, `w:tblBorders`) :
 * `w:val` → style, `w:sz` en huitièmes de point → `widthPt` (au plus 12 pt, sinon la
 * largeur par défaut), `w:color` (`auto` → noir). `null` pour `nil`/`none` : la bordure
 * est explicitement absente.
 */
export function readBorder(element: Element, side: BorderSide): BlockBorder | null {
  const style = borderStyleOf(wordAttribute(element, 'val'));
  if (style === null) return null;
  const size = numberAttr(wordAttribute(element, 'sz'));
  const widthPt =
    size === undefined ? undefined : bounded(eighthPointsToPt(size), 0, WORD_LIMITS.borderMaxPt);
  return {
    side,
    style,
    widthPt: widthPt ?? DEFAULT_BORDER_WIDTH_PT,
    color: borderColor(wordAttribute(element, 'color')),
  };
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

/**
 * Fond d'un `w:shd` : la couleur `w:fill` en `#rrggbb`. `undefined` quand le fond est
 * absent, `auto` ou `nil` (ce qui efface un fond hérité). Les motifs (`pct25`…) sont
 * ignorés : seul le remplissage est représentable.
 */
export function readShadingFill(shd: Element): string | undefined {
  const val = wordAttribute(shd, 'val');
  if (val === 'nil') return undefined;
  return hexColor(wordAttribute(shd, 'fill'));
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

/** Distance en twips d'un attribut, bornée à ±1584 pt ; `undefined` si absente ou hors bornes. */
function distanceAttr(value: string): number | undefined {
  const twips = numberAttr(value);
  return twips === undefined ? undefined : boundedDistancePt(twipsToPt(twips));
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

/**
 * Police d'un `w:rFonts` : l'attribut de thème prime sur le nom explicite, `ascii` sur
 * `hAnsi`. Un nom qui n'est pas un nom de police (`fontName`) est ignoré : il finirait
 * tel quel dans un attribut `style`.
 */
function readFont(rFonts: Element, theme: ThemeFonts): string | undefined {
  for (const attr of ['asciiTheme', 'hAnsiTheme']) {
    const value = wordAttribute(rFonts, attr);
    if (!value) continue;
    const font = fontName(value.startsWith('major') ? theme.major : theme.minor);
    if (font) return font;
  }
  return fontName(wordAttribute(rFonts, 'ascii')) ?? fontName(wordAttribute(rFonts, 'hAnsi'));
}

function readUnderline(u: Element): DecorationStyle | null {
  const val = wordAttribute(u, 'val') || 'single';
  switch (val) {
    case 'none':
      return null;
    case 'double':
    case 'wavyDouble':
      return 'double';
    case 'dotted':
    case 'dottedHeavy':
      return 'dotted';
    case 'wave':
    case 'wavyHeavy':
      return 'wavy';
    default:
      return /^dash|^dotDash|^dotDotDash/i.test(val) ? 'dashed' : 'solid';
  }
}

/** Applique un `w:rPr` (de style ou direct) sur l'accumulateur. `w:rStyle` n'est pas lu ici. */
export function applyRunProperties(rPr: Element, acc: MutableRun, theme: ThemeFonts): void {
  for (const child of Array.from(rPr.children)) {
    const val = wordAttribute(child, 'val');
    switch (child.localName) {
      case 'rFonts': {
        const font = readFont(child, theme);
        if (font) acc.fontFamily = font;
        break;
      }
      case 'sz': {
        const halfPoints = numberAttr(val);
        const size =
          halfPoints === undefined
            ? undefined
            : bounded(
                halfPointsToPt(halfPoints),
                WORD_LIMITS.fontSizeMinPt,
                WORD_LIMITS.fontSizeMaxPt,
              );
        if (size !== undefined) acc.fontSizePt = size;
        break;
      }
      case 'b':
        acc.bold = onOff(val);
        break;
      case 'i':
        acc.italic = onOff(val);
        break;
      case 'u':
        acc.underline = readUnderline(child);
        break;
      case 'strike':
        acc.strike = onOff(val) ? 'solid' : null;
        break;
      case 'dstrike':
        acc.strike = onOff(val) ? 'double' : null;
        break;
      // `auto`/`none` posent `undefined` plutôt que de supprimer la clé : dans le delta d'un
      // style de caractère (`mergeRunDelta`), la clé présente efface la valeur héritée.
      case 'color':
        acc.color = hexColor(val);
        break;
      case 'highlight':
        acc.highlight = highlightColor(val);
        break;
      case 'shd': {
        // Fond de run : surlignage de repli, `w:highlight` garde la main s'il est posé.
        const fill = readShadingFill(child);
        if (fill && !childNamed(rPr, 'highlight')) acc.highlight = fill;
        break;
      }
      case 'vertAlign':
        acc.superscript = val === 'superscript';
        acc.subscript = val === 'subscript';
        break;
      case 'spacing': {
        const spacing = distanceAttr(val);
        if (spacing !== undefined) acc.letterSpacingPt = spacing;
        break;
      }
      case 'caps':
        if (onOff(val)) acc.caps = 'all';
        else if (acc.caps === 'all') delete acc.caps;
        break;
      case 'smallCaps':
        if (onOff(val)) acc.caps = 'small';
        else if (acc.caps === 'small') delete acc.caps;
        break;
      case 'lang':
        if (val) acc.lang = val;
        break;
      default:
        break;
    }
  }
}

/**
 * Applique le delta d'un style de caractère (ses `w:rPr` résolus sur un accumulateur
 * vide) sur les propriétés héritées du paragraphe. Les propriétés à bascule d'ECMA-376
 * §17.7.3 (`b`, `i`, `caps`, `smallCaps`, `strike`/`dstrike`) sont combinées en **XOR** :
 * un style `Strong` (gras) sur un titre déjà gras rend non gras, comme Word. Une bascule
 * explicitement désactivée dans le style (`w:b w:val="0"`) ne change rien (XOR avec
 * faux). Les autres propriétés remplacent l'héritée, y compris par `undefined`
 * (`w:color w:val="auto"` efface la couleur du paragraphe).
 */
export function mergeRunDelta(acc: MutableRun, delta: MutableRun): void {
  for (const key of Object.keys(delta) as (keyof MutableRun)[]) {
    switch (key) {
      case 'bold':
      case 'italic':
        if (delta[key]) acc[key] = !acc[key];
        break;
      case 'strike':
        if (delta.strike) acc.strike = acc.strike ? null : delta.strike;
        break;
      case 'caps':
        // `caps` et `smallCaps` sont deux bascules ; quand les deux finissent actives, la
        // casse du style de caractère l'emporte (un seul rendu possible dans le contrat).
        if (delta.caps) acc.caps = acc.caps === delta.caps ? undefined : delta.caps;
        break;
      default:
        (acc as Record<string, unknown>)[key] = delta[key];
        break;
    }
  }
}

/** Propriétés de run figées : les booléens faux, `null` et `undefined` disparaissent. */
export function finalizeRun(acc: MutableRun): ResolvedRunProps {
  const out: {
    -readonly [K in keyof ResolvedRunProps]: ResolvedRunProps[K];
  } = {};
  if (acc.fontFamily) out.fontFamily = acc.fontFamily;
  if (acc.fontSizePt !== undefined) out.fontSizePt = acc.fontSizePt;
  if (acc.bold) out.bold = true;
  if (acc.italic) out.italic = true;
  if (acc.underline) out.underline = acc.underline;
  if (acc.strike) out.strike = acc.strike;
  if (acc.color) out.color = acc.color;
  if (acc.highlight) out.highlight = acc.highlight;
  if (acc.superscript) out.superscript = true;
  if (acc.subscript) out.subscript = true;
  if (acc.letterSpacingPt !== undefined && acc.letterSpacingPt !== 0) {
    out.letterSpacingPt = acc.letterSpacingPt;
  }
  if (acc.caps) out.caps = acc.caps;
  if (acc.runStyle) out.runStyle = acc.runStyle;
  if (acc.lang) out.lang = acc.lang;
  return out;
}

/** Propriétés de paragraphe figées, sans le niveau de plan (converti par `styles.ts`). */
export function finalizeParagraph(
  acc: MutableParagraph,
  runDefaults: ResolvedRunProps,
): Omit<ResolvedParagraphProps, 'styleId' | 'headingLevel'> {
  const out: {
    -readonly [K in keyof ResolvedParagraphProps]?: ResolvedParagraphProps[K];
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
  return { ...out, runDefaults };
}
