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
] as const;

/** Dimensions et marges résolues d'une page, en millimètres. */
export interface PageMetrics {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly marginTopMm: number;
  readonly marginRightMm: number;
  readonly marginBottomMm: number;
  readonly marginLeftMm: number;
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

/** Vrai si une URL d'attribut `href`/`src` est acceptable (jamais `javascript:` ni `data:` hors image). */
function isSafeUrl(name: string, value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('/')) {
    return true;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(trimmed)?.[1];
  if (scheme === undefined) {
    return true;
  }
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') {
    return true;
  }
  return name === 'src' && trimmed.startsWith('data:image/');
}

/** Vrai si une valeur de `style` ne contient rien d'exécutable (`url(`, `expression(`). */
function isSafeStyle(value: string): boolean {
  return !/url\s*\(|expression\s*\(|javascript:/i.test(value);
}

/** Assainit un élément en place : attributs filtrés, puis descendants. */
function sanitizeElement(element: Element): void {
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
  sanitizeChildren(element);
}

/** Parcourt les enfants : balise interdite supprimée, inconnue déballée, connue assainie. */
function sanitizeChildren(parent: Node): void {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (DROPPED_TAGS.has(tag)) {
      element.remove();
    } else if (!ALLOWED_TAGS.has(tag)) {
      sanitizeChildren(element);
      element.replaceWith(...element.childNodes);
    } else {
      sanitizeElement(element);
    }
  }
}

/**
 * Assainit un fragment HTML d'en-tête ou de pied avant de l'injecter en `innerHTML` :
 * texte et balises inline/bloc simples uniquement (`p`, titres, `span`, marques, listes,
 * tables, `img`, `a`), attributs `style`, `class`, `data-*`, `href`/`src` sûrs. Jamais de
 * `<script>`, `<style>`, `<iframe>`, ni d'attribut `on*`. Les balises inconnues sont
 * déballées, leur texte conservé. Le core n'avait pas de sanitiseur : celui-ci est
 * volontairement minimal, allowlist stricte.
 */
export function sanitizeHeaderFooterHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  sanitizeChildren(template.content);
  return template.innerHTML;
}

/** Formate des millimètres avec au plus deux décimales. */
function formatMm(value: number): string {
  return `${roundLayoutNumber(value)}mm`;
}

/** Nombre positif fini, sinon le repli. */
function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Nombre fini positif ou nul, sinon le repli. */
function nonNegativeOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Vrai si la taille est un format nommé connu. */
function isPageSizeName(value: unknown): value is PageSizeName {
  return typeof value === 'string' && value in PAGE_SIZES_MM;
}

/**
 * Résout les dimensions et marges d'une page depuis `layout.page` : format nommé ou libre
 * (A4 par défaut), orientation paysage qui inverse largeur et hauteur, marges à 25,4 mm
 * par défaut. Les valeurs absurdes (négatives, `NaN`) tombent sur les défauts.
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
  ];
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
  host.classList.add(PAGE_VIEW_CLASS);
  const values = pageViewCssValues(resolvePageMetrics(layout));
  PAGE_VIEW_CSS_VARIABLES.forEach((name, index) => {
    host.style.setProperty(name, values[index] ?? '');
  });

  let header: HTMLElement | null = null;
  let footer: HTMLElement | null = null;
  if (options.showHeadersFooters !== false) {
    const parent = contentElement.parentNode;
    header = document.createElement('div');
    header.className = PAGE_HEADER_CLASS;
    header.setAttribute('contenteditable', 'false');
    header.innerHTML = sanitizeHeaderFooterHtml(layout.headers?.default?.html ?? '');
    footer = document.createElement('div');
    footer.className = PAGE_FOOTER_CLASS;
    footer.setAttribute('contenteditable', 'false');
    footer.innerHTML = sanitizeHeaderFooterHtml(layout.footers?.default?.html ?? '');
    if (parent) {
      parent.insertBefore(header, contentElement);
      parent.insertBefore(footer, contentElement.nextSibling);
    }
  }

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
