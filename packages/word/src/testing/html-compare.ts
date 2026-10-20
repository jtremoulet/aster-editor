import type { PastePass, ResolvedPasteOptions, WordPasteOptions } from '../paste/types';
import { resolvePasteOptions } from '../paste/types';

/** Balises de bloc autour desquelles les blancs n'ont aucun sens dans la comparaison. */
const BLOCK_BOUNDARY =
  /\s*(<\/?(?:p|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|blockquote|div|br|hr)\b[^>]*>)\s*/gi;

/**
 * Rend deux HTML comparables malgré l'indentation des fichiers `expected/` : les suites
 * de blancs deviennent un espace, et tout blanc collé à une balise de bloc disparaît.
 * Les espaces entre balises inline (`</em> <u>`) sont conservés, ils sont significatifs.
 */
export function normalizeHtmlForCompare(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/\s+>/g, '>').replace(BLOCK_BOUNDARY, '$1').trim();
}

/** Parse un fragment HTML avec le `DOMParser` de jsdom, comme le ferait le navigateur. */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * Applique une passe isolée sur un mini HTML et renvoie le `body` sérialisé. C'est le
 * harnais des tests unitaires par passe : une entrée courte, une sortie lisible.
 */
export function runPass(
  html: string,
  pass: PastePass,
  options: WordPasteOptions = {},
  listFormats?: ResolvedPasteOptions['listFormats'],
): string {
  const doc = parseHtml(html);
  pass(doc, resolvePasteOptions(options, listFormats));
  return doc.body.innerHTML;
}
