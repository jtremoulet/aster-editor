import { renameElement, selectAll } from '../dom-utils.js';
import type { PastePass } from '../types.js';

/** Classes Word de titre, du plus haut niveau au plus bas. */
const HEADING_CLASS = /^Mso(?:Title|Heading([1-9]))$/;

/** Classes Word qui expriment une citation (style « Citation » et « Citation intense »). */
const QUOTE_CLASS = /^Mso(?:Intense)?Quote$/;

function classesOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

/** Niveau de titre déduit de la classe Word, `undefined` si ce n'est pas un titre. */
function headingLevel(element: Element): number | undefined {
  for (const className of classesOf(element)) {
    const match = HEADING_CLASS.exec(className);
    if (match) {
      return match[1] ? Math.min(6, Number.parseInt(match[1], 10)) : 1;
    }
  }
  return undefined;
}

function isQuote(element: Element): boolean {
  return classesOf(element).some((className) => QUOTE_CLASS.test(className));
}

/**
 * Traduit les styles de paragraphe Word en blocs sémantiques :
 * - `MsoTitle` → `h1`, `MsoHeading1..6` → `h1..h6` (`h7+` plafonné à `h6`) ;
 * - les `<h1>`-`<h6>` que Word émet déjà sont conservés tels quels ;
 * - `MsoQuote` / `MsoIntenseQuote` → `<blockquote>` ; des citations consécutives
 *   partagent le même `<blockquote>` pour rendre un paragraphe multiple fidèle ;
 * - `MsoListParagraph` sans `mso-list` reste un `<p>` ordinaire, la classe tombe
 *   dans `cleanInlineStyles`.
 */
export const normalizeHeadings: PastePass = (doc) => {
  for (const paragraph of selectAll(doc.body, 'p[class]')) {
    const level = headingLevel(paragraph);
    if (level !== undefined) {
      renameElement(doc, paragraph, `h${level}`);
      continue;
    }
    if (isQuote(paragraph)) {
      const previous = paragraph.previousElementSibling;
      const quote =
        previous && previous.localName === 'blockquote'
          ? previous
          : doc.createElement('blockquote');
      if (quote !== previous) {
        paragraph.parentNode?.insertBefore(quote, paragraph);
      }
      paragraph.removeAttribute('class');
      quote.appendChild(paragraph);
    }
  }
};
