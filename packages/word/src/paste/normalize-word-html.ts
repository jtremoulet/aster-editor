import { cleanInlineStyles } from './passes/clean-inline-styles.js';
import { collapseEmptyParagraphs } from './passes/collapse-empty-paragraphs.js';
import { normalizeHeadings } from './passes/normalize-headings.js';
import { normalizeTables } from './passes/normalize-tables.js';
import { normalizeWhitespace } from './passes/normalize-whitespace.js';
import { parseListFormats, rebuildLists } from './passes/rebuild-lists.js';
import {
  stripConditionalComments,
  stripConditionalCommentsText,
} from './passes/strip-conditional-comments.js';
import { stripOfficeNamespaces } from './passes/strip-office-namespaces.js';
import { wrapVariables } from './passes/variables.js';
import { resolvePasteOptions, type PastePass, type WordPasteOptions } from './types.js';

/**
 * Ordre des passes, celui documenté dans `docs/ARCHITECTURE.md`. `wrapVariables` ferme
 * la marche : les textes adjacents ont été fusionnés, un `{{` coupé sur deux spans est recollé.
 */
export const WORD_PASSES: readonly PastePass[] = [
  stripConditionalComments,
  stripOfficeNamespaces,
  rebuildLists,
  normalizeHeadings,
  cleanInlineStyles,
  normalizeTables,
  collapseEmptyParagraphs,
  normalizeWhitespace,
  wrapVariables,
];

const START_FRAGMENT = '<!--StartFragment-->';
const END_FRAGMENT = '<!--EndFragment-->';

/**
 * Isole le fragment réellement copié. Word et Chrome balisent la sélection avec
 * `StartFragment`/`EndFragment` ; tout ce qui est autour (`<head>`, `<style>`, corps
 * complet) n'est que de l'enrobage. Sans marqueurs, on garde tout le HTML.
 *
 * Un `StartFragment` sans `EndFragment` signale un presse-papier tronqué : une balise
 * ouverte et jamais fermée en fin de chaîne (`…<` ou `…<!--EndFr`) deviendrait du texte
 * visible, on la retire (W-12). Sans regex `/<[^>]*$/`, quadratique sur `<<<<…>`.
 */
export function extractFragment(html: string): string {
  const start = html.indexOf(START_FRAGMENT);
  if (start === -1) {
    return html;
  }
  const end = html.indexOf(END_FRAGMENT);
  if (end !== -1) {
    return end < start ? html : html.slice(start + START_FRAGMENT.length, end);
  }
  const lastOpen = html.lastIndexOf('<');
  return lastOpen !== -1 && html.indexOf('>', lastOpen) === -1 ? html.slice(0, lastOpen) : html;
}

/**
 * Parseur par défaut : le `DOMParser` de l'environnement (navigateur, ou jsdom en test).
 * Résolu à l'appel et non à l'import, pour que le module se charge sans DOM.
 */
export function defaultParse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * Nettoie le HTML du presse-papier Word en HTML sémantique prêt pour le schéma Aster.
 * Fonction pure : le seul effet est sur le `Document` fraîchement parsé, jamais sur un
 * `document` global. Les formats de liste sont lus dans le `<style>` du HTML complet
 * avant extraction du fragment, car Word les déclare dans le `<head>`.
 */
export function normalizeWordHtml(html: string, options: WordPasteOptions = {}): string {
  if (typeof html !== 'string' || html.length === 0) {
    return '';
  }
  const parse = options.parse ?? defaultParse;
  const cleaned = stripConditionalCommentsText(html);
  const resolved = resolvePasteOptions(options, parseListFormats(cleaned));
  const doc = parse(extractFragment(cleaned));
  for (const pass of WORD_PASSES) {
    pass(doc, resolved);
  }
  return doc.body.innerHTML.trim();
}
