import type {
  AsterEditor,
  DocumentLayout,
  PageDimensions,
  PageSizeName,
  PageViewOptions,
} from '../api/index.js';
import { roundLayoutNumber } from './layout-css.js';
import { PAGE_SIZES_MM, resolveSectionLayout } from './page-view.js';
import {
  MM_TO_PX,
  cssLengthToPx,
  type PageGap,
  type PaginationResult,
  type SectionCssVariables,
} from './pagination-layout.js';
import {
  headerFooterHtmlFor,
  isContinuousSection,
  type HeaderFooterPage,
} from './page-view-variants.js';

/**
 * Rendu des sections dans les coupures de page (session 4, L44). Le contrôleur pose un
 * widget `div.aster-page-gap` avant chaque bloc qui ouvre une page ; ce module l'enrichit
 * quand le document a des sauts de section :
 *
 * - `data-section` sur chaque coupure : numéro (1-based) de la section de la page qui
 *   commence après elle ;
 * - les variables `--aster-page-*` de cette section en style inline (hauteur, marges
 *   haute, en-tête et largeur de la section qui commence ; marge basse et pied de celle
 *   qui se termine), pour que `ui/themes/page.css` dessine une coupure à la bonne hauteur.
 *   Les marges gauche et droite ne sont **pas** posées : la coupure s'aligne sur la feuille,
 *   qui garde les marges horizontales de la section 1 (approximation documentée, une
 *   seule feuille sans changement de largeur en cours de document) ;
 * - sur **chaque** coupure (session 5, L52, retour POC n° 3) : le pied de la page qui se
 *   termine (section `previous`) et l'en-tête de la page qui commence (section `section`),
 *   assainis, en lecture seule, retirés avec `showHeadersFooters: false` ; la variante
 *   suit la page (`headerFooterHtmlFor` : `first` sur la première page d'une section
 *   `titlePage`, `even` sur les pages paires quand il existe, `default` sinon) ;
 * - sur la première coupure d'une section seulement (classe `aster-page-gap--section`) :
 *   le libellé « Section n · Format orientation » (`pageView.section`).
 */

/** Attribut du widget : numéro (1-based) de la section de la page qui commence après la coupure. */
export const PAGE_SECTION_ATTRIBUTE = 'data-section';
/** Classe de la coupure qui ouvre une section (première coupure dont la section change). */
export const PAGE_GAP_SECTION_CLASS = 'aster-page-gap--section';
/** Classe du libellé « Section n · Format orientation » rendu dans la marge haute de la page. */
export const PAGE_GAP_SECTION_LABEL_CLASS = 'aster-page-gap__section';
/** Classe de l'en-tête de la section qui commence, rendu dans la coupure. */
export const PAGE_GAP_HEADER_CLASS = 'aster-page-gap__header';
/** Classe du pied de la section qui se termine, rendu dans la coupure. */
export const PAGE_GAP_FOOTER_CLASS = 'aster-page-gap__footer';
/**
 * Variable CSS posée sur l'hôte quand le document a des sections : somme des hauteurs de
 * toutes les pages (mm), pour étirer la feuille à des pages de hauteurs différentes.
 */
export const PAGE_HEIGHT_TOTAL_CSS_VARIABLE = '--aster-page-height-total';

/** Variables prises à la section qui **se termine** (bas de la page précédente). */
const CLOSING_VARIABLES: readonly string[] = [
  '--aster-page-margin-bottom',
  '--aster-page-margin-footer',
];
/** Variables prises à la section qui **commence** (haut de la page suivante). */
const OPENING_VARIABLES: readonly string[] = [
  '--aster-page-width',
  '--aster-page-height',
  '--aster-page-margin-top',
  '--aster-page-margin-header',
];

/** Section de la page qui précède la coupure `position` : celle de la coupure d'avant, 1 pour la première. */
export function previousPageSection(gaps: readonly PageGap[], position: number): number {
  return (position > 0 ? gaps[position - 1]?.section : undefined) ?? 1;
}

/** Millimètres d'une variable de longueur, `null` si elle est absente ou illisible. */
function variableMm(variables: SectionCssVariables | undefined, name: string): number | null {
  const px = cssLengthToPx(variables?.[name] ?? '');
  return px === null ? null : roundLayoutNumber(px / MM_TO_PX);
}

/** Format nommé dont les dimensions (dans un sens ou l'autre) sont celles données, sinon `null`. */
function pageSizeNameOf(widthMm: number, heightMm: number): PageSizeName | null {
  const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.05;
  const entries = Object.entries(PAGE_SIZES_MM) as [PageSizeName, PageDimensions][];
  for (const [name, size] of entries) {
    if (
      (same(size.widthMm, widthMm) && same(size.heightMm, heightMm)) ||
      (same(size.widthMm, heightMm) && same(size.heightMm, widthMm))
    ) {
      return name;
    }
  }
  return null;
}

