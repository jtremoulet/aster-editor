import type {
  DocumentLayout,
  PageDimensions,
  PageSizeName,
  PageViewOptions,
  SectionLayout,
} from '../api/index.js';
import { roundLayoutNumber } from './layout-css.js';
import {
  PAGE_DEFAULTS_CLASS,
  PAGE_DEFAULT_CSS_VARIABLES,
  hasDefaultSpacing,
  pageDefaultsCssValues,
  type PageDefaultsCssValues,
} from './page-view-defaults.js';
import { FIRST_PAGE, headerFooterHtmlFor, type HeaderFooterPage } from './page-view-variants.js';

// Défauts du document (L52) et variantes first / even des en-têtes : modules dédiés.
export {
  PAGE_DEFAULTS_CLASS,
  PAGE_DEFAULT_CSS_VARIABLES,
  hasDefaultSpacing,
  pageDefaultsCssValues,
  type PageDefaultCssVariable,
  type PageDefaultsCssValues,
} from './page-view-defaults.js';
export {
  FIRST_PAGE,
  headerFooterHtmlFor,
  isContinuousSection,
  type HeaderFooterPage,
} from './page-view-variants.js';

// Sanitiseur des en-têtes et pieds : extrait en F30 (R30-13), même API qu'avant.
export { MAX_SANITIZE_DEPTH, sanitizeHeaderFooterHtml } from './header-footer-sanitize.js';

/** Classe posée sur l'hôte de l'éditeur quand la vue page est active. */
export const PAGE_VIEW_CLASS = 'aster--page-view';
/** Classe du conteneur d'en-tête rendu avant le corps. */
export const PAGE_HEADER_CLASS = 'aster-page-header';
/** Classe du conteneur de pied rendu après le corps. */
export const PAGE_FOOTER_CLASS = 'aster-page-footer';

/** Marge par défaut d'un document Word : 1 pouce. */
export const DEFAULT_PAGE_MARGIN_MM = 25.4;

/** Distance par défaut du bord à l'en-tête / au pied dans Word : un demi-pouce. */
export const DEFAULT_HEADER_FOOTER_MARGIN_MM = 12.7;

/**
 * Borne haute de toute dimension ou marge de page, en millimètres (R23-05). Au-delà (ou
 * pour `1e308`, dont `value * 100` déborde en `Infinity` au formatage), la valeur tombe sur
 * le défaut : aucune variable CSS ne vaut jamais `Infinitymm`.
 */
export const MAX_PAGE_MM = 10_000;

/** Dimensions des formats nommés, en portrait, en millimètres. */
export const PAGE_SIZES_MM: Readonly<Record<PageSizeName, PageDimensions>> = {
  A3: { widthMm: 297, heightMm: 420 },
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
};

/**
 * Variable CSS posée sur l'hôte quand `layout.sections` existe (session 4, L44) : largeur
 * de la plus large section, en mm. La feuille (`ui/themes/page.css`) garde cette largeur
 * sur tout le document : une seule feuille, pas de changement de largeur en cours de
 * document (approximation documentée). Absente sans sections.
 */
export const PAGE_WIDTH_MAX_CSS_VARIABLE = '--aster-page-width-max';

/** Variables CSS posées sur l'hôte, dans l'ordre. */
export const PAGE_VIEW_CSS_VARIABLES = [
  '--aster-page-width',
  '--aster-page-height',
  '--aster-page-margin-top',
  '--aster-page-margin-right',
  '--aster-page-margin-bottom',
  '--aster-page-margin-left',
  '--aster-page-margin-header',
  '--aster-page-margin-footer',
] as const;

/** Dimensions et marges résolues d'une page, en millimètres. */
export interface PageMetrics {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly marginTopMm: number;
  readonly marginRightMm: number;
  readonly marginBottomMm: number;
  readonly marginLeftMm: number;
  /** Distance du bord haut à l'en-tête (`PageMargins.headerMm`, 12,7 mm par défaut). */
  readonly marginHeaderMm: number;
  /** Distance du bord bas au pied (`PageMargins.footerMm`, 12,7 mm par défaut). */
  readonly marginFooterMm: number;
}

