import type { CellVerticalAlign } from '@aster-editor/core';
import type { DefaultParagraph } from '@aster-editor/core';
import { childNamed, childrenNamed, textOf, wordAttribute } from '../preprocess/xml-utils.js';
import { readDocumentLang } from '../reader/sections.js';
import { conditionalFormatsOf } from '../reader/styles.js';
import { defaultParagraphOf } from '../reader/styles.js';
import {
  applyConditionalFormats,
  conditionalTypesOf,
  readBandSizes,
  readTableLook,
  type TableLook,
} from '../reader/table-conditional.js';
import type {
  DocxPackage,
  NumberingResolver,
  ResolvedParagraphProps,
  ResolvedRunProps,
  StyleResolver,
  TableStyleProps,
} from '../reader/types.js';
import {
  numericAttribute,
  readBorders,
  shadingColor,
  twipsToPt,
  type BorderMap,
} from '../reader/units.js';
import {
  effectiveCellBorders,
  effectiveTableBorders,
  nonEmptyBorders,
  type CellEdges,
  type EffectiveBorders,
} from './model-borders.js';
import { isBlankParagraph, readParagraphs } from './model-paragraph.js';
import { readSections } from './model-sections.js';

/**
 * Modèle comparable d'un document Word : blocs du corps (paragraphes et tableaux, `w:sdt`
 * aplatis) avec leurs propriétés **résolues** par le lecteur, sections avec leurs en-têtes
 * et pieds. Les `Document` du paquet ne sont jamais modifiés. Les `w:rsid*`,
 * `w:lastRenderedPageBreak`, `w:proofErr` et signets ne sont pas lus, sauf les
 * identifiants de révision du paragraphe, exposés pour l'option `ignoreRevisionIds: false`.
 * Les bordures et largeurs de cellules sont celles que Word rend (`model-borders.ts`), les
 * sauts de page et champs de fusion sont modélisés par `model-paragraph.ts`. Le style de
 * tableau vu par chaque cellule est résolu comme le lecteur (L46) : formats conditionnels
 * du style (`w:tblStylePr`) activés par `w:tblLook` selon la position de la cellule, fondus
 * dans ses bordures, son fond et les défauts de ses runs.
 */

export interface RunModel {
  readonly text: string;
  readonly props: ResolvedRunProps;
}

export interface ImageModel {
  readonly kind: 'drawing' | 'pict';
  readonly widthPx?: number;
  readonly heightPx?: number;
}

export interface NoteModel {
  readonly kind: 'footnote' | 'endnote';
  readonly text: string;
}

/**
 * Champ de fusion d'un paragraphe : vrai `MERGEFIELD` ou `{{nom}}` écrit en clair. Le nom
 * brut distingue `MERGEFIELD "Nom Client"`, `nom_client` et `"NOM CLIENT"`, trois colonnes
 * de source de données (R30-04) ; le nom normalisé ne sert que face à un `{{}}` littéral,
 * celui qu'Aster écrit à l'import.
 */
export interface FieldModel {
  /** Nom brut : celui de l'instruction (guillemets retirés) ou l'intérieur du `{{}}`, blancs rognés. */
  readonly raw: string;
  /** Nom de variable normalisé comme à l'import (`Nom Client` → `nom_client`). */
  readonly name: string;
  /** Vrai pour un `{{nom}}` en clair, faux pour un champ `MERGEFIELD` (simple ou complexe). */
  readonly literal: boolean;
}

