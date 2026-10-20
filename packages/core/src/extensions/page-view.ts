import type { DocumentLayout, PageDimensions, PageSizeName, PageViewOptions } from '../api';
import { roundLayoutNumber } from './layout-css';

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

/** Balises conservées par l'assainissement des en-têtes et pieds. */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'code',
  'br',
  'a',
  'img',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'hr',
]);

/** Balises supprimées avec leur contenu (tout le reste est « déballé »). */
const DROPPED_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'noscript',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta',
  'base',
]);

/** Attributs conservés (plus tout `data-*`). */
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
  'style',
  'class',
  'href',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'colspan',
  'rowspan',
  'type',
  'start',
  'target',
  'rel',
]);

/** Schémas d'URL acceptés dans `href` / `src` (plus `data:image/` pour `src` seulement). */
const ALLOWED_URL_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel']);

/** Caractères de contrôle et blancs ASCII (U+0000 à U+0020), ignorés par les parseurs d'URL. */
// eslint-disable-next-line no-control-regex -- c'est précisément la plage à retirer.
const URL_NOISE_PATTERN = /[\u0000- ]/g;

/**
 * Vrai si une URL d'attribut `href`/`src` est acceptable : ancre, chemin relatif, ou schéma
 * de l'allowlist. Les parseurs d'URL ignorent les caractères de contrôle et les blancs
 * ASCII (`java\tscript:` est lu `javascript:`), pas une regex : ils sont retirés **avant**
 * le test, comme le fait DOMPurify (R23-01). Un `\` vaut `/` pour les schémas spéciaux
 * (`\\evil` → `//evil`) et les URL relatives au protocole (`//evil`) sont refusées.
 */
function isSafeUrl(name: string, value: string): boolean {
  const stripped = value.replace(URL_NOISE_PATTERN, '').replace(/\\/g, '/').toLowerCase();
  if (stripped === '' || stripped.startsWith('#')) {
    return true;
  }
  if (stripped.startsWith('//')) {
    return false;
  }
  if (stripped.startsWith('/')) {
    return true;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(stripped)?.[1];
  if (scheme === undefined) {
    return true;
  }
  if (ALLOWED_URL_SCHEMES.has(scheme)) {
    return true;
  }
  return name === 'src' && stripped.startsWith('data:image/');
}

/**
 * Vrai si une valeur de `style` ne charge ni n'exécute rien. Le CSS décode les échappements
 * (`\75rl(` est lu `url(`, CSS Syntax L3 §4.3.7) et ignore les commentaires : tout `\` est
 * refusé (Word n'en produit jamais) et les commentaires sont retirés avant de chercher les
 * fonctions qui chargent une ressource (`url(`, `image-set(`, `image(`, `src(`, `element(`)
 * ou exécutent du code (`expression(`, `-moz-binding`, `behavior`) (R23-08).
 */
function isSafeStyle(value: string): boolean {
  if (value.includes('\\')) {
    return false;
  }
  const stripped = value.replace(/\/\*[\s\S]*?\*\//g, '');
  return !/(?:url|image-set|image|src|element|expression)\s*\(|javascript:|-moz-binding|behavior\s*:/i.test(
    stripped,
  );
}

/** Filtre les attributs d'un élément en place : allowlist, jamais `on*`, URL et style sûrs. */
function sanitizeAttributes(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const allowed =
      (ALLOWED_ATTRIBUTES.has(name) || name.startsWith('data-')) &&
      !name.startsWith('on') &&
      (name !== 'href' && name !== 'src' ? true : isSafeUrl(name, attribute.value)) &&
      (name !== 'style' || isSafeStyle(attribute.value));
    if (!allowed) {
      element.removeAttribute(attribute.name);
    }
  }
}

/**
 * Profondeur d'imbrication conservée par l'assainissement. Au-delà, un élément est réduit
 * à son texte : un fragment de 8 000 `<div>` imbriqués, possible depuis un `.docx`
 * hostile, ne produit plus qu'un arbre borné.
 */
export const MAX_SANITIZE_DEPTH = 64;

/** Sélecteur des balises supprimées avec leur contenu. */
const DROPPED_SELECTOR = [...DROPPED_TAGS].join(',');

/** Un parent à parcourir et la profondeur de ses enfants directs. */
interface SanitizeFrame {
  readonly parent: Node;
  readonly depth: number;
}

/**
 * Remplace un élément trop profond par son seul texte, balises interdites retirées
 * d'abord (leur contenu ne doit pas réapparaître en texte). Une seule passe sur le
 * sous-arbre, quelle que soit sa taille : le déballer niveau par niveau déplacerait le
 * sous-arbre à chaque niveau, ce qui est quadratique dans le DOM.
 */
function flattenToText(element: Element): void {
  for (const dropped of element.querySelectorAll(DROPPED_SELECTOR)) {
    dropped.remove();
  }
  const text = element.textContent;
  if (text === '') {
    element.remove();
  } else {
    element.replaceWith(document.createTextNode(text));
  }
}

/**
 * Parcourt les enfants d'un parent : commentaire et balise interdite supprimés, élément
 * trop profond réduit à son texte, balise inconnue déballée (ses enfants remontent et sont
 * examinés à leur tour), balise connue assainie puis empilée. Pile explicite plutôt que
 * récursion : la version récursive faisait déborder la pile d'appels sur un HTML
 * profondément imbriqué (R23-03). Le déballage ne se produit qu'au-dessus du plafond, le
 * coût total reste borné par `MAX_SANITIZE_DEPTH` fois la taille du fragment.
 */
function sanitizeTree(root: Node): void {
  const stack: SanitizeFrame[] = [{ parent: root, depth: 0 }];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const { parent, depth } = frame;
    let child = parent.firstChild;
    while (child !== null) {
      const following = child.nextSibling;
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        child = following;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child = following;
        continue;
      }
      const element = child as Element;
      const tag = element.tagName.toLowerCase();
      if (DROPPED_TAGS.has(tag)) {
        element.remove();
        child = following;
        continue;
      }
      if (depth >= MAX_SANITIZE_DEPTH) {
        flattenToText(element);
        child = following;
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        // Déballé en place : ses enfants prennent sa position et sont examinés ensuite.
        const first = element.firstChild;
        element.replaceWith(...element.childNodes);
        child = first ?? following;
        continue;
      }
      sanitizeAttributes(element);
      stack.push({ parent: element, depth: depth + 1 });
      child = following;
    }
  }
}