/** Formate des millimètres avec au plus deux décimales ; jamais `Infinitymm` ni `NaNmm`. */
function formatMm(value: number): string {
  const rounded = roundLayoutNumber(value);
  return `${Number.isFinite(rounded) ? rounded : 0}mm`;
}

/** Nombre fini strictement positif et au plus `MAX_PAGE_MM`, sinon le repli. */
function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_PAGE_MM
    ? value
    : fallback;
}

/** Nombre fini positif ou nul et au plus `MAX_PAGE_MM`, sinon le repli. */
function nonNegativeOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_PAGE_MM
    ? value
    : fallback;
}

/** Vrai si la taille est un format nommé connu. */
function isPageSizeName(value: unknown): value is PageSizeName {
  return typeof value === 'string' && value in PAGE_SIZES_MM;
}

/**
 * Résout les dimensions et marges d'une page depuis `layout.page` : format nommé ou libre
 * (A4 par défaut), orientation paysage qui inverse largeur et hauteur, marges à 25,4 mm
 * par défaut, en-tête et pied à 12,7 mm du bord. Les valeurs absurdes (négatives, `NaN`,
 * infinies, au-delà de `MAX_PAGE_MM`) tombent sur les défauts.
 */
export function resolvePageMetrics(
  layout: DocumentLayout | SectionLayout | undefined | null,
): PageMetrics {
  const page = layout?.page;
  const size = page?.size;
  let dimensions: PageDimensions = PAGE_SIZES_MM.A4;
  if (isPageSizeName(size)) {
    dimensions = PAGE_SIZES_MM[size];
  } else if (typeof size === 'object' && size !== null) {
    dimensions = {
      widthMm: positiveOr(size.widthMm, PAGE_SIZES_MM.A4.widthMm),
      heightMm: positiveOr(size.heightMm, PAGE_SIZES_MM.A4.heightMm),
    };
  }
  const landscape = page?.orientation === 'landscape';
  const margins = page?.margins;
  return {
    widthMm: landscape ? dimensions.heightMm : dimensions.widthMm,
    heightMm: landscape ? dimensions.widthMm : dimensions.heightMm,
    marginTopMm: nonNegativeOr(margins?.topMm, DEFAULT_PAGE_MARGIN_MM),
    marginRightMm: nonNegativeOr(margins?.rightMm, DEFAULT_PAGE_MARGIN_MM),
    marginBottomMm: nonNegativeOr(margins?.bottomMm, DEFAULT_PAGE_MARGIN_MM),
    marginLeftMm: nonNegativeOr(margins?.leftMm, DEFAULT_PAGE_MARGIN_MM),
    marginHeaderMm: nonNegativeOr(margins?.headerMm, DEFAULT_HEADER_FOOTER_MARGIN_MM),
    marginFooterMm: nonNegativeOr(margins?.footerMm, DEFAULT_HEADER_FOOTER_MARGIN_MM),
  };
}

/** Vrai si la valeur est un tableau de sections (type garde, sans présumer des entrées). */
function isSectionLayoutList(value: unknown): value is readonly SectionLayout[] {
  return Array.isArray(value);
}

/** Vrai si la valeur est un objet de mise en page de section (une entrée `null` ou texte ne l'est pas). */
function isSectionLayout(value: unknown): value is SectionLayout {
  return typeof value === 'object' && value !== null;
}

/**
 * Sections déclarées par la mise en page, ou aucune : `sections` venu d'un JSON peut être
 * tout sauf un tableau (R41-05), et `maxSectionWidthMm` levait alors `sections.map is not
 * a function` après le retrait de la vue page précédente.
 */
function sectionLayouts(layout: DocumentLayout | undefined | null): readonly SectionLayout[] {
  const sections: unknown = layout?.sections;
  return isSectionLayoutList(sections) ? sections : [];
}

