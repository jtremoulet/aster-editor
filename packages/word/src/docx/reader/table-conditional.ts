import { tableLookValue, type BlockBorder, type BorderSide } from '@aster-editor/core';
import { childNamed, wordAttribute } from '../preprocess/xml-utils.js';
import {
  applyRunProperties,
  finalizeRun,
  orderedBorders,
  readBorder,
  readShadingFill,
  type MutableRun,
  type ThemeFonts,
} from './properties.js';
import type { ResolvedRunProps, TableStyleProps } from './types.js';
import { bordersBySide, CSS_SIDES, numberAttr, onOff } from './units.js';

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

/**
 * Bordures de cellule d'un format conditionnel, côté par côté : une bordure, ou `null`
 * pour un `nil` explicite qui **retire** la bordure que le style de tableau pose (les
 * styles intégrés de Word, « Grid Table 4 », « List Table 3 »…, annulent ainsi
 * `insideH`/`insideV` sur `firstRow` ou `lastRow`, R42-02). Côté absent : rien à dire.
 */
export type ConditionalCellBorders = Partial<Record<BorderSide, BlockBorder | null>>;

/** Ce qu'un `w:tblStylePr` apporte : bordures et fond de cellule (`w:tcPr`), propriétés de run (`w:rPr`). */
export interface ConditionalFormat {
  readonly cellBorders?: ConditionalCellBorders;
  readonly cellShading?: string;
  readonly run?: ResolvedRunProps;
}

export type ConditionalFormats = Partial<Record<ConditionalType, ConditionalFormat>>;

/** Nœud d'une chaîne de styles de tableau : ses `w:tblStylePr`, de la racine à la feuille. */
export interface ConditionalSource {
  readonly tblStylePrs: readonly Element[];
}

/**
 * Bordures d'un `w:tcBorders` conditionnel, lues côté par côté (`nil` → `null`) : les
 * traits intérieurs de la région d'abord (`insideH` → haut et bas, `insideV` → gauche et
 * droite de chaque cellule, approximation : toutes les cellules de la région sont
 * traitées comme intérieures), puis les côtés nommés, qui les recouvrent.
 */
function applyConditionalBorders(
  tcBorders: Element,
  map: Map<BorderSide, BlockBorder | null>,
): void {
  const inside: readonly (readonly [string, readonly BorderSide[]])[] = [
    ['insideH', ['top', 'bottom']],
    ['insideV', ['left', 'right']],
  ];
  for (const [name, sides] of inside) {
    const element = childNamed(tcBorders, name);
    if (!element) continue;
    for (const side of sides) map.set(side, readBorder(element, side));
  }
  for (const side of CSS_SIDES) {
    const element = childNamed(tcBorders, side);
    if (element) map.set(side, readBorder(element, side));
  }
}

/**
 * Lit les formats conditionnels d'une chaîne `basedOn` (racine → feuille) : chaque type
 * accumule ses `w:tcBorders` (`nil` conservé comme `null`, pour retirer un trait du
 * style), son `w:shd` et ses `w:rPr` le long de la chaîne. Les `w:pPr` des
 * `w:tblStylePr` (alignement, espacement) sont hors lot et ignorés. `undefined` quand
 * aucun type n'apporte rien.
 */
