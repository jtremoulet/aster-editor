import { sanitizeHeaderFooterHtml } from '@aster-editor/core';

/**
 * Normalisation du HTML d'un champ riche minimal (`rich-field.ts`, session 5, L54 ;
 * extrait en F52 pour la règle des 400 lignes). La valeur d'un champ est le HTML assaini
 * par le core puis normalisé ici : un **point fixe** du parseur HTML, identique à ce que la
 * vue page affiche de la valeur appliquée (R52-01), où un filet, une image ou une ligne
 * blanche entre deux blocs comptent comme contenu (R52-02), sans `class` ni `style`
 * étranger à la typographie (R52-04).
 */

/** Balises de bloc conservées telles quelles au premier niveau d'un champ. */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'table',
  'hr',
]);

/** Blocs que la touche Entrée scinde en deux (la seconde moitié devient un `<p>`). */
export const SPLITTABLE_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

/** Balises de présentation produites par les navigateurs, renommées vers leur équivalent sémantique. */
const RENAMED_TAGS: Readonly<Record<string, string>> = { b: 'strong', i: 'em' };

/** Sélecteur des blocs dont la présence dans un `<div>` en fait un conteneur, pas un paragraphe. */
const NESTED_BLOCK_SELECTOR = 'div, p, h1, h2, h3, h4, h5, h6, ul, ol, table, hr';

/**
 * Parents attendus des balises de structure. Une balise hors de son parent (`<li>` nu,
 * `<td>` hors ligne) est déballée : le parseur HTML la déplacerait ou l'ignorerait au
 * prochain `innerHTML`, la valeur ne serait pas ce que la vue page affiche (R52-01).
 */
const STRUCTURE_PARENTS: Readonly<Record<string, readonly string[]>> = {
  li: ['ul', 'ol'],
  td: ['tr'],
  th: ['tr'],
  tr: ['table', 'thead', 'tbody'],
  thead: ['table'],
  tbody: ['table'],
};

/**
 * Propriétés CSS conservées dans un `style` (noms exacts et préfixes) : typographie et
 * boîte seulement, ce que le lecteur `.docx` et l'éditeur écrivent. Tout le reste
 * (`position`, `z-index`, `transform`, `display`…) est retiré : une puce forgée ne peut
 * pas recouvrir le dialogue (R52-04, dette R52).
 */
const STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'vertical-align',
  'white-space',
  'direction',
  'unicode-bidi',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'table-layout',
  'caption-side',
  'empty-cells',
  'tab-size',
  'hyphens',
  'widows',
  'orphans',
]);

const STYLE_PROPERTY_PREFIXES: readonly string[] = [
  'font',
  'text-',
  'border',
  'margin',
  'padding',
  'background',
  'list-style',
  'break-',
  'page-break-',
];

/** Nombre maximal de passes de normalisation avant de rendre la valeur telle quelle. */
const MAX_NORMALIZE_PASSES = 3;

/** Nom de balise en minuscules. */
export function tagOf(element: Element): string {
  return element.tagName.toLowerCase();
}

/** Vrai si un nœud est un élément de bloc (`BLOCK_TAGS`). */
export function isBlockNode(node: Node): node is Element {
  return node instanceof Element && BLOCK_TAGS.has(tagOf(node));
}

/** Vrai si un élément n'a ni texte non blanc, ni image, ni filet : rien à l'écran, hors décor. */
export function isEmptyElement(element: Element): boolean {
  return (
    (element.textContent ?? '').trim() === '' &&
    tagOf(element) !== 'hr' &&
    element.querySelector('img, hr') === null
  );
}

/** Vrai si l'élément ou un descendant porte une bordure ou un fond : visible même vide (R52-02). */
function isDecorated(element: Element): boolean {
  const candidates = [element, ...Array.from(element.querySelectorAll('[style]'))];
  return candidates.some((candidate) =>
    /(?:^|;)\s*(?:border|background)/i.test(candidate.getAttribute('style') ?? ''),
  );
}

/**
 * Vrai si un élément porte un contenu visible : du texte non blanc, une image, un filet
 * (`<hr>` ou bloc bordé), un fond. Un paragraphe « filet » vide (`<p style="border-bottom:
 * …"></p>`, ce que le lecteur produit pour la ligne sous l'en-tête de Word) compte.
 */
export function hasVisibleContent(element: Element): boolean {
  return !isEmptyElement(element) || isDecorated(element);
}

/** Remplace un élément par un autre de même contenu et mêmes attributs, sous un nouveau nom. */
function renameElement(element: Element, tag: string): void {
  const renamed = element.ownerDocument.createElement(tag);
  for (const attribute of Array.from(element.attributes)) {
    renamed.setAttribute(attribute.name, attribute.value);
  }
  renamed.append(...Array.from(element.childNodes));
  element.replaceWith(renamed);
}

/** Remplace un élément par ses enfants. */
function unwrapElement(element: Element): void {
  element.replaceWith(...Array.from(element.childNodes));
}

/** Enveloppe dans un `<p>` chaque suite de nœuds de premier niveau qui ne sont pas des blocs. */
export function wrapInlineRuns(container: ParentNode & Node): void {
  let paragraph: HTMLElement | null = null;
  for (const node of Array.from(container.childNodes)) {
    if (isBlockNode(node)) {
      paragraph = null;
      continue;
    }
    if (!paragraph) {
      paragraph = node.ownerDocument?.createElement('p') ?? document.createElement('p');
      container.insertBefore(paragraph, node);
    }
    paragraph.append(node);
  }
}

