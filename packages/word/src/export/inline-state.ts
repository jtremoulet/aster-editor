import type { IRunOptions } from 'docx';
import { resolveDocxStyle, type ExportContext } from './context';
import {
  highlightName,
  parseColor,
  parseFontFamily,
  parseFontSize,
  parsePoints,
  parseStyle,
  pointsToTwips,
  type HighlightName,
} from './css';
import { tagOf } from './dom';
import { sanitizeXmlText } from './sanitize';
import { CODE_FONT, STYLE_IDS } from './styles';

/**
 * Marques inline héritées le long de la descente (`InlineState`) : lecture d'un élément
 * (balise, `style`, `data-docx-run-style`) et traduction en options de run `docx`.
 * Module de `inline.ts` (ré-exporté par lui) : découpage L45, aucune logique modifiée.
 */

/** Attribut du style de caractère Word d'origine d'un span (`RunLayoutAttrs.docxRunStyle`). */
export const DOCX_RUN_STYLE_ATTRIBUTE = 'data-docx-run-style';

/** Styles de trait du souligné (`w:u w:val`), valeurs de `UnderlineType` de `docx`. */
export type UnderlineStyle = 'single' | 'double' | 'dotted' | 'dash' | 'wave';

/** Marques héritées le long de la descente dans les éléments inline. */
export interface InlineState {
  readonly bold?: boolean;
  readonly italics?: boolean;
  readonly underline?: boolean;
  /** Trait du souligné (`text-decoration-style`), simple par défaut. */
  readonly underlineStyle?: UnderlineStyle;
  readonly strike?: boolean;
  /** Barré double (`<s style="text-decoration-style: double">`), `w:dstrike`. */
  readonly doubleStrike?: boolean;
  readonly subScript?: boolean;
  readonly superScript?: boolean;
  readonly code?: boolean;
  /** Surlignage nommé de Word (`yellow`…), pour les seize couleurs qu'il connaît. */
  readonly highlight?: HighlightName;
  /** Fond de run `RRGGBB` (`w:shd`) pour toute autre couleur de fond. */
  readonly shading?: string;
  readonly color?: string;
  readonly font?: string;
  readonly size?: number;
  /** Espacement des caractères en twips (`letter-spacing`). */
  readonly letterSpacing?: number;
  /** Casse forcée : `text-transform: uppercase` ou `font-variant: small-caps`. */
  readonly caps?: 'all' | 'small';
  /** Style de caractère Word d'origine (`data-docx-run-style`), s'il est défini. */
  readonly runStyle?: string;
  /** URL du lien englobant, `undefined` hors lien. */
  readonly href?: string;
}

/** Schémas de lien que Word accepte dans un `ExternalHyperlink`. */
const LINK_PATTERN = /^(https?:|mailto:|tel:|ftp:)/i;

/**
 * Encode une URL pour les relations du .docx : Word refuse d'ouvrir un fichier dont une
 * cible de relation contient un espace, `|` ou un caractère non ASCII. `encodeURI`
 * laisse les délimiteurs d'URL en place ; les séquences `%xx` déjà présentes sont
 * restaurées pour que l'encodage soit idempotent. Une URL inencodable (substitut isolé)
 * est rendue telle quelle.
 */
export function encodeHref(href: string): string {
  try {
    return encodeURI(href).replace(/%25([0-9a-f]{2})/gi, '%$1');
  } catch {
    return href;
  }
}

/** `text-decoration-style` CSS → trait de souligné Word, `undefined` pour `solid`/absent. */
function underlineStyleOf(value: string | undefined): UnderlineStyle | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'double':
      return 'double';
    case 'dotted':
      return 'dotted';
    case 'dashed':
      return 'dash';
    case 'wavy':
      return 'wave';
    default:
      return undefined;
  }
}

/**
 * Applique au state les marques portées par un élément inline (balise + `style` +
 * `data-docx-run-style`). Le contexte sert à valider le style de caractère Word : sans
 * lui, l'attribut est ignoré.
 */