/**
 * Mise en page de la section `section` (numéro 1-based, celui de `data-section-break` et
 * de `getSections`). `layout.sections[section - 1]` quand elle existe ; sinon les champs
 * de premier niveau (`page`, `columns`, `headers`, `footers`, `titlePage`), qui sont la
 * seule section d'un document sans `sections` et la copie de la dernière section sinon
 * (compatibilité 0.5). Un numéro hors plage, un `sections` qui n'est pas un tableau ou une
 * entrée qui n'est pas un objet retombent donc sur la dernière section.
 */
export function resolveSectionLayout(layout: DocumentLayout, section: number): SectionLayout {
  const known: unknown = sectionLayouts(layout)[section - 1];
  if (isSectionLayout(known)) {
    return known;
  }
  const fallback: {
    -readonly [K in keyof SectionLayout]: SectionLayout[K];
  } = {};
  if (layout.page !== undefined) fallback.page = layout.page;
  if (layout.columns !== undefined) fallback.columns = layout.columns;
  if (layout.headers !== undefined) fallback.headers = layout.headers;
  if (layout.footers !== undefined) fallback.footers = layout.footers;
  if (layout.titlePage !== undefined) fallback.titlePage = layout.titlePage;
  return fallback;
}

/**
 * Section (1-based) ouverte par le saut de section de premier niveau de rang `rank`
 * (0-based, dans l'ordre du document) : le k-ième saut ouvre la section k + 1, quel que
 * soit l'attribut `data-section-break` du `hr` (R44-01). Seule source partagée par le
 * NodeView du saut (variables posées sur le `hr`) et par la pagination (segments,
 * libellé et en-tête de la coupure) : les deux désignent toujours la même entrée de
 * `layout.sections`, même sur un document chargé avec des numéros hors ordre.
 */
export function sectionOpenedByBreak(rank: number): number {
  return rank + 2;
}

/** Sélecteur des sauts de section de premier niveau dans le conteneur de contenu. */
const TOP_LEVEL_SECTION_BREAK_SELECTOR = ':scope > hr[data-section-break]';

/**
 * Nombre de sections **du corps** : sauts de section de premier niveau rendus dans
 * `contentElement` (`hr[data-section-break]`, NodeView du core ou rendu équivalent) plus
 * un, borné par le nombre de sections déclarées (au moins 1). C'est la dernière section
 * que l'hôte affiche (pied, `--aster-page-width-max`, R44-05) : un `layout.sections` plus
 * long que le corps (sauts supprimés, mise en page conservée) n'impose pas une section
 * jamais ouverte.
 */
export function bodySectionCount(
  layout: DocumentLayout | undefined | null,
  contentElement: Element | null,
): number {
  const declared = sectionLayouts(layout).length;
  if (declared === 0) {
    return 1;
  }
  const breaks = contentElement?.querySelectorAll(TOP_LEVEL_SECTION_BREAK_SELECTOR).length ?? 0;
  return Math.max(1, Math.min(breaks + 1, declared));
}

/**
 * Largeur de la plus large section en mm (`--aster-page-width-max`, L44), `null` sans
 * `layout.sections` : la feuille suit alors `--aster-page-width`. Chaque section est
 * résolue comme ailleurs (`resolveSectionLayout`) : une entrée qui n'est pas un objet
 * compte pour le premier niveau. `limit` borne le nombre de sections considérées (celles
 * que le corps ouvre, R44-05) ; absent, toutes les sections déclarées comptent.
 */
export function maxSectionWidthMm(
  layout: DocumentLayout | undefined | null,
  limit?: number,
): number | null {
  const declared = sectionLayouts(layout).length;
  if (!layout || declared === 0) {
    return null;
  }
  const count = limit === undefined ? declared : Math.max(1, Math.min(limit, declared));
  return Math.max(
    ...Array.from(
      { length: count },
      (_, index) => resolvePageMetrics(resolveSectionLayout(layout, index + 1)).widthMm,
    ),
  );
}

