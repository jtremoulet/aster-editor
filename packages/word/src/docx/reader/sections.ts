import type {
  DocumentLayout,
  PageMargins,
  PageOrientation,
  PageSetup,
  PageSizeName,
} from '@aster-editor/core';
import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import type { DocxPackage, StyleResolver } from './types';
import { numericAttribute, twipsToMm } from './units-blocks';

/**
 * Mise en page d'une section (`w:sectPr`) vers le `DocumentLayout` du contrat : format
 * de page nommé quand les dimensions correspondent à ±1 mm, sinon dimensions libres ;
 * orientation ; marges en millimètres ; colonnes ; police par défaut ; langue.
 */

/** Formats nommés, largeur × hauteur en portrait (mm). */
const PAGE_SIZES: readonly (readonly [PageSizeName, number, number])[] = [
  ['A4', 210, 297],
  ['A3', 297, 420],
  ['A5', 148, 210],
  ['Letter', 215.9, 279.4],
  ['Legal', 215.9, 355.6],
];

const SIZE_TOLERANCE_MM = 1;

interface NamedSize {
  readonly size: PageSizeName;
  readonly orientation: PageOrientation;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= SIZE_TOLERANCE_MM;
}

/** Format nommé correspondant aux dimensions, dans l'une ou l'autre orientation. */
export function namedPageSize(widthMm: number, heightMm: number): NamedSize | null {
  for (const [size, portraitWidth, portraitHeight] of PAGE_SIZES) {
    if (near(widthMm, portraitWidth) && near(heightMm, portraitHeight)) {
      return { size, orientation: 'portrait' };
    }
    if (near(widthMm, portraitHeight) && near(heightMm, portraitWidth)) {
      return { size, orientation: 'landscape' };
    }
  }
  return null;
}

function readPage(sectPr: Element): PageSetup | undefined {
  const page: { -readonly [K in keyof PageSetup]: PageSetup[K] } = {};
  const pgSz = childNamed(sectPr, 'pgSz');
  const width = numericAttribute(pgSz, 'w');
  const height = numericAttribute(pgSz, 'h');
  if (pgSz && width && height && width > 0 && height > 0) {
    const widthMm = twipsToMm(width);
    const heightMm = twipsToMm(height);
    const named = namedPageSize(widthMm, heightMm);
    if (named) {
      page.size = named.size;
      page.orientation = named.orientation;
    } else {
      page.size = { widthMm, heightMm };
      const orient = wordAttribute(pgSz, 'orient');
      if (orient === 'landscape' || orient === 'portrait') page.orientation = orient;
    }
  }

  const pgMar = childNamed(sectPr, 'pgMar');
  if (pgMar) {
    const margins: { -readonly [K in keyof PageMargins]: PageMargins[K] } = {};
    const read = (name: string): number | undefined => {
      const value = numericAttribute(pgMar, name);
      // Une marge haute négative signifie « exacte » dans Word : seule la distance compte.
      return value === undefined ? undefined : twipsToMm(Math.abs(value));
    };
    const top = read('top');
    const right = read('right');
    const bottom = read('bottom');
    const left = read('left');
    const header = read('header');
    const footer = read('footer');
    if (top !== undefined) margins.topMm = top;
    if (right !== undefined) margins.rightMm = right;
    if (bottom !== undefined) margins.bottomMm = bottom;
    if (left !== undefined) margins.leftMm = left;
    if (header !== undefined) margins.headerMm = header;
    if (footer !== undefined) margins.footerMm = footer;
    if (Object.keys(margins).length > 0) page.margins = margins;
  }

  return Object.keys(page).length > 0 ? page : undefined;
}

/**
 * Lit la mise en page de la section : `page` (format, orientation, marges), `columns`
 * (`w:cols w:num` ≥ 2), `defaultFont` (résolveur de styles) et `lang` quand l'appelant la
 * fournit (voir `readDocumentLang`). `sectPr` absent → seule la police par défaut.
 */
export function readSectionLayout(
  sectPr: Element | null,
  styles: StyleResolver,
  lang?: string,
): DocumentLayout {
  const layout: { -readonly [K in keyof DocumentLayout]: DocumentLayout[K] } = {};
  if (sectPr) {
    const page = readPage(sectPr);
    if (page) layout.page = page;
    const columns = numericAttribute(childNamed(sectPr, 'cols'), 'num');
    if (columns !== undefined && columns >= 2) layout.columns = Math.floor(columns);
  }
  const font = styles.defaultFont();
  if (font.family || font.sizePt) layout.defaultFont = font;
  if (lang) layout.lang = lang;
  return layout;
}

/**
 * Langue du document : `w:lang w:val` des `docDefaults` de `styles.xml` (BCP 47, ex.
 * `fr-FR`). Lecture directe de la partie, sans passer par le résolveur de styles, dont
 * l'interface ne l'expose pas. À brancher dans `index.ts` en troisième argument de
 * `readSectionLayout`.
 */
export async function readDocumentLang(pkg: DocxPackage): Promise<string | undefined> {
  const path = await pkg.related(pkg.mainPart, '/styles');
  const doc = path ? await pkg.part(path) : null;
  if (!doc) return undefined;
  const docDefaults = childNamed(doc.documentElement, 'docDefaults');
  const rPrDefault = docDefaults ? childNamed(docDefaults, 'rPrDefault') : null;
  const rPr = rPrDefault ? childNamed(rPrDefault, 'rPr') : null;
  const lang = rPr ? childNamed(rPr, 'lang') : null;
  const value = lang ? wordAttribute(lang, 'val') : '';
  return value || undefined;
}
