/**
 * Lecture des styles inline utiles à l'export. On parse l'attribut `style` à la main
 * plutôt que via `element.style` : le `Document` vient d'un parseur injectable qui
 * n'implémente pas forcément CSSOM.
 */

/** Couleurs CSS nommées que Word rencontre le plus souvent dans un HTML d'éditeur. */
const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  yellow: 'FFFF00',
  orange: 'FFA500',
  purple: '800080',
  gray: '808080',
  grey: '808080',
  silver: 'C0C0C0',
  maroon: '800000',
  navy: '000080',
  teal: '008080',
  olive: '808000',
  lime: '00FF00',
  aqua: '00FFFF',
  cyan: '00FFFF',
  fuchsia: 'FF00FF',
  magenta: 'FF00FF',
};

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

/** Composante 0-255 → deux chiffres hexadécimaux majuscules. */
function hex2(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

/** Composante `rgb()` : nombre 0-255 ou pourcentage. */
function rgbComponent(raw: string, percent: string): number {
  const amount = Number(raw);
  return percent === '%' ? (amount * 255) / 100 : amount;
}

/** `hsl()` → `RRGGBB`, teinte en degrés, saturation et luminosité en 0-1 (algorithme CSS Color 4). */
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = (((hue % 360) + 360) % 360) / 30;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): number => {
    const k = (n + h) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `${hex2(channel(0) * 255)}${hex2(channel(8) * 255)}${hex2(channel(4) * 255)}`;
}

/**
 * Couleur CSS → hexadécimal `RRGGBB` sans `#`, format attendu par `docx`. Accepte
 * `#rgb`, `#rrggbb` (alpha ignoré), `rgb()`/`rgba()` en nombres ou pourcentages,
 * `hsl()`/`hsla()` et les noms courants. `null` si la couleur est illisible ou transparente.
 */