/** Valeurs des variables CSS, dans l'ordre de `PAGE_VIEW_CSS_VARIABLES`. */
export function pageViewCssValues(metrics: PageMetrics): readonly string[] {
  return [
    formatMm(metrics.widthMm),
    formatMm(metrics.heightMm),
    formatMm(metrics.marginTopMm),
    formatMm(metrics.marginRightMm),
    formatMm(metrics.marginBottomMm),
    formatMm(metrics.marginLeftMm),
    formatMm(metrics.marginHeaderMm),
    formatMm(metrics.marginFooterMm),
  ];
}

/**
 * Événement DOM (sans bulle) émis sur `contentElement` quand la vue page est activée ou
 * retirée. Le plugin de pagination (L30) l'écoute sur `view.dom` et relit
 * `getActivePageView` : aucune dépendance de `page-view` vers le plugin.
 */
export const PAGE_VIEW_CHANGE_EVENT = 'aster:page-view-change';

/**
 * Événement DOM (sans bulle) émis sur `contentElement` par le plugin `sectionBreak` quand
 * la suite des sauts de premier niveau change (insertion, suppression, remplacement).
 * Défini ici (et réexporté par `section-break.ts`, qui importe déjà ce module) pour que
 * la vue page l'écoute sans cycle d'imports : le pied de l'hôte et
 * `--aster-page-width-max` suivent la dernière section du corps (L50).
 */
export const SECTION_BREAKS_CHANGE_EVENT = 'aster:section-breaks-change';

/** Options de la vue page active, par conteneur de contenu (`view.dom`). */
const ACTIVE_PAGE_VIEWS = new WeakMap<HTMLElement, PageViewOptions>();

/** Options de la vue page active sur ce conteneur de contenu, `null` si elle est inactive. */
export function getActivePageView(contentElement: HTMLElement): PageViewOptions | null {
  return ACTIVE_PAGE_VIEWS.get(contentElement) ?? null;
}

/** Signale un changement de vue page aux plugins qui écoutent `contentElement`. */
function notifyPageViewChange(contentElement: HTMLElement): void {
  contentElement.dispatchEvent(new CustomEvent(PAGE_VIEW_CHANGE_EVENT));
}

/** Ce que l'hôte affiche de la dernière section du corps : pied (assaini) et largeur max. */
interface LastSectionState {
  readonly footerHtml: string;
  readonly widthMaxMm: number | null;
}

/**
 * Dernière page connue de la pagination, par conteneur de contenu (L52) : le pied de
 * l'hôte habille le bas de la **dernière** page, dont la variante (`first` / `even`)
 * dépend de son numéro et de sa place dans sa section. Absente (pagination inactive, pas
 * encore mesurée) : page 1 si le corps n'a qu'une section, sinon une page quelconque de
 * la dernière section (variante `default`).
 */
const LAST_PAGES = new WeakMap<HTMLElement, HeaderFooterPage>();

/** Événement DOM (sans bulle) émis sur `contentElement` par `setHostLastPage` pour rafraîchir le pied. */
const HOST_LAST_PAGE_EVENT = 'aster:page-view-last-page';

/**
 * Déclare la dernière page du document (numéro, première de sa section ?) pour que le
 * pied de l'hôte prenne la bonne variante ; `null` oublie la pagination. Appelé par le
 * contrôleur de pagination après chaque mesure, sans dépendance de ce module vers lui.
 */
export function setHostLastPage(contentElement: HTMLElement, page: HeaderFooterPage | null): void {
  const previous = LAST_PAGES.get(contentElement);
  if (page === null) {
    LAST_PAGES.delete(contentElement);
  } else {
    LAST_PAGES.set(contentElement, page);
  }
  if (
    (previous?.pageNumber ?? null) === (page?.pageNumber ?? null) &&
    (previous?.firstOfSection ?? null) === (page?.firstOfSection ?? null)
  ) {
    return;
  }
  contentElement.dispatchEvent(new CustomEvent(HOST_LAST_PAGE_EVENT));
}