export interface ParagraphModel {
  readonly kind: 'paragraph';
  /** Texte tel que Word l'affiche : résultat des champs, tabulations et sauts de ligne compris. */
  readonly text: string;
  /** Texte canonique : chaque champ de fusion remplacé par `{{nom}}` normalisé, pour l'alignement et l'équivalence. */
  readonly placeholderText: string;
  /** Champs de fusion dans l'ordre, `MERGEFIELD` et `{{nom}}` en clair distingués par `literal`. */
  readonly fields: readonly FieldModel[];
  readonly props: ResolvedParagraphProps;
  /** Format résolu du niveau de liste (`decimal|%1.|1`), `undefined` sans numérotation connue. */
  readonly listFormat?: string;
  /** Saut de page explicite (`w:br w:type="page"`) à la fin de ce paragraphe. */
  readonly pageBreakAfter?: true;
  readonly runs: readonly RunModel[];
  readonly images: readonly ImageModel[];
  readonly notes: readonly NoteModel[];
  /** Attributs `w:rsid*` du paragraphe, triés, pour `ignoreRevisionIds: false`. */
  readonly revisionIds: string;
}

export interface CellModel {
  readonly colspan: number;
  readonly vMerge?: 'restart' | 'continue';
  /** Largeur effective : `w:tcW` en twips, sinon la somme des colonnes de grille couvertes. */
  readonly widthPt?: number;
  /** Bordures effectives (style, tableau selon la position, cellule), côtés visibles seulement. */
  readonly borders?: EffectiveBorders;
  readonly shading?: string;
  readonly verticalAlign?: CellVerticalAlign;
  readonly blocks: readonly BlockModel[];
}

export interface TableModel {
  readonly kind: 'table';
  readonly text: string;
  readonly placeholderText: string;
  readonly styleId?: string;
  readonly width?: string;
  /** `w:jc` du tableau (`center`, `right`…), absent pour `left` ou sans élément. */
  readonly align?: string;
  /**
   * Drapeaux `w:tblLook` effectifs (`firstRow,noVBand`…, défaut de Word `0x04A0` sans
   * l'élément), posés seulement quand le style du tableau définit des formats
   * conditionnels : ailleurs ils n'ont aucun effet sur le rendu.
   */
  readonly conditional?: string;
  /** Bordures extérieures effectives (style puis `w:tblBorders`), côtés visibles seulement. */
  readonly borders?: EffectiveBorders;
  readonly columnWidthsPt: readonly number[];
  readonly rows: readonly (readonly CellModel[])[];
}

export type BlockModel = ParagraphModel | TableModel;

export interface HeaderFooterModel {
  readonly blocks: readonly BlockModel[];
}

export type HeaderFooterType = 'default' | 'first' | 'even';

export interface SectionModel {
  readonly type?: string;
  readonly pageSize?: Record<string, string | number>;
  readonly margins?: Record<string, number>;
  readonly columns?: Record<string, string | number | boolean>;
  readonly titlePage: boolean;
  readonly headers: Partial<Record<HeaderFooterType, HeaderFooterModel>>;
  readonly footers: Partial<Record<HeaderFooterType, HeaderFooterModel>>;
}

export interface DocumentModel {
  readonly blocks: readonly BlockModel[];
  readonly sections: readonly SectionModel[];
  readonly lang?: string;
  /**
   * Défauts de paragraphe du document (`docDefaults` puis style `Normal`, comme le
   * lecteur les lit en `layout.defaultParagraph`, session 5) ; absent quand tout vaut le
   * défaut de Word.
   */
  readonly defaultParagraph?: DefaultParagraph;
}

/** Contexte de lecture d'une partie : paquet, chemin de la partie, résolveurs, textes des notes. */
export interface ModelContext {
  readonly pkg: DocxPackage;
  readonly part: string;
  readonly styles: StyleResolver;
  readonly numbering: NumberingResolver;
  readonly notes: ReadonlyMap<string, string>;
  /** Style de tableau vu par la cellule en cours (formats conditionnels compris), absent hors tableau. */
  readonly tableStyle?: TableStyleProps | null;
}

const VERTICAL_ALIGNS: ReadonlyMap<string, CellVerticalAlign> = new Map([
  ['top', 'top'],
  ['center', 'middle'],
  ['bottom', 'bottom'],
]);

