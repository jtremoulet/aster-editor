import type { CellVerticalAlign } from '@aster-editor/core';
import {
  allNamed,
  childNamed,
  childrenNamed,
  textOf,
  wordAttribute,
} from '../preprocess/xml-utils';
import { readDocumentLang } from '../reader/sections';
import type {
  DocxPackage,
  NumberingResolver,
  ResolvedParagraphProps,
  ResolvedRunProps,
  StyleResolver,
  TableStyleProps,
} from '../reader/types';
import { emuToPx, twipsToPt } from '../reader/units';
import {
  bordersBySide,
  numericAttribute,
  readBorders,
  shadingColor,
  type BorderMap,
} from '../reader/units-blocks';
import { readSections } from './model-sections';

/**
 * Modèle comparable d'un document Word : blocs du corps (paragraphes et tableaux, `w:sdt`
 * aplatis) avec leurs propriétés **résolues** par le lecteur, sections avec leurs en-têtes
 * et pieds. Les `Document` du paquet ne sont jamais modifiés. Les `w:rsid*`,
 * `w:lastRenderedPageBreak`, `w:proofErr` et signets ne sont pas lus, sauf les
 * identifiants de révision du paragraphe, exposés pour l'option `ignoreRevisionIds: false`.
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

export interface ParagraphModel {
  readonly kind: 'paragraph';
  readonly text: string;
  readonly props: ResolvedParagraphProps;
  /** Format résolu du niveau de liste (`decimal|%1.|1`), `undefined` sans numérotation connue. */
  readonly listFormat?: string;
  readonly runs: readonly RunModel[];
  readonly images: readonly ImageModel[];
  readonly notes: readonly NoteModel[];
  /** Attributs `w:rsid*` du paragraphe, triés, pour `ignoreRevisionIds: false`. */
  readonly revisionIds: string;
}

export interface CellModel {
  readonly colspan: number;
  readonly vMerge?: 'restart' | 'continue';
  readonly widthPt?: number;
  readonly borders?: BorderMap;
  readonly shading?: string;
  readonly verticalAlign?: CellVerticalAlign;
  readonly blocks: readonly BlockModel[];
}

export interface TableModel {
  readonly kind: 'table';
  readonly text: string;
  readonly styleId?: string;
  readonly width?: string;
  readonly align?: string;
  readonly borders?: BorderMap;
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
}

/** Contexte de lecture d'une partie : paquet, chemin de la partie, résolveurs, textes des notes. */
export interface ModelContext {
  readonly pkg: DocxPackage;
  readonly part: string;
  readonly styles: StyleResolver;
  readonly numbering: NumberingResolver;
  readonly notes: ReadonlyMap<string, string>;
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

function readImage(element: Element): ImageModel | null {
  if (element.localName === 'pict') {
    return allNamed(element, 'imagedata').length > 0 ? { kind: 'pict' } : null;
  }
  if (allNamed(element, 'blip').length === 0) return null;
  const container = childNamed(element, 'anchor') ?? childNamed(element, 'inline') ?? element;
  const extent = childNamed(container, 'extent');
  const cx = Number(extent?.getAttribute('cx') ?? '');
  const cy = Number(extent?.getAttribute('cy') ?? '');
  return {
    kind: 'drawing',
    ...(cx > 0 ? { widthPx: emuToPx(cx) } : {}),
    ...(cy > 0 ? { heightPx: emuToPx(cy) } : {}),
  };
}

/** Clé de fusion de deux runs voisins : mêmes propriétés résolues. */
function runKey(props: ResolvedRunProps): string {
  return JSON.stringify(props, Object.keys(props).sort());
}

function readParagraph(p: Element, ctx: ModelContext): ParagraphModel {
  const pPr = childNamed(p, 'pPr');
  const props = ctx.styles.paragraph(pPr);
  const runs: { text: string; props: ResolvedRunProps; key: string }[] = [];
  const images: ImageModel[] = [];
  const notes: NoteModel[] = [];
  /** Champs complexes ouverts : `true` tant que le champ est en phase instruction. */
  const fields: boolean[] = [];
  const inInstruction = (): boolean => fields.includes(true);

  const pushText = (props: ResolvedRunProps, text: string): void => {
    if (text === '' || inInstruction()) return;
    const key = runKey(props);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.text += text;
    else runs.push({ text, props, key });
  };

  const readRun = (run: Element): void => {
    const resolved = ctx.styles.run(childNamed(run, 'rPr'), props);
    for (const child of Array.from(run.children)) {
      switch (child.localName) {
        case 't':
          pushText(resolved, child.textContent ?? '');
          break;
        case 'tab':
        case 'ptab':
          pushText(resolved, '\t');
          break;
        case 'br':
        case 'cr':
          pushText(resolved, '\n');
          break;
        case 'noBreakHyphen':
          pushText(resolved, String.fromCharCode(0x2011));
          break;
        case 'softHyphen':
          pushText(resolved, String.fromCharCode(0xad));
          break;
        case 'sym': {
          const code = Number.parseInt(wordAttribute(child, 'char'), 16);
          if (Number.isFinite(code)) pushText(resolved, String.fromCodePoint(code));
          break;
        }
        case 'fldChar': {
          const type = wordAttribute(child, 'fldCharType');
          if (type === 'begin') fields.push(true);
          else if (type === 'separate' && fields.length > 0) fields[fields.length - 1] = false;
          else if (type === 'end') fields.pop();
          break;
        }
        case 'drawing':
        case 'pict': {
          const image = inInstruction() ? null : readImage(child);
          if (image) images.push(image);
          break;
        }
        case 'footnoteReference':
        case 'endnoteReference': {
          const kind = child.localName === 'footnoteReference' ? 'footnote' : 'endnote';
          const id = wordAttribute(child, 'id');
          if (id && !inInstruction()) {
            notes.push({ kind, text: ctx.notes.get(`${kind}:${id}`) ?? '' });
          }
          break;
        }
        default:
          break;
      }
    }
  };

  const walk = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      switch (child.localName) {
        case 'r':
          readRun(child);
          break;
        case 'del':
        case 'moveFrom':
        case 'pPr':
        case 'bookmarkStart':
        case 'bookmarkEnd':
        case 'proofErr':
        case 'commentRangeStart':
        case 'commentRangeEnd':
          break;
        case 'sdt': {
          const content = childNamed(child, 'sdtContent');
          if (content) walk(content);
          break;
        }
        default:
          // `w:hyperlink`, `w:fldSimple`, `w:ins`, `w:smartTag`… : conteneurs traversés.
          walk(child);
      }
    }
  };
  walk(p);

  const numbering = props.numbering;
  const level = numbering
    ? ctx.numbering.definition(numbering.numId)?.levels.find((l) => l.level === numbering.level)
    : undefined;
  const revisionIds = Array.from(p.attributes)
    .filter((attr) => attr.localName.startsWith('rsid'))
    .map((attr) => `${attr.localName}=${attr.value}`)
    .sort()
    .join(' ');

  return {
    kind: 'paragraph',
    text: runs.map((run) => run.text).join(''),
    props,
    ...(level ? { listFormat: `${level.format}|${level.text}|${String(level.start)}` } : {}),
    runs: runs.map(({ text, props }) => ({ text, props })),
    images,
    notes,
    revisionIds,
  };
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