export function readConditionalFormats(
  chain: readonly ConditionalSource[],
  theme: ThemeFonts,
): ConditionalFormats | undefined {
  const borders = new Map<ConditionalType, Map<BorderSide, BlockBorder | null>>();
  const shadings = new Map<ConditionalType, string | undefined>();
  const runs = new Map<ConditionalType, MutableRun>();
  for (const source of chain) {
    for (const tblStylePr of source.tblStylePrs) {
      const type = wordAttribute(tblStylePr, 'type');
      if (!isConditionalType(type)) continue;
      const tcPr = childNamed(tblStylePr, 'tcPr');
      const tcBorders = tcPr ? childNamed(tcPr, 'tcBorders') : null;
      if (tcBorders) {
        const map = borders.get(type) ?? new Map<BorderSide, BlockBorder | null>();
        applyConditionalBorders(tcBorders, map);
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
      ...(cellBorders && cellBorders.size > 0
        ? { cellBorders: Object.fromEntries(cellBorders) as ConditionalCellBorders }
        : {}),
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
 * Masque appliqué par Word quand `w:tblLook` manque : `0x04A0` = première ligne, première
 * colonne, pas de bandes verticales (bandes horizontales actives). ECMA-376 §17.4.56 dit
 * `0x0000` pour un élément omis, mais les notes d'implémentation de Microsoft
 * ([MS-OI29500] §2.1.160) précisent que Word assume `0x04A0` ; c'est aussi la valeur
 * que Word écrit sur chaque tableau neuf et le défaut de LibreOffice à l'import. On
 * suit Word, pas la lettre du standard (décision R42-06).
 */
const WORD_DEFAULT_LOOK = 0x04a0;

/**
 * Lit `w:tblLook` : les attributs nommés (`w:firstRow="1"` chez Word, `"true"` chez la
 * lib `docx` : les quatre formes `onOff` sont acceptées, un attribut absent vaut faux)
 * priment ; sans aucun attribut nommé, le masque `w:val` hexadécimal (Word 2007) est lu.
 * Sans `w:tblLook`, avec un `<w:tblLook/>` vide ou un `w:val` illisible, le masque est
 * celui que Word applique par défaut (`WORD_DEFAULT_LOOK`, R42-06) : l'absence et
 * l'élément vide se lisent pareil. Jamais `null`.
 */
export function readTableLook(tblPr: Element | null): TableLook {
  const tblLook = tblPr ? childNamed(tblPr, 'tblLook') : null;
  const named = tblLook !== null && LOOK_KEYS.some((key) => wordAttribute(tblLook, key) !== '');
  const parsed = tblLook && !named ? Number.parseInt(wordAttribute(tblLook, 'val'), 16) : NaN;
  const mask = Number.isFinite(parsed) ? parsed : WORD_DEFAULT_LOOK;
  const flag = (key: keyof TableLook): boolean => {
    if (named && tblLook) {
      const value = wordAttribute(tblLook, key);
      return value !== '' && onOff(value);
    }
    return (mask & LOOK_BITS[key]) !== 0;
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

/**
 * Valeur de `data-docx-look` (contrat `TableLayoutAttrs.look`, L49) : les drapeaux
 * effectifs dans l'ordre de `TABLE_LOOK_FLAGS`, **seulement quand le document porte un
 * `w:tblLook`** (explicite, même vide : le défaut de Word s'y lit comme des drapeaux
 * effectifs). Sans l'élément, `undefined` : le défaut reste appliqué aux propriétés
 * directes des cellules mais rien n'est sérialisé, et l'export n'écrit pas de
 * `w:tblLook`. Un masque sans aucun drapeau (`w:val="0000"`) n'est pas représentable
 * par le contrat (`null` = pas de drapeau) et donne aussi `undefined`.
 */
export function tableLookAttribute(tblPr: Element | null): string | undefined {
  const tblLook = tblPr ? childNamed(tblPr, 'tblLook') : null;
  if (!tblLook) return undefined;
  return tableLookValue(readTableLook(tblPr)) ?? undefined;
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
 * types, appliqués du moins au plus prioritaire (bordures côté par côté, un `nil`
 * conditionnel retirant le côté que le style pose, fond, défauts de run). Retourne `style`
 * tel quel quand aucun type n'apporte rien, pour que les cellules ordinaires partagent le
 * même objet.
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
    for (const [side, border] of Object.entries(format.cellBorders ?? {}) as [
      BorderSide,
      BlockBorder | null,
    ][]) {
      if (border) borders[side] = border;
      else delete borders[side];
    }
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
