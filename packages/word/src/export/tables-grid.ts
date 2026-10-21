import { warn, type ExportContext } from './context.js';
import { parsePixels, parseStyle } from './css.js';
import { childElements, positiveIntAttribute, tagOf } from './dom.js';

/**
 * Grille d'une table HTML : lignes et cellules, fusions bornées, largeurs de colonnes
 * (px et twips). Module de `tables.ts` (ré-exporté par lui) : découpage L45, aucune
 * logique modifiée.
 */

/** Nombre maximal de colonnes d'une table Word : plafond de `colspan` et de `<col span>`. */
export const MAX_TABLE_COLUMNS = 63;

/** Nombre maximal de lignes qu'une fusion verticale peut couvrir (`rowspan`). */
export const MAX_ROW_SPAN = 65_534;

/** Twips par pixel CSS à 96 dpi : 1 px = 0,75 pt = 15 twips. */
export const TWIPS_PER_PX = 15;

/**
 * Fusion lue sur `colspan`, `rowspan` ou `span`, 1 par défaut, bornée au plafond de
 * Word avec avertissement `table-span-clamped` : un `colspan="1000000"` ne doit ni
 * produire un fichier que Word refuse, ni faire allouer un million de colonnes.
 */
function spanAttribute(element: Element, name: string, max: number, ctx: ExportContext): number {
  const value = positiveIntAttribute(element, name);
  if (value === null) return 1;
  if (value <= max) return value;
  warn(
    ctx,
    'table-span-clamped',
    `${name}="${String(value)}" borné à ${String(max)}, plafond de Word`,
  );
  return max;
}

/** Ligne d'une table avec ses cellules et son appartenance à l'en-tête. */
export interface TableRowInfo {
  readonly header: boolean;
  readonly cells: readonly Element[];
}

/** Lignes directes d'une table, nues ou dans `thead`/`tbody`/`tfoot`, avec leurs cellules. */
export function collectRows(table: Element): TableRowInfo[] {
  const rows: TableRowInfo[] = [];
  const push = (row: Element, header: boolean): void => {
    const cells = childElements(row).filter((cell) => {
      const tag = tagOf(cell);
      return tag === 'td' || tag === 'th';
    });
    if (cells.length > 0) rows.push({ header, cells });
  };
  for (const child of childElements(table)) {
    const tag = tagOf(child);
    if (tag === 'tr') push(child, false);
    else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      for (const row of childElements(child)) if (tagOf(row) === 'tr') push(row, tag === 'thead');
    }
  }
  return rows;
}

/** Vrai si toutes les cellules de la ligne sont des `th` : une ligne d'en-tête implicite. */
export function isAllHeaderCells(cells: readonly Element[]): boolean {
  return cells.length > 0 && cells.every((cell) => tagOf(cell) === 'th');
}

/**
 * Largeurs en pixels des colonnes couvertes par une cellule : `colwidth="80,90"` (une
 * valeur par colonne fusionnée, convention Tiptap), sinon `style="width"` ou l'attribut
 * `width` pour une cellule simple. `null` pour une colonne inconnue.
 */
function cellColumnWidths(cell: Element, span: number): Array<number | null> {
  const colwidth = cell.getAttribute('colwidth');
  if (colwidth !== null) {
    const parts = colwidth.split(',').map((part) => parsePixels(part.trim()));
    return parts.length === span ? parts : [];
  }
  if (span !== 1) return [];
  const style = parseStyle(cell.getAttribute('style'));
  return [parsePixels(style.get('width') ?? cell.getAttribute('width'))];
}

/** Largeurs déclarées par `<colgroup><col style="width">` (ou `width`), par colonne. */
function colgroupWidths(table: Element, ctx: ExportContext): Array<number | null> {
  const widths: Array<number | null> = [];
  const pushCol = (col: Element): void => {
    const style = parseStyle(col.getAttribute('style'));
    const width = parsePixels(style.get('width') ?? col.getAttribute('width'));
    const span = spanAttribute(col, 'span', MAX_TABLE_COLUMNS, ctx);
    for (let i = 0; i < span; i += 1) widths.push(width);
  };
  for (const child of childElements(table)) {
    if (tagOf(child) === 'col') pushCol(child);
    else if (tagOf(child) === 'colgroup') {
      for (const col of childElements(child)) if (tagOf(col) === 'col') pushCol(col);
    }
  }
  return widths;
}