/** Traduction du core, repli anglais sans éditeur (coupure rendue hors éditeur Aster). */
function translate(aster: AsterEditor | null, key: string, fallback: string): string {
  return aster ? aster.i18n.t(key) : fallback;
}

/**
 * Libellé d'une section pour sa coupure d'ouverture : « Section 2 · Letter paysage », ou
 * « Section 2 · 100 × 150 mm portrait » pour un format libre. Dimensions lues dans les
 * variables mesurées de la section ; l'orientation est déduite (paysage si plus large que
 * haut). Sans dimensions lisibles, le libellé se limite à « Section n ».
 */
export function sectionLabel(
  aster: AsterEditor | null,
  variables: SectionCssVariables | undefined,
  section: number,
): string {
  const prefix = `${translate(aster, 'pageView.section', 'Section')} ${section}`;
  const widthMm = variableMm(variables, '--aster-page-width');
  const heightMm = variableMm(variables, '--aster-page-height');
  if (widthMm === null || heightMm === null) {
    return prefix;
  }
  const format = pageSizeNameOf(widthMm, heightMm) ?? `${widthMm} × ${heightMm} mm`;
  const orientation =
    widthMm > heightMm
      ? translate(aster, 'pageView.landscape', 'landscape')
      : translate(aster, 'pageView.portrait', 'portrait');
  return `${prefix} · ${format} ${orientation}`;
}

/**
 * Variables inline d'une coupure entre la section `previous` (page qui se termine) et la
 * section `next` (page qui commence) : marge basse et pied de la première, hauteur,
 * largeur, marge haute et en-tête de la seconde. Vide si une section est inconnue.
 */
export function gapCssVariables(
  sections: readonly SectionCssVariables[],
  previous: number,
  next: number,
): SectionCssVariables {
  const closing = sections[previous - 1];
  const opening = sections[next - 1];
  const variables: Record<string, string> = {};
  if (!closing || !opening) {
    return variables;
  }
  for (const name of CLOSING_VARIABLES) {
    const value = closing[name];
    if (value !== undefined) variables[name] = value;
  }
  for (const name of OPENING_VARIABLES) {
    const value = opening[name];
    if (value !== undefined) variables[name] = value;
  }
  return variables;
}

/** Les deux pages d'une coupure : celle qui se termine au-dessus, celle qui commence en dessous. */
export interface GapPages {
  readonly closing: HeaderFooterPage;
  readonly opening: HeaderFooterPage;
}

/**
 * Pages de la coupure `gap` (page `gap.page - 1` qui se termine, `gap.page` qui commence),
 * avec leur place dans leur section : la page qui commence est la première de la sienne
 * quand la section change à cette coupure et ne s'ouvre pas en `continuous` ; la page qui
 * se termine l'est quand elle est la page 1 ou que la coupure d'avant a ouvert sa section.
 * La position de `gap` est retrouvée dans `result.gaps` (même objet) ; coupure inconnue :
 * pages quelconques de leur section.
 */
export function gapPages(
  gap: PageGap,
  previous: number,
  result: PaginationResult,
  layout: DocumentLayout,
): GapPages {
  const section = gap.section ?? previous;
  const position = result.gaps.indexOf(gap);
  const opensSection = (at: number): boolean => {
    const target = result.gaps[at];
    if (!target || target.section === undefined) return false;
    const before = previousPageSection(result.gaps, at);
    return target.section !== before && !isContinuousSection(layout, target.section);
  };
  const openingFirst = position >= 0 ? opensSection(position) : false;
  const closingFirst = position === 0 || (position > 0 && opensSection(position - 1));
  return {
    closing: { pageNumber: gap.page - 1, firstOfSection: closingFirst },
    opening: { pageNumber: gap.page, firstOfSection: openingFirst && section !== previous },
  };
}

/** HTML assaini de l'en-tête ou du pied d'une section pour une page, `''` s'il n'y en a pas. */
function sectionHtml(
  layout: DocumentLayout,
  section: number,
  kind: 'headers' | 'footers',
  page: HeaderFooterPage,
): string {
  return headerFooterHtmlFor(resolveSectionLayout(layout, section), kind, page);
}

/** Conteneur en lecture seule d'un en-tête ou d'un pied dans une coupure, `null` si vide. */
function renderHeaderFooter(className: string, html: string): HTMLElement | null {
  if (html === '') {
    return null;
  }
  const element = document.createElement('div');
  element.className = className;
  element.setAttribute('contenteditable', 'false');
  element.innerHTML = html;
  return element;
}

/**
 * En-tête et pied d'une coupure (L52) : pied de la page qui se termine (section
 * `previous`), en-tête de la page qui commence (section `section`), chacun dans la
 * variante de sa page. Sans section (`gap.section` absent), le document n'a qu'une section :
 * c'est celle de l'hôte, section 1, sur toutes les pages.
 */
