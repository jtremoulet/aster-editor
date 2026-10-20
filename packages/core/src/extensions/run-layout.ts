import { Extension, type Attribute } from '@tiptap/core';
import { TextStyle } from '@tiptap/extension-text-style';
import { Underline } from '@tiptap/extension-underline';
import type { TagParseRule } from '@tiptap/pm/model';
import type { DecorationStyle } from '../api';
import { formatPt, parsePt, readStyleProperty } from './layout-css';

/** Nom de l'extension qui porte les attributs de run de mise en page. */
export const RUN_LAYOUT_EXTENSION_NAME = 'runLayout';

/** Attribut HTML du nom de style de caractère Word d'un `<span>`. */
export const DOCX_RUN_STYLE_ATTRIBUTE = 'data-docx-run-style';

/** Casses forcées reconnues : `all` = majuscules, `small` = petites capitales. */
export const RUN_CAPS = ['all', 'small'] as const;

export type RunCaps = (typeof RUN_CAPS)[number];

/** Styles de trait des marques `underline` et `strike`. */
export const DECORATION_STYLES: readonly DecorationStyle[] = [
  'solid',
  'double',
  'dotted',
  'dashed',
  'wavy',
];

/** Types de marque qui portent `decorationStyle`. */
export const DECORATED_MARK_TYPES = ['underline', 'strike'] as const;

/** Vrai pour `all` ou `small`. */
export function isCaps(value: unknown): value is RunCaps {
  return typeof value === 'string' && (RUN_CAPS as readonly string[]).includes(value);
}

/** Vrai pour un style de trait du contrat. */
export function isDecorationStyle(value: unknown): value is DecorationStyle {
  return typeof value === 'string' && (DECORATION_STYLES as readonly string[]).includes(value);
}

/**
 * Casse d'un élément depuis son `style` : `text-transform: uppercase` → `all`,
 * `font-variant: small-caps` ou `font-variant-caps: small-caps` → `small`.
 */
export function parseCaps(element: HTMLElement): RunCaps | null {
  if (readStyleProperty(element, 'text-transform')?.toLowerCase() === 'uppercase') {
    return 'all';
  }
  const variant =
    readStyleProperty(element, 'font-variant-caps') ?? readStyleProperty(element, 'font-variant');
  return variant?.toLowerCase().includes('small-caps') ? 'small' : null;
}

/** Style de trait contenu dans une valeur `text-decoration` (raccourci), `null` sans. */
export function decorationStyleFromShorthand(
  value: string | null | undefined,
): DecorationStyle | null {
  if (!value) {
    return null;
  }
  for (const token of value.trim().toLowerCase().split(/\s+/)) {
    if (isDecorationStyle(token)) {
      return token;
    }
  }
  return null;
}

/**
 * Style de trait d'un élément : `text-decoration-style` d'abord, sinon le raccourci
 * `text-decoration: underline double`.
 */
export function parseDecorationStyle(element: HTMLElement): DecorationStyle | null {
  const explicit = readStyleProperty(element, 'text-decoration-style')?.toLowerCase();
  if (isDecorationStyle(explicit)) {
    return explicit;
  }
  return decorationStyleFromShorthand(readStyleProperty(element, 'text-decoration'));
}

/** Attribut `letterSpacingPt` : `letter-spacing: 1pt`. */
const LETTER_SPACING_ATTRIBUTE: Attribute = {
  default: null,
  parseHTML: (element) => parsePt(readStyleProperty(element, 'letter-spacing')),
  renderHTML: (attributes) => {
    const value: unknown = attributes['letterSpacingPt'];
    return typeof value === 'number' && Number.isFinite(value)
      ? { style: `letter-spacing: ${formatPt(value)}` }
      : {};
  },
};

/** Attribut `caps` : `text-transform: uppercase` ou `font-variant: small-caps`. */
const CAPS_ATTRIBUTE: Attribute = {
  default: null,
  parseHTML: parseCaps,
  renderHTML: (attributes) => {
    const caps: unknown = attributes['caps'];
    if (caps === 'all') {
      return { style: 'text-transform: uppercase' };
    }
    return caps === 'small' ? { style: 'font-variant: small-caps' } : {};
  },
};

/** Attribut `docxRunStyle` : `data-docx-run-style`. */
const DOCX_RUN_STYLE: Attribute = {
  default: null,
  parseHTML: (element) => element.getAttribute(DOCX_RUN_STYLE_ATTRIBUTE) || null,
  renderHTML: (attributes) => {
    const value: unknown = attributes['docxRunStyle'];
    return typeof value === 'string' && value !== '' ? { [DOCX_RUN_STYLE_ATTRIBUTE]: value } : {};
  },
};

/** Attribut `decorationStyle` : `text-decoration-style: double`. */
const DECORATION_STYLE_ATTRIBUTE: Attribute = {
  default: null,
  parseHTML: parseDecorationStyle,
  renderHTML: (attributes) => {
    const value: unknown = attributes['decorationStyle'];
    return isDecorationStyle(value) ? { style: `text-decoration-style: ${value}` } : {};
  },
};

/**
 * Extension `RunLayout` : attributs de `RunLayoutAttrs` sur la marque `textStyle`
 * (`letterSpacingPt`, `caps`, `docxRunStyle`) et `decorationStyle` sur `underline` et
 * `strike`. Déclarée après `TextStyleKit` : ses déclarations viennent après `color`,
 * `font-family`… dans le `style` du `<span>`. Les commandes Aster `text.*` sont dans
 * `commands/layout.ts`.
 */
export const RunLayout = Extension.create({
  name: RUN_LAYOUT_EXTENSION_NAME,

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          letterSpacingPt: LETTER_SPACING_ATTRIBUTE,
          caps: CAPS_ATTRIBUTE,
          docxRunStyle: DOCX_RUN_STYLE,
        },
      },
      {
        types: [...DECORATED_MARK_TYPES],
        attributes: { decorationStyle: DECORATION_STYLE_ATTRIBUTE },
      },
    ];
  },
});

/**
 * `TextStyle` d'Aster : celui de Tiptap, qui ne reconnaît qu'un `<span style>`, étendu
 * pour accepter aussi un `<span data-docx-run-style>` sans `style` (style de caractère
 * Word sans propriété directe). Le reste (fusion des `span` imbriqués) est délégué à la
 * règle d'origine.
 */
export const AsterTextStyle = TextStyle.extend({
  parseHTML() {
    const [spanRule] = this.parent?.() ?? [];
    const parentGetAttrs: TagParseRule['getAttrs'] =
      spanRule && 'tag' in spanRule ? (spanRule as TagParseRule).getAttrs : undefined;
    return [
      {
        tag: 'span',
        consuming: false,
        getAttrs: (element: HTMLElement) => {
          if (element.hasAttribute('style')) {
            return parentGetAttrs ? parentGetAttrs(element) : {};
          }
          return element.hasAttribute(DOCX_RUN_STYLE_ATTRIBUTE) ? {} : false;
        },
      },
    ];
  },
});

/**
 * `Underline` d'Aster : celui de Tiptap, dont la règle `text-decoration` lit en plus le
 * style de trait du raccourci (`text-decoration: underline double`). Pour `<u>`, c'est
 * l'attribut `decorationStyle` de `RunLayout` qui lit l'élément.
 */
export const AsterUnderline = Underline.extend({
  parseHTML() {
    return [
      { tag: 'u' },
      {
        style: 'text-decoration',
        consuming: false,
        getAttrs: (style: string) =>
          style.includes('underline')
            ? { decorationStyle: decorationStyleFromShorthand(style) }
            : false,
      },
    ];
  },
});
