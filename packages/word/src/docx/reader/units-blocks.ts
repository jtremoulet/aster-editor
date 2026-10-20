import type { BlockBorder, BorderSide, BorderStyle } from '@aster-editor/core';
import { childrenNamed, wordAttribute } from '../preprocess/xml-utils';
import { pt } from './html';

/**
 * Conversions d'unités et lecture des bordures et fonds pour les blocs du lecteur
 * (tableaux, images, sections). Lot L25 ; L24 écrit ses propres conversions pour les
 * runs et paragraphes dans `units.ts` : doublon assumé le temps de la vague, à fusionner
 * par l'orchestrateur.
 */

const TWIPS_PER_PT = 20;
const TWIPS_PER_INCH = 1440;
const MM_PER_INCH = 25.4;
const EMU_PER_INCH = 914400;
const PX_PER_INCH = 96;
const PT_PER_INCH = 72;
/** Un twip = 1/15 px à 96 dpi, ce que Tiptap attend pour `colwidth`. */
const TWIPS_PER_PX = 15;

/** Arrondi à deux décimales, pour ne jamais sortir `12.700000000000001`. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Twips (1/20 pt) → points. */
export function twipsToPt(twips: number): number {
  return round2(twips / TWIPS_PER_PT);
}

/** Twips → millimètres, deux décimales (`1134` → `20.0`, `720` → `12.7`). */
export function twipsToMm(twips: number): number {
  return round2((twips / TWIPS_PER_INCH) * MM_PER_INCH);
}

/** Twips → pixels entiers (largeurs de colonnes Tiptap). */
export function twipsToPx(twips: number): number {
  return Math.round(twips / TWIPS_PER_PX);
}

/** EMU (914 400 par pouce) → pixels entiers à 96 dpi. */
export function emuToPx(emu: number): number {
  return Math.round((emu / EMU_PER_INCH) * PX_PER_INCH);
}

/** Points → pixels entiers à 96 dpi (dimensions VML `style="width:72pt"`). */
export function ptToPx(points: number): number {
  return Math.round((points / PT_PER_INCH) * PX_PER_INCH);
}

/** Huitièmes de point (`w:sz` des bordures) → points. */
export function eighthsToPt(eighths: number): number {
  return round2(eighths / 8);
}

