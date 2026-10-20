import type { BlockBorder, BorderSide } from '@aster-editor/core';
import { allNamed, childNamed, childrenNamed, wordAttribute } from '../preprocess/xml-utils';
import {
  applyBorders,
  applyParagraphProperties,
  applyRunProperties,
  cloneParagraph,
  emptyParagraph,
  finalizeParagraph,
  finalizeRun,
  orderedBorders,
  readBorder,
  readShadingFill,
  type MutableParagraph,
  type MutableRun,
  type ThemeFonts,
} from './properties';
import type {
  DocxPackage,
  HeadingLevel,
  ResolvedParagraphProps,
  ResolvedRunProps,
  StyleResolver,
  TableStyleProps,
} from './types';
import { numberAttr, twipsToPt } from './units';

/**
 * Résolution des styles Word : `docDefaults` → chaîne `basedOn` (garde anti-cycle) →
 * style de caractère → propriétés directes. Les polices du thème (`minorHAnsi`…) sont
 * lues dans `theme1.xml`. Le résolveur expose en plus du contrat `docDefaults()`, base
 * d'émission du HTML : `paragraphs.ts` et `runs.ts` n'écrivent que ce qui en diffère.
 */

type StyleType = 'paragraph' | 'character' | 'table' | 'numbering';

interface StyleDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: StyleType;
  readonly basedOn?: string;
  readonly link?: string;
  readonly isDefault: boolean;
  readonly pPr: Element | null;
  readonly rPr: Element | null;
  readonly tblPr: Element | null;
  readonly tcPr: Element | null;
}

/** Défauts du document (`w:docDefaults`), sans aucun style appliqué. */
export interface DocDefaults {
  readonly paragraph: ResolvedParagraphProps;
  readonly run: ResolvedRunProps;
}

/** Résolveur d'Aster : le contrat plus les défauts du document. */
export interface DocxStyleResolver extends StyleResolver {
  docDefaults(): DocDefaults;
}

/** Style de tableau d'Aster : le contrat plus les défauts de paragraphe du style (`pPr`). */
export interface DocxTableStyleProps extends TableStyleProps {
  readonly paragraphDefaults?: Omit<ResolvedParagraphProps, 'runDefaults' | 'styleId'>;
}

/**
 * Défauts du document d'un résolveur quelconque : ceux d'Aster s'il les expose, sinon un
 * repli sur `defaultFont()` (résolveur tiers ou stub).
 */
export function docDefaultsOf(styles: StyleResolver): DocDefaults {
  if ('docDefaults' in styles && typeof styles.docDefaults === 'function') {
    return (styles as DocxStyleResolver).docDefaults();
  }
  const font = styles.defaultFont();
  const run: ResolvedRunProps = {
    ...(font.family ? { fontFamily: font.family } : {}),
    ...(font.sizePt !== undefined ? { fontSizePt: font.sizePt } : {}),
  };
  return { paragraph: { runDefaults: run }, run };
}

/** Défauts de paragraphe d'un style de tableau, `undefined` pour un style tiers. */
export function tableParagraphDefaultsOf(
  style: TableStyleProps | null,
): DocxTableStyleProps['paragraphDefaults'] {
  return style && 'paragraphDefaults' in style
    ? (style as DocxTableStyleProps).paragraphDefaults
    : undefined;
}

const HEADING_PATTERN = /^(?:heading|titre|überschrift|título|titolo)\s*([1-6])$/i;

function headingLevelOfName(value: string): HeadingLevel | undefined {
  const match = HEADING_PATTERN.exec(value.trim());
  return match ? (Number(match[1]) as HeadingLevel) : undefined;
}

function readStyle(element: Element): StyleDefinition | null {
  const id = wordAttribute(element, 'styleId');
  const type = wordAttribute(element, 'type') || 'paragraph';
  if (!id || !isStyleType(type)) return null;
  const name = childNamed(element, 'name');
  const basedOn = childNamed(element, 'basedOn');
  const link = childNamed(element, 'link');
  return {
    id,
    name: name ? wordAttribute(name, 'val') : '',
    type,
    basedOn: basedOn ? wordAttribute(basedOn, 'val') || undefined : undefined,
    link: link ? wordAttribute(link, 'val') || undefined : undefined,
    isDefault:
      wordAttribute(element, 'default') === '1' || wordAttribute(element, 'default') === 'true',
    pPr: childNamed(element, 'pPr'),
    rPr: childNamed(element, 'rPr'),
    tblPr: childNamed(element, 'tblPr'),
    tcPr: childNamed(element, 'tcPr'),
  };
}

