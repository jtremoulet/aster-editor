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
