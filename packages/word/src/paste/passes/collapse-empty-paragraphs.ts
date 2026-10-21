import { isBlank, selectAll } from '../dom-utils.js';
import type { PastePass } from '../types.js';

/** Balises qui donnent un contenu à un paragraphe même sans texte. */
const CONTENT_TAGS = 'img, table, hr, iframe, video, audio';

/** Vrai si le paragraphe n'apporte rien : espaces, insécables et `<br>` seulement. */
function isEmptyParagraph(paragraph: Element): boolean {
  return isBlank(paragraph.textContent) && paragraph.querySelector(CONTENT_TAGS) === null;
}

/** Retire les `<br>` en fin de bloc : Word en laisse derrière ses sauts de ligne forcés. */
function trimTrailingBreaks(block: Element): void {
  let last = block.lastChild;
  while (last) {
    if (last.nodeType === 3 && isBlank(last.textContent)) {
      const previous = last.previousSibling;
      block.removeChild(last);
      last = previous;
      continue;
    }
    if (last.nodeType === 1 && (last as Element).localName === 'br') {
      const previous = last.previousSibling;
      block.removeChild(last);
      last = previous;
      continue;
    }
    break;
  }
}

/**
 * Supprime les paragraphes vides que Word insère comme espacement (`<p><o:p>&nbsp;</o:p></p>`,
 * `<p>&nbsp;</p>`, `<p><br></p>`), ainsi que les `<br>` orphelins directement sous le corps
 * et les `<br>` en fin de bloc. Si tout le document se vide, on garde un `<p></p>` :
 * un collage ne doit jamais produire un document sans bloc.
 */
export const collapseEmptyParagraphs: PastePass = (doc) => {
  const body = doc.body;
  for (const block of selectAll(body, 'p, h1, h2, h3, h4, h5, h6, li, td, th')) {
    trimTrailingBreaks(block);
  }
  let removed = 0;
  for (const paragraph of selectAll(body, 'p')) {
    if (isEmptyParagraph(paragraph)) {
      paragraph.parentNode?.removeChild(paragraph);
      removed += 1;
    }
  }
  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType === 1 && (child as Element).localName === 'br') {
      body.removeChild(child);
    }
  }
  if (removed > 0 && body.children.length === 0 && isBlank(body.textContent)) {
    body.textContent = '';
    body.appendChild(doc.createElement('p'));
  }
};
