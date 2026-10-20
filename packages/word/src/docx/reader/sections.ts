import type {
  DocumentLayout,
  PageMargins,
  PageOrientation,
  PageSetup,
  PageSizeName,
  SectionLayout,
  SectionStart,
} from '@aster-editor/core';
import type { DocxImportWarning } from '../types';
import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import type { DocxPackage, StyleResolver } from './types';
import { numericAttribute, twipsToMm } from './units';

/**
 * Mise en page d'une section (`w:sectPr`) vers le `DocumentLayout` du contrat : format
 * de page nommé quand les dimensions correspondent à ±1 mm, sinon dimensions libres ;
 * orientation ; marges en millimètres ; colonnes ; police par défaut ; langue. Les
 * valeurs hors des bornes de Word (page de 12,7 à 558,8 mm, marges dans la page, 45
 * colonnes au plus) sont ignorées avec un avertissement `reader`.
 */

/** Bornes de Word : côté de page en millimètres (0,5 à 22 pouces) et nombre de colonnes. */
export const MIN_PAGE_MM = 12.7;
export const MAX_PAGE_MM = 558.8;
export const MAX_COLUMNS = 45;

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

function inPageBounds(mm: number): boolean {
  return mm >= MIN_PAGE_MM && mm <= MAX_PAGE_MM;
}

function readPage(sectPr: Element, warn: (message: string) => void): PageSetup | undefined {
  const page: { -readonly [K in keyof PageSetup]: PageSetup[K] } = {};
  const pgSz = childNamed(sectPr, 'pgSz');
  const width = numericAttribute(pgSz, 'w');
  const height = numericAttribute(pgSz, 'h');
  // Dimensions connues de la page (bornes des marges) ; les bornes de Word par défaut.
  let pageWidthMm = MAX_PAGE_MM;
  let pageHeightMm = MAX_PAGE_MM;
  if (pgSz && width && height && width > 0 && height > 0) {
    const widthMm = twipsToMm(width);
    const heightMm = twipsToMm(height);
    if (!inPageBounds(widthMm) || !inPageBounds(heightMm)) {
      warn(
        `Format de page ${String(widthMm)} × ${String(heightMm)} mm hors des bornes Word (${String(MIN_PAGE_MM)} à ${String(MAX_PAGE_MM)} mm), ignoré.`,
      );
    } else {
      pageWidthMm = widthMm;
      pageHeightMm = heightMm;
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
  }

  const pgMar = childNamed(sectPr, 'pgMar');
  if (pgMar) {
    const margins: { -readonly [K in keyof PageMargins]: PageMargins[K] } = {};
    const read = (name: string): number | undefined => {
      const value = numericAttribute(pgMar, name);
      if (value === undefined) return undefined;
      // Une marge haute négative signifie « exacte » dans Word : seule la distance compte.
      const mm = twipsToMm(Math.abs(value));
      const limit = name === 'left' || name === 'right' ? pageWidthMm : pageHeightMm;
      if (mm > limit) {
        warn(`Marge ${name} de ${String(mm)} mm plus grande que la page, ignorée.`);
        return undefined;
      }
      return mm;
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

const SECTION_STARTS: ReadonlySet<string> = new Set([
  'nextPage',
  'continuous',
  'evenPage',
  'oddPage',
]);

/** Type de saut qui ouvre la section (`w:type w:val`), `undefined` si absent ou inconnu (`nextColumn`). */
export function readSectionStart(sectPr: Element): SectionStart | undefined {
  const type = childNamed(sectPr, 'type');
  const value = type ? wordAttribute(type, 'val') : '';
  return SECTION_STARTS.has(value) ? (value as SectionStart) : undefined;
}

/** Propriétés propres d'une section (sans en-têtes ni pieds), telles que `SectionLayout` les porte. */
export type SectionProperties = Pick<SectionLayout, 'page' | 'columns' | 'start'>;

/**
 * Lit un `w:sectPr` : `page` (format, orientation, marges), `columns` (`w:cols w:num` de 2 à
 * 45) et `start` (`w:type`). Les valeurs hors bornes sont ignorées et signalées dans
 * `warnings` quand il est fourni. Commun à la mise en page de premier niveau
 * (`readSectionLayout`) et à chaque entrée de `layout.sections` (session 4).
 */
export function readSectionProperties(
  sectPr: Element,
  warnings?: DocxImportWarning[],
): SectionProperties {
  const section: { -readonly [K in keyof SectionProperties]: SectionProperties[K] } = {};
  const warn = (message: string): void => {
    warnings?.push({ code: 'reader', message });
  };
  const page = readPage(sectPr, warn);
  if (page) section.page = page;
  const columns = numericAttribute(childNamed(sectPr, 'cols'), 'num');
  if (columns !== undefined && columns > MAX_COLUMNS) {
    warn(`${String(columns)} colonnes, plus que les ${String(MAX_COLUMNS)} de Word : ignoré.`);
  } else if (columns !== undefined && columns >= 2) {
    section.columns = Math.floor(columns);
  }
  const start = readSectionStart(sectPr);
  if (start) section.start = start;
  return section;
}

/**
 * Lit la mise en page de la section : `page` (format, orientation, marges), `columns`
 * (`w:cols w:num` de 2 à 45), `defaultFont` (résolveur de styles) et `lang` quand l'appelant
 * la fournit (voir `readDocumentLang`). `sectPr` absent → seule la police par défaut. Les
 * valeurs hors bornes sont ignorées et signalées dans `warnings` quand il est fourni. Le
 * type de saut (`start`) reste dans `layout.sections`, pas au premier niveau.
 */
export function readSectionLayout(
  sectPr: Element | null,
  styles: StyleResolver,
  lang?: string,
  warnings?: DocxImportWarning[],
): DocumentLayout {
  const layout: { -readonly [K in keyof DocumentLayout]: DocumentLayout[K] } = {};
  if (sectPr) {
    const { page, columns } = readSectionProperties(sectPr, warnings);
    if (page) layout.page = page;
    if (columns !== undefined) layout.columns = columns;
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