/** Notes d'une partie (`footnotes` / `endnotes`) : `kind:id` → texte brut. */
async function readNotes(pkg: DocxPackage): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  for (const kind of ['footnote', 'endnote'] as const) {
    const path = await pkg.related(pkg.mainPart, `/${kind}s`);
    const doc = path ? await pkg.part(path) : null;
    if (!doc) continue;
    for (const note of childrenNamed(doc.documentElement, kind)) {
      const id = wordAttribute(note, 'id');
      if (id) notes.set(`${kind}:${id}`, textOf(note).trim());
    }
  }
  return notes;
}

function tableWidth(tblW: Element | null): string | undefined {
  if (!tblW) return undefined;
  const type = wordAttribute(tblW, 'type');
  const raw = wordAttribute(tblW, 'w');
  if (raw === '' || type === 'auto' || type === 'nil') return undefined;
  if (type === 'pct' || raw.endsWith('%')) {
    const value = raw.endsWith('%') ? Number(raw.slice(0, -1)) : Number(raw) / 50;
    return Number.isFinite(value) ? `${String(Math.round(value * 100) / 100)}%` : undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? `${String(twipsToPt(value))}pt` : undefined;
}

/** Contexte de lecture d'une cellule : style vu par la cellule, bordures du tableau, grille, position. */
interface CellContext {
  /** Style du tableau complété par les formats conditionnels de cette cellule. */
  readonly style: TableStyleProps | null;
  readonly tblBorders: BorderMap;
  readonly gridTwips: readonly number[];
  readonly gridStart: number;
  readonly edges: CellEdges;
}

/**
 * Largeur effective d'une cellule : `w:tcW` en twips quand il est posé, sinon les colonnes
 * de grille qu'elle couvre (ce que Word rend). `pct` et `auto` sans grille : inconnue.
 */
function cellWidthPt(tcW: Element | null, colspan: number, cell: CellContext): number | undefined {
  const type = tcW ? wordAttribute(tcW, 'type') : '';
  const twips = numericAttribute(tcW, 'w');
  if (twips !== undefined && twips > 0 && type !== 'pct' && type !== 'auto') {
    return twipsToPt(twips);
  }
  if (type === 'pct') return undefined;
  const columns = cell.gridTwips.slice(cell.gridStart, cell.gridStart + colspan);
  if (columns.length === 0) return undefined;
  return twipsToPt(columns.reduce((sum, width) => sum + width, 0));
}

function readCell(tc: Element, ctx: ModelContext, cell: CellContext): CellModel {
  const tcPr = childNamed(tc, 'tcPr');
  const vMergeElement = tcPr ? childNamed(tcPr, 'vMerge') : null;
  const vMergeValue = vMergeElement ? wordAttribute(vMergeElement, 'val') : null;
  const colspan = Math.max(
    1,
    numericAttribute(tcPr ? childNamed(tcPr, 'gridSpan') : null, 'val') ?? 1,
  );
  const widthPt = cellWidthPt(tcPr ? childNamed(tcPr, 'tcW') : null, colspan, cell);
  const tcBorders = readBorders(tcPr ? childNamed(tcPr, 'tcBorders') : null);
  const borders = nonEmptyBorders(
    effectiveCellBorders(cell.style, cell.tblBorders, tcBorders, cell.edges),
  );
  const vAlign = tcPr ? childNamed(tcPr, 'vAlign') : null;
  const verticalAlign = vAlign ? VERTICAL_ALIGNS.get(wordAttribute(vAlign, 'val')) : undefined;
  const shading = shadingColor(tcPr ? childNamed(tcPr, 'shd') : null) ?? cell.style?.cellShading;
  return {
    colspan,
    ...(vMergeElement ? { vMerge: vMergeValue === 'restart' ? 'restart' : 'continue' } : {}),
    ...(widthPt !== undefined ? { widthPt } : {}),
    ...(borders ? { borders } : {}),
    ...(shading ? { shading } : {}),
    ...(verticalAlign ? { verticalAlign } : {}),
    blocks: readBlocks(tc, { ...ctx, tableStyle: cell.style }),
  };
}

/** Drapeaux actifs d'un `w:tblLook`, dans l'ordre de Word (`firstRow,noVBand`), vide si aucun. */
function lookSummary(look: TableLook): string {
  return (Object.keys(look) as (keyof TableLook)[]).filter((key) => look[key]).join(',');
}

/**
 * Enfants nommés d'un conteneur de tableau, `w:sdt`/`w:sdtContent` et `w:customXml`
 * aplatis (R30-08) : une ligne ou une cellule sous un contrôle de contenu (section
 * répétée, cellule contrôlée) est une ligne ou une cellule comme les autres pour Word.
 */
function tableChildren(parent: Element, name: 'tr' | 'tc'): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(parent.children)) {
    if (child.localName === name) out.push(child);
    else if (child.localName === 'sdt') {
      const content = childNamed(child, 'sdtContent');
      if (content) out.push(...tableChildren(content, name));
    } else if (child.localName === 'customXml') out.push(...tableChildren(child, name));
  }
  return out;
}

