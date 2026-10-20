import type { BlockBorder, BorderSide } from '@aster-editor/core';
import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import {
  applyBorders,
  applyRunProperties,
  finalizeRun,
  orderedBorders,
  readShadingFill,
  type MutableRun,
  type ThemeFonts,
} from './properties';
import type { ResolvedRunProps, TableStyleProps } from './types';
import { bordersBySide } from './units-blocks';
import { numberAttr, onOff } from './units';

/**
 * Styles conditionnels de tableau (`w:tblStylePr` : première ligne, bandes…), approximés
 * en propriétés directes de cellule à l'import (session 4). `styles.ts` lit les formats
 * dans la chaîne du style, `tables.ts` décide pour chaque cellule lesquels s'appliquent
 * selon `w:tblLook` et sa position, puis les fond dans le style de tableau vu par la
 * cellule : bordures, fond et défauts de run, **seulement là où la cellule n'en pose pas**
 * (les `w:tcPr` directs et les `w:rPr` directs gardent la main, comme dans Word).
 */

/** Types conditionnels pris en charge, du moins au plus prioritaire (ordre de Word). */
export const CONDITIONAL_TYPES = [
  'band1Vert',
  'band2Vert',
  'band1Horz',
  'band2Horz',
  'firstCol',
  'lastCol',
  'firstRow',
  'lastRow',
] as const;

export type ConditionalType = (typeof CONDITIONAL_TYPES)[number];

function isConditionalType(value: string): value is ConditionalType {
  return (CONDITIONAL_TYPES as readonly string[]).includes(value);
}

/** Ce qu'un `w:tblStylePr` apporte : bordures et fond de cellule (`w:tcPr`), propriétés de run (`w:rPr`). */
export interface ConditionalFormat {
  readonly cellBorders?: readonly BlockBorder[];
  readonly cellShading?: string;
  readonly run?: ResolvedRunProps;
}

export type ConditionalFormats = Partial<Record<ConditionalType, ConditionalFormat>>;

/** Nœud d'une chaîne de styles de tableau : ses `w:tblStylePr`, de la racine à la feuille. */
export interface ConditionalSource {
  readonly tblStylePrs: readonly Element[];
}

/**
 * Lit les formats conditionnels d'une chaîne `basedOn` (racine → feuille) : chaque type
 * accumule ses `w:tcBorders` (`nil` retire), son `w:shd` et ses `w:rPr` le long de la
 * chaîne. Les `w:pPr` des `w:tblStylePr` (alignement, espacement) sont hors lot et ignorés.
 * `undefined` quand aucun type n'apporte rien.
 */
export function readConditionalFormats(
  chain: readonly ConditionalSource[],
  theme: ThemeFonts,
): ConditionalFormats | undefined {
  const borders = new Map<ConditionalType, Map<BorderSide, BlockBorder>>();
  const shadings = new Map<ConditionalType, string | undefined>();
  const runs = new Map<ConditionalType, MutableRun>();
  for (const source of chain) {
    for (const tblStylePr of source.tblStylePrs) {
      const type = wordAttribute(tblStylePr, 'type');
      if (!isConditionalType(type)) continue;
      const tcPr = childNamed(tblStylePr, 'tcPr');
      const tcBorders = tcPr ? childNamed(tcPr, 'tcBorders') : null;
      if (tcBorders) {
        const map = borders.get(type) ?? new Map<BorderSide, BlockBorder>();
        applyBorders(tcBorders, map);
        borders.set(type, map);
      }
      const shd = tcPr ? childNamed(tcPr, 'shd') : null;
      if (shd) shadings.set(type, readShadingFill(shd));
      const rPr = childNamed(tblStylePr, 'rPr');
      if (rPr) {
        const run = runs.get(type) ?? {};
        applyRunProperties(rPr, run, theme);
        runs.set(type, run);
      }
    }
  }
  const formats: { -readonly [K in ConditionalType]?: ConditionalFormat } = {};
  for (const type of CONDITIONAL_TYPES) {
    const cellBorders = borders.get(type);
    const cellShading = shadings.get(type);
    const run = runs.get(type);
    const resolvedRun = run ? finalizeRun(run) : undefined;
    const format: { -readonly [K in keyof ConditionalFormat]?: ConditionalFormat[K] } = {
      ...(cellBorders && cellBorders.size > 0 ? { cellBorders: orderedBorders(cellBorders) } : {}),
      ...(cellShading ? { cellShading } : {}),
      ...(resolvedRun && Object.keys(resolvedRun).length > 0 ? { run: resolvedRun } : {}),
    };
    if (Object.keys(format).length > 0) formats[type] = format;
  }
  return Object.keys(formats).length > 0 ? formats : undefined;
}

/** Drapeaux `w:tblLook` : quels formats conditionnels le tableau active. */
export interface TableLook {
  readonly firstRow: boolean;
  readonly lastRow: boolean;
  readonly firstColumn: boolean;
  readonly lastColumn: boolean;
  readonly noHBand: boolean;
  readonly noVBand: boolean;
}

/** Bits du masque `w:val` hexadécimal (forme Word 2007), ECMA-376 §17.4.56. */
const LOOK_BITS: Readonly<Record<keyof TableLook, number>> = {
  firstRow: 0x0020,
  lastRow: 0x0040,
  firstColumn: 0x0080,
  lastColumn: 0x0100,
  noHBand: 0x0200,
  noVBand: 0x0400,
};