export function applyElementState(
  element: Element,
  state: InlineState,
  ctx?: ExportContext,
): InlineState {
  const style = parseStyle(element.getAttribute('style'));
  let next: InlineState = state;
  switch (tagOf(element)) {
    case 'strong':
    case 'b':
      next = { ...next, bold: true };
      break;
    case 'em':
    case 'i':
      next = { ...next, italics: true };
      break;
    case 'u':
    case 'ins': {
      const underlineStyle = underlineStyleOf(style.get('text-decoration-style'));
      next = { ...next, underline: true, ...(underlineStyle ? { underlineStyle } : {}) };
      break;
    }
    case 's':
    case 'strike':
    case 'del':
      if (style.get('text-decoration-style')?.trim().toLowerCase() === 'double') {
        next = { ...next, doubleStrike: true };
      } else {
        next = { ...next, strike: true };
      }
      break;
    case 'sub':
      next = { ...next, subScript: true, superScript: false };
      break;
    case 'sup':
      next = { ...next, superScript: true, subScript: false };
      break;
    case 'code':
    case 'kbd':
    case 'samp':
      next = { ...next, code: true };
      break;
    case 'mark':
      next = { ...next, highlight: 'yellow', shading: undefined };
      break;
    case 'a': {
      const href = sanitizeXmlText(element.getAttribute('href') ?? '').trim();
      if (LINK_PATTERN.test(href)) next = { ...next, href: encodeHref(href) };
      break;
    }
    default:
      break;
  }
  const weight = style.get('font-weight');
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600)
    next = { ...next, bold: true };
  if (style.get('font-style') === 'italic') next = { ...next, italics: true };
  const decoration = style.get('text-decoration') ?? style.get('text-decoration-line');
  if (decoration?.includes('underline')) next = { ...next, underline: true };
  if (decoration?.includes('line-through')) next = { ...next, strike: true };
  const vertical = style.get('vertical-align');
  if (vertical === 'sub') next = { ...next, subScript: true, superScript: false };
  if (vertical === 'super') next = { ...next, superScript: true, subScript: false };
  const color = parseColor(style.get('color'));
  if (color) next = { ...next, color };
  const font = parseFontFamily(style.get('font-family'));
  if (font) next = { ...next, font };
  const size = parseFontSize(style.get('font-size'));
  if (size) next = { ...next, size };
  const background = parseColor(style.get('background-color') ?? style.get('background'));
  if (background) {
    // Les seize couleurs de Word restent un surlignage ; les autres deviennent un fond de run.
    const named = highlightName(background);
    next = named
      ? { ...next, highlight: named, shading: undefined }
      : { ...next, shading: background, highlight: undefined };
  }
  const letterSpacing = parsePoints(style.get('letter-spacing'));
  if (letterSpacing !== null && letterSpacing !== 0) {
    next = { ...next, letterSpacing: pointsToTwips(letterSpacing) };
  }
  const transform = style.get('text-transform')?.trim().toLowerCase();
  if (transform === 'uppercase') next = { ...next, caps: 'all' };
  else if (transform === 'none' && next.caps === 'all') next = { ...next, caps: undefined };
  const variant = style.get('font-variant')?.trim().toLowerCase();
  if (variant === 'small-caps' || style.get('font-variant-caps')?.trim() === 'small-caps') {
    next = { ...next, caps: 'small' };
  } else if (variant === 'normal' && next.caps === 'small') {
    next = { ...next, caps: undefined };
  }
  if (ctx) {
    const runStyle = resolveDocxStyle(ctx, element.getAttribute(DOCX_RUN_STYLE_ATTRIBUTE), 'run');
    if (runStyle) next = { ...next, runStyle };
  }
  return next;
}

/** Options `docx` d'un run texte à partir du state courant. */
export function runOptions(state: InlineState, text?: string): IRunOptions {
  const options: {
    -readonly [K in keyof IRunOptions]: IRunOptions[K];
  } = {};
  if (text !== undefined) options.text = text;
  if (state.bold) options.bold = true;
  if (state.italics) options.italics = true;
  if (state.underline)
    options.underline = state.underlineStyle ? { type: state.underlineStyle } : {};
  if (state.strike) options.strike = true;
  if (state.doubleStrike) options.doubleStrike = true;
  if (state.subScript) options.subScript = true;
  if (state.superScript) options.superScript = true;
  if (state.highlight) options.highlight = state.highlight;
  if (state.shading) options.shading = { fill: state.shading, type: 'clear', color: 'auto' };
  if (state.color) options.color = state.color;
  if (state.size) options.size = state.size;
  if (state.letterSpacing) options.characterSpacing = state.letterSpacing;
  if (state.caps === 'all') options.allCaps = true;
  if (state.caps === 'small') options.smallCaps = true;
  if (state.code) {
    options.style = STYLE_IDS.code;
    options.font = CODE_FONT;
  } else if (state.font) {
    options.font = state.font;
  }
  // Un style de caractère Word d'origine prime sur « Code », et « Hyperlink » sur tout :
  // Word n'en accepte qu'un par run.
  if (state.runStyle) options.style = state.runStyle;
  if (state.href) options.style = STYLE_IDS.hyperlink;
  return options;
}