/** Nombre lu dans un attribut `w:…`, `undefined` si absent ou non numérique. */
export function numericAttribute(element: Element | null, name: string): number | undefined {
  if (!element) return undefined;
  const raw = wordAttribute(element, name);
  if (raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Vrai pour un attribut booléen Word absent (`<w:tblHeader/>` = vrai) ou valant `1`/`true`/`on`. */
export function booleanAttribute(element: Element | null): boolean {
  if (!element) return false;
  const value = wordAttribute(element, 'val').toLowerCase();
  return value === '' || value === '1' || value === 'true' || value === 'on';
}

const DASHED_STYLES: ReadonlySet<string> = new Set([
  'dashed',
  'dashSmallGap',
  'dotDash',
  'dotDotDash',
  'dashDotStroked',
]);
const DOTTED_STYLES: ReadonlySet<string> = new Set(['dotted']);
const DOUBLE_STYLES: ReadonlySet<string> = new Set([
  'double',
  'triple',
  'doubleWave',
  'thinThickSmallGap',
  'thickThinSmallGap',
  'thinThickThinSmallGap',
  'thinThickMediumGap',
  'thickThinMediumGap',
  'thinThickThinMediumGap',
  'thinThickLargeGap',
  'thickThinLargeGap',
  'thinThickThinLargeGap',
]);

/**
 * Style CSS d'une bordure Word (`w:val`). `nil`/`none` → `null` (pas de bordure) ; les
 * dizaines de styles décoratifs de Word sont ramenés aux quatre du contrat.
 */
export function borderStyleOf(value: string): BorderStyle | null {
  if (value === '' || value === 'nil' || value === 'none') return null;
  if (DASHED_STYLES.has(value)) return 'dashed';
  if (DOTTED_STYLES.has(value)) return 'dotted';
  if (DOUBLE_STYLES.has(value)) return 'double';
  return 'solid';
}

const HEX_COLOR = /^[0-9a-f]{6}$/i;

/** Couleur Word (`000000`, `auto`) → CSS `#rrggbb`, `auto` ou invalide → repli. */
export function cssColor(value: string, fallback = '#000000'): string {
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? `#${trimmed.toLowerCase()}` : fallback;
}

/** Couleur de fond d'un `w:shd` (`w:fill`), `undefined` si absente, `auto` ou non hexadécimale. */
export function shadingColor(shd: Element | null): string | undefined {
  if (!shd) return undefined;
  const fill = wordAttribute(shd, 'fill');
  if (HEX_COLOR.test(fill)) return `#${fill.toLowerCase()}`;
  // `w:val="solid"` : le motif plein prend la couleur `w:color`.
  if (wordAttribute(shd, 'val') === 'solid') {
    const color = wordAttribute(shd, 'color');
    if (HEX_COLOR.test(color)) return `#${color.toLowerCase()}`;
  }
  return undefined;
}

/** Noms des bordures d'un conteneur Word, côtés plus bordures intérieures de tableau. */
export type BorderName = 'top' | 'right' | 'bottom' | 'left' | 'insideH' | 'insideV';

/** Bordures lues : `null` = explicitement sans bordure (`nil`), absent = non précisé. */
export type BorderMap = Partial<Record<BorderName, BlockBorder | null>>;

/** Côtés CSS dans l'ordre de sérialisation du contrat. */
export const CSS_SIDES: readonly BorderSide[] = ['top', 'right', 'bottom', 'left'];

const BORDER_ELEMENTS: ReadonlyMap<string, BorderName> = new Map([
  ['top', 'top'],
  ['right', 'right'],
  ['end', 'right'],
  ['bottom', 'bottom'],
  ['left', 'left'],
  ['start', 'left'],
  ['insideH', 'insideH'],
  ['insideV', 'insideV'],
]);

/** Bordure d'un élément `w:top`, `w:left`… `null` si `nil`/`none`. */
export function readBorderElement(element: Element, side: BorderSide): BlockBorder | null {
  const style = borderStyleOf(wordAttribute(element, 'val'));
  if (!style) return null;
  const size = numericAttribute(element, 'sz') ?? 0;
  return {
    side,
    style,
    // Un `w:sz` absent ou nul avec un style visible : Word trace un filet fin.
    widthPt: size > 0 ? eighthsToPt(size) : 0.5,
    color: cssColor(wordAttribute(element, 'color')),
  };
}

/**
 * Lit `w:tblBorders`, `w:tcBorders` ou `w:pBdr`. Les bordures intérieures (`insideH`,
 * `insideV`) sont rangées sous leur nom avec un côté provisoire, à re-côté par l'appelant.
 */
export function readBorders(container: Element | null): BorderMap {
  const map: BorderMap = {};
  if (!container) return map;
  for (const child of Array.from(container.children)) {
    const name = BORDER_ELEMENTS.get(child.localName);
    if (!name) continue;
    const side: BorderSide = name === 'insideH' ? 'top' : name === 'insideV' ? 'left' : name;
    map[name] = readBorderElement(child, side);
  }
  return map;
}

/** Bordure recôtée (`insideH` appliquée au bas d'une cellule, par exemple). */
export function withSide(border: BlockBorder, side: BorderSide): BlockBorder {
  return border.side === side ? border : { ...border, side };
}

/** Liste de bordures → table par côté, pour fusionner style et propriétés directes. */
export function bordersBySide(
  borders: readonly BlockBorder[] | undefined,
): Partial<Record<BorderSide, BlockBorder>> {
  const map: Partial<Record<BorderSide, BlockBorder>> = {};
  for (const border of borders ?? []) map[border.side] = border;
  return map;
}

/**
 * Déclarations CSS `border-top: 0.5pt solid #000000`… dans l'ordre du contrat
 * (`top`, `right`, `bottom`, `left`), les côtés absents étant omis.
 */
export function borderDeclarations(
  borders: Partial<Record<BorderSide, BlockBorder | null | undefined>>,
): (readonly [string, string | undefined])[] {
  return CSS_SIDES.map((side) => {
    const border = borders[side];
    return [
      `border-${side}`,
      border ? `${pt(border.widthPt)} ${border.style} ${border.color}` : undefined,
    ] as const;
  });
}

/** Marges `top right bottom left` en points. */
export type PaddingPt = readonly [number, number, number, number];

/** Marges partielles lues dans `w:tblCellMar` ou `w:tcMar`, en points. */
export type PartialPadding = Partial<Record<BorderSide, number>>;

/**
 * Lit `w:tblCellMar` / `w:tcMar` : `w:top`, `w:left` (ou `w:start`), `w:bottom`, `w:right`
 * (ou `w:end`) avec `w:w` en twips (`w:type="dxa"`) ou `nil` (0).
 */
export function readCellMargins(container: Element | null): PartialPadding {
  const result: PartialPadding = {};
  if (!container) return result;
  for (const child of Array.from(container.children)) {
    const name = BORDER_ELEMENTS.get(child.localName);
    if (!name || name === 'insideH' || name === 'insideV') continue;
    const type = wordAttribute(child, 'type');
    if (type === 'nil') {
      result[name] = 0;
      continue;
    }
    const width = numericAttribute(child, 'w');
    if (width !== undefined) result[name] = twipsToPt(width);
  }
  return result;
}

/** Marges de cellule par défaut de Word : 0 en haut et en bas, 108 twips (5,4 pt) à gauche et à droite. */
const WORD_DEFAULT_PADDING: PaddingPt = [0, 5.4, 0, 5.4];

/**
 * Fusionne des marges partielles, de la moins prioritaire à la plus prioritaire. Retourne
 * `undefined` si aucune n'est définie (l'éditeur garde son défaut), sinon complète les
 * côtés manquants avec les défauts de Word.
 */
export function mergePadding(
  base: PaddingPt | undefined,
  ...layers: readonly PartialPadding[]
): PaddingPt | undefined {
  const merged: PartialPadding = base
    ? { top: base[0], right: base[1], bottom: base[2], left: base[3] }
    : {};
  for (const layer of layers) Object.assign(merged, layer);
  if (Object.keys(merged).length === 0) return undefined;
  return [
    merged.top ?? WORD_DEFAULT_PADDING[0],
    merged.right ?? WORD_DEFAULT_PADDING[1],
    merged.bottom ?? WORD_DEFAULT_PADDING[2],
    merged.left ?? WORD_DEFAULT_PADDING[3],
  ];
}

/** `padding: 2pt 4pt 2pt 4pt`, valeur CSS d'un `PaddingPt`. */
export function paddingValue(padding: PaddingPt | undefined): string | undefined {
  return padding ? padding.map((value) => pt(value)).join(' ') : undefined;
}

/** Largeurs de colonnes `w:tblGrid/w:gridCol` en pixels entiers, vide sans grille. */
export function readGridColumns(table: Element): number[] {
  const grid = childrenNamed(table, 'tblGrid')[0];
  if (!grid) return [];
  return childrenNamed(grid, 'gridCol')
    .map((col) => numericAttribute(col, 'w'))
    .filter((width): width is number => width !== undefined)
    .map(twipsToPx);
}
