/**
 * Utilitaires DOM partagés par les passes du normaliseur. Tout passe par le `Document`
 * reçu en paramètre : aucun accès à un `document` global, pour rester pur et testable.
 */

/** Balises considérées comme des blocs pour le trim des espaces et la détection des listes. */
export const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ul',
  'ol',
  'td',
  'th',
  'tr',
  'thead',
  'tbody',
  'tfoot',
  'table',
  'blockquote',
  'div',
  'pre',
  'hr',
  'body',
]);

/** Vrai si l'élément est un bloc au sens de `BLOCK_TAGS`. */
export function isBlockElement(node: Node | null): node is Element {
  return node !== null && node.nodeType === 1 && BLOCK_TAGS.has((node as Element).localName);
}

/** Remplace un élément par ses enfants. Le parent conserve l'ordre des nœuds. */
export function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

/**
 * Renomme un élément en déplaçant ses enfants dans une nouvelle balise. Seuls les
 * attributs listés sont copiés : on en profite pour oublier les `class` et `lang` Word.
 */
export function renameElement(
  doc: Document,
  element: Element,
  tagName: string,
  keepAttributes: readonly string[] = ['style'],
): Element {
  const replacement = doc.createElement(tagName);
  for (const name of keepAttributes) {
    const value = element.getAttribute(name);
    if (value !== null) {
      replacement.setAttribute(name, value);
    }
  }
  while (element.firstChild) {
    replacement.appendChild(element.firstChild);
  }
  element.parentNode?.replaceChild(replacement, element);
  return replacement;
}

/** Enveloppe tous les enfants d'un élément dans une nouvelle balise (ex. `strong`). */
export function wrapChildren(doc: Document, element: Element, tagName: string): Element {
  const wrapper = doc.createElement(tagName);
  while (element.firstChild) {
    wrapper.appendChild(element.firstChild);
  }
  element.appendChild(wrapper);
  return wrapper;
}

/** Découpe un attribut `style` en paires `[propriété, valeur]`, en minuscules pour les noms. */
export function parseStyle(style: string | null): Array<[string, string]> {
  if (!style) {
    return [];
  }
  const declarations: Array<[string, string]> = [];
  for (const chunk of style.split(';')) {
    const index = chunk.indexOf(':');
    if (index === -1) {
      continue;
    }
    const name = chunk.slice(0, index).trim().toLowerCase();
    const value = chunk.slice(index + 1).trim();
    if (name && value) {
      declarations.push([name, value]);
    }
  }
  return declarations;
}

/** Recompose un attribut `style` à partir de déclarations, `null` si la liste est vide. */
export function serializeStyle(declarations: ReadonlyArray<[string, string]>): string | null {
  if (declarations.length === 0) {
    return null;
  }
  return declarations.map(([name, value]) => `${name}:${value}`).join(';');
}

/** Lit une propriété CSS dans l'attribut `style` d'un élément, `undefined` si absente. */
export function getStyleProperty(element: Element, property: string): string | undefined {
  for (const [name, value] of parseStyle(element.getAttribute('style'))) {
    if (name === property) {
      return value;
    }
  }
  return undefined;
}

/** Vrai si le texte ne contient que des espaces, insécables compris. */
export function isBlank(text: string | null | undefined): boolean {
  return !text || /^[\s\u00a0\u200b\ufeff]*$/.test(text);
}

/** Liste statique des éléments correspondant au sélecteur : on peut muter le DOM en itérant. */
export function selectAll(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Itère tous les nœuds texte sous `root` en profondeur, en excluant les sous-arbres
 * des balises listées (typiquement `pre`, dont on respecte les espaces).
 */
export function collectTextNodes(root: Node, skipTags: ReadonlySet<string> = new Set()): Text[] {
  const result: Text[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      result.push(node as Text);
      return;
    }
    if (node.nodeType === 1 && skipTags.has((node as Element).localName)) {
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
  };
  visit(root);
  return result;
}
