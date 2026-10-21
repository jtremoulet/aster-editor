import type {
  IBorderOptions,
  ITableBordersOptions,
  ITableCellBorders,
  ITableCellOptions,
  ITableOptions,
  ITableWidthProperties,
} from 'docx';
import type { ExportContext } from './context.js';
import {
  CSS_BORDER_SIDES,
  parseBorders,
  parseColor,
  parsePadding,
  parsePoints,
  parseStyle,
  pointsToTwips,
  type CssBorder,
  type CssBorderSide,
} from './css.js';
import { NIL_BORDER, borderOptions } from './styles.js';
import type { TableRowInfo } from './tables-grid.js';

/**
 * Propriétés de tableau et de cellule du contrat (`TableLayoutAttrs`, `CellLayoutAttrs`) :
 * bordures, alignement, largeur déclarée, fond, alignement vertical et marges internes.
 * Module de `tables.ts` (ré-exporté par lui) : découpage L45, aucune logique modifiée.
 */

/** Bordure Word explicitement absente (`w:val="nil"`). */
export const NO_BORDER: IBorderOptions = NIL_BORDER;

/** Bordure de cellule ou de tableau : CSS → `docx`, `nil` pour un côté déclaré sans trait. */
function tableBorder(border: CssBorder | null, side: CssBorderSide): IBorderOptions {
  return border ? borderOptions(border, side) : NO_BORDER;
}

/** Attribut d'alignement horizontal du tableau (`TableLayoutAttrs.align`, `w:jc`). */
const TABLE_ALIGN_ATTRIBUTE = 'data-align';

/**
 * Alignement horizontal du tableau (`w:jc`) : `data-align="center|right"` du contrat, ou
 * le centrage CSS usuel (`margin: auto`, `margin: 0 auto`, `margin-left/right: auto`), le
 * raccourci `margin` étant lu selon la règle TRBL à 1, 2 ou 4 valeurs (R43-08).
 * `undefined` pour `left` ou sans déclaration : Word aligne à gauche par défaut.
 */
export function tableAlignment(
  table: Element,
  style: ReadonlyMap<string, string>,
  ctx: ExportContext,
): ITableOptions['alignment'] | undefined {
  const { AlignmentType } = ctx.docx;
  switch (table.getAttribute(TABLE_ALIGN_ATTRIBUTE)?.trim().toLowerCase()) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'left':
      return undefined;
    default:
      break;
  }
  const margin = style.get('margin')?.trim().toLowerCase().split(/\s+/) ?? [];
  const left =
    style.get('margin-left')?.trim().toLowerCase() ?? margin[3] ?? margin[1] ?? margin[0];
  const right = style.get('margin-right')?.trim().toLowerCase() ?? margin[1] ?? margin[0];
  if (left === 'auto' && right === 'auto') return AlignmentType.CENTER;
  if (left === 'auto' && right !== undefined) return AlignmentType.RIGHT;
  return undefined;
}

type MutableCellBorders = { -readonly [K in keyof ITableCellBorders]: ITableCellBorders[K] };

/** Arêtes d'une cellule qui sont des bords extérieurs du tableau. */
export interface CellEdges {
  readonly top: boolean;
  readonly right: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
}

/**
 * Propriétés de cellule du contrat (`CellLayoutAttrs`, en `style` inline) : bordures par
 * côté (`w:tcBorders`), fond (`w:shd`), alignement vertical (`w:vAlign`), marges internes
 * (`w:tcMar`, `padding` en points). En mode explicite (tableau venu de l'import), le HTML
 * fait foi : un côté intérieur non déclaré est écrit `nil`, pour qu'un style de tableau du
 * gabarit ne le redessine pas ; les bords extérieurs restent ceux du tableau.
 */