/** Nombre de colonnes de grille d'une ligne : somme des `gridSpan`. */
function rowSpan(tr: Element): number {
  return tableChildren(tr, 'tc').reduce((sum, tc) => {
    const tcPr = childNamed(tc, 'tcPr');
    return (
      sum + Math.max(1, numericAttribute(tcPr ? childNamed(tcPr, 'gridSpan') : null, 'val') ?? 1)
    );
  }, 0);
}

function readTable(tbl: Element, ctx: ModelContext): TableModel {
  const tblPr = childNamed(tbl, 'tblPr');
  const tblStyle = tblPr ? childNamed(tblPr, 'tblStyle') : null;
  const styleId = tblStyle ? wordAttribute(tblStyle, 'val') : '';
  const jc = tblPr ? childNamed(tblPr, 'jc') : null;
  const align = jc ? wordAttribute(jc, 'val') : '';
  const tblBorders = readBorders(tblPr ? childNamed(tblPr, 'tblBorders') : null);
  const style = ctx.styles.tableStyle(styleId || null);
  const borders = nonEmptyBorders(effectiveTableBorders(style, tblBorders));
  // Formats conditionnels du style, activés par `w:tblLook` (défaut de Word sans l'élément),
  // résolus par cellule comme le lecteur (`reader/tables.ts`). Les drapeaux ne sont
  // comparés que s'ils ont un effet, c'est-à-dire si le style définit au moins un format.
  const conditional = conditionalFormatsOf(style);
  const look = readTableLook(tblPr);
  const bands = readBandSizes(tblPr);
  const cellStyle = (position: Parameters<typeof conditionalTypesOf>[0]): TableStyleProps | null =>
    style && conditional
      ? applyConditionalFormats(style, conditional, conditionalTypesOf(position, look, bands))
      : style;
  const grid = childNamed(tbl, 'tblGrid');
  const gridTwips = grid
    ? childrenNamed(grid, 'gridCol')
        .map((col) => numericAttribute(col, 'w'))
        .filter((w): w is number => w !== undefined)
    : [];
  const trs = tableChildren(tbl, 'tr');
  // Boucle plutôt que `Math.max(...spread)` : au-delà de ≈ 125 000 lignes, la pile d'appels débordait (R30-07).
  const columns = trs.reduce((max, tr) => Math.max(max, rowSpan(tr)), gridTwips.length);
  const rows = trs.map((tr, r) => {
    let gridStart = 0;
    return tableChildren(tr, 'tc').map((tc) => {
      const tcPr = childNamed(tc, 'tcPr');
      const colspan = Math.max(
        1,
        numericAttribute(tcPr ? childNamed(tcPr, 'gridSpan') : null, 'val') ?? 1,
      );
      const edges: CellEdges = {
        top: r === 0,
        bottom: r === trs.length - 1,
        left: gridStart === 0,
        right: gridStart + colspan >= columns,
      };
      const effectiveStyle = cellStyle({
        row: r,
        rowCount: trs.length,
        column: gridStart,
        lastColumn: edges.right,
      });
      const model = readCell(tc, ctx, {
        style: effectiveStyle,
        tblBorders,
        gridTwips,
        gridStart,
        edges,
      });
      gridStart += colspan;
      return model;
    });
  });
  const rowsText = (pick: (block: BlockModel) => string): string =>
    rows.map((row) => row.map((cell) => cell.blocks.map(pick).join('\n')).join('\t')).join('\n');
  const width = tableWidth(tblPr ? childNamed(tblPr, 'tblW') : null);
  return {
    kind: 'table',
    text: rowsText((block) => block.text),
    placeholderText: rowsText((block) => block.placeholderText),
    ...(styleId ? { styleId } : {}),
    ...(width ? { width } : {}),
    ...(align ? { align } : {}),
    ...(conditional ? { conditional: lookSummary(look) } : {}),
    ...(borders ? { borders } : {}),
    columnWidthsPt: gridTwips.map(twipsToPt),
    rows,
  };
}

