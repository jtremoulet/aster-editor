import type { BlockBorder, BorderSide, BorderStyle } from '@aster-editor/core';
import { childrenNamed, wordAttribute } from '../preprocess/xml-utils.js';
import { pt } from './html.js';

/**
 * Conversions d'unités, couleurs, attributs et bordures OOXML, partagés par tous les
 * modules du lecteur et par le comparateur. Les twips (1/20 pt), demi-points, huitièmes
 * de point et EMU n'existent que dans le paquet `word` : tout ce qui sort est en points,
 * millimètres ou pixels, arrondi à deux décimales (sauf les pixels entiers que Tiptap
 * attend pour `colwidth` et les dimensions d'image). Une seule source de vérité pour les
 * arrondis (L45 : fusion de `units.ts` de L24 et `units-blocks.ts` de L25).
 */

const TWIPS_PER_PT = 20;
const TWIPS_PER_INCH = 1440;
const MM_PER_INCH = 25.4;
const EMU_PER_PT = 12700;
const EMU_PER_PX = 9525;
const EMU_PER_INCH = 914400;
const PX_PER_INCH = 96;
const PT_PER_INCH = 72;
/** Un twip = 1/15 px à 96 dpi, ce que Tiptap attend pour `colwidth`. */
const TWIPS_PER_PX = 15;

/** Arrondi à deux décimales, sans flottement (`0.1 + 0.2`, `12.700000000000001`). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Nombre décimal strict : ni hexadécimal (`0x20`), ni exposant (`1e300`), ni `Infinity`. */
const DECIMAL_NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * Entier d'un attribut OOXML, `undefined` si absent ou non numérique. Les valeurs
 * décimales (`"12.5"`, tolérées par certains producteurs) sont acceptées ; tout ce que
 * `Number()` accepterait en plus (hexadécimal, exposant, espaces internes) est rejeté
 * (décision F24, appliquée aux runs, paragraphes et blocs).
 */