const LOOK_KEYS = Object.keys(LOOK_BITS) as readonly (keyof TableLook)[];

/**
 * Lit `w:tblLook` : les attributs nommés (`w:firstRow="1"` chez Word, `"true"` chez la
 * lib `docx` : les quatre formes `onOff` sont acceptées, un attribut absent vaut faux)
 * priment ; sans aucun attribut nommé, le masque `w:val` hexadécimal (Word 2007) est lu.
 * Sans `w:tblLook`, aucun format conditionnel n'est appliqué (`null`).
 */
export function readTableLook(tblPr: Element | null): TableLook | null {
  const tblLook = tblPr ? childNamed(tblPr, 'tblLook') : null;
  if (!tblLook) return null;
  const named = LOOK_KEYS.some((key) => wordAttribute(tblLook, key) !== '');
  const mask = named ? 0 : Number.parseInt(wordAttribute(tblLook, 'val'), 16);
  const flag = (key: keyof TableLook): boolean => {
    if (named) {
      const value = wordAttribute(tblLook, key);
      return value !== '' && onOff(value);
    }
    return Number.isFinite(mask) && (mask & LOOK_BITS[key]) !== 0;
  };
  return {
    firstRow: flag('firstRow'),
    lastRow: flag('lastRow'),
    firstColumn: flag('firstColumn'),
    lastColumn: flag('lastColumn'),
    noHBand: flag('noHBand'),
    noVBand: flag('noVBand'),
  };
}

/** Taille des bandes (`w:tblStyleRowBandSize` / `w:tblStyleColBandSize`), 1 par défaut. */
export function readBandSizes(tblPr: Element | null): {
  readonly rows: number;
  readonly columns: number;
} {
  const read = (name: string): number => {
    const element = tblPr ? childNamed(tblPr, name) : null;
    const value = element ? numberAttr(wordAttribute(element, 'val')) : undefined;
    return value !== undefined && value >= 1 ? Math.floor(value) : 1;
  };
  return { rows: read('tblStyleRowBandSize'), columns: read('tblStyleColBandSize') };
}

/** Position d'une cellule dans la grille, pour décider des formats qui s'appliquent. */
export interface CellPosition {
  readonly row: number;
  readonly rowCount: number;
  readonly column: number;
  readonly lastColumn: boolean;
}

/**
 * Types conditionnels d'une cellule, du moins au plus prioritaire. Les bandes se comptent
 * sur les lignes (colonnes) de corps, hors première et dernière quand `w:tblLook` les
 * active : la première ligne de corps est `band1Horz`, la suivante `band2Horz`, par
 * paquets de `bandSize`.
 */
export function conditionalTypesOf(
  position: CellPosition,
  look: TableLook,
  bands: { readonly rows: number; readonly columns: number },
): ConditionalType[] {
  const types: ConditionalType[] = [];
  const firstRow = look.firstRow && position.row === 0;
  const lastRow = look.lastRow && position.row === position.rowCount - 1;
  const firstCol = look.firstColumn && position.column === 0;
  const lastCol = look.lastColumn && position.lastColumn;
  if (!look.noVBand && !firstCol && !lastCol) {
    const index = position.column - (look.firstColumn ? 1 : 0);
    if (index >= 0)
      types.push(Math.floor(index / bands.columns) % 2 === 0 ? 'band1Vert' : 'band2Vert');
  }
  if (!look.noHBand && !firstRow && !lastRow) {
    const index = position.row - (look.firstRow ? 1 : 0);
    if (index >= 0)
      types.push(Math.floor(index / bands.rows) % 2 === 0 ? 'band1Horz' : 'band2Horz');
  }
  if (firstCol) types.push('firstCol');
  if (lastCol) types.push('lastCol');
  if (firstRow) types.push('firstRow');
  if (lastRow) types.push('lastRow');
  return types;
}

/**
 * Style de tableau vu par une cellule : le style de base complété par les formats de ses
 * types, appliqués du moins au plus prioritaire (bordures côté par côté, fond, défauts de
 * run). Retourne `style` tel quel quand aucun type n'apporte rien, pour que les cellules
 * ordinaires partagent le même objet.
 */
export function applyConditionalFormats(
  style: TableStyleProps,
  formats: ConditionalFormats,
  types: readonly ConditionalType[],
): TableStyleProps {
  const applied = types.map((type) => formats[type]).filter((format) => format !== undefined);
  if (applied.length === 0) return style;
  const borders = bordersBySide(style.cellBorders);
  let cellShading = style.cellShading;
  let runDefaults: ResolvedRunProps = style.runDefaults ?? {};
  for (const format of applied) {
    for (const border of format.cellBorders ?? []) borders[border.side] = border;
    if (format.cellShading) cellShading = format.cellShading;
    if (format.run) runDefaults = { ...runDefaults, ...format.run };
  }
  const cellBorders = orderedBorders(
    new Map(Object.entries(borders) as [BorderSide, BlockBorder][]),
  );
  return {
    ...style,
    ...(cellBorders.length > 0 ? { cellBorders } : {}),
    ...(cellShading ? { cellShading } : {}),
    ...(Object.keys(runDefaults).length > 0 ? { runDefaults } : {}),
  };
}