function isStyleType(value: string): value is StyleType {
  return (
    value === 'paragraph' || value === 'character' || value === 'table' || value === 'numbering'
  );
}

async function readThemeFonts(pkg: DocxPackage): Promise<ThemeFonts> {
  const path = (await pkg.related(pkg.mainPart, '/theme')) ?? 'word/theme/theme1.xml';
  const doc = await pkg.part(path);
  if (!doc) return {};
  const latin = (scheme: string): string | undefined => {
    const element = allNamed(doc, scheme)[0];
    const font = element ? childNamed(element, 'latin') : null;
    return font?.getAttribute('typeface') || undefined;
  };
  return { major: latin('majorFont'), minor: latin('minorFont') };
}

async function readStylesPart(pkg: DocxPackage): Promise<Document | null> {
  const path = (await pkg.related(pkg.mainPart, '/styles')) ?? 'word/styles.xml';
  return pkg.part(path);
}

/** Crée le résolveur de styles du document. Signature figée par la phase 0. */
export async function createStyleResolver(pkg: DocxPackage): Promise<DocxStyleResolver> {
  const [stylesDoc, theme] = await Promise.all([readStylesPart(pkg), readThemeFonts(pkg)]);
  const styles = new Map<string, StyleDefinition>();
  const defaults = new Map<StyleType, string>();
  const baseParagraph = emptyParagraph();
  const baseRun: MutableRun = {};

  if (stylesDoc) {
    const root = stylesDoc.documentElement;
    const docDefaults = childNamed(root, 'docDefaults');
    const rPrDefault = docDefaults ? childNamed(docDefaults, 'rPrDefault') : null;
    const pPrDefault = docDefaults ? childNamed(docDefaults, 'pPrDefault') : null;
    const rPr = rPrDefault ? childNamed(rPrDefault, 'rPr') : null;
    const pPr = pPrDefault ? childNamed(pPrDefault, 'pPr') : null;
    if (rPr) applyRunProperties(rPr, baseRun, theme);
    if (pPr) applyParagraphProperties(pPr, baseParagraph);
    for (const element of childrenNamed(root, 'style')) {
      const style = readStyle(element);
      if (!style) continue;
      styles.set(style.id, style);
      if (style.isDefault && !defaults.has(style.type)) defaults.set(style.type, style.id);
    }
  }

  const docDefaults: DocDefaults = {
    paragraph: finalizeParagraph(baseParagraph, finalizeRun(baseRun)),
    run: finalizeRun(baseRun),
  };

  /** Chaîne `basedOn` de la racine à la feuille, cycles et références cassées ignorés. */
  const chainOf = (styleId: string | undefined, type: StyleType): StyleDefinition[] => {
    const chain: StyleDefinition[] = [];
    const seen = new Set<string>();
    let current = styleId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const style = styles.get(current);
      if (!style || style.type !== type) break;
      chain.unshift(style);
      current = style.basedOn;
    }
    return chain;
  };

  interface ResolvedParagraphStyle {
    readonly styleId?: string;
    readonly headingLevel?: HeadingLevel;
    readonly paragraph: MutableParagraph;
    readonly run: MutableRun;
    readonly runDefaults: ResolvedRunProps;
  }

  const paragraphStyles = new Map<string, ResolvedParagraphStyle>();

  const resolveParagraphStyle = (requested: string | undefined): ResolvedParagraphStyle => {
    const styleId = requested && styles.has(requested) ? requested : defaults.get('paragraph');
    const key = styleId ?? '';
    const cached = paragraphStyles.get(key);
    if (cached) return cached;
    const chain = chainOf(styleId, 'paragraph');
    const paragraph = cloneParagraph(baseParagraph);
    const run: MutableRun = { ...baseRun };
    let headingLevel: HeadingLevel | undefined;
    for (const style of chain) {
      if (style.pPr) applyParagraphProperties(style.pPr, paragraph);
      if (style.rPr) applyRunProperties(style.rPr, run, theme);
      headingLevel = headingLevelOfName(style.id) ?? headingLevelOfName(style.name) ?? headingLevel;
    }
    const outline = paragraph.outlineLevel;
    if (outline !== undefined && outline >= 0 && outline <= 5) {
      headingLevel = (outline + 1) as HeadingLevel;
    }
    const resolved: ResolvedParagraphStyle = {
      styleId: chain.length > 0 ? styleId : undefined,
      headingLevel,
      paragraph,
      run,
      runDefaults: finalizeRun(run),
    };
    paragraphStyles.set(key, resolved);
    return resolved;
  };

  /** `w:rPr` à appliquer pour un style de caractère (ou le style lié d'un style de paragraphe). */
  const characterChain = (styleId: string): Element[] => {
    const style = styles.get(styleId);
    if (!style) return [];
    if (style.type === 'character') {
      return chainOf(styleId, 'character')
        .map((def) => def.rPr)
        .filter((rPr): rPr is Element => rPr !== null);
    }
    if (style.type === 'paragraph') {
      const linked = style.link && styles.get(style.link);
      if (linked && linked.type === 'character') return characterChain(linked.id);
      return chainOf(styleId, 'paragraph')
        .map((def) => def.rPr)
        .filter((rPr): rPr is Element => rPr !== null);
    }
    return [];
  };

  const tableStyles = new Map<string, DocxTableStyleProps | null>();

  const resolveTableStyle = (styleId: string): DocxTableStyleProps | null => {
    const chain = chainOf(styleId, 'table');
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
    return {
      ...(outer.length > 0 ? { borders: outer } : {}),
      ...(cells.length > 0 ? { cellBorders: cells } : {}),
      ...(cellShading ? { cellShading } : {}),
      ...(padding ? { cellPaddingPt: padding } : {}),
      runDefaults: finalizeRun(run),
      ...(Object.keys(paragraphOnly).length > 0 ? { paragraphDefaults: paragraphOnly } : {}),
    };
  };

  return {
    paragraph(pPr) {
      const pStyle = pPr ? childNamed(pPr, 'pStyle') : null;
      const base = resolveParagraphStyle(
        pStyle ? wordAttribute(pStyle, 'val') || undefined : undefined,
      );
      let paragraph = base.paragraph;
      if (pPr) {
        paragraph = cloneParagraph(base.paragraph);
        applyParagraphProperties(pPr, paragraph);
      }
      let headingLevel = base.headingLevel;
      const outline = paragraph.outlineLevel;
      if (pPr && childNamed(pPr, 'outlineLvl') && outline !== undefined) {
        headingLevel = outline >= 0 && outline <= 5 ? ((outline + 1) as HeadingLevel) : undefined;
      }
      return {
        ...(base.styleId ? { styleId: base.styleId } : {}),
        ...(headingLevel ? { headingLevel } : {}),
        ...finalizeParagraph(paragraph, base.runDefaults),
      };
    },

    run(rPr, paragraph) {
      const acc: MutableRun = { ...paragraph.runDefaults };
      if (!rPr) return finalizeRun(acc);
      const rStyle = childNamed(rPr, 'rStyle');
      const styleId = rStyle ? wordAttribute(rStyle, 'val') : '';
      if (styleId) {
        for (const styleRPr of characterChain(styleId)) applyRunProperties(styleRPr, acc, theme);
        if (styles.has(styleId)) acc.runStyle = styleId;
      }
      applyRunProperties(rPr, acc, theme);
      return finalizeRun(acc);
    },

    tableStyle(styleId) {
      if (!styleId) return null;
      let cached = tableStyles.get(styleId);
      if (cached === undefined) {
        cached = resolveTableStyle(styleId);
        tableStyles.set(styleId, cached);
      }
      return cached;
    },

    defaultFont() {
      const { runDefaults } = resolveParagraphStyle(undefined);
      return {
        ...(runDefaults.fontFamily ? { family: runDefaults.fontFamily } : {}),
        ...(runDefaults.fontSizePt !== undefined ? { sizePt: runDefaults.fontSizePt } : {}),
      };
    },

    docDefaults() {
      return docDefaults;
    },
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