/**
 * Assainit un fragment HTML d'en-tête ou de pied avant de l'injecter en `innerHTML` :
 * texte et balises inline/bloc simples uniquement (`p`, titres, `span`, marques, listes,
 * tables, `img`, `a`), attributs `style`, `class`, `data-*`, `href`/`src` sûrs. Jamais de
 * `<script>`, `<style>`, `<iframe>`, ni d'attribut `on*`. Les balises inconnues sont
 * déballées, leur texte conservé, et l'imbrication est plafonnée à `MAX_SANITIZE_DEPTH`.
 * Le core n'avait pas de sanitiseur : celui-ci est volontairement minimal, allowlist stricte.
 */
export function sanitizeHeaderFooterHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  sanitizeTree(template.content);
  return template.innerHTML;
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
export function resolvePageMetrics(layout: DocumentLayout | undefined | null): PageMetrics {
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
 */
export function applyPageView(
  host: HTMLElement,
  contentElement: HTMLElement,
  options: PageViewOptions,
): PageViewHandle {
  const layout: DocumentLayout = options.layout ?? {};
  // Tout ce qui lit la mise en page (et peut lever sur une entrée hostile) est calculé
  // avant la première mutation de l'hôte : en cas d'exception, rien n'est à moitié posé.
  const showHeadersFooters = options.showHeadersFooters !== false;
  const values = pageViewCssValues(resolvePageMetrics(layout));
  const headerHtml = showHeadersFooters
    ? sanitizeHeaderFooterHtml(layout.headers?.default?.html ?? '')
    : '';
  const footerHtml = showHeadersFooters
    ? sanitizeHeaderFooterHtml(layout.footers?.default?.html ?? '')
    : '';

  host.classList.add(PAGE_VIEW_CLASS);
  PAGE_VIEW_CSS_VARIABLES.forEach((name, index) => {
    host.style.setProperty(name, values[index] ?? '');
  });

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
      if (host.getAttribute('style') === '') {
        host.removeAttribute('style');
      }
      header?.remove();
      footer?.remove();
    },
  };
}
