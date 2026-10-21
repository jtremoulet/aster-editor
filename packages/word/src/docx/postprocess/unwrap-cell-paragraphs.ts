import { isElement, isIgnorableNode, wrapInlineChildren } from './dom-utils.js';
import type { PostprocessPass } from './types.js';

/** Blocs que Tiptap accepte directement dans une cellule. */
const CELL_BLOCK_TAGS: readonly string[] = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'table',
  'hr',
];

/**
 * Garantit qu'une cellule contient toujours au moins un bloc. Le schéma Tiptap attend
 * des blocs dans `td`/`th`, donc on ne déballe **pas** le `<p>` unique : on l'y laisse.
 * En revanche une cellule vide reçoit un `<p></p>`, et du texte inline nu est enveloppé.
 */
export const unwrapCellParagraphs: PostprocessPass = (doc) => {
  for (const cell of Array.from(doc.querySelectorAll('td, th'))) {
    const meaningful = Array.from(cell.childNodes).filter((node) => !isIgnorableNode(node));
    if (meaningful.length === 0) {
      while (cell.firstChild) cell.removeChild(cell.firstChild);
      cell.appendChild(doc.createElement('p'));
      continue;
    }
    if (meaningful.some((node) => !isElement(node, ...CELL_BLOCK_TAGS))) {
      wrapInlineChildren(cell, CELL_BLOCK_TAGS);
    }
  }
};