/** Scinde un `style` en déclarations, les `;` entre guillemets ou parenthèses ignorés. */
function splitDeclarations(style: string): string[] {
  const declarations: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  for (const char of style) {
    if (quote !== null) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    } else if (char === ';' && depth === 0) {
      declarations.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  declarations.push(current);
  return declarations.map((declaration) => declaration.trim()).filter(Boolean);
}

/** Vrai pour une déclaration conservée : propriété typographique ou de boîte, valeur non `inherit`. */
function isKeptDeclaration(declaration: string): boolean {
  const colon = declaration.indexOf(':');
  if (colon < 0) return false;
  const name = declaration.slice(0, colon).trim().toLowerCase();
  const value = declaration
    .slice(colon + 1)
    .trim()
    .toLowerCase();
  if (value === '' || value === 'inherit') return false;
  return (
    STYLE_PROPERTIES.has(name) || STYLE_PROPERTY_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * Nettoie les attributs d'un élément : `class` retiré (étranger au champ), `style` réduit
 * aux déclarations typographiques sans `inherit` (Chromium en pose une série à chaque
 * fusion de blocs dans un `contenteditable`, R52-04), retiré s'il ne reste rien.
 */
function cleanAttributes(element: Element): void {
  element.removeAttribute('class');
  const style = element.getAttribute('style');
  if (style === null) return;
  const kept = splitDeclarations(style).filter(isKeptDeclaration);
  if (kept.length === 0) element.removeAttribute('style');
  else element.setAttribute('style', kept.join('; '));
}

/**
 * Une passe de normalisation structurelle : `<b>` / `<i>` renommés ; `<div>` déballé s'il
 * contient un bloc, renommé `<p>` sinon ; balise de structure hors de son parent déballée ;
 * attributs nettoyés ; `<span>` sans attribut déballé ; inline de premier niveau enveloppé.
 */
function normalizeTree(root: DocumentFragment): void {
  for (const [from, to] of Object.entries(RENAMED_TAGS)) {
    for (const element of Array.from(root.querySelectorAll(from))) {
      renameElement(element, to);
    }
  }
  // Un `<div>` qui contient un bloc (ou un autre `<div>`) n'est pas un paragraphe : renommé
  // en `<p>`, le parseur HTML éclaterait l'imbrication au prochain `innerHTML` (R52-01).
  for (const element of Array.from(root.querySelectorAll('div'))) {
    if (element.querySelector(NESTED_BLOCK_SELECTOR) !== null) unwrapElement(element);
    else renameElement(element, 'p');
  }
  for (const [tag, parents] of Object.entries(STRUCTURE_PARENTS)) {
    for (const element of Array.from(root.querySelectorAll(tag))) {
      const parent = element.parentElement;
      if (parent === null || !parents.includes(tagOf(parent))) unwrapElement(element);
    }
  }
  for (const element of Array.from(root.querySelectorAll('*'))) {
    cleanAttributes(element);
  }
  for (const span of Array.from(root.querySelectorAll('span'))) {
    if (span.attributes.length === 0) unwrapElement(span);
  }
  wrapInlineRuns(root);
}

/**
 * Retire les `<br>` finaux de chaque bloc scindable, puis les paragraphes vides en tête et
 * en queue. Un paragraphe vide **entre** deux blocs est une ligne blanche voulue (R52-02).
 */
function trimBlocks(root: DocumentFragment): void {
  for (const block of Array.from(root.children)) {
    if (!SPLITTABLE_TAGS.has(tagOf(block))) continue;
    while (block.lastChild && block.lastChild.nodeName === 'BR') {
      block.lastChild.remove();
    }
  }
  const isBlankEdge = (block: Element): boolean =>
    SPLITTABLE_TAGS.has(tagOf(block)) && !hasVisibleContent(block);
  while (root.firstElementChild && isBlankEdge(root.firstElementChild)) {
    root.firstElementChild.remove();
  }
  while (root.lastElementChild && isBlankEdge(root.lastElementChild)) {
    root.lastElementChild.remove();
  }
}

/** Une passe complète : assainissement (qui re-parse), structure, bords, sérialisation. */
function normalizeOnce(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = sanitizeHeaderFooterHtml(html);
  const root = template.content;
  normalizeTree(root);
  trimBlocks(root);
  return Array.from(root.children).some(hasVisibleContent) ? template.innerHTML : '';
}

/**
 * Normalise le HTML d'un champ : assaini par le core d'abord (jamais de `<script>`, de
 * `on*`…), puis `<b>` / `<i>` renommés en `<strong>` / `<em>`, `<div>` renommé en `<p>` ou
 * déballé s'il contient un bloc, balises de structure nues (`<li>`, `<td>`) déballées,
 * `class` retiré et `style` réduit aux déclarations typographiques (sans `inherit`),
 * `<span>` sans attribut déballé, texte et nœuds inline de premier niveau enveloppés dans
 * un `<p>`, `<br>` finaux et paragraphes vides en tête et en queue retirés. Rend `''` quand
 * rien de visible ne reste : c'est la valeur « en-tête retiré ».
 *
 * La valeur est un **point fixe** du parseur HTML : la passe est rejouée tant que
 * re-parser son résultat le change (deux passes suffisent en pratique), si bien que
 * `normalizeFieldHtml(v) === v` et `sanitizeHeaderFooterHtml(v) === v`, et que la vue page
 * affiche exactement la valeur appliquée (R52-01).
 */
export function normalizeFieldHtml(html: string): string {
  let normalized = normalizeOnce(html);
  for (let pass = 1; pass < MAX_NORMALIZE_PASSES; pass += 1) {
    const again = normalizeOnce(normalized);
    if (again === normalized) break;
    normalized = again;
  }
  return normalized;
}