export function numberAttr(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (!DECIMAL_NUMBER.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** `numberAttr` de l'attribut `w:<name>` d'un élément (`undefined` sans élément). */
export function numericAttribute(element: Element | null, name: string): number | undefined {
  return element ? numberAttr(wordAttribute(element, name)) : undefined;
}

/**
 * Booléen OOXML (`w:b`, `w:i`, `w:keepNext`, `w:tblHeader`…) : l'élément présent sans
 * `w:val` vaut vrai ; `0`, `false`, `off` valent faux (et annulent la valeur héritée).
 */
export function onOff(value: string | null | undefined): boolean {
  const val = (value ?? '').trim().toLowerCase();
  return val === '' || val === '1' || val === 'true' || val === 'on';
}

/** `onOff` du `w:val` d'un élément booléen ; faux sans élément. */
export function booleanAttribute(element: Element | null): boolean {
  return element ? onOff(wordAttribute(element, 'val')) : false;
}

/**
 * Bornes de Word (ce que son interface accepte), en points : une valeur hors de ces
 * bornes vient d'un producteur cassé ou d'un document hostile et est ignorée, comme une
 * valeur non numérique — jamais écrite en CSS, jamais une exception.
 */
export const WORD_LIMITS = {
  /** Taille de police `w:sz` : 1 à 1638 pt. */
  fontSizeMinPt: 1,
  fontSizeMaxPt: 1638,
  /** Largeur de bordure `w:sz` (huitièmes) : 12 pt au plus. */
  borderMaxPt: 12,
  /** Retraits, espacements avant/après, interligne exact, espacement de caractères : ±1584 pt. */
  distanceMaxPt: 1584,
  /** Interligne multiple (`w:lineRule="auto"`) : 132 lignes au plus. */
  lineMultipleMax: 132,
} as const;

/** `value` s'il est dans `[min, max]`, sinon `undefined` (valeur hors bornes ignorée). */
export function bounded(value: number | undefined, min: number, max: number): number | undefined {
  return value !== undefined && value >= min && value <= max ? value : undefined;
}

/** Distance signée (retrait, espacement) bornée à ±1584 pt. */
export function boundedDistancePt(value: number | undefined): number | undefined {
  return bounded(value, -WORD_LIMITS.distanceMaxPt, WORD_LIMITS.distanceMaxPt);
}

/**
 * Nom de police acceptable : lettres, chiffres, espace, point, tiret, 64 caractères au
 * plus (`Arial Narrow`, `Wingdings 2`, `Noto Sans CJK`). Tout le reste — en particulier
 * un `;` ou un `(` qui ferait sortir de la déclaration `font-family` — est ignoré.
 */
const FONT_NAME = /^[\w .-]{1,64}$/u;

/** Nom de police validé et épuré des espaces de bord, `undefined` s'il est irrecevable. */
export function fontName(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return FONT_NAME.test(trimmed) ? trimmed : undefined;
}

/** Identifiant CSS simple : pas d'espace, pas de point, ne commence pas par un chiffre. */
const CSS_IDENTIFIER = /^-?[A-Za-z_][\w-]*$/;

/**
 * Valeur CSS de `font-family` pour un nom validé par `fontName` : citée entre guillemets
 * dès qu'elle n'est pas un identifiant CSS (`"Wingdings 2"`, `"Arial Narrow"`), sinon
 * telle quelle (`Calibri`). Le nom ne contient ni `"` ni `\`, aucun échappement n'est
 * nécessaire ; le core relit la valeur citée telle quelle et la ré-émet à l'identique.
 */
export function cssFontFamily(name: string): string {
  return CSS_IDENTIFIER.test(name) ? name : `"${name}"`;
}

/** Twips → points (`240` → `12`). */
export function twipsToPt(twips: number): number {
  return round2(twips / TWIPS_PER_PT);
}

/** Twips → millimètres (`1440` → `25.4`, `1134` → `20`, `708` → `12.49`). */
export function twipsToMm(twips: number): number {
  return round2((twips / TWIPS_PER_INCH) * MM_PER_INCH);
}

/** Twips → pixels entiers (largeurs de colonnes Tiptap). */
export function twipsToPx(twips: number): number {
  return Math.round(twips / TWIPS_PER_PX);
}

/** Demi-points (`w:sz`) → points (`22` → `11`). */
export function halfPointsToPt(halfPoints: number): number {
  return round2(halfPoints / 2);
}

/** Huitièmes de point (`w:sz` des bordures) → points (`4` → `0.5`). */
export function eighthPointsToPt(eighths: number): number {
  return round2(eighths / 8);
}

/** EMU → points (`127000` → `10`). */
export function emuToPt(emu: number): number {
  return round2(emu / EMU_PER_PT);
}

/** EMU → pixels CSS à 96 dpi, deux décimales (`952500` → `100`) : valeur comparée par le rapport de fidélité. */
export function emuToPx(emu: number): number {
  return round2(emu / EMU_PER_PX);
}

/** EMU → pixels entiers à 96 dpi (`914400` → `96`) : dimensions `width`/`height` des images. */
export function emuToPxInt(emu: number): number {
  return Math.round((emu / EMU_PER_INCH) * PX_PER_INCH);
}

/** Points → pixels entiers à 96 dpi (dimensions VML `style="width:72pt"`). */
export function ptToPx(points: number): number {
  return Math.round((points / PT_PER_INCH) * PX_PER_INCH);
}

/** Cinquantièmes de pour cent (`w:w w:type="pct"`, `5000` → `100`). */
export function fiftiethsToPercent(fiftieths: number): number {
  return round2(fiftieths / 50);
}

/** Interligne multiple `w:line` en 240e (`276` → `1.15`). */
export function lineToMultiple(line: number): number {
  return round2(line / 240);
}

/** Couleur `#rrggbb` minuscule : `RRGGBB` → `#rrggbb` ; `auto`, `none`, vide ou invalide → `undefined`. */
export function hexColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(trimmed)) return undefined;
  return `#${trimmed.toLowerCase()}`;
}