function appendHeaderFooter(
  element: HTMLElement,
  gap: PageGap,
  previous: number,
  result: PaginationResult,
  options: PageViewOptions,
): void {
  if (options.showHeadersFooters === false) {
    return;
  }
  const layout: DocumentLayout = options.layout ?? {};
  const section = gap.section ?? previous;
  const pages = gapPages(gap, previous, result, layout);
  const footer = renderHeaderFooter(
    PAGE_GAP_FOOTER_CLASS,
    sectionHtml(layout, previous, 'footers', pages.closing),
  );
  if (footer) element.prepend(footer);
  const header = renderHeaderFooter(
    PAGE_GAP_HEADER_CLASS,
    sectionHtml(layout, section, 'headers', pages.opening),
  );
  if (header) element.append(header);
}

/**
 * Enrichit le DOM d'une coupure (voir l'en-tête du module) : pied et en-tête sur chaque
 * coupure (L52), puis, avec des sections, `data-section`, les variables de la section et,
 * quand la section change à cette coupure (première coupure de la section, forcée ou,
 * pour une section `continuous`, première coupure par débordement), la classe
 * `aster-page-gap--section` et le libellé. `previous` est la section de la page qui se
 * termine.
 */
export function decorateGapSection(
  element: HTMLElement,
  gap: PageGap,
  previous: number,
  result: PaginationResult,
  options: PageViewOptions,
  aster: AsterEditor | null,
): void {
  appendHeaderFooter(element, gap, previous, result, options);
  const section = gap.section;
  const sections = result.sections;
  if (section === undefined || !sections) {
    return;
  }
  element.setAttribute(PAGE_SECTION_ATTRIBUTE, String(section));
  for (const [name, value] of Object.entries(gapCssVariables(sections, previous, section))) {
    element.style.setProperty(name, value);
  }
  if (section === previous) {
    return;
  }
  element.classList.add(PAGE_GAP_SECTION_CLASS);
  const label = document.createElement('span');
  label.className = PAGE_GAP_SECTION_LABEL_CLASS;
  label.textContent = sectionLabel(aster, sections[section - 1], section);
  element.append(label);
}

/**
 * Signature courte de ce qui change le rendu d'une coupure (variables de ses deux
 * sections, en-tête et pied de ses deux pages) : entre dans la clé de la décoration, pour
 * que ProseMirror recrée le DOM quand la mise en page ou un en-tête change et le
 * réutilise sinon. Sans section, seuls l'en-tête et le pied (L52) comptent.
 */
export function sectionSignature(
  gap: PageGap,
  previous: number,
  result: PaginationResult,
  options: PageViewOptions,
): string {
  const layout: DocumentLayout = options.layout ?? {};
  const section = gap.section ?? previous;
  const sections = result.sections;
  const showHeadersFooters = options.showHeadersFooters !== false;
  const pages = gapPages(gap, previous, result, layout);
  const parts = [
    sections ? JSON.stringify(sections[previous - 1] ?? null) : '',
    sections ? JSON.stringify(sections[section - 1] ?? null) : '',
    String(showHeadersFooters),
    showHeadersFooters ? sectionHtml(layout, previous, 'footers', pages.closing) : '',
    showHeadersFooters ? sectionHtml(layout, section, 'headers', pages.opening) : '',
  ];
  // djb2 : un entier court suffit, la clé n'a pas besoin d'être cryptographique.
  let hash = 5381;
  for (const character of parts.join('\u0001')) {
    hash = (hash * 33) ^ character.charCodeAt(0);
  }
  return `${section}-${previous}-${(hash >>> 0).toString(36)}`;
}

/**
 * Dernière page d'une pagination pour le pied de l'hôte (L52) : son numéro est le nombre
 * de pages ; elle est la première de sa section quand le document tient sur une page ou
 * que la dernière coupure ouvre une section (hors `continuous`).
 */
export function lastPageOf(result: PaginationResult, layout: DocumentLayout): HeaderFooterPage {
  const last = result.gaps[result.gaps.length - 1];
  if (!last) {
    return { pageNumber: 1, firstOfSection: true };
  }
  const previous = previousPageSection(result.gaps, result.gaps.length - 1);
  return gapPages(last, previous, result, layout).opening;
}

/**
 * Somme des hauteurs de toutes les pages en millimètres (page 1 dans la section 1, puis
 * chaque page dans la section de sa coupure), `null` sans sections ou sans hauteur
 * lisible : la feuille retombe alors sur `--aster-page-count × --aster-page-height`.
 */
export function pageHeightTotalMm(result: PaginationResult): number | null {
  const sections = result.sections;
  if (!sections || sections.length === 0) {
    return null;
  }
  let total = 0;
  const pageSections = [1, ...result.gaps.map((gap) => gap.section ?? 1)];
  for (const section of pageSections) {
    const heightMm = variableMm(sections[section - 1], '--aster-page-height');
    if (heightMm === null) {
      return null;
    }
    total += heightMm;
  }
  return roundLayoutNumber(total);
}
