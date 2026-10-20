import type { BlockBorder, BorderSide } from '@aster-editor/core';
import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import {
  applyBorders,
  applyParagraphProperties,
  applyRunProperties,
  emptyParagraph,
  finalizeParagraph,
  finalizeRun,
  orderedBorders,
  readBorder,
  readShadingFill,
  type MutableRun,
  type ThemeFonts,
} from './properties';
import type { StyleDefinition } from './styles-part';
import { readConditionalFormats, type ConditionalFormats } from './table-conditional';
import type { DocxParagraphProps } from './properties';
import type { TableStyleProps } from './types';
import { numberAttr, twipsToPt } from './units';

/**
 * Résolution d'un style de tableau sur sa chaîne `basedOn` : bordures extérieures et de
 * cellule, fond, marges, défauts de run et de paragraphe, formats conditionnels. Module
 * de `styles.ts` : découpage L45, aucune logique modifiée.
 */

/**
 * Style de tableau d'Aster : le contrat plus les défauts de paragraphe du style (`pPr`,
 * taquets de tabulation compris, R42-07) et ses formats conditionnels (`w:tblStylePr`,
 * session 4), appliqués par `tables.ts` et `paragraphs.ts`.
 */
export interface DocxTableStyleProps extends TableStyleProps {
  readonly paragraphDefaults?: Omit<DocxParagraphProps, 'runDefaults' | 'styleId'>;
  readonly conditional?: ConditionalFormats;
}

/**
 * Style de tableau résolu sur sa chaîne `basedOn` (de la racine à la feuille), `null`
 * pour une chaîne vide (style inconnu ou d'un autre type). `baseRun` est l'état des
 * `docDefaults` de run, `theme` les polices du thème.
 */
export function resolveTableStyle(
  chain: readonly StyleDefinition[],
  baseRun: MutableRun,
  theme: ThemeFonts,
): DocxTableStyleProps | null {
  if (chain.length === 0) return null;
  const borders = new Map<BorderSide, BlockBorder>();
  const inside = new Map<BorderSide, BlockBorder>();
  const cellBorders = new Map<BorderSide, BlockBorder>();
  let cellShading: string | undefined;
  let padding: [number, number, number, number] | undefined;
  const run: MutableRun = { ...baseRun };
  const paragraph = emptyParagraph();
  for (const style of chain) {
    if (style.rPr) applyRunProperties(style.rPr, run, theme);
    if (style.pPr) applyParagraphProperties(style.pPr, paragraph);
    const tblBorders = style.tblPr ? childNamed(style.tblPr, 'tblBorders') : null;
    if (tblBorders) {
      applyBorders(tblBorders, borders);
      applyInsideBorders(tblBorders, inside);
    }
    const cellMar = style.tblPr ? childNamed(style.tblPr, 'tblCellMar') : null;
    if (cellMar) padding = readCellMargins(cellMar, padding);
    const tcBorders = style.tcPr ? childNamed(style.tcPr, 'tcBorders') : null;
    if (tcBorders) applyBorders(tcBorders, cellBorders);
    const shd = style.tcPr ? childNamed(style.tcPr, 'shd') : null;
    if (shd) cellShading = readShadingFill(shd);
  }
  // Sans `tcBorders` propres, les traits intérieurs du tableau bordent chaque cellule.
  const cells = cellBorders.size > 0 ? orderedBorders(cellBorders) : orderedBorders(inside);
  const paragraphDefaults = finalizeParagraph(paragraph, {});
  const { runDefaults: _ignored, ...paragraphOnly } = paragraphDefaults;
  const outer = orderedBorders(borders);
  const conditional = readConditionalFormats(chain, theme);
  return {
    ...(outer.length > 0 ? { borders: outer } : {}),
    ...(cells.length > 0 ? { cellBorders: cells } : {}),
    ...(cellShading ? { cellShading } : {}),
    ...(padding ? { cellPaddingPt: padding } : {}),
    runDefaults: finalizeRun(run),
    ...(Object.keys(paragraphOnly).length > 0 ? { paragraphDefaults: paragraphOnly } : {}),
    ...(conditional ? { conditional } : {}),
  };
}

/** `w:insideH` → haut et bas de cellule, `w:insideV` → gauche et droite. */
function applyInsideBorders(tblBorders: Element, inside: Map<BorderSide, BlockBorder>): void {
  const pairs: readonly (readonly [string, readonly BorderSide[]])[] = [
    ['insideH', ['top', 'bottom']],
    ['insideV', ['left', 'right']],
  ];
  for (const [name, sides] of pairs) {
    const element = childNamed(tblBorders, name);
    if (!element) continue;
    for (const side of sides) {
      const border = readBorder(element, side);
      if (border) inside.set(side, border);
      else inside.delete(side);
    }
  }
}

/** Marges de cellule `w:tblCellMar` en points `[haut, droite, bas, gauche]`, sur la base héritée. */
function readCellMargins(
  cellMar: Element,
  inherited: [number, number, number, number] | undefined,
): [number, number, number, number] {
  const out: [number, number, number, number] = inherited ? [...inherited] : [0, 0, 0, 0];
  const sides: readonly (readonly [string, 0 | 1 | 2 | 3])[] = [
    ['top', 0],
    ['right', 1],
    ['end', 1],
    ['bottom', 2],
    ['left', 3],
    ['start', 3],
  ];
  for (const [name, index] of sides) {
    const element = childNamed(cellMar, name);
    if (!element) continue;
    const width = numberAttr(wordAttribute(element, 'w'));
    if (width !== undefined) out[index] = twipsToPt(width);
  }
  return out;
}
