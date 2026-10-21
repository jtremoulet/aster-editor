import {
  MISSING,
  recordIfAny,
  recordWithin,
  WIDTH_TOLERANCE_PT,
  type CompareContext,
} from './compare-context.js';
import type { BlockModel, CellModel, TableModel } from './model.js';
import { fmt } from './values.js';

/**
 * Comparaison d'un tableau et de ses cellules : dimensions, style, largeur, alignement
 * (`w:jc`), drapeaux conditionnels (`w:tblLook`, quand le style en fait usage), bordures
 * extérieures effectives, largeurs de colonnes (±0,5 pt), fusions, puis chaque cellule
 * (bordures effectives, fond, largeur ±0,5 pt, alignement vertical, formats conditionnels
 * résolus dans ces valeurs comme le lecteur) et ses blocs, comparés par le comparateur de
 * blocs injecté pour ne pas créer de cycle d'imports.
 */

/** Comparateur de blocs injecté par `compare-blocks.ts`. */
export type BlockComparer = (
  original: readonly BlockModel[],
  result: readonly BlockModel[],
  prefix: string,
  ctx: CompareContext,
) => void;

/** Fusions non triviales d'un tableau : `(ligne,colonne):gridSpan/vMerge`. */
function merges(table: TableModel): string[] {
  const out: string[] = [];
  table.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell.colspan > 1 || cell.vMerge) {
        out.push(
          `(${String(r + 1)},${String(c + 1)}):${String(cell.colspan)}/${cell.vMerge ?? '-'}`,
        );
      }
    });
  });
  return out;
}

function compareCell(
  a: CellModel,
  b: CellModel | undefined,
  where: string,
  ctx: CompareContext,
  compareBlocks: BlockComparer,
): void {
  const present = b !== undefined;
  recordIfAny(ctx, 'table', 'table.cellBorders', where, a.borders, b?.borders, present);
  recordIfAny(ctx, 'table', 'table.cellShading', where, a.shading, b?.shading, present);
  recordWithin(
    ctx,
    'table',
    'table.cellWidth',
    where,
    a.widthPt,
    b?.widthPt,
    present,
    WIDTH_TOLERANCE_PT,
  );
  recordIfAny(
    ctx,
    'table',
    'table.cellVerticalAlign',
    where,
    a.verticalAlign,
    b?.verticalAlign,
    present,
  );
  compareBlocks(a.blocks, b?.blocks ?? [], where, ctx);
}

/** Compare un tableau de l'original à son vis-à-vis (absent = tout perdu). */
export function compareTable(
  a: TableModel,
  b: TableModel | undefined,
  where: string,
  ctx: CompareContext,
  compareBlocks: BlockComparer,
): void {
  // Boucle plutôt que `Math.max(...spread)` : au-delà de ≈ 125 000 lignes, la pile d'appels débordait (R30-07).
  const columns = (table: TableModel): number =>
    table.rows.reduce(
      (max, row) =>
        Math.max(
          max,
          row.reduce((sum, cell) => sum + cell.colspan, 0),
        ),
      0,
    );
  const present = b !== undefined;
  ctx.tally.record(
    'table',
    'table.rows',
    where,
    String(a.rows.length),
    b ? String(b.rows.length) : MISSING,
  );
  ctx.tally.record(
    'table',
    'table.columns',
    where,
    String(columns(a)),
    b ? String(columns(b)) : MISSING,
  );
  recordIfAny(ctx, 'table', 'table.style', where, a.styleId, b?.styleId, present);
  recordIfAny(ctx, 'table', 'table.width', where, a.width, b?.width, present);
  recordIfAny(ctx, 'table', 'table.align', where, a.align, b?.align, present);
  // Drapeaux `w:tblLook` effectifs, seulement quand le style définit des formats conditionnels.
  recordIfAny(ctx, 'table', 'table.conditional', where, a.conditional, b?.conditional, present);
  recordIfAny(ctx, 'table', 'table.borders', where, a.borders, b?.borders, present);
  recordWithin(
    ctx,
    'table',
    'table.columnWidths',
    where,
    a.columnWidthsPt,
    b?.columnWidthsPt,
    present,
    WIDTH_TOLERANCE_PT,
  );
  const mergesA = merges(a);
  const mergesB = b ? merges(b) : [];
  if (mergesA.length > 0 || mergesB.length > 0) {
    ctx.tally.record('table', 'table.merges', where, fmt(mergesA), b ? fmt(mergesB) : MISSING);
  }
  a.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const cellWhere = `${where} cellule (${String(r + 1)},${String(c + 1)})`;
      compareCell(cell, b?.rows[r]?.[c], cellWhere, ctx, compareBlocks);
    });
  });
}
