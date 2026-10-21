/**
 * Lecture des styles inline utiles à l'export. On parse l'attribut `style` à la main
 * plutôt que via `element.style` : le `Document` vient d'un parseur injectable qui
 * n'implémente pas forcément CSSOM. Les couleurs (`css-colors.ts`), les longueurs
 * (`css-lengths.ts`) et les bordures (`css-borders.ts`) sont ré-exportées d'ici : l'API
 * du module est celle d'avant le découpage (L45).
 */

export { highlightName, parseColor, type HighlightName } from './css-colors.js';
export {
  parseLineHeight,
  parsePadding,
  parsePixels,
  parsePoints,
  pointsToTwips,
  type CssLineHeight,
} from './css-lengths.js';
export {
  CSS_BORDER_SIDES,
  parseBorder,
  parseBorders,
  type CssBorder,
  type CssBorderSide,
  type CssBorderStyle,
} from './css-borders.js';

/** Découpe `a: b; c: d` en map clé → valeur, clés en minuscules, valeurs trimées. */
export function parseStyle(style: string | null): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (!style) return map;
  for (const declaration of style.split(';')) {
    const index = declaration.indexOf(':');
    if (index <= 0) continue;
    const name = declaration.slice(0, index).trim().toLowerCase();
    const value = declaration.slice(index + 1).trim();
    if (name !== '' && value !== '') map.set(name, value);
  }
  return map;
}

/** Taille de texte par défaut de Word (11 pt), base des pourcentages et des mots-clés. */
const BASE_FONT_SIZE_PT = 11;

/** Mots-clés `font-size` absolus → facteur par rapport à `medium` (échelle CSS). */
const FONT_SIZE_KEYWORDS: Readonly<Record<string, number>> = {
  'xx-small': 3 / 5,
  'x-small': 3 / 4,
  small: 8 / 9,
  medium: 1,
  large: 6 / 5,
  'x-large': 3 / 2,
  'xx-large': 2,
  'xxx-large': 3,
};

/**
 * `font-size` CSS → demi-points (`size` de `docx`). `px` à 96 dpi, `pt`, `em`/`rem`
 * relatifs à 12 pt, `%` et mots-clés absolus (`small`, `large`…) relatifs à la taille
 * par défaut de Word (11 pt). `smaller`/`larger` et le reste sont ignorés (`null`).
 */
export function parseFontSize(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const factor = FONT_SIZE_KEYWORDS[normalized];
  if (factor !== undefined) return Math.round(BASE_FONT_SIZE_PT * factor * 2);
  const match = /^([\d.]+)\s*(px|pt|em|rem|%)$/.exec(normalized);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  let points: number;
  switch (match[2]) {
    case 'px':
      points = amount * 0.75;
      break;
    case 'pt':
      points = amount;
      break;
    case '%':
      points = (BASE_FONT_SIZE_PT * amount) / 100;
      break;
    default:
      points = amount * 12;
  }
  return Math.round(points * 2);
}

/** Première famille de `font-family`, sans guillemets. `null` si vide ou générique. */
export function parseFontFamily(value: string | undefined): string | null {
  if (!value) return null;
  const first =
    value
      .split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '') ?? '';
  if (first === '' || first === 'inherit') return null;
  return first;
}

/** Alignement de paragraphe reconnu par Word. `left`/`start` sont le défaut : `null`. */
export type ParagraphAlignment = 'center' | 'right' | 'both';

/** `text-align` CSS → alignement `docx` (`both` = justifié). */
export function parseAlignment(value: string | undefined): ParagraphAlignment | null {
  switch (value?.trim().toLowerCase()) {
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    case 'justify':
      return 'both';
    default:
      return null;
  }
}
