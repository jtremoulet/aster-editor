import type { HtmlParser } from '../docx/types';

/**
 * Helpers DOM de l'export, sans `instanceof` : le `Document` vient d'un parseur
 * injectable (jsdom, navigateur, autre realm) et seuls `nodeType`/`tagName` sont sûrs.
 */

/** Vrai si le nœud est un élément dont le tag (minuscule) est dans `tags`, ou tout élément si vide. */
export function isElement(
  node: Node | null | undefined,
  ...tags: readonly string[]
): node is Element {
  if (!node || node.nodeType !== 1) return false;
  if (tags.length === 0) return true;
  return tags.includes((node as Element).tagName.toLowerCase());
}

/** Vrai si le nœud est un nœud texte. */
export function isText(node: Node | null | undefined): node is Text {
  return node?.nodeType === 3;
}

/** Tag en minuscules. */
export function tagOf(element: Element): string {
  return element.tagName.toLowerCase();
}

/** Enfants directs qui sont des éléments. */
export function childElements(element: Element): Element[] {
  return Array.from(element.childNodes).filter((node): node is Element => isElement(node));
}

/** Balises de bloc : tout le reste est traité comme inline. */
export const BLOCK_TAGS: readonly string[] = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'nav',
  'aside',
  'figure',
  'figcaption',
  'details',
  'summary',
];

/** Éléments embarqués sans équivalent Word : ignorés avec avertissement `unsupported-element`. */
export const DROPPED_TAGS: readonly string[] = [
  'iframe',
  'video',
  'audio',
  'canvas',
  'svg',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'select',
  'textarea',
];

/** Éléments sans contenu visible, ignorés silencieusement. */
export const SILENT_TAGS: readonly string[] = ['script', 'style', 'template', 'noscript'];

/** Attribut qui marque un saut de page (`<div data-page-break>`, `<hr data-page-break>`, `<p data-page-break>`). */
export const PAGE_BREAK_ATTRIBUTE = 'data-page-break';

/** Vrai si un conteneur a au moins un enfant élément de bloc. */
export function hasBlockChild(element: Element): boolean {
  return childElements(element).some((child) => BLOCK_TAGS.includes(tagOf(child)));
}

/** Attribut entier strictement positif (`colspan`, `rowspan`), `null` sinon. */
export function positiveIntAttribute(element: Element, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** `DOMParser` injecté ou global : jamais `document`, pour rester compatible SSR et tests. */
export function resolveParser(parse: HtmlParser | undefined): HtmlParser {
  if (parse) return parse;
  if (typeof DOMParser === 'undefined') {
    throw new Error('exportDocx: aucun DOMParser disponible, passe `options.parse`');
  }
  return new DOMParser();
}

/** Parse un fragment HTML dans un document complet et rend son `<body>`. */
export function parseFragment(html: string, parser: HtmlParser): Element {
  return parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html')
    .body;
}
