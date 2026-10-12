import type { FileChild, Paragraph, Table, TableCell } from 'docx';
import type { BlockScope } from './blocks';
import type { ExportContext } from './context';
import { childElements, positiveIntAttribute, tagOf } from './dom';

/** Convertisseur de blocs injecté pour casser le cycle `blocks` ↔ `tables`. */
export type ChildrenConverter = (
  container: Element,
  scope: BlockScope,
  ctx: ExportContext,
) => Promise<FileChild[]>;

/** Lignes directes d'une table, nues ou dans `thead`/`tbody`/`tfoot`, avec leur appartenance à l'en-tête. */
function collectRows(table: Element): Array<{ row: Element; header: boolean }> {
  const rows: Array<{ row: Element; header: boolean }> = [];
  for (const child of childElements(table)) {
    const tag = tagOf(child);
    if (tag === 'tr') rows.push({ row: child, header: false });
    else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      for (const row of childElements(child)) {
        if (tagOf(row) === 'tr') rows.push({ row, header: tag === 'thead' });
      }
    }
  }
  return rows;
}

/** Vrai si toutes les cellules de la ligne sont des `th` : une ligne d'en-tête implicite. */
function isAllHeaderCells(cells: readonly Element[]): boolean {
  return cells.length > 0 && cells.every((cell) => tagOf(cell) === 'th');
}

/**
 * `<td>`/`<th>` → `TableCell`. Les en-têtes sont en gras, `colspan`/`rowspan` deviennent
 * `columnSpan`/`rowSpan` (docx génère lui-même les cellules de continuation verticale).
 * Une cellule contient toujours au moins un paragraphe, exigence de Word.
 */
async function convertCell(
  cell: Element,
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
  const columnSpan = positiveIntAttribute(cell, 'colspan');
  const rowSpan = positiveIntAttribute(cell, 'rowspan');
  return new ctx.docx.TableCell({
    children: blocks,
    ...(columnSpan && columnSpan > 1 ? { columnSpan } : {}),
    ...(rowSpan && rowSpan > 1 ? { rowSpan } : {}),
  });
}

/**
 * `<table>` → `Table` sur 100 % de la largeur. Les lignes de `thead` (ou composées
 * uniquement de `th`) sont marquées `tableHeader`, ce que mammoth réimporte en `thead`.
 */
export async function convertTable(
  table: Element,
  scope: BlockScope,
  ctx: ExportContext,
  convert: ChildrenConverter,
): Promise<Table> {
  const { Table, TableRow, WidthType } = ctx.docx;
  const rows = [];
  for (const { row, header } of collectRows(table)) {
    const cellElements = childElements(row).filter((cell) => {
      const tag = tagOf(cell);
      return tag === 'td' || tag === 'th';
    });
    if (cellElements.length === 0) continue;
    const cells = [];
    for (const cell of cellElements) cells.push(await convertCell(cell, scope, ctx, convert));
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
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}
