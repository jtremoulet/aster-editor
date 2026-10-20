import type { BlockBorder, BorderSide, CellVerticalAlign } from '@aster-editor/core';
import { childNamed, childrenNamed, wordAttribute } from '../preprocess/xml-utils';
import { escapeAttr, pt, styleAttr } from './html';
import { deriveContext } from './index';
import type { ConverterContext, TableBlock, TableStyleProps } from './types';
import {
  booleanAttribute,
  borderDeclarations,
  bordersBySide,
  mergePadding,
  numericAttribute,
  paddingValue,
  readBorders,
  readCellMargins,
  readGridColumns,
  shadingColor,
  twipsToPt,
  withSide,
  type BorderMap,
  type PaddingPt,
} from './units-blocks';

/**
 * Conversion d'un `w:tbl` en `<table>` stylé selon le contrat `TableLayoutAttrs` /
 * `CellLayoutAttrs` : largeur, bordures du tableau sur `<table>`, bordures intérieures
 * (`insideH` / `insideV`) et propriétés directes sur les cellules, fonds, alignement
 * vertical, marges internes, `colwidth` Tiptap sur la première ligne, `colspan` et
 * `rowspan` calculés depuis `w:gridSpan` et `w:vMerge` (la cellule de continuation est
 * omise, comme Tiptap). Les cellules sont converties par `ctx.convert.blocks`, ce qui
 * rend les tableaux imbriqués récursifs.
 */

type SideBorders = Partial<Record<BorderSide, BlockBorder | null>>;

interface CellRecord {
  readonly header: boolean;
  readonly colspan: number;
  rowspan: number;
  readonly html: string;
  readonly borders: SideBorders;
  readonly shading?: string;
  readonly verticalAlign?: CellVerticalAlign;
  readonly padding?: PaddingPt;
  readonly colwidth?: string;
}

interface RowRecord {
  readonly cells: CellRecord[];
}

/** `w:tblW` → `width` CSS : `pct` en pourcentage (cinquantièmes ou `NN%`), `dxa` en points. */
function tableWidth(tblW: Element | null): string | undefined {
  if (!tblW) return undefined;
  const type = wordAttribute(tblW, 'type');
  const raw = wordAttribute(tblW, 'w');
  if (type === 'pct' || raw.endsWith('%')) {
    const value = raw.endsWith('%') ? Number(raw.slice(0, -1)) : Number(raw) / 50;
    return Number.isFinite(value) && value > 0
      ? `${String(Math.round(value * 100) / 100)}%`
      : undefined;
  }
  if (type === 'dxa' || (type === '' && raw !== '')) {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? pt(twipsToPt(value)) : undefined;
  }
  return undefined;
}

const VERTICAL_ALIGNS: ReadonlyMap<string, CellVerticalAlign> = new Map([
  ['top', 'top'],
  ['center', 'middle'],
  ['bottom', 'bottom'],
]);

/** Vrai pour une cellule `w:vMerge` de continuation (sans `w:val` ou `continue`). */
function isMergeContinuation(vMerge: Element | null): boolean {
  if (!vMerge) return false;
  const value = wordAttribute(vMerge, 'val');
  return value === '' || value === 'continue';
}

/**
 * Bordures effectives d'une cellule : celles du style de tableau, puis les bordures
 * intérieures du tableau sur les arêtes intérieures, puis `w:tcBorders` (`nil` retire).
 * Les arêtes extérieures restent sur `<table>`.
 */
function cellBorders(
  style: TableStyleProps | null,
  table: BorderMap,
  tcBorders: BorderMap,
  edges: {
    readonly top: boolean;
    readonly right: boolean;
    readonly bottom: boolean;
    readonly left: boolean;
  },
): SideBorders {
  const result: SideBorders = { ...bordersBySide(style?.cellBorders) };
  const insideH = table.insideH;
  const insideV = table.insideV;
  if (insideH !== undefined) {
    if (!edges.top) result.top = insideH ? withSide(insideH, 'top') : null;
    if (!edges.bottom) result.bottom = insideH ? withSide(insideH, 'bottom') : null;
  }
  if (insideV !== undefined) {
    if (!edges.left) result.left = insideV ? withSide(insideV, 'left') : null;
    if (!edges.right) result.right = insideV ? withSide(insideV, 'right') : null;
  }
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const direct = tcBorders[side];
    if (direct !== undefined) result[side] = direct;
  }
  return result;
}

function renderCell(cell: CellRecord): string {
  const tag = cell.header ? 'th' : 'td';
  const attrs: string[] = [];
  if (cell.colspan > 1) attrs.push(` colspan="${String(cell.colspan)}"`);
  if (cell.rowspan > 1) attrs.push(` rowspan="${String(cell.rowspan)}"`);
  if (cell.colwidth) attrs.push(` colwidth="${cell.colwidth}"`);
  attrs.push(
    styleAttr([
      ...borderDeclarations(cell.borders),
      ['background-color', cell.shading],
      ['vertical-align', cell.verticalAlign],
      ['padding', paddingValue(cell.padding)],
    ]),
  );
  return `<${tag}${attrs.join('')}>${cell.html}</${tag}>`;
}

