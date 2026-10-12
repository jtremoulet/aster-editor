import { isEmptyBlock } from './dom-utils';
import type { PostprocessPass } from './types';

/**
 * Supprime les `<p>` vides, sauf dans les cellules et les `<li>` où le schéma Tiptap
 * exige au moins un bloc. Word en produit beaucoup pour espacer visuellement.
 */
export const stripEmptyParagraphs: PostprocessPass = (doc) => {
  for (const p of Array.from(doc.querySelectorAll('p'))) {
    if (p.closest('td, th, li')) continue;
    if (isEmptyBlock(p)) p.parentNode?.removeChild(p);
  }
};
