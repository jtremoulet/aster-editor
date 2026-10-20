import type {
  FileChild,
  ITableCellOptions,
  ITableOptions,
  Paragraph,
  Table,
  TableCell,
} from 'docx';
import type { BlockScope } from './blocks';
import { warn, type ExportContext } from './context';
import { parsePixels, parseStyle } from './css';
import { childElements, positiveIntAttribute, tagOf } from './dom';

/** Nombre maximal de colonnes d'une table Word : plafond de `colspan` et de `<col span>`. */
export const MAX_TABLE_COLUMNS = 63;

/** Nombre maximal de lignes qu'une fusion verticale peut couvrir (`rowspan`). */
export const MAX_ROW_SPAN = 65_534;

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

/** Convertisseur de blocs injecté pour casser le cycle `blocks` ↔ `tables`. */
export type ChildrenConverter = (
  container: Element,
  scope: BlockScope,
  ctx: ExportContext,
) => Promise<FileChild[]>;

/** Twips par pixel CSS à 96 dpi : 1 px = 0,75 pt = 15 twips. */
const TWIPS_PER_PX = 15;

/** Ligne d'une table avec ses cellules et son appartenance à l'en-tête. */
interface TableRowInfo {
  readonly header: boolean;
  readonly cells: readonly Element[];
}

/** Lignes directes d'une table, nues ou dans `thead`/`tbody`/`tfoot`, avec leurs cellules. */
function collectRows(table: Element): TableRowInfo[] {
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
function isAllHeaderCells(cells: readonly Element[]): boolean {
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
interface CellPosition {
  readonly column: number;
  readonly span: number;
}

/** Grille de la table : largeur connue (px) de chaque colonne et position de chaque cellule. */
interface TableGrid {
  readonly columns: ReadonlyArray<number | null>;
  readonly positions: ReadonlyMap<Element, CellPosition>;
}

/**
 * Place chaque cellule dans la grille en tenant compte des fusions (`colspan`, `rowspan`)
 * et relève la largeur de chaque colonne : première valeur rencontrée dans les cellules,
 * puis `<colgroup>` en repli. Les fusions sont bornées ici (avec avertissement) et la
 * grille ne marque que les lignes qui existent : un `rowspan` démesuré ne coûte rien.
 */
function analyzeGrid(table: Element, rows: readonly TableRowInfo[], ctx: ExportContext): TableGrid {
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
function columnWidthsTwips(
  columns: ReadonlyArray<number | null>,
  ctx: ExportContext,
): number[] | null {
  if (columns.length === 0 || columns.some((width) => width === null)) return null;
  const px = columns.map((width) => width ?? 0);
  const total = px.reduce((sum, width) => sum + width, 0);
  const scale = total > ctx.maxImageWidth ? ctx.maxImageWidth / total : 1;
  return px.map((width) => Math.max(1, Math.round(width * scale * TWIPS_PER_PX)));
}

/**
 * `<td>`/`<th>` → `TableCell`. Les en-têtes sont en gras, `colspan`/`rowspan` deviennent
 * `columnSpan`/`rowSpan` (docx génère lui-même les cellules de continuation verticale).
 * Une cellule contient toujours au moins un paragraphe, exigence de Word. La largeur
 * (DXA) est la somme des colonnes couvertes quand elles sont connues.
 */
async function convertCell(
  cell: Element,
  position: CellPosition | undefined,
  width: number | null,
  scope: BlockScope,
  ctx: ExportContext,
  convert: ChildrenConverter,
): Promise<TableCell> {
  const header = tagOf(cell) === 'th';
  const cellScope: BlockScope = {
    quote: false,
    list: null,
    inline: header ? { ...scope.inline, bold: true } : scope.inline,
  };
  const children = await convert(cell, cellScope, ctx);
  const blocks: Array<Paragraph | Table> = children.filter(
    (child): child is Paragraph | Table =>
      child instanceof ctx.docx.Paragraph || child instanceof ctx.docx.Table,
  );
  if (blocks.length === 0) blocks.push(new ctx.docx.Paragraph({ children: [] }));
  // Fusions déjà bornées (et signalées) par `analyzeGrid` : on les relit sans avertir deux fois.
  const columnSpan = position?.span ?? 1;
  const rowSpan = positiveIntAttribute(cell, 'rowspan', MAX_ROW_SPAN) ?? 1;
  const options: ITableCellOptions = {
    children: blocks,
    ...(columnSpan > 1 ? { columnSpan } : {}),
    ...(rowSpan > 1 ? { rowSpan } : {}),
    ...(width !== null ? { width: { size: width, type: ctx.docx.WidthType.DXA } } : {}),
  };
  return new ctx.docx.TableCell(options);
}

/** Largeur en twips d'une cellule à partir des colonnes qu'elle couvre, `null` si l'une est inconnue. */
function cellWidthTwips(
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

/**
 * `<table>` → `Table`. Les lignes de `thead` (ou composées uniquement de `th`) sont
 * marquées `tableHeader`, ce que mammoth réimporte en `thead`. Avec des largeurs de
 * colonnes complètes (`colwidth`, `style="width"`, `<col>`), la table passe en
 * disposition fixe avec sa grille en DXA ; sinon elle occupe 100 % de la largeur.
 */
export async function convertTable(
  table: Element,
  scope: BlockScope,
  ctx: ExportContext,
  convert: ChildrenConverter,
): Promise<Table> {
  const { Table, TableLayoutType, TableRow, WidthType } = ctx.docx;
  const rowInfos = collectRows(table);
  const grid = analyzeGrid(table, rowInfos, ctx);
  const twips = columnWidthsTwips(grid.columns, ctx);
  const rows = [];
  for (const { header, cells: cellElements } of rowInfos) {
    const cells = [];
    for (const cell of cellElements) {
      const position = grid.positions.get(cell);
      const width = cellWidthTwips(position, grid.columns, twips, ctx);
      cells.push(await convertCell(cell, position, width, scope, ctx, convert));
    }
    // `tableHeader` seulement quand vrai : mammoth lit la présence de `w:tblHeader`, pas sa valeur.
    const isHeader = header || isAllHeaderCells(cellElements);
    rows.push(new TableRow({ children: cells, ...(isHeader ? { tableHeader: true } : {}) }));
  }
  if (rows.length === 0) {
    rows.push(
      new TableRow({
        children: [
          new ctx.docx.TableCell({ children: [new ctx.docx.Paragraph({ children: [] })] }),
        ],
      }),
    );
  }
  const options: ITableOptions = twips
    ? {
        rows,
        width: { size: twips.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
        columnWidths: twips,
        layout: TableLayoutType.FIXED,
      }
    : { rows, width: { size: 100, type: WidthType.PERCENTAGE } };
  return new Table(options);
}
