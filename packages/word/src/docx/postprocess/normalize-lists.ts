import { hasTag, isElement, wrapInlineChildren } from './dom-utils';
import type { PostprocessPass } from './types';

/** Blocs autorisés directement dans un `<li>` par le schéma Tiptap. */
const LI_BLOCK_TAGS: readonly string[] = [
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
];

/**
 * Déplace une sous-liste sortie au mauvais niveau (`<ul><li>a</li><ul>…</ul></ul>`)
 * dans le `<li>` qui la précède. Sans `<li>` précédent, on en crée un vide pour
 * rester valide.
 */
function reparentStrayLists(list: Element, doc: Document): void {
  for (const child of Array.from(list.children)) {
    if (!hasTag(child, 'ul', 'ol')) continue;
    let previous = child.previousElementSibling;
    if (!isElement(previous, 'li')) {
      previous = doc.createElement('li');
      list.insertBefore(previous, child);
    }
    previous.appendChild(child);
  }
}

/**
 * mammoth sort `<li>texte<ul>…</ul></li>` : le texte inline est enveloppé dans un `<p>`
 * pour coller au schéma Tiptap (`listItem` = `paragraph block*`). Les sous-listes mal
 * placées sont rattachées au `<li>` précédent.
 */
export const normalizeLists: PostprocessPass = (doc) => {
  for (const list of Array.from(doc.querySelectorAll('ul, ol'))) {
    reparentStrayLists(list, doc);
  }
  for (const item of Array.from(doc.querySelectorAll('li'))) {
    wrapInlineChildren(item, LI_BLOCK_TAGS);
    // Le schéma Tiptap exige `paragraph block*` : un li qui ouvre sur une sous-liste reçoit un p vide.
    if (!isElement(item.firstChild, 'p'))
      item.insertBefore(doc.createElement('p'), item.firstChild);
  }
};