/** Page que le pied de l'hôte habille : celle de la pagination, sinon la présomption ci-dessus. */
function hostLastPage(contentElement: HTMLElement, lastSection: number): HeaderFooterPage {
  return LAST_PAGES.get(contentElement) ?? { pageNumber: 1, firstOfSection: lastSection === 1 };
}

/**
 * Pied et largeur max de l'hôte pour la dernière section **du corps** (R44-05 :
 * `bodySectionCount`, sauts de premier niveau lus dans `contentElement` + 1, borné par les
 * sections déclarées). Calcul pur, relancé à chaque changement de la suite des sauts (L50)
 * et de la dernière page connue (L52 : variante `first` / `even` du pied).
 */
function lastSectionState(
  layout: DocumentLayout,
  contentElement: HTMLElement,
  showHeadersFooters: boolean,
): LastSectionState {
  const lastSection = bodySectionCount(layout, contentElement);
  const last = resolveSectionLayout(layout, lastSection);
  return {
    footerHtml: showHeadersFooters
      ? headerFooterHtmlFor(last, 'footers', hostLastPage(contentElement, lastSection))
      : '',
    widthMaxMm: maxSectionWidthMm(layout, lastSection),
  };
}

/** Pose (ou retire) les variables de défauts du document et la classe d'espacement (L52). */
function applyPageDefaults(host: HTMLElement, values: PageDefaultsCssValues): void {
  for (const name of PAGE_DEFAULT_CSS_VARIABLES) {
    const value = values[name];
    if (value === undefined) host.style.removeProperty(name);
    else host.style.setProperty(name, value);
  }
  host.classList.toggle(PAGE_DEFAULTS_CLASS, hasDefaultSpacing(values));
}

/** Pose sur l'hôte et le pied ce que `lastSectionState` a calculé ; sans sections, aucune largeur max. */
function applyLastSection(
  host: HTMLElement,
  footer: HTMLElement | null,
  state: LastSectionState,
): void {
  if (state.widthMaxMm === null) {
    host.style.removeProperty(PAGE_WIDTH_MAX_CSS_VARIABLE);
  } else {
    host.style.setProperty(PAGE_WIDTH_MAX_CSS_VARIABLE, formatMm(state.widthMaxMm));
  }
  if (footer && footer.innerHTML !== state.footerHtml) {
    footer.innerHTML = state.footerHtml;
  }
}

/** Vue page montée : conteneurs et retrait. */
export interface PageViewHandle {
  /** Options telles que reçues, pour remonter la même vue si la suivante échoue (R41-05). */
  readonly options: PageViewOptions;
  readonly layout: DocumentLayout;
  readonly header: HTMLElement | null;
  readonly footer: HTMLElement | null;
  /** Retire classe, variables et conteneurs. Idempotent. */
  remove(): void;
}

/**
 * Active la vue page : classe `aster--page-view` et variables `--aster-page-*` sur
 * l'hôte, conteneurs `div.aster-page-header` / `div.aster-page-footer` (contenu assaini)
 * juste avant et juste après `contentElement`. La feuille de style est dans `ui` ; le
 * core ne pose que classes, variables et conteneurs.
 *
 * Sections (session 4) : avec `layout.sections`, l'hôte porte les variables et l'en-tête
 * de la **section 1** (`resolveSectionLayout`), pas ceux du premier niveau (copie de la
 * dernière section), et le pied de la dernière section que le corps ouvre
 * (`bodySectionCount`, lu dans `contentElement` à l'appel puis à chaque
 * `aster:section-breaks-change`, L50 : `section.insertBreak` / `removeBreak`, collage ou
 * `undo` qui change la suite des sauts rafraîchissent le pied et
 * `--aster-page-width-max` sans rappeler `setPageView`). Chaque `sectionBreak` porte
 * ensuite, sur son `hr`, les variables de la section qui le suit ; les en-têtes des
 * sections suivantes sont du ressort de la pagination (L44).
 */
