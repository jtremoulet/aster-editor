/**
 * Couleurs CSS → `RRGGBB` de `docx`, et surlignages nommés de Word. Module de `css.ts`
 * (ré-exporté par lui) : découpage L45, aucune logique modifiée.
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
