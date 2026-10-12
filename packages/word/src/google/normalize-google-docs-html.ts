import { parseStyle, selectAll, unwrap } from '../paste/dom-utils';
import { defaultParse, extractFragment } from '../paste/normalize-word-html';
import { cleanInlineStyles } from '../paste/passes/clean-inline-styles';
import { collapseEmptyParagraphs } from '../paste/passes/collapse-empty-paragraphs';
import { normalizeTables } from '../paste/passes/normalize-tables';
import { normalizeWhitespace } from '../paste/passes/normalize-whitespace';
import { stripConditionalComments } from '../paste/passes/strip-conditional-comments';
import { stripOfficeNamespaces } from '../paste/passes/strip-office-namespaces';
import { resolvePasteOptions, type PastePass, type WordPasteOptions } from '../paste/types';

/**
 * Retire l'enveloppe `<b style="font-weight:normal" id="docs-internal-guid-…">` : Google
 * l'utilise comme simple conteneur, pas comme mise en gras. Tout `<b>` déclaré
 * `font-weight:normal` est traité de la même façon, par sécurité.
 */
const unwrapGoogleContainer: PastePass = (doc) => {
  for (const element of selectAll(
    doc.body,
    'b[id^="docs-internal-guid"], b[style*="font-weight"]',
  )) {
    const weight = parseStyle(element.getAttribute('style')).find(
      ([name]) => name === 'font-weight',
    );
    if (element.id.startsWith('docs-internal-guid') || weight?.[1] === 'normal') {
      unwrap(element);
    }
  }
};

/**
 * Google imbrique les sous-listes directement dans le `<ul>` parent
 * (`<ul><li>a</li><ul><li>b</li></ul></ul>`), ce que ProseMirror refuse. On déplace
 * chaque liste enfant dans le `<li>` qui la précède, ou dans un `<li>` neuf si elle
 * ouvre la liste.
 */
const nestOrphanSublists: PastePass = (doc) => {
  for (const list of selectAll(doc.body, 'ul > ul, ul > ol, ol > ul, ol > ol')) {
    const previous = list.previousElementSibling;
    if (previous && previous.localName === 'li') {
      previous.appendChild(list);
    } else {
      const item = doc.createElement('li');
      list.parentNode?.insertBefore(item, list);
      item.appendChild(list);
    }
  }
};

/** Pipeline Google Docs : plus court que Word, pas de listes à reconstruire. */
const GOOGLE_PASSES: readonly PastePass[] = [
  stripConditionalComments,
  stripOfficeNamespaces,
  unwrapGoogleContainer,
  nestOrphanSublists,
  cleanInlineStyles,
  normalizeTables,
  collapseEmptyParagraphs,
  normalizeWhitespace,
];

/**
 * Nettoie le HTML du presse-papier Google Docs. Google produit du HTML déjà structuré
 * (`h1`, `ul`, `a`) mais noie la mise en forme dans des styles inline : on retire
 * l'enveloppe interne, on traduit `font-weight:700` / `font-style:italic` /
 * `text-decoration:underline` en `strong` / `em` / `u`, on réimbrique les sous-listes et
 * on jette tous les `style`, `dir`, `role`, `aria-*`. Les `<li>` gardent leur `<p>`,
 * le schéma Aster l'accepte. Fonction pure, même contrat que `normalizeWordHtml`.
 */
export function normalizeGoogleDocsHtml(html: string, options: WordPasteOptions = {}): string {
  if (typeof html !== 'string' || html.length === 0) {
    return '';
  }
  const parse = options.parse ?? defaultParse;
  const resolved = resolvePasteOptions(options);
  const doc = parse(extractFragment(html));
  for (const pass of GOOGLE_PASSES) {
    pass(doc, resolved);
  }
  return doc.body.innerHTML.trim();
}
