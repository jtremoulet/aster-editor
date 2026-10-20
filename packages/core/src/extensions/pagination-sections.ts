import type {
  AsterEditor,
  DocumentLayout,
  PageDimensions,
  PageSizeName,
  PageViewOptions,
} from '../api';
import { sanitizeHeaderFooterHtml } from './header-footer-sanitize';
import { roundLayoutNumber } from './layout-css';
import { PAGE_SIZES_MM, resolveSectionLayout } from './page-view';
import {
  MM_TO_PX,
  cssLengthToPx,
  type PageGap,
  type PaginationResult,
  type SectionCssVariables,
} from './pagination-layout';

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
 * - sur la première coupure d'une section (classe `aster-page-gap--section`) : le libellé
 *   « Section n · Format orientation » (`pageView.section`), l'en-tête `default` de la
 *   section qui commence et le pied `default` de celle qui se termine, assainis, en lecture
 *   seule, retirés avec `showHeadersFooters: false`.
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

/** HTML assaini d'un en-tête ou pied `default` d'une section, `''` s'il n'y en a pas. */
function sectionHtml(layout: DocumentLayout, section: number, kind: 'headers' | 'footers'): string {
  return sanitizeHeaderFooterHtml(resolveSectionLayout(layout, section)[kind]?.default?.html ?? '');
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
 * Enrichit le DOM d'une coupure avec sa section (voir l'en-tête du module). `previous` est
 * la section de la page qui se termine ; la coupure « ouvre » une section quand elle
 * diffère de `gap.section` (première coupure de la section, forcée ou, pour une section
 * `continuous`, première coupure par débordement). Sans `gap.section`, rien n'est posé.
 */
export function decorateGapSection(
  element: HTMLElement,
  gap: PageGap,
  previous: number,
  result: PaginationResult,
  options: PageViewOptions,
  aster: AsterEditor | null,
): void {
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
  const layout: DocumentLayout = options.layout ?? {};
  if (options.showHeadersFooters !== false) {
    const footer = renderHeaderFooter(
      PAGE_GAP_FOOTER_CLASS,
      sectionHtml(layout, previous, 'footers'),
    );
    if (footer) element.prepend(footer);
    const header = renderHeaderFooter(
      PAGE_GAP_HEADER_CLASS,
      sectionHtml(layout, section, 'headers'),
    );
    if (header) element.append(header);
  }
  const label = document.createElement('span');
  label.className = PAGE_GAP_SECTION_LABEL_CLASS;
  label.textContent = sectionLabel(aster, sections[section - 1], section);
  element.append(label);
}

/**
 * Signature courte de ce qui change le rendu d'une coupure de section (variables de ses
 * deux sections, en-têtes et pieds concernés) : entre dans la clé de la décoration, pour
 * que ProseMirror recrée le DOM quand la mise en page d'une section change et le
 * réutilise sinon. Chaîne vide sans section.
 */
export function sectionSignature(
  gap: PageGap,
  previous: number,
  result: PaginationResult,
  options: PageViewOptions,
): string {
  const section = gap.section;
  const sections = result.sections;
  if (section === undefined || !sections) {
    return '';
  }
  const layout: DocumentLayout = options.layout ?? {};
  const parts = [
    JSON.stringify(sections[previous - 1] ?? null),
    JSON.stringify(sections[section - 1] ?? null),
    String(options.showHeadersFooters !== false),
    section === previous ? '' : sectionHtml(layout, previous, 'footers'),
    section === previous ? '' : sectionHtml(layout, section, 'headers'),
  ];
  // djb2 : un entier court suffit, la clé n'a pas besoin d'être cryptographique.
  let hash = 5381;
  for (const character of parts.join('\u0001')) {
    hash = (hash * 33) ^ character.charCodeAt(0);
  }
  return `${section}-${previous}-${(hash >>> 0).toString(36)}`;
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
