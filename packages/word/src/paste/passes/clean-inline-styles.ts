import {
  parseStyle,
  renameElement,
  selectAll,
  serializeStyle,
  unwrap,
  wrapChildren,
} from '../dom-utils';
import type { PastePass, ResolvedPasteOptions } from '../types';

/** Balises gérées par `normalizeTables`, que cette passe laisse intactes. */
const TABLE_TAGS: ReadonlySet<string> = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'colgroup',
  'col',
  'caption',
]);

/** Attributs conservés par balise ; `style` est traité à part. Tout le reste tombe. */
const KEPT_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  ol: ['start', 'type'],
};

/** Balises de présentation héritées, renommées en équivalent sémantique. */
const RENAMED_TAGS: Readonly<Record<string, string>> = {
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
  ins: 'u',
};

/** Couleurs « par défaut » de Word, sans valeur sémantique même avec `keepColors`. */
const DEFAULT_COLORS: ReadonlySet<string> = new Set(['windowtext', 'black', '#000000', '#000']);

/** Alignements qui méritent d'être conservés ; `left` est la valeur par défaut. */
const ALIGNMENTS: ReadonlySet<string> = new Set(['center', 'right', 'justify']);

interface SemanticHints {
  strong: boolean;
  em: boolean;
  u: boolean;
  s: boolean;
  sub: boolean;
  sup: boolean;
  mark: boolean;
}

/**
 * Filtre un attribut `style` : ne garde que `text-align` et `color` selon les options,
 * et relève au passage les propriétés à traduire en balises sémantiques.
 */
function filterStyle(
  element: Element,
  options: ResolvedPasteOptions,
): { style: string | null; hints: SemanticHints } {
  const hints: SemanticHints = {
    strong: false,
    em: false,
    u: false,
    s: false,
    sub: false,
    sup: false,
    mark: false,
  };
  const kept: Array<[string, string]> = [];
  const declarations = parseStyle(element.getAttribute('style'));
  const align = element.getAttribute('align')?.toLowerCase();
  if (align && !declarations.some(([name]) => name === 'text-align')) {
    declarations.push(['text-align', align]);
  }
  // Dans un lien (ou sur le lien lui-même), couleur et soulignement ne sont que le rendu
  // par défaut du lien (Word comme Google Docs les posent sur un span interne) : on les ignore.
  const insideLink = element.closest('a') !== null;
  for (const [name, rawValue] of declarations) {
    const value = rawValue.toLowerCase();
    switch (name) {
      case 'font-weight':
        hints.strong = value === 'bold' || value === 'bolder' || Number.parseInt(value, 10) >= 600;
        break;
      case 'font-style':
        hints.em = value === 'italic' || value === 'oblique';
        break;
      case 'text-decoration':
      case 'text-decoration-line':
        hints.u = hints.u || (!insideLink && value.includes('underline'));
        hints.s = hints.s || value.includes('line-through');
        break;
      case 'vertical-align':
        hints.sub = value === 'sub';
        hints.sup = value === 'super';
        break;
      case 'mso-highlight':
        hints.mark = value !== 'none';
        break;
      case 'text-align':
        if (options.keepAlignment && ALIGNMENTS.has(value)) {
          kept.push([name, value]);
        }
        break;
      case 'color':
        if (options.keepColors && !insideLink && !DEFAULT_COLORS.has(value)) {
          kept.push([name, rawValue]);
        }
        break;
      default:
        break;
    }
  }
  return { style: serializeStyle(kept), hints };
}

/**
 * Enveloppe le contenu d'un span dans les balises sémantiques détectées. L'ordre va du
 * plus interne au plus externe, chaque enveloppe englobant la précédente : on obtient
 * `<strong><em><u>…</u></em></strong>`.
 */
function applySemanticHints(doc: Document, element: Element, hints: SemanticHints): void {
  const innermostFirst: Array<[keyof SemanticHints, string]> = [
    ['sup', 'sup'],
    ['sub', 'sub'],
    ['s', 's'],
    ['u', 'u'],
    ['em', 'em'],
    ['strong', 'strong'],
    ['mark', 'mark'],
  ];
  for (const [hint, tag] of innermostFirst) {
    if (hints[hint]) {
      wrapChildren(doc, element, tag);
    }
  }
}

function cleanAttributes(element: Element, style: string | null): void {
  const kept = KEPT_ATTRIBUTES[element.localName] ?? [];
  for (const name of Array.from(element.attributes, (attribute) => attribute.name)) {
    if (!kept.includes(name)) {
      element.removeAttribute(name);
    }
  }
  if (style) {
    element.setAttribute('style', style);
  }
}

/**
 * Nettoie les styles inline de Word et traduit ce qui a un sens en balises :
 * - jette `mso-*`, polices, tailles, interlignes, marges, retraits, fonds ;
 * - `font-weight:bold` → `strong`, `font-style:italic` → `em`, `underline` → `u`,
 *   `line-through` → `s`, `vertical-align:sub/super` → `sub`/`sup`, `mso-highlight` → `mark` ;
 * - `color` conservé seulement avec `keepColors` (et jamais le noir par défaut) ;
 * - `text-align` conservé seulement avec `keepAlignment` (vrai par défaut), `align=` inclus ;
 * - `b`/`i`/`strike` renommés en `strong`/`em`/`s` ;
 * - `class`, `lang`, `width`/`height` de bloc et tous les autres attributs tombent ;
 * - les `span` et `font` sans attribut restant sont déballés.
 * Les balises de table sont laissées à `normalizeTables`, qui a besoin de leurs styles.
 */
export const cleanInlineStyles: PastePass = (doc, options) => {
  for (const element of selectAll(doc.body, Object.keys(RENAMED_TAGS).join(','))) {
    renameElement(doc, element, RENAMED_TAGS[element.localName] ?? 'span');
  }
  for (const element of selectAll(doc.body, '*')) {
    if (TABLE_TAGS.has(element.localName)) {
      continue;
    }
    if (element.localName === 'font') {
      const color = element.getAttribute('color');
      if (color) {
        element.setAttribute('style', `color:${color};${element.getAttribute('style') ?? ''}`);
      }
    }
    const { style, hints } = filterStyle(element, options);
    cleanAttributes(element, style);
    if (element.localName === 'span' || element.localName === 'font') {
      applySemanticHints(doc, element, hints);
      const span = element.localName === 'font' ? renameElement(doc, element, 'span') : element;
      if (span.attributes.length === 0) {
        unwrap(span);
      }
    }
  }
};