export function parseColor(value: string | undefined): string | null {
  if (!value) return null;
  const color = value.trim().toLowerCase();
  if (color === 'transparent' || color === 'inherit' || color === 'currentcolor') return null;
  const hex = /^#([0-9a-f]{3,8})$/.exec(color)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      return hex
        .slice(0, 3)
        .split('')
        .map((digit) => digit + digit)
        .join('')
        .toUpperCase();
    }
    if (hex.length === 6 || hex.length === 8) return hex.slice(0, 6).toUpperCase();
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)/.exec(color);
  if (rgb) {
    const [, r = '0', rp = '', g = '0', gp = '', b = '0', bp = ''] = rgb;
    return `${hex2(rgbComponent(r, rp))}${hex2(rgbComponent(g, gp))}${hex2(rgbComponent(b, bp))}`;
  }
  const hsl = /^hsla?\(\s*(-?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/.exec(color);
  if (hsl) {
    const [, h = '0', s = '0', l = '0'] = hsl;
    return hslToHex(Number(h), Number(s) / 100, Number(l) / 100);
  }
  return NAMED_COLORS[color] ?? null;
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

/** Longueur CSS/HTML en pixels (`320`, `320px`, `24pt`). `null` sinon (`auto`, `%`, vide). */
export function parsePixels(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^([\d.]+)\s*(px|pt)?$/.exec(value.trim().toLowerCase());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(match[2] === 'pt' ? amount / 0.75 : amount);
}

/** Points par unité CSS absolue. Un nombre nu est lu en points (contrat de mise en page). */
const POINTS_PER_UNIT: Readonly<Record<string, number>> = {
  pt: 1,
  px: 0.75,
  in: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pc: 12,
  '': 1,
};

/**
 * Longueur CSS absolue → points, signée (`-18pt` est un retrait suspendu), deux décimales.
 * `null` pour une unité relative (`em`, `%`), un mot-clé ou une valeur illisible.
 */
export function parsePoints(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(-?[\d.]+)\s*(pt|px|in|cm|mm|pc)?$/.exec(value.trim().toLowerCase());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * (POINTS_PER_UNIT[match[2] ?? ''] ?? 1) * 100) / 100;
}

/** Points → twips (1/20 de point), entier. */
export function pointsToTwips(points: number): number {
  return Math.round(points * 20);
}

/** Styles de trait du contrat de mise en page (`BlockBorder.style`). */
export type CssBorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';

/** Bordure CSS lue : style, épaisseur en points, couleur `RRGGBB`. */
export interface CssBorder {
  readonly style: CssBorderStyle;
  readonly widthPt: number;
  readonly color: string;
}

/** Côtés d'une bordure de bloc ou de cellule. */
export type CssBorderSide = 'top' | 'right' | 'bottom' | 'left';

/** Côtés dans l'ordre de sérialisation du contrat. */
export const CSS_BORDER_SIDES: readonly CssBorderSide[] = ['top', 'right', 'bottom', 'left'];

/** Mots-clés `border-style` CSS → style du contrat ; les autres (`groove`…) deviennent `solid`. */
function borderStyleKeyword(word: string): CssBorderStyle | null {
  switch (word) {
    case 'solid':
    case 'groove':
    case 'ridge':
    case 'inset':
    case 'outset':
      return 'solid';
    case 'dashed':
    case 'dotted':
    case 'double':
      return word;
    default:
      return null;
  }
}

/** Épaisseurs nommées de `border-width`, en points (valeurs usuelles des navigateurs). */
const BORDER_WIDTH_KEYWORDS: Readonly<Record<string, number>> = {
  thin: 0.75,
  medium: 2.25,
  thick: 3.75,
};

/**
 * Raccourci `border` / `border-<côté>` CSS (`1pt solid #000000`, dans n'importe quel
 * ordre, couleur `#hex`, `rgb()` ou nom) → bordure, `undefined` si la valeur est illisible,
 * `null` pour `none` / `hidden` / `0` (bordure explicitement absente). Une épaisseur
 * absente vaut `medium`, un style absent `solid`, une couleur absente noir.
 */
export function parseBorder(value: string | undefined): CssBorder | null | undefined {
  if (!value) return undefined;
  const raw = value.trim().toLowerCase();
  if (raw === '' || raw === 'none' || raw === 'hidden' || raw === '0') return null;
  // Les espaces d'un `rgb(r, g, b)` ne séparent pas des mots : on les retire avant la découpe.
  const tokens = raw.replace(
    /\(\s*([^)]*?)\s*\)/g,
    (_, inner: string) => `(${inner.replace(/\s+/g, '')})`,
  );
  let style: CssBorderStyle | null = null;
  let widthPt: number | null = null;
  let color: string | null = null;
  for (const token of tokens.split(/\s+/)) {
    const keyword = borderStyleKeyword(token);
    if (keyword) {
      style = keyword;
      continue;
    }
    const named = BORDER_WIDTH_KEYWORDS[token];
    if (named !== undefined) {
      widthPt = named;
      continue;
    }
    const points = parsePoints(token);
    if (points !== null) {
      widthPt = points;
      continue;
    }
    const parsed = parseColor(token);
    if (parsed) color = parsed;
    else if (token === 'transparent') return null;
  }
  if (widthPt !== null && widthPt <= 0) return null;
  if (style === null && widthPt === null && color === null) return undefined;
  return { style: style ?? 'solid', widthPt: widthPt ?? 2.25, color: color ?? '000000' };
}

/**
 * Bordures d'un `style` inline, côté par côté : raccourci `border` (tous les côtés) puis
 * `border-<côté>`, puis les propriétés longues `border-<côté>-width|style|color` qui
 * complètent ou corrigent. Un côté absent de la map n'est pas déclaré ; `null` le déclare
 * explicitement sans bordure (`border-top: none`).
 */
