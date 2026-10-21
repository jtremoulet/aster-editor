import type { BlockBorder } from '@aster-editor/core';
import {
  effectiveCellBorders,
  effectiveTableBorders,
  type CellEdges,
} from '../compare/model-borders.js';
import { allNamed, childNamed, childrenNamed, wordAttribute } from '../preprocess/xml-utils.js';
import { conditionalFormatsOf, type DocxStyleResolver } from '../reader/styles.js';
import {
  applyConditionalFormats,
  conditionalTypesOf,
  readBandSizes,
  readTableLook,
} from '../reader/table-conditional.js';
import type { TableStyleProps } from '../reader/types.js';
import {
  numericAttribute,
  onOff,
  readBorders,
  shadingColor,
  type BorderMap,
} from '../reader/units.js';

/**
 * Tableaux à style conditionnel dans le gabarit (L49). Le lecteur résout les formats
 * conditionnels du style (`w:tblStylePr` activés par `w:tblLook`) en propriétés directes
 * de cellule et de run ; l'export neuf les réécrit telles quelles, et le document relu par
 * Word ne suivait plus son style. Ici, pour chaque tableau greffé qui porte **à la fois**
 * `w:tblStyle` (un style du gabarit avec des formats conditionnels) et `w:tblLook` (venu de
 * `data-docx-look`), les propriétés directes **exactement égales** à ce que le style
 * conditionnel produirait pour la cellule sont retirées : fond (`w:shd`), gras des runs
 * (`w:b` / `w:bCs`) et bordures. La résolution est celle du lecteur
 * (`table-conditional.ts`) et du comparateur (`model-borders.ts`), par position de cellule
 * selon les drapeaux et la taille des bandes. Les bordures sont retirées en bloc, tableau
 * par tableau, seulement quand chaque cellule rend avec le style seul exactement ce qu'elle
 * rend avec ses `w:tcBorders` et les `w:tblBorders` du tableau : un retrait côté par côté
 * laisserait les `nil` intérieurs du tableau masquer les traits du style. Les propriétés
 * qui diffèrent du style restent écrites.
 */

/** Bordures effectives sérialisées côté par côté, pour comparer deux résolutions. */
function bordersKey(borders: Partial<Record<string, BlockBorder>>): string {
  return JSON.stringify(
    (['top', 'right', 'bottom', 'left'] as const).map((side) => borders[side] ?? null),
  );
}

/** Nombre de colonnes de grille d'une ligne : somme des `w:gridSpan`. */
function rowColumns(tr: Element): number {
  return childrenNamed(tr, 'tc').reduce((sum, tc) => sum + cellSpan(tc), 0);
}

function cellSpan(tc: Element): number {
  const tcPr = childNamed(tc, 'tcPr');
  return Math.max(1, numericAttribute(tcPr ? childNamed(tcPr, 'gridSpan') : null, 'val') ?? 1);
}

/** Vrai pour un `w:b` (ou `w:bCs`) qui active le gras : sans `w:val`, ou `1`/`true`/`on`. */
function isBoldOn(element: Element): boolean {
  return onOff(wordAttribute(element, 'val'));
}

/** Retire des runs des paragraphes directs de la cellule le gras que le style conditionnel pose déjà. */
function stripConditionalBold(tc: Element): void {
  for (const paragraph of childrenNamed(tc, 'p')) {
    for (const run of allNamed(paragraph, 'r')) {
      const rPr = childNamed(run, 'rPr');
      if (!rPr) continue;
      const bold = childNamed(rPr, 'b');
      if (!bold || !isBoldOn(bold)) continue;
      bold.remove();
      const boldCs = childNamed(rPr, 'bCs');
      if (boldCs && isBoldOn(boldCs)) boldCs.remove();
      if (rPr.children.length === 0) rPr.remove();
    }
  }
}

interface CellRecord {
  readonly tc: Element;
  readonly tcPr: Element | null;
  readonly style: TableStyleProps;
  readonly edges: CellEdges;
}