/** Position d'une cellule dans la grille : première colonne et nombre de colonnes couvertes. */
export interface CellPosition {
  readonly column: number;
  readonly span: number;
}

/** Grille de la table : largeur connue (px) de chaque colonne et position de chaque cellule. */
export interface TableGrid {
  readonly columns: ReadonlyArray<number | null>;
  readonly positions: ReadonlyMap<Element, CellPosition>;
}

/**
 * Place chaque cellule dans la grille en tenant compte des fusions (`colspan`, `rowspan`)
 * et relève la largeur de chaque colonne : première valeur rencontrée dans les cellules,
 * puis `<colgroup>` en repli. Les fusions sont bornées ici (avec avertissement) et la
 * grille ne marque que les lignes qui existent : un `rowspan` démesuré ne coûte rien.
 */
export function analyzeGrid(
  table: Element,
  rows: readonly TableRowInfo[],
  ctx: ExportContext,
): TableGrid {
  const columns: Array<number | null> = [];
  const positions = new Map<Element, CellPosition>();
  const occupied = new Map<number, Set<number>>();
  rows.forEach(({ cells }, rowIndex) => {
    const taken = occupied.get(rowIndex) ?? new Set<number>();
    let column = 0;
    for (const cell of cells) {
      while (taken.has(column)) column += 1;
      const span = spanAttribute(cell, 'colspan', MAX_TABLE_COLUMNS, ctx);
      const rowSpan = spanAttribute(cell, 'rowspan', MAX_ROW_SPAN, ctx);
      cellColumnWidths(cell, span).forEach((width, offset) => {
        const index = column + offset;
        if (columns[index] === undefined || columns[index] === null) columns[index] = width;
      });
      for (let offset = 0; offset < span; offset += 1) {
        if (columns[column + offset] === undefined) columns[column + offset] = null;
      }
      const lastRow = Math.min(rowIndex + rowSpan, rows.length);
      for (let below = rowIndex + 1; below < lastRow; below += 1) {
        const set = occupied.get(below) ?? new Set<number>();
        for (let offset = 0; offset < span; offset += 1) set.add(column + offset);
        occupied.set(below, set);
      }
      positions.set(cell, { column, span });
      column += span;
    }
  });
  colgroupWidths(table, ctx).forEach((width, index) => {
    if (index < columns.length && columns[index] === null) columns[index] = width;
  });
  return { columns, positions };
}

/**
 * Largeurs de colonnes en twips quand toutes sont connues, réduites à l'échelle si la
 * table déborderait de la zone de texte. `null` si une colonne au moins est inconnue :
 * la table reste alors à 100 % et seules les cellules connues portent une largeur.
 */
export function columnWidthsTwips(
  columns: ReadonlyArray<number | null>,
  ctx: ExportContext,
  fitToPage: boolean,
): number[] | null {
  if (columns.length === 0 || columns.some((width) => width === null)) return null;
  const px = columns.map((width) => width ?? 0);
  const total = px.reduce((sum, width) => sum + width, 0);
  const scale = fitToPage && total > ctx.maxImageWidth ? ctx.maxImageWidth / total : 1;
  return px.map((width) => Math.max(1, Math.round(width * scale * TWIPS_PER_PX)));
}

/** Largeur en twips d'une cellule à partir des colonnes qu'elle couvre, `null` si l'une est inconnue. */
export function cellWidthTwips(
  position: CellPosition | undefined,
  columns: ReadonlyArray<number | null>,
  twips: readonly number[] | null,
  ctx: ExportContext,
): number | null {
  if (!position) return null;
  const covered = columns.slice(position.column, position.column + position.span);
  if (covered.length !== position.span || covered.some((width) => width === null)) return null;
  if (twips) {
    return twips
      .slice(position.column, position.column + position.span)
      .reduce((sum, width) => sum + width, 0);
  }
  const px = covered.reduce<number>((sum, width) => sum + (width ?? 0), 0);
  return Math.round(Math.min(px, ctx.maxImageWidth) * TWIPS_PER_PX);
}