/** Convertit un tableau Word. Signature figée par `index.ts`. */
export async function convertTable(table: Element, ctx: ConverterContext): Promise<TableBlock> {
  const tblPr = childNamed(table, 'tblPr');
  const tblStyle = tblPr ? childNamed(tblPr, 'tblStyle') : null;
  const styleId = tblStyle ? wordAttribute(tblStyle, 'val') : '';
  const style = ctx.styles.tableStyle(styleId || null);
  const tableBorders = readBorders(tblPr ? childNamed(tblPr, 'tblBorders') : null);
  const styleBorders = bordersBySide(style?.borders);
  const outerBorders: SideBorders = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const direct = tableBorders[side];
    outerBorders[side] = direct !== undefined ? direct : styleBorders[side];
  }
  const defaultPadding = readCellMargins(tblPr ? childNamed(tblPr, 'tblCellMar') : null);
  const grid = readGridColumns(table);
  const rows = childrenNamed(table, 'tr');
  const tableCtx = deriveContext(ctx, { tableStyle: style });

  // Une cellule `vMerge restart` reste ouverte sur sa colonne de grille tant que les lignes
  // suivantes y placent une continuation : on incrémente son `rowspan` et on omet la cellule.
  const openMerges = new Map<number, CellRecord>();
  const records: RowRecord[] = [];

  for (const [rowIndex, tr] of rows.entries()) {
    const trPr = childNamed(tr, 'trPr');
    const header = booleanAttribute(trPr ? childNamed(trPr, 'tblHeader') : null);
    const cells: CellRecord[] = [];
    const tcs = childrenNamed(tr, 'tc');
    let column = 0;
    for (const [cellIndex, tc] of tcs.entries()) {
      const tcPr = childNamed(tc, 'tcPr');
      const colspan = Math.max(
        1,
        Math.floor(numericAttribute(tcPr ? childNamed(tcPr, 'gridSpan') : null, 'val') ?? 1),
      );
      const vMerge = tcPr ? childNamed(tcPr, 'vMerge') : null;
      if (isMergeContinuation(vMerge)) {
        const origin = openMerges.get(column);
        if (origin) {
          origin.rowspan += 1;
          column += colspan;
          continue;
        }
      }
      for (let c = column; c < column + colspan; c += 1) openMerges.delete(c);

      const edges = {
        top: rowIndex === 0,
        bottom: rowIndex === rows.length - 1,
        left: column === 0,
        right: cellIndex === tcs.length - 1,
      };
      const borders = cellBorders(
        style,
        tableBorders,
        readBorders(tcPr ? childNamed(tcPr, 'tcBorders') : null),
        edges,
      );
      const shading = shadingColor(tcPr ? childNamed(tcPr, 'shd') : null) ?? style?.cellShading;
      const vAlign = tcPr ? childNamed(tcPr, 'vAlign') : null;
      const verticalAlign = vAlign ? VERTICAL_ALIGNS.get(wordAttribute(vAlign, 'val')) : undefined;
      const padding = mergePadding(
        style?.cellPaddingPt,
        defaultPadding,
        readCellMargins(tcPr ? childNamed(tcPr, 'tcMar') : null),
      );
      const widths = grid.slice(column, column + colspan);
      const colwidth =
        rowIndex === 0 && widths.length === colspan ? widths.map(String).join(',') : undefined;

      const cellCtx = deriveContext(tableCtx, { cellVerticalAlign: verticalAlign });
      const blocks = await ctx.convert.blocks(tc, cellCtx);
      const html = ctx.convert.render(blocks, cellCtx) || '<p></p>';

      const record: CellRecord = {
        header,
        colspan,
        rowspan: 1,
        html,
        borders,
        shading,
        verticalAlign,
        padding,
        colwidth,
      };
      cells.push(record);
      if (vMerge && !isMergeContinuation(vMerge)) openMerges.set(column, record);
      column += colspan;
    }
    records.push({ cells });
  }

  const tableAttrs =
    styleAttr([
      ['width', tableWidth(tblPr ? childNamed(tblPr, 'tblW') : null)],
      ...borderDeclarations(outerBorders),
    ]) + (styleId ? ` data-docx-style="${escapeAttr(styleId)}"` : '');
  const body = records.map((row) => `<tr>${row.cells.map(renderCell).join('')}</tr>`).join('');
  return { kind: 'table', html: `<table${tableAttrs}><tbody>${body}</tbody></table>` };
}
