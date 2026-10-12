import { getStyleProperty, isBlank, parseStyle, selectAll, unwrap } from '../paste/dom-utils';
import { defaultParse, extractFragment } from '../paste/normalize-word-html';
import { cleanInlineStyles } from '../paste/passes/clean-inline-styles';
import { collapseEmptyParagraphs } from '../paste/passes/collapse-empty-paragraphs';
import { normalizeTables } from '../paste/passes/normalize-tables';
import { normalizeWhitespace } from '../paste/passes/normalize-whitespace';
import { stripConditionalComments } from '../paste/passes/strip-conditional-comments';
import { stripOfficeNamespaces } from '../paste/passes/strip-office-namespaces';
import { resolvePasteOptions, type PastePass, type WordPasteOptions } from '../paste/types';

/** `list-style-type` que Google pose sur chaque `<li>`, traduit en attribut `type` du `<ol>`. */
const LIST_STYLE_TYPES: Readonly<Record<string, string>> = {
  'lower-alpha': 'a',
  'lower-latin': 'a',
  'upper-alpha': 'A',
  'upper-latin': 'A',
  'lower-roman': 'i',
  'upper-roman': 'I',
};

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

/**
 * Google ne pose pas `type` sur le `<ol>` mais `list-style-type:lower-alpha` sur chaque
 * `<li>`. On remonte le premier format rencontré sur la liste avant que
 * `cleanInlineStyles` ne jette les styles des items (W-11).
 */
const hoistListStyleType: PastePass = (doc) => {
  for (const item of selectAll(doc.body, 'ol > li[style*="list-style-type"]')) {
    const value = getStyleProperty(item, 'list-style-type')?.toLowerCase() ?? '';
    const type = LIST_STYLE_TYPES[value];
    const list = item.parentElement;
    if (type !== undefined && list && !list.hasAttribute('type')) {
      list.setAttribute('type', type);
    }
  }
};

/**
 * Google enveloppe chaque table dans un `<div dir="ltr" align="left">`. Une fois ses
 * attributs nettoyés, un `<div>` nu qui ne contient qu'une table n'apporte rien : on le
 * déballe (W-11). Un `<div>` qui a gardé un alignement est laissé tel quel.
 */
const unwrapTableWrappers: PastePass = (doc) => {
  for (const div of selectAll(doc.body, 'div')) {
    const onlyTable = div.children.length === 1 && div.firstElementChild?.localName === 'table';
    const noText = Array.from(div.childNodes).every(
      (node) => node.nodeType !== 3 || isBlank(node.textContent),
    );
    if (div.attributes.length === 0 && onlyTable && noText) {
      unwrap(div);
    }
  }
};

/** Pipeline Google Docs : plus court que Word, pas de listes à reconstruire. */
const GOOGLE_PASSES: readonly PastePass[] = [
  stripConditionalComments,
  stripOfficeNamespaces,
  unwrapGoogleContainer,
  nestOrphanSublists,
  hoistListStyleType,
  cleanInlineStyles,
  unwrapTableWrappers,
  normalizeTables,
  collapseEmptyParagraphs,
  normalizeWhitespace,
];

/**
 * Nettoie le HTML du presse-papier Google Docs. Google produit du HTML déjà structuré
 * (`h1`, `ul`, `a`) mais noie la mise en forme dans des styles inline : on retire
 * l'enveloppe interne, on traduit `font-weight:700` / `font-style:italic` /
 * `text-decoration:underline` en `strong` / `em` / `u`, on réimbrique les sous-listes,
 * on remonte `list-style-type` en `type` de `<ol>`, on déballe le `<div>` autour des
 * tables et on jette tous les `style`, `dir`, `role`, `aria-*`. Les `<li>` gardent leur
 * `<p>`, le schéma Aster l'accepte. Fonction pure, même contrat que `normalizeWordHtml`.
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