export function applyPageView(
  host: HTMLElement,
  contentElement: HTMLElement,
  options: PageViewOptions,
): PageViewHandle {
  const layout: DocumentLayout = options.layout ?? {};
  // Tout ce qui lit la mise en page (et peut lever sur une entrée hostile) est calculé
  // avant la première mutation de l'hôte : en cas d'exception, rien n'est à moitié posé.
  const first = resolveSectionLayout(layout, 1);
  const showHeadersFooters = options.showHeadersFooters !== false;
  const values = pageViewCssValues(resolvePageMetrics(first));
  // L'en-tête de l'hôte habille la page 1, première de la section 1 : `first` si la
  // section est `titlePage` (L52), `default` sinon.
  const headerHtml = showHeadersFooters ? headerFooterHtmlFor(first, 'headers', FIRST_PAGE) : '';
  // Le pied en bas de la feuille est celui de la dernière section **du corps** (R44-05 :
  // sauts de premier niveau + 1, borné par les sections déclarées ; la pagination affiche
  // les pieds intermédiaires sur chaque coupure) ; l'en-tête, celui de la première.
  const last = lastSectionState(layout, contentElement, showHeadersFooters);
  const defaults = pageDefaultsCssValues(layout);

  host.classList.add(PAGE_VIEW_CLASS);
  PAGE_VIEW_CSS_VARIABLES.forEach((name, index) => {
    host.style.setProperty(name, values[index] ?? '');
  });
  // Défauts de paragraphe et police du document (L52), appliqués en repli par `page.css`.
  applyPageDefaults(host, defaults);

  let header: HTMLElement | null = null;
  let footer: HTMLElement | null = null;
  if (showHeadersFooters) {
    const parent = contentElement.parentNode;
    header = document.createElement('div');
    header.className = PAGE_HEADER_CLASS;
    header.setAttribute('contenteditable', 'false');
    header.innerHTML = headerHtml;
    footer = document.createElement('div');
    footer.className = PAGE_FOOTER_CLASS;
    footer.setAttribute('contenteditable', 'false');
    if (parent) {
      parent.insertBefore(header, contentElement);
      parent.insertBefore(footer, contentElement.nextSibling);
    }
  }
  // Sections (L44) : la feuille prend la largeur de la plus large section ; pied de la dernière.
  applyLastSection(host, footer, last);

  // La suite des sauts change (L50) : la dernière section du corps aussi, peut-être. La
  // dernière page change (L52, pagination) : la variante du pied aussi.
  const onSectionBreaksChange = (): void => {
    applyLastSection(host, footer, lastSectionState(layout, contentElement, showHeadersFooters));
  };
  contentElement.addEventListener(SECTION_BREAKS_CHANGE_EVENT, onSectionBreaksChange);
  contentElement.addEventListener(HOST_LAST_PAGE_EVENT, onSectionBreaksChange);

  // Pagination (L30) : les options sont lisibles par le plugin avant qu'il soit prévenu.
  ACTIVE_PAGE_VIEWS.set(contentElement, options);
  notifyPageViewChange(contentElement);

  let removed = false;
  return {
    options,
    layout,
    header,
    footer,
    remove() {
      if (removed) {
        return;
      }
      removed = true;
      contentElement.removeEventListener(SECTION_BREAKS_CHANGE_EVENT, onSectionBreaksChange);
      contentElement.removeEventListener(HOST_LAST_PAGE_EVENT, onSectionBreaksChange);
      // Le plugin de pagination retire d'abord ses propres variables et décorations.
      ACTIVE_PAGE_VIEWS.delete(contentElement);
      notifyPageViewChange(contentElement);
      host.classList.remove(PAGE_VIEW_CLASS);
      host.classList.remove(PAGE_DEFAULTS_CLASS);
      for (const name of [...PAGE_VIEW_CSS_VARIABLES, ...PAGE_DEFAULT_CSS_VARIABLES]) {
        host.style.removeProperty(name);
      }
      host.style.removeProperty(PAGE_WIDTH_MAX_CSS_VARIABLE);
      if (host.getAttribute('style') === '') {
        host.removeAttribute('style');
      }
      header?.remove();
      footer?.remove();
    },
  };
}