export function parseBorders(
  style: ReadonlyMap<string, string>,
): ReadonlyMap<CssBorderSide, CssBorder | null> {
  const result = new Map<CssBorderSide, CssBorder | null>();
  const all = parseBorder(style.get('border'));
  for (const side of CSS_BORDER_SIDES) {
    let border: CssBorder | null | undefined = all;
    const own = parseBorder(style.get(`border-${side}`));
    if (own !== undefined) border = own;
    const width = parsePoints(style.get(`border-${side}-width`));
    const styleWord = style.get(`border-${side}-style`)?.trim().toLowerCase();
    const colorValue = parseColor(style.get(`border-${side}-color`));
    if (width !== null || styleWord !== undefined || colorValue) {
      if (styleWord === 'none' || styleWord === 'hidden' || (width !== null && width <= 0)) {
        border = null;
      } else {
        const base: CssBorder = border ?? { style: 'solid', widthPt: 2.25, color: '000000' };
        border = {
          style: (styleWord ? borderStyleKeyword(styleWord) : null) ?? base.style,
          widthPt: width ?? base.widthPt,
          color: colorValue ?? base.color,
        };
      }
    }
    if (border !== undefined) result.set(side, border);
  }
  return result;
}

/** Interligne lu : multiple (`1.15`) ou exact en points (`14pt`). */
export type CssLineHeight =
  | { readonly kind: 'multiple'; readonly value: number }
  | { readonly kind: 'exact'; readonly points: number };

/**
 * `line-height` CSS → interligne Word : nombre nu ou pourcentage = multiple, longueur
 * absolue = exact. `normal`, `inherit` et les unités relatives sont ignorés.
 */
export function parseLineHeight(value: string | undefined): CssLineHeight | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (/^[\d.]+$/.test(raw)) {
    const multiple = Number(raw);
    return Number.isFinite(multiple) && multiple > 0 ? { kind: 'multiple', value: multiple } : null;
  }
  const percent = /^([\d.]+)%$/.exec(raw);
  if (percent) {
    const multiple = Number(percent[1]) / 100;
    return Number.isFinite(multiple) && multiple > 0 ? { kind: 'multiple', value: multiple } : null;
  }
  const points = parsePoints(raw);
  return points !== null && points > 0 ? { kind: 'exact', points } : null;
}

/**
 * `padding` CSS (1 à 4 valeurs, règle TRBL) → points `[haut, droite, bas, gauche]`.
 * `null` si une valeur est illisible.
 */
export function parsePadding(
  value: string | undefined,
): readonly [number, number, number, number] | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).map(parsePoints);
  if (parts.length === 0 || parts.length > 4 || parts.some((part) => part === null)) return null;
  const [a = 0, b = a, c = a, d = b] = parts as number[];
  return [a, b, c, d];
}

/** Les seize surlignages nommés de Word (`w:highlight`), valeurs de `HighlightColor` de `docx`. */
export type HighlightName =
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'magenta'
  | 'blue'
  | 'red'
  | 'darkBlue'
  | 'darkCyan'
  | 'darkGreen'
  | 'darkMagenta'
  | 'darkRed'
  | 'darkYellow'
  | 'darkGray'
  | 'lightGray'
  | 'black'
  | 'white';

/** Surlignages nommés de Word et la couleur que Word affiche pour chacun. */
const HIGHLIGHT_NAMES: ReadonlyArray<readonly [HighlightName, string]> = [
  ['yellow', 'FFFF00'],
  ['green', '00FF00'],
  ['cyan', '00FFFF'],
  ['magenta', 'FF00FF'],
  ['blue', '0000FF'],
  ['red', 'FF0000'],
  ['darkBlue', '000080'],
  ['darkCyan', '008080'],
  ['darkGreen', '008000'],
  ['darkMagenta', '800080'],
  ['darkRed', '800000'],
  ['darkYellow', '808000'],
  ['darkGray', '808080'],
  ['lightGray', 'C0C0C0'],
  ['black', '000000'],
  ['white', 'FFFFFF'],
];

/**
 * Nom de surlignage Word (`w:highlight`) d'une couleur `RRGGBB`, `null` si aucun des seize
 * ne correspond : le fond est alors écrit en `w:shd`, que Word affiche à l'identique.
 */
export function highlightName(color: string): HighlightName | null {
  const upper = color.toUpperCase();
  return HIGHLIGHT_NAMES.find(([, hex]) => hex === upper)?.[0] ?? null;
}
