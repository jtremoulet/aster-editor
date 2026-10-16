import type { VariableValues } from '../api';
import { variablePlaceholder } from '../editor/variable-store';

/** Sélecteur des puces dans le HTML Aster (`getHTML()` en mode `placeholders`). */
export const VARIABLE_SELECTOR = 'span[data-aster-variable]';

/**
 * Parseur HTML → élément conteneur, dont `innerHTML` est la sortie. Injectable pour un
 * environnement sans `DOMParser` global (Node avec linkedom, par exemple).
 */
export type HtmlContainerParser = (html: string) => HTMLElement;

/** Options de `resolveVariablesHtml`. */
export interface ResolveVariablesOptions {
  /** Parseur injecté ; par défaut `new DOMParser().parseFromString(html, 'text/html').body`. */
  readonly parse?: HtmlContainerParser;
}

/** Parseur par défaut : `DOMParser` du navigateur (ou de jsdom), corps du document obtenu. */
function defaultParser(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

/**
 * Substitue les puces d'un HTML Aster par leurs valeurs, en texte brut échappé : c'est le
 * mode `variables: 'resolve'` de `getHTML`, utilisable aussi sur un HTML stocké, hors
 * éditeur. Une variable sans valeur garde `{{nom}}` en texte. Les autres `span` et le
 * reste du balisage sont rendus tels quels ; un HTML sans puce est renvoyé inchangé,
 * sans passer par le DOM.
 */
export function resolveVariablesHtml(
  html: string,
  values: VariableValues,
  options: ResolveVariablesOptions = {},
): string {
  if (!html.includes('data-aster-variable')) {
    return html;
  }
  const root = (options.parse ?? defaultParser)(html);
  for (const span of Array.from(root.querySelectorAll(VARIABLE_SELECTOR))) {
    const name = span.getAttribute('data-aster-variable') ?? '';
    const value = values[name];
    const text = value === undefined ? variablePlaceholder(name) : value;
    // Nœud texte, jamais `innerHTML` : la valeur est échappée à la sérialisation.
    span.replaceWith(span.ownerDocument.createTextNode(text));
  }
  return root.innerHTML;
}