function readCell(tc: Element, ctx: ModelContext, style: TableStyleProps | null): CellModel {
  const tcPr = childNamed(tc, 'tcPr');
  const vMergeElement = tcPr ? childNamed(tcPr, 'vMerge') : null;
  const vMergeValue = vMergeElement ? wordAttribute(vMergeElement, 'val') : null;
  const tcW = tcPr ? childNamed(tcPr, 'tcW') : null;
  const widthTwips = numericAttribute(tcW, 'w');
  const tcBorders = tcPr ? childNamed(tcPr, 'tcBorders') : null;
  const vAlign = tcPr ? childNamed(tcPr, 'vAlign') : null;
  const verticalAlign = vAlign ? VERTICAL_ALIGNS.get(wordAttribute(vAlign, 'val')) : undefined;
  const shading = shadingColor(tcPr ? childNamed(tcPr, 'shd') : null) ?? style?.cellShading;
  return {
    colspan: Math.max(1, numericAttribute(tcPr ? childNamed(tcPr, 'gridSpan') : null, 'val') ?? 1),
    ...(vMergeElement ? { vMerge: vMergeValue === 'restart' ? 'restart' : 'continue' } : {}),
    ...(tcW && widthTwips !== undefined && wordAttribute(tcW, 'type') !== 'pct'
      ? { widthPt: twipsToPt(widthTwips) }
      : {}),
    ...(tcBorders ? { borders: readBorders(tcBorders) } : {}),
    ...(shading ? { shading } : {}),
    ...(verticalAlign ? { verticalAlign } : {}),
    blocks: readBlocks(tc, ctx),
  };
}

function readTable(tbl: Element, ctx: ModelContext): TableModel {
  const tblPr = childNamed(tbl, 'tblPr');
  const tblStyle = tblPr ? childNamed(tblPr, 'tblStyle') : null;
  const styleId = tblStyle ? wordAttribute(tblStyle, 'val') : '';
  const jc = tblPr ? childNamed(tblPr, 'jc') : null;
  const align = jc ? wordAttribute(jc, 'val') : '';
  const tblBorders = tblPr ? childNamed(tblPr, 'tblBorders') : null;
  // Bordures effectives du tableau : celles du style, recouvertes par les directes.
  const style = ctx.styles.tableStyle(styleId || null);
  const borders: BorderMap = { ...bordersBySide(style?.borders), ...readBorders(tblBorders) };
  const grid = childNamed(tbl, 'tblGrid');
  const columnWidthsPt = grid
    ? childrenNamed(grid, 'gridCol')
        .map((col) => numericAttribute(col, 'w'))
        .filter((w): w is number => w !== undefined)
        .map(twipsToPt)
    : [];
  const rows = childrenNamed(tbl, 'tr').map((tr) =>
    childrenNamed(tr, 'tc').map((tc) => readCell(tc, ctx, style)),
  );
  const text = rows.map((row) => row.map((cell) => blocksText(cell.blocks)).join('\t')).join('\n');
  const width = tableWidth(tblPr ? childNamed(tblPr, 'tblW') : null);
  return {
    kind: 'table',
    text,
    ...(styleId ? { styleId } : {}),
    ...(width ? { width } : {}),
    ...(align ? { align } : {}),
    ...(Object.keys(borders).length > 0 ? { borders } : {}),
    columnWidthsPt,
    rows,
  };
}

/** Texte brut d'une suite de blocs, paragraphes séparés par des sauts de ligne. */
export function blocksText(blocks: readonly BlockModel[]): string {
  return blocks.map((block) => block.text).join('\n');
}

/** Blocs d'un conteneur (`w:body`, `w:tc`, `w:hdr`…), `w:sdt` aplatis, le reste ignoré. */
function readBlocks(container: Element, ctx: ModelContext): BlockModel[] {
  const blocks: BlockModel[] = [];
  for (const child of Array.from(container.children)) {
    if (child.localName === 'p') blocks.push(readParagraph(child, ctx));
    else if (child.localName === 'tbl') blocks.push(readTable(child, ctx));
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
  return { blocks: readBlocks(body, ctx), sections, ...(lang ? { lang } : {}) };
}