export function cellLayout(
  cell: Element,
  ctx: ExportContext,
  explicit: boolean,
  edges: CellEdges,
): Pick<ITableCellOptions, 'borders' | 'shading' | 'verticalAlign' | 'margins'> {
  const style = parseStyle(cell.getAttribute('style'));
  const result: {
    -readonly [
      K in keyof Pick<ITableCellOptions, 'borders' | 'shading' | 'verticalAlign' | 'margins'>
    ]: ITableCellOptions[K];
  } = {};
  const borders: MutableCellBorders = {};
  const declared = parseBorders(style);
  for (const side of CSS_BORDER_SIDES) {
    const border = declared.get(side);
    if (border !== undefined) borders[side] = tableBorder(border, side);
    else if (explicit && !edges[side]) borders[side] = NO_BORDER;
  }
  if (Object.keys(borders).length > 0) result.borders = borders;
  const shading = parseColor(style.get('background-color'));
  if (shading) result.shading = { fill: shading, type: 'clear', color: 'auto' };
  switch (style.get('vertical-align')?.trim().toLowerCase()) {
    case 'top':
      result.verticalAlign = ctx.docx.VerticalAlignTable.TOP;
      break;
    case 'middle':
      result.verticalAlign = ctx.docx.VerticalAlignTable.CENTER;
      break;
    case 'bottom':
      result.verticalAlign = ctx.docx.VerticalAlignTable.BOTTOM;
      break;
    default:
      break;
  }
  const padding = parsePadding(style.get('padding'));
  if (padding) {
    const [top, right, bottom, left] = padding;
    result.margins = {
      marginUnitType: ctx.docx.WidthType.DXA,
      top: pointsToTwips(top),
      right: pointsToTwips(right),
      bottom: pointsToTwips(bottom),
      left: pointsToTwips(left),
    };
  }
  return result;
}

/**
 * Largeur déclarée du tableau (`TableLayoutAttrs.width` : `100%` ou `450pt`), `null` sans
 * déclaration lisible.
 */
export function declaredTableWidth(
  style: ReadonlyMap<string, string>,
  ctx: ExportContext,
): ITableWidthProperties | null {
  const raw = style.get('width')?.trim();
  if (!raw) return null;
  const percent = /^([\d.]+)%$/.exec(raw);
  if (percent) {
    const value = Number(percent[1]);
    return Number.isFinite(value) && value > 0
      ? { size: Math.min(100, value), type: ctx.docx.WidthType.PERCENTAGE }
      : null;
  }
  const points = parsePoints(raw);
  return points !== null && points > 0
    ? { size: pointsToTwips(points), type: ctx.docx.WidthType.DXA }
    : null;
}

/** Vrai si un `<td>`/`<th>` du tableau déclare une bordure dans son `style`. */
export function anyCellDeclaresBorders(rows: readonly TableRowInfo[]): boolean {
  return rows.some(({ cells }) =>
    cells.some((cell) => parseBorders(parseStyle(cell.getAttribute('style'))).size > 0),
  );
}

/**
 * Bordures du tableau. Un tableau qui vient de l'éditeur sans aucune bordure déclarée
 * garde le quadrillage simple de `docx` (lisible dans Word). Dès qu'une bordure est
 * déclarée (sur `<table>` ou une cellule) ou qu'un style Word est référencé, le contrat
 * fait foi : côtés extérieurs tels que déclarés, `nil` sinon, et aucun trait intérieur au
 * niveau du tableau (les cellules portent les leurs).
 */
export function tableBorders(
  style: ReadonlyMap<string, string>,
  explicit: boolean,
): ITableBordersOptions | undefined {
  const declared = parseBorders(style);
  if (!explicit && declared.size === 0) return undefined;
  const borders: { -readonly [K in keyof ITableBordersOptions]: ITableBordersOptions[K] } = {
    insideHorizontal: NO_BORDER,
    insideVertical: NO_BORDER,
  };
  for (const side of CSS_BORDER_SIDES)
    borders[side] = tableBorder(declared.get(side) ?? null, side);
  return borders;
}
