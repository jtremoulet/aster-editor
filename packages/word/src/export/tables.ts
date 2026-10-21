import type {
  FileChild,
  ITableOptions,
  ITableWidthProperties,
  Paragraph,
  Table,
  TableCell,
  ITableCellOptions,
} from 'docx';
import { TABLE_LOOK_ATTRIBUTE, TABLE_LOOK_FLAGS, parseTableLook } from '@aster-editor/core';
import type { ITableLookOptions } from 'docx';
import type { BlockScope } from './blocks.js';
import { resolveDocxStyle, type ExportContext } from './context.js';
import { parseBorders, parseStyle } from './css.js';
import { positiveIntAttribute, tagOf } from './dom.js';
import { DOCX_STYLE_ATTRIBUTE } from './styles.js';
import {
  anyCellDeclaresBorders,
  cellLayout,
  declaredTableWidth,
  tableAlignment,
  tableBorders,
  type CellEdges,
} from './tables-borders.js';
import {
  MAX_ROW_SPAN,
  analyzeGrid,
  cellWidthTwips,
  collectRows,
  columnWidthsTwips,
  isAllHeaderCells,
  type CellPosition,
} from './tables-grid.js';

/**
 * `<table>` → `Table` de `docx`. La grille (`tables-grid.ts`) et les propriétés du
 * contrat (`tables-borders.ts`) sont ré-exportées d'ici : l'API du module est celle
 * d'avant le découpage (L45).
 */

export { MAX_ROW_SPAN, MAX_TABLE_COLUMNS } from './tables-grid.js';

/** Convertisseur de blocs injecté pour casser le cycle `blocks` ↔ `tables`. */
export type ChildrenConverter = (
  container: Element,
  scope: BlockScope,
  ctx: ExportContext,
) => Promise<FileChild[]>;

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
  explicit: boolean,
  edges: CellEdges,
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
    ...cellLayout(cell, ctx, explicit, edges),
  };
  return new ctx.docx.TableCell(options);
}

/**
 * `w:tblLook` depuis `data-docx-look` (`TableLayoutAttrs.look`, L49) : les six drapeaux
 * écrits explicitement (un drapeau absent de l'attribut vaut faux, comme au contrat), pour
 * que Word n'applique pas son masque par défaut `0x04A0`. `undefined` sans attribut lisible :
 * aucun `w:tblLook` n'est écrit, comme le lecteur n'en a pas lu.
 */
export function tableLookOptions(table: Element): ITableLookOptions | undefined {
  const look = parseTableLook(table.getAttribute(TABLE_LOOK_ATTRIBUTE));
  if (!look) return undefined;
  const options: { -readonly [K in keyof ITableLookOptions]: ITableLookOptions[K] } = {};
  for (const flag of TABLE_LOOK_FLAGS) options[flag] = look[flag] === true;
  return options;
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
  const style = parseStyle(table.getAttribute('style'));
  const tableStyle = resolveDocxStyle(ctx, table.getAttribute(DOCX_STYLE_ATTRIBUTE), 'tableau');
  const declaredWidth = declaredTableWidth(style, ctx);
  // Une largeur déclarée vient du document (contrat) : sa grille est reprise telle quelle.
  const twips = columnWidthsTwips(grid.columns, ctx, declaredWidth === null);
  const explicit =
    tableStyle !== null || parseBorders(style).size > 0 || anyCellDeclaresBorders(rowInfos);
  const borders = tableBorders(style, explicit);
  const rows = [];
  for (const [rowIndex, { header, cells: cellElements }] of rowInfos.entries()) {
    const cells = [];
    for (const cell of cellElements) {
      const position = grid.positions.get(cell);
      const width = cellWidthTwips(position, grid.columns, twips, ctx);
      const rowSpan = positiveIntAttribute(cell, 'rowspan', MAX_ROW_SPAN) ?? 1;
      const edges: CellEdges = {
        top: rowIndex === 0,
        bottom: rowIndex + rowSpan >= rowInfos.length,
        left: (position?.column ?? 0) === 0,
        right: position === undefined || position.column + position.span >= grid.columns.length,
      };
      cells.push(await convertCell(cell, position, width, scope, ctx, convert, explicit, edges));
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
  // Largeur déclarée d'abord ; en mode explicite sans déclaration, `auto` (le tableau
  // d'origine n'en avait pas) ; sinon la grille connue (disposition fixe) ou 100 %.
  const fallbackWidth: ITableWidthProperties | null = explicit
    ? { size: 0, type: WidthType.AUTO }
    : null;
  const sized: ITableOptions = twips
    ? {
        rows,
        width: declaredWidth ??
          fallbackWidth ?? {
            size: twips.reduce((sum, width) => sum + width, 0),
            type: WidthType.DXA,
          },
        columnWidths: twips,
        ...(declaredWidth || fallbackWidth ? {} : { layout: TableLayoutType.FIXED }),
      }
    : { rows, width: declaredWidth ?? fallbackWidth ?? { size: 100, type: WidthType.PERCENTAGE } };
  const alignment = tableAlignment(table, style, ctx);
  const tableLook = tableLookOptions(table);
  const options: ITableOptions = {
    ...sized,
    ...(tableStyle ? { style: tableStyle } : {}),
    ...(borders ? { borders } : {}),
    ...(alignment ? { alignment } : {}),
    ...(tableLook ? { tableLook } : {}),
  };
  return new Table(options);
}
