import { collectTextNodes, isBlank, isBlockElement, selectAll } from '../dom-utils';
import type { PastePass } from '../types';

/** On respecte les espaces dans le code préformaté, et seulement là. */
const PRESERVED_TAGS: ReadonlySet<string> = new Set(['pre']);

/** Marques inline dont on sort les espaces de bord. Les liens gardent les leurs. */
const INLINE_MARKS = 'strong, em, u, s, sub, sup, mark, code';

/** Blocs dont le texte est trimé aux bords. */
const TRIMMED_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, div';

/** Conteneurs qui n'acceptent aucun texte direct : tout blanc y est de l'indentation. */
const CONTAINER_ONLY: ReadonlySet<string> = new Set([
  'ul',
  'ol',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
]);

/** Vrai si le nœud texte ne sépare que des blocs : il n'a aucune valeur et sera retiré. */
function isInterBlockWhitespace(text: Text): boolean {
  if (!isBlank(text.data)) {
    return false;
  }
  const parent = text.parentElement;
  if (!parent || CONTAINER_ONLY.has(parent.localName)) {
    return true;
  }
  const previous = text.previousSibling;
  const next = text.nextSibling;
  if (isBlockElement(previous) || isBlockElement(next)) {
    return true;
  }
  // En bord de bloc, le blanc est de l'indentation ; en bord d'inline (`<span> </span>`),
  // c'est un espace entre deux mots, que la fusion des nœuds texte réduira ensuite.
  return isBlockElement(parent) && (previous === null || next === null);
}

/**
 * Normalise les espaces :
 * - les `&nbsp;` que Word met entre les mots deviennent des espaces ordinaires ;
 * - les suites d'espaces (dont les `mso-spacerun` déjà déballés) se réduisent à une ;
 * - le texte est trimé en début et fin de chaque bloc ;
 * - les nœuds blancs entre deux blocs (indentation du HTML Word) disparaissent.
 * Le contenu des `<pre>` est laissé intact.
 */
export const normalizeWhitespace: PastePass = (doc) => {
  const body = doc.body;
  collapseRuns(body);
  for (const mark of selectAll(body, INLINE_MARKS)) {
    hoistEdgeSpaces(doc, mark);
  }
  // Les espaces sortis des marques sont désormais adjacents à d'autres textes.
  collapseRuns(body);
  for (const text of collectTextNodes(body, PRESERVED_TAGS)) {
    if (isInterBlockWhitespace(text)) {
      text.parentNode?.removeChild(text);
    }
  }
  const blocks = [body, ...Array.from(body.querySelectorAll(TRIMMED_BLOCKS))];
  for (const block of blocks) {
    const texts = collectTextNodes(block, PRESERVED_TAGS);
    const first = texts[0];
    const last = texts[texts.length - 1];
    if (first && touchesBlockEdge(first, block, 'start')) {
      first.data = first.data.replace(/^ +/, '');
    }
    if (last && touchesBlockEdge(last, block, 'end')) {
      last.data = last.data.replace(/ +$/, '');
    }
  }
  for (const text of collectTextNodes(body, PRESERVED_TAGS)) {
    if (text.data === '') {
      text.parentNode?.removeChild(text);
    }
  }
};

/**
 * Vrai si rien de visible ne sépare le nœud texte du bord du bloc : en remontant vers le
 * bloc, aucun ancêtre n'a de frère de ce côté, hormis un `<br>` qui ouvre une ligne.
 * Un texte qui suit ou précède une image inline n'est pas en bord de bloc : l'espace
 * qui le sépare de l'image est significatif (W-6).
 */
function touchesBlockEdge(text: Text, block: Element, side: 'start' | 'end'): boolean {
  let node: Node = text;
  while (node !== block) {
    const sibling = side === 'start' ? node.previousSibling : node.nextSibling;
    if (sibling !== null && !(sibling.nodeType === 1 && (sibling as Element).localName === 'br')) {
      return false;
    }
    const parent = node.parentNode;
    if (!parent) {
      return false;
    }
    node = parent;
  }
  return true;
}

/** Fusionne les nœuds texte adjacents (déballages de spans) puis réduit chaque suite de blancs à un espace. */
function collapseRuns(body: HTMLElement): void {
  body.normalize();
  for (const text of collectTextNodes(body, PRESERVED_TAGS)) {
    const collapsed = text.data.replace(/[\s\u00a0]+/g, ' ');
    if (collapsed !== text.data) {
      text.data = collapsed;
    }
  }
}

/**
 * Sort les espaces de bord d'une marque inline : `<em>a</em><u> b</u>` → `<em>a</em> <u>b</u>`.
 * Google Docs et Word rattachent volontiers l'espace entre deux mots à la mise en forme
 * du second, ce qui donne des marques qui commencent par un blanc.
 */
function hoistEdgeSpaces(doc: Document, mark: Element): void {
  const texts = collectTextNodes(mark, PRESERVED_TAGS);
  const first = texts[0];
  const last = texts[texts.length - 1];
  if (first && first.data.startsWith(' ')) {
    first.data = first.data.slice(1);
    mark.parentNode?.insertBefore(doc.createTextNode(' '), mark);
  }
  if (last && last.data.endsWith(' ')) {
    last.data = last.data.slice(0, -1);
    mark.parentNode?.insertBefore(doc.createTextNode(' '), mark.nextSibling);
  }
}
