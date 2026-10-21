import { footnotes } from './footnotes.js';
import { normalizeImages } from './normalize-images.js';
import { normalizeLists } from './normalize-lists.js';
import { normalizeTables } from './normalize-tables.js';
import { stripEmptyParagraphs } from './strip-empty-paragraphs.js';
import type { PostprocessContext, PostprocessPass } from './types.js';
import { unwrapCellParagraphs } from './unwrap-cell-paragraphs.js';

/**
 * Passes dans l'ordre d'application. `footnotes` d'abord, car elle peut supprimer une
 * liste que `normalizeLists` n'a alors pas besoin de traiter ; `stripEmptyParagraphs`
 * en dernier, après que les autres passes ont pu créer des `<p>` de structure.
 */
export const POSTPROCESS_PASSES: readonly PostprocessPass[] = [
  footnotes,
  normalizeTables,
  unwrapCellParagraphs,
  normalizeLists,
  normalizeImages,
  stripEmptyParagraphs,
];

/**
 * Applique toutes les passes sur le document, en place, puis les passes `extra`
 * construites par l'appelant (variables : elles dépendent de ce que le prétraitement a
 * collecté). Elles viennent en dernier : elles ne font que poser des puces dans le texte
 * d'un HTML déjà structuré.
 */
export function runPostprocess(
  doc: Document,
  ctx: PostprocessContext,
  extra: readonly PostprocessPass[] = [],
): void {
  for (const pass of POSTPROCESS_PASSES) pass(doc, ctx);
  for (const pass of extra) pass(doc, ctx);
}