/** Texte brut d'une suite de blocs, paragraphes séparés par des sauts de ligne. */
export function blocksText(blocks: readonly BlockModel[]): string {
  return blocks.map((block) => block.text).join('\n');
}

/**
 * Ajoute un paragraphe ; un paragraphe vide qui ne porte qu'un saut de page (`<w:p><w:br
 * w:type="page"/></w:p>`) se replie sur le paragraphe précédent, dont il marque la fin.
 */
function pushParagraph(blocks: BlockModel[], paragraph: ParagraphModel): void {
  const previous = blocks[blocks.length - 1];
  if (
    paragraph.pageBreakAfter &&
    isBlankParagraph(paragraph) &&
    previous?.kind === 'paragraph' &&
    !previous.pageBreakAfter
  ) {
    blocks[blocks.length - 1] = { ...previous, pageBreakAfter: true };
    return;
  }
  blocks.push(paragraph);
}

/** Blocs d'un conteneur (`w:body`, `w:tc`, `w:hdr`…), `w:sdt` aplatis, le reste ignoré. */
function readBlocks(container: Element, ctx: ModelContext): BlockModel[] {
  const blocks: BlockModel[] = [];
  for (const child of Array.from(container.children)) {
    if (child.localName === 'p') {
      for (const paragraph of readParagraphs(child, ctx)) pushParagraph(blocks, paragraph);
    } else if (child.localName === 'tbl') blocks.push(readTable(child, ctx));
    else if (child.localName === 'sdt') {
      const content = childNamed(child, 'sdtContent');
      if (content) blocks.push(...readBlocks(content, ctx));
    } else if (child.localName === 'customXml') {
      // Bloc `w:customXml` : conteneur transparent, comme pour le lecteur (R25-05).
      blocks.push(...readBlocks(child, ctx));
    }
  }
  return blocks;
}

/** Lit le modèle comparable d'un paquet ouvert. Lève si la partie principale est illisible. */
export async function readDocumentModel(
  pkg: DocxPackage,
  styles: StyleResolver,
  numbering: NumberingResolver,
): Promise<DocumentModel> {
  const main = await pkg.part(pkg.mainPart);
  const body = main ? childNamed(main.documentElement, 'body') : null;
  if (!body) throw new Error(`compareDocx : partie principale ${pkg.mainPart} illisible`);
  const ctx: ModelContext = {
    pkg,
    part: pkg.mainPart,
    styles,
    numbering,
    notes: await readNotes(pkg),
  };
  const sections = await readSections(body, ctx, readBlocks);
  const lang = await readDocumentLang(pkg);
  const defaultParagraph = defaultParagraphOf(styles);
  return {
    blocks: readBlocks(body, ctx),
    sections,
    ...(lang ? { lang } : {}),
    ...(Object.keys(defaultParagraph).length > 0 ? { defaultParagraph } : {}),
  };
}
