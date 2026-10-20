import type {
  DocumentLayout,
  PageDimensions,
  PageSizeName,
  PageViewOptions,
  SectionLayout,
} from '../api';
import { sanitizeHeaderFooterHtml } from './header-footer-sanitize';
import { roundLayoutNumber } from './layout-css';

// Sanitiseur des en-têtes et pieds : extrait en F30 (R30-13), même API qu'avant.
export { MAX_SANITIZE_DEPTH, sanitizeHeaderFooterHtml } from './header-footer-sanitize';

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
 * Largeur de la plus large section en mm (`--aster-page-width-max`, L44), `null` sans
 * `layout.sections` : la feuille suit alors `--aster-page-width`. Chaque section est
 * résolue comme ailleurs (`resolveSectionLayout`) : une entrée qui n'est pas un objet
 * compte pour le premier niveau.
 */
export function maxSectionWidthMm(layout: DocumentLayout | undefined | null): number | null {
  const count = sectionLayouts(layout).length;
  if (!layout || count === 0) {
    return null;
  }
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
 * Sections (session 4) : avec `layout.sections`, l'hôte porte les variables, l'en-tête
 * et le pied de la **section 1** (`resolveSectionLayout`), pas ceux du premier niveau
 * (copie de la dernière section). Chaque `sectionBreak` porte ensuite, sur son `hr`, les
 * variables de la section qui le suit ; les en-têtes des sections suivantes sont du
 * ressort de la pagination (L44).
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
  const headerHtml = showHeadersFooters
    ? sanitizeHeaderFooterHtml(first.headers?.default?.html ?? '')
    : '';
  // Le pied en bas de la feuille est celui de la dernière section (la pagination affiche
  // les pieds intermédiaires sur chaque coupure de section) ; l'en-tête, celui de la première.
  const last = resolveSectionLayout(layout, sectionLayouts(layout).length || 1);
  const footerHtml = showHeadersFooters
    ? sanitizeHeaderFooterHtml(last.footers?.default?.html ?? '')
    : '';
  const widthMaxMm = maxSectionWidthMm(layout);

  host.classList.add(PAGE_VIEW_CLASS);
  PAGE_VIEW_CSS_VARIABLES.forEach((name, index) => {
    host.style.setProperty(name, values[index] ?? '');
  });
  // Sections (L44) : la feuille prend la largeur de la plus large section.
  if (widthMaxMm !== null) {
    host.style.setProperty(PAGE_WIDTH_MAX_CSS_VARIABLE, formatMm(widthMaxMm));
  }

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
    footer.innerHTML = footerHtml;
    if (parent) {
      parent.insertBefore(header, contentElement);
      parent.insertBefore(footer, contentElement.nextSibling);
    }
  }

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
      // Le plugin de pagination retire d'abord ses propres variables et décorations.
      ACTIVE_PAGE_VIEWS.delete(contentElement);
      notifyPageViewChange(contentElement);
      host.classList.remove(PAGE_VIEW_CLASS);
      for (const name of PAGE_VIEW_CSS_VARIABLES) {
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