/** Couleur de bordure : comme `hexColor` mais `auto` (et absent, invalide) → `fallback`, noir comme Word l'affiche. */
export function borderColor(value: string | null | undefined, fallback = '#000000'): string {
  return hexColor(value) ?? fallback;
}

/** Couleur de fond d'un `w:shd` (`w:fill`, ou `w:color` d'un motif `solid`), `undefined` si absente, `auto` ou invalide. */
export function shadingColor(shd: Element | null): string | undefined {
  if (!shd) return undefined;
  const fill = hexColor(wordAttribute(shd, 'fill'));
  if (fill) return fill;
  // `w:val="solid"` : le motif plein prend la couleur `w:color`.
  return wordAttribute(shd, 'val') === 'solid' ? hexColor(wordAttribute(shd, 'color')) : undefined;
}

/**
 * Surlignages nommés de Word (`w:highlight`), valeurs d'affichage de Word. Clés en
 * minuscules : la recherche se fait sur le nom abaissé (`darkBlue`, `DarkBlue` et
 * `darkblue` désignent la même couleur).
 */
const HIGHLIGHT_COLORS: Readonly<Record<string, string>> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkblue: '#000080',
  darkcyan: '#008080',
  darkgreen: '#008000',
  darkmagenta: '#800080',
  darkred: '#800000',
  darkyellow: '#808000',
  darkgray: '#808080',
  lightgray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff',
};

/** Surlignage nommé → `#rrggbb`, `none` ou inconnu → `undefined`. */
export function highlightColor(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return HIGHLIGHT_COLORS[name.trim().toLowerCase()];
}

/**
 * Style de bordure OOXML (`w:val`) → style du contrat. `nil`/`none` (ou absent) → `null`
 * (pas de bordure, annule une bordure héritée). Les dizaines de motifs décoratifs de
 * Word (3D, artistiques, `thinThickSmallGap`…) sont ramenés aux quatre du contrat.
 */
export function borderStyleOf(value: string | null | undefined): BorderStyle | null {
  const val = (value ?? '').trim();
  if (val === '' || val === 'nil' || val === 'none') return null;
  if (/^(?:dotted|dotDash|dotDotDash)$/i.test(val)) return val === 'dotted' ? 'dotted' : 'dashed';
  if (/^dash/i.test(val)) return 'dashed';
  if (/^(?:double|triple|thinThick|thickThin|thinThickThin|thickThinThick)/i.test(val)) {
    return 'double';
  }
  return 'solid';
}

/** Largeur de bordure par défaut de Word quand `w:sz` est absent, nul ou irrecevable : ½ pt. */
const DEFAULT_BORDER_WIDTH_PT = 0.5;

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

/**
 * Bordure d'un élément `w:top`, `w:left`… de `w:pBdr`, `w:tcBorders`, `w:tblBorders`,
 * de style comme direct : le **seul** lecteur de bordure du paquet (`properties.readBorder`
 * en est l'alias, R42-05). `null` si `nil`/`none` ; `w:val` → style ; un `w:sz` absent,
 * nul ou hors bornes (> 12 pt) avec un style visible donne le filet fin de Word (½ pt) ;
 * `w:color` `auto` ou absent → noir, toute couleur hexadécimale conservée telle quelle
 * (`BFBFBF` reste `#bfbfbf`) ; `w:space` en points → `spacePt` s'il est présent et dans
 * les bornes.
 */
export function readBorderElement(element: Element, side: BorderSide): BlockBorder | null {
  const style = borderStyleOf(wordAttribute(element, 'val'));
  if (!style) return null;
  const widthPt = eighthPointsToPt(numericAttribute(element, 'sz') ?? 0);
  const spacePt = bounded(numericAttribute(element, 'space'), 0, WORD_LIMITS.distanceMaxPt);
  return {
    side,
    style,
    widthPt: widthPt > 0 && widthPt <= WORD_LIMITS.borderMaxPt ? widthPt : DEFAULT_BORDER_WIDTH_PT,
    color: borderColor(wordAttribute(element, 'color')),
    ...(spacePt !== undefined ? { spacePt } : {}),
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
    if (wordAttribute(child, 'type') === 'nil') {
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
