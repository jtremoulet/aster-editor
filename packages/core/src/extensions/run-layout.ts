import {
  Extension,
  Mark,
  flattenExtensions,
  fromString,
  type Attribute,
  type Attributes,
  type Editor,
  type ExtensionAttribute,
} from '@tiptap/core';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Underline } from '@tiptap/extension-underline';
import { StarterKit } from '@tiptap/starter-kit';
import type { TagParseRule } from '@tiptap/pm/model';
import type { DecorationStyle } from '../api/index.js';
import {
  formatPt,
  isLayoutNumber,
  normalizeColor,
  parsePt,
  parseStyleDeclarations,
  readStyleProperty,
} from './layout-css.js';

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

/** Attribut `letterSpacingPt` : `letter-spacing: 1pt`. Hors bornes (`1e307`) : rien d'émis. */
const LETTER_SPACING_ATTRIBUTE: Attribute = {
  default: null,
  parseHTML: (element) => parsePt(readStyleProperty(element, 'letter-spacing')),
  renderHTML: (attributes) => {
    const value: unknown = attributes['letterSpacingPt'];
    return isLayoutNumber(value) ? { style: `letter-spacing: ${formatPt(value)}` } : {};
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

/** Nom de la marque de style de texte de Tiptap. */
const TEXT_STYLE_MARK_NAME = 'textStyle';

/**
 * Attributs portés par `textStyle` dans un éditeur donné (ceux de `TextStyleKit`, de
 * `RunLayout` et de l'intégrateur). `extensionManager.attributes` les recalcule à chaque
 * lecture en appelant tous les `addAttributes` : on les fige par éditeur, le jeu
 * d'extensions ne changeant pas après la construction.
 */
const textStyleAttributesCache = new WeakMap<Editor, readonly ExtensionAttribute[]>();

function textStyleAttributes(editor: Editor): readonly ExtensionAttribute[] {
  const cached = textStyleAttributesCache.get(editor);
  if (cached) {
    return cached;
  }
  const attributes = editor.extensionManager.attributes.filter(
    (attribute) => attribute.type === TEXT_STYLE_MARK_NAME,
  );
  textStyleAttributesCache.set(editor, attributes);
  return attributes;
}

/**
 * Vrai si au moins un attribut de `textStyle` se résout sur l'élément, en rejouant ce que
 * Tiptap fera juste après (`parseHTML` de l'attribut, sinon l'attribut HTML du même nom).
 * Une chaîne vide compte pour « absent » : c'est ce que `color` de Tiptap rend quand le
 * `style` ne porte pas de couleur, et ce que `removeEmptyTextStyle` tient pour vide.
 */
function resolvesTextStyleAttribute(editor: Editor, element: HTMLElement): boolean {
  return textStyleAttributes(editor).some(({ name, attribute }) => {
    const value: unknown = attribute.parseHTML
      ? attribute.parseHTML(element)
      : fromString(element.getAttribute(name));
    return value !== null && value !== undefined && value !== '';
  });
}

/** Propriétés CSS de `textStyle` dont la valeur est une couleur du contrat. */
const COLOR_PROPERTIES: readonly string[] = ['color', 'background-color'];

/**
 * Réécrit les couleurs d'un `style` rendu en `#rrggbb` minuscules (`#FF0000`,
 * `rgb(255, 0, 0)` → `#ff0000`) ; une valeur que `normalizeColor` ne comprend pas
 * (`var(--x)`) reste telle quelle, l'ordre des déclarations est conservé.
 */
export function normalizeStyleColors(style: string): string {
  const declarations: string[] = [];
  for (const [property, value] of parseStyleDeclarations(style)) {
    const normalized = COLOR_PROPERTIES.includes(property) ? normalizeColor(value) : null;
    declarations.push(`${property}: ${normalized ?? value}`);
  }
  return declarations.join('; ');
}

/**
 * `TextStyle` d'Aster : celui de Tiptap, qui ne reconnaît qu'un `<span style>`, avec
 * deux différences :
 *
 * - un `<span data-docx-run-style>` sans `style` (style de caractère Word sans propriété
 *   directe) est accepté ;
 * - un `<span style>` dont **aucun** attribut de `textStyle` ne se résout (`text-decoration:
 *   underline`, `mso-*` d'un collage Word) est refusé : Tiptap créait une marque vide, qui
 *   ressortait en `<span>` nu autour du `<u>` et disparaissait à la relecture.
 *
 * Au rendu, `color` et `background-color` sont normalisés en `#rrggbb` minuscules comme
 * les couleurs du contrat (`api/layout.ts`) : `setColor('#FF0000')` sort `color: #ff0000`.
 * Le reste (fusion des `span` imbriqués) est délégué à la règle d'origine.
 */
export const AsterTextStyle = TextStyle.extend({
  parseHTML() {
    const [spanRule] = this.parent?.() ?? [];
    const parentGetAttrs: TagParseRule['getAttrs'] =
      spanRule && 'tag' in spanRule ? (spanRule as TagParseRule).getAttrs : undefined;
    const { editor } = this;
    return [
      {
        tag: 'span',
        consuming: false,
        getAttrs: (element: HTMLElement) => {
          if (element.hasAttribute('style')) {
            const attrs = parentGetAttrs ? parentGetAttrs(element) : {};
            if (attrs === false) {
              return false;
            }
            // Sans éditeur (schéma construit à vide), on garde le comportement de Tiptap.
            return !editor || resolvesTextStyleAttribute(editor, element) ? attrs : false;
          }
          return element.hasAttribute(DOCX_RUN_STYLE_ATTRIBUTE) ? {} : false;
        },
      },
    ];
  },

  renderHTML({ mark, HTMLAttributes }) {
    const style: unknown = HTMLAttributes['style'];
    const attributes =
      typeof style === 'string'
        ? { ...HTMLAttributes, style: normalizeStyleColors(style) }
        : HTMLAttributes;
    return this.parent?.({ mark, HTMLAttributes: attributes }) ?? ['span', attributes, 0];
  },
});

/**
 * `Highlight` d'Aster : celui de Tiptap (multicolore), dont la couleur est rendue en
 * `#rrggbb` minuscules (`data-color` et `background-color`), comme `AsterTextStyle`. Une
 * valeur non reconnue reste verbatim. À câbler dans `aster-extensions.ts` à la place de
 * `Highlight.configure({ multicolor: true })`.
 */
export const AsterHighlight = Highlight.extend({
  addAttributes() {
    const parent: Attributes = this.parent?.() ?? {};
    const color: Attribute | undefined = parent['color'];
    if (!color?.renderHTML) {
      return parent;
    }
    const parentRenderHTML = color.renderHTML;
    return {
      ...parent,
      color: {
        ...color,
        renderHTML: (attributes: Record<string, unknown>) => {
          const value: unknown = attributes['color'];
          const normalized = typeof value === 'string' ? normalizeColor(value) : null;
          return parentRenderHTML({ ...attributes, color: normalized ?? value });
        },
      },
    };
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

/**
 * `Strike` de Tiptap, récupéré dans le jeu de `StarterKit` : `@tiptap/extension-strike`
 * n'est pas une dépendance directe du core et on n'en ajoute pas. `flattenExtensions`
 * instancie les extensions du kit (objets de configuration, sans éditeur), on y prend la
 * marque `strike`.
 */
function strikeFromStarterKit(): Mark {
  const strike = flattenExtensions([StarterKit]).find((extension) => extension.name === 'strike');
  if (!(strike instanceof Mark)) {
    throw new Error('StarterKit ne fournit plus la marque strike');
  }
  return strike;
}

/**
 * `Strike` d'Aster : celui de `StarterKit`, dont la règle `text-decoration` lit en plus le
 * style de trait du raccourci (`text-decoration: line-through double`), comme
 * `AsterUnderline`. Les règles `<s>`, `<del>`, `<strike>` sont celles d'origine. À câbler
 * dans `aster-extensions.ts` avec `StarterKit.configure({ strike: false })`.
 */
export const AsterStrike = strikeFromStarterKit().extend({
  parseHTML() {
    const tagRules = (this.parent?.() ?? []).filter((rule) => 'tag' in rule);
    return [
      ...tagRules,
      {
        style: 'text-decoration',
        consuming: false,
        getAttrs: (style: string) =>
          style.includes('line-through')
            ? { decorationStyle: decorationStyleFromShorthand(style) }
            : false,
      },
    ];
  },
});