/** Cellules du tableau avec le style conditionnel vu par chacune et sa position dans la grille. */
function resolveCells(tbl: Element, tblPr: Element, style: TableStyleProps): CellRecord[] {
  const conditional = conditionalFormatsOf(style);
  const look = readTableLook(tblPr);
  const bands = readBandSizes(tblPr);
  const trs = childrenNamed(tbl, 'tr');
  const columns = trs.reduce((max, tr) => Math.max(max, rowColumns(tr)), 0);
  const cells: CellRecord[] = [];
  trs.forEach((tr, row) => {
    let gridStart = 0;
    for (const tc of childrenNamed(tr, 'tc')) {
      const span = cellSpan(tc);
      const edges: CellEdges = {
        top: row === 0,
        bottom: row === trs.length - 1,
        left: gridStart === 0,
        right: gridStart + span >= columns,
      };
      const types = conditionalTypesOf(
        { row, rowCount: trs.length, column: gridStart, lastColumn: edges.right },
        look,
        bands,
      );
      cells.push({
        tc,
        tcPr: childNamed(tc, 'tcPr'),
        style: conditional ? applyConditionalFormats(style, conditional, types) : style,
        edges,
      });
      gridStart += span;
    }
  });
  return cells;
}

/**
 * Vrai si le tableau rend, avec ses `w:tblBorders` et les `w:tcBorders` de chaque cellule,
 * exactement les bordures que le style (conditionnel compris) rend seul.
 */
function bordersMatchStyle(
  cells: readonly CellRecord[],
  style: TableStyleProps,
  tblBorders: BorderMap,
): boolean {
  if (
    bordersKey(effectiveTableBorders(style, tblBorders)) !==
    bordersKey(effectiveTableBorders(style, {}))
  ) {
    return false;
  }
  return cells.every((cell) => {
    const tcBorders = readBorders(cell.tcPr ? childNamed(cell.tcPr, 'tcBorders') : null);
    const rendered = effectiveCellBorders(cell.style, tblBorders, tcBorders, cell.edges);
    const fromStyle = effectiveCellBorders(cell.style, {}, {}, cell.edges);
    return bordersKey(rendered) === bordersKey(fromStyle);
  });
}

/** Retire d'un tableau greffé les propriétés directes que son style conditionnel produit déjà. */
function stripTable(tbl: Element, resolver: DocxStyleResolver): void {
  const tblPr = childNamed(tbl, 'tblPr');
  const tblStyle = tblPr ? childNamed(tblPr, 'tblStyle') : null;
  const tblLook = tblPr ? childNamed(tblPr, 'tblLook') : null;
  if (!tblPr || !tblStyle || !tblLook) return;
  const style = resolver.tableStyle(wordAttribute(tblStyle, 'val') || null);
  if (!style || !conditionalFormatsOf(style)) return;
  const cells = resolveCells(tbl, tblPr, style);
  for (const cell of cells) {
    const shd = cell.tcPr ? childNamed(cell.tcPr, 'shd') : null;
    if (shd && cell.style.cellShading && shadingColor(shd) === cell.style.cellShading) {
      shd.remove();
    }
    if (cell.style.runDefaults?.bold) stripConditionalBold(cell.tc);
  }
  const tblBordersElement = childNamed(tblPr, 'tblBorders');
  if (bordersMatchStyle(cells, style, readBorders(tblBordersElement))) {
    tblBordersElement?.remove();
    for (const cell of cells) {
      const tcBorders = cell.tcPr ? childNamed(cell.tcPr, 'tcBorders') : null;
      tcBorders?.remove();
      if (cell.tcPr && cell.tcPr.children.length === 0) cell.tcPr.remove();
    }
  }
}

/**
 * Applique `stripTable` à chaque tableau des blocs greffés, tableaux imbriqués compris
 * (du plus profond au moins profond : un tableau imbriqué est résolu avec son propre
 * style, pas celui de la cellule qui le contient).
 */
export function stripConditionalTableProperties(
  blocks: readonly Element[],
  resolver: DocxStyleResolver,
): void {
  for (const block of blocks) {
    const tables = [...allNamed(block, 'tbl'), ...(block.localName === 'tbl' ? [block] : [])];
    for (const tbl of tables) stripTable(tbl, resolver);
  }
}
