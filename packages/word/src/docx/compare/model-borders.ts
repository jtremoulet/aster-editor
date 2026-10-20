import type { BlockBorder } from '@aster-editor/core';
import type { TableStyleProps } from '../reader/types';
import { bordersBySide, type BorderMap } from '../reader/units';

/**
 * Bordures **effectives** d'un tableau et de ses cellules, telles que Word les rend : style
 * de tableau, puis `w:tblBorders` (côtés extérieurs sur les cellules du bord, `insideH` /
 * `insideV` ailleurs), puis `w:tcBorders` ; `nil` efface. Un côté sans bordure visible est
 * omis, qu'il soit absent ou explicitement `nil` : deux documents qui distribuent les
 * mêmes traits entre tableau et cellules se comparent égaux (L28c). L'espace texte-trait
 * (`w:space`, `spacePt`) n'est pas comparé : Word ne l'applique pas aux bordures de
 * tableau et de cellule (l'espace y vient des marges `w:tcMar`) et l'écrit toujours à 0,
 * là où l'export en écrit 1 ou 4 pt faute de valeur dans le contrat (L45).
 */

/** Côtés d'une cellule ou d'un tableau (`between` n'existe que pour les paragraphes). */
export type CellSide = 'top' | 'right' | 'bottom' | 'left';

const CELL_SIDES: readonly CellSide[] = ['top', 'right', 'bottom', 'left'];

/** Bordures visibles par côté, sans `null` : l'absence vaut « pas de bordure ». */
export type EffectiveBorders = Partial<Record<CellSide, BlockBorder>>;

/** Position d'une cellule dans la grille : vrai pour chaque côté qui touche le bord du tableau. */
export type CellEdges = Readonly<Record<CellSide, boolean>>;

/** Bordure telle que Word la rend sur un tableau : recôtée, sans `spacePt`. */
function renderedBorder(border: BlockBorder, side: CellSide): BlockBorder {
  return { side, style: border.style, widthPt: border.widthPt, color: border.color };
}

/** Bordures extérieures effectives du tableau : celles du style recouvertes par les directes. */
export function effectiveTableBorders(
  style: TableStyleProps | null,
  tblBorders: BorderMap,
): EffectiveBorders {
  const fromStyle = bordersBySide(style?.borders);
  const out: EffectiveBorders = {};
  for (const side of CELL_SIDES) {
    const direct = tblBorders[side];
    const border = direct === undefined ? fromStyle[side] : direct;
    if (border) out[side] = renderedBorder(border, side);
  }
  return out;
}

/**
 * Bordures effectives d'une cellule. Le style de tableau est résolu par le lecteur en
 * bordures extérieures et bordures de cellule (ses `insideH`/`insideV` ou ses `tcBorders`) :
 * sur un bord, la bordure extérieure du style prime ; à l'intérieur, celle des cellules.
 */
export function effectiveCellBorders(
  style: TableStyleProps | null,
  tblBorders: BorderMap,
  tcBorders: BorderMap,
  edges: CellEdges,
): EffectiveBorders {
  const styleOuter = bordersBySide(style?.borders);
  const styleCells = bordersBySide(style?.cellBorders);
  const out: EffectiveBorders = {};
  for (const side of CELL_SIDES) {
    const edge = edges[side];
    const inside = side === 'top' || side === 'bottom' ? 'insideH' : 'insideV';
    let border: BlockBorder | null | undefined = tcBorders[side];
    if (border === undefined) border = edge ? tblBorders[side] : tblBorders[inside];
    if (border === undefined)
      border = edge ? (styleOuter[side] ?? styleCells[side]) : styleCells[side];
    if (border) out[side] = renderedBorder(border, side);
  }
  return out;
}

/** `undefined` quand aucun côté n'a de bordure, pour ne pas compter une propriété vide. */
export function nonEmptyBorders(borders: EffectiveBorders): EffectiveBorders | undefined {
  return Object.keys(borders).length > 0 ? borders : undefined;
}
