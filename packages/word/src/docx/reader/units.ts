import type { BorderStyle } from '@aster-editor/core';

/**
 * Conversions d'unités et de couleurs OOXML, partagées par tous les modules du lecteur
 * (L24 les crée, L25 les lit). Les twips (1/20 pt), demi-points, huitièmes de point et
 * EMU n'existent que dans le paquet `word` : tout ce qui sort est en points, millimètres
 * ou pixels, arrondi à deux décimales.
 */

const TWIPS_PER_PT = 20;
const TWIPS_PER_MM = 1440 / 25.4;
const EMU_PER_PT = 12700;
const EMU_PER_PX = 9525;

/** Arrondi à deux décimales, sans flottement (`0.1 + 0.2`). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Nombre décimal strict : ni hexadécimal (`0x20`), ni exposant (`1e300`), ni `Infinity`. */
const DECIMAL_NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * Entier d'un attribut OOXML, `undefined` si absent ou non numérique. Les valeurs
 * décimales (`"12.5"`, tolérées par certains producteurs) sont acceptées ; tout ce que
 * `Number()` accepterait en plus (hexadécimal, exposant, espaces internes) est rejeté.
 */
export function numberAttr(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (!DECIMAL_NUMBER.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Bornes de Word (ce que son interface accepte), en points : une valeur hors de ces
 * bornes vient d'un producteur cassé ou d'un document hostile et est ignorée, comme une
 * valeur non numérique — jamais écrite en CSS, jamais une exception.
 */
export const WORD_LIMITS = {
  /** Taille de police `w:sz` : 1 à 1638 pt. */
  fontSizeMinPt: 1,
  fontSizeMaxPt: 1638,
  /** Largeur de bordure `w:sz` (huitièmes) : 12 pt au plus. */
  borderMaxPt: 12,
  /** Retraits, espacements avant/après, interligne exact, espacement de caractères : ±1584 pt. */
  distanceMaxPt: 1584,
  /** Interligne multiple (`w:lineRule="auto"`) : 132 lignes au plus. */
  lineMultipleMax: 132,
} as const;

/** `value` s'il est dans `[min, max]`, sinon `undefined` (valeur hors bornes ignorée). */
export function bounded(value: number | undefined, min: number, max: number): number | undefined {
  return value !== undefined && value >= min && value <= max ? value : undefined;
}

/** Distance signée (retrait, espacement) bornée à ±1584 pt. */
export function boundedDistancePt(value: number | undefined): number | undefined {
  return bounded(value, -WORD_LIMITS.distanceMaxPt, WORD_LIMITS.distanceMaxPt);
}

/**
 * Nom de police acceptable : lettres, chiffres, espace, point, tiret, 64 caractères au
 * plus (`Arial Narrow`, `Wingdings 2`, `Noto Sans CJK`). Tout le reste — en particulier
 * un `;` ou un `(` qui ferait sortir de la déclaration `font-family` — est ignoré.
 */
const FONT_NAME = /^[\w .-]{1,64}$/u;

/** Nom de police validé et épuré des espaces de bord, `undefined` s'il est irrecevable. */
export function fontName(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return FONT_NAME.test(trimmed) ? trimmed : undefined;
}

/** Identifiant CSS simple : pas d'espace, pas de point, ne commence pas par un chiffre. */
const CSS_IDENTIFIER = /^-?[A-Za-z_][\w-]*$/;

/**
 * Valeur CSS de `font-family` pour un nom validé par `fontName` : citée entre guillemets
 * dès qu'elle n'est pas un identifiant CSS (`"Wingdings 2"`, `"Arial Narrow"`), sinon
 * telle quelle (`Calibri`). Le nom ne contient ni `"` ni `\`, aucun échappement n'est
 * nécessaire ; le core relit la valeur citée telle quelle et la ré-émet à l'identique.
 */
export function cssFontFamily(name: string): string {
  return CSS_IDENTIFIER.test(name) ? name : `"${name}"`;
}

/** Twips → points (`240` → `12`). */
export function twipsToPt(twips: number): number {
  return round2(twips / TWIPS_PER_PT);
}

/** Twips → millimètres (`1440` → `25.4`). */
export function twipsToMm(twips: number): number {
  return round2(twips / TWIPS_PER_MM);
}

/** Demi-points (`w:sz`) → points (`22` → `11`). */
export function halfPointsToPt(halfPoints: number): number {
  return round2(halfPoints / 2);
}

/** Huitièmes de point (`w:sz` des bordures) → points (`4` → `0.5`). */
export function eighthPointsToPt(eighths: number): number {
  return round2(eighths / 8);
}

/** EMU → points (`127000` → `10`). */
export function emuToPt(emu: number): number {
  return round2(emu / EMU_PER_PT);
}

/** EMU → pixels CSS à 96 dpi (`952500` → `100`). */
export function emuToPx(emu: number): number {
  return round2(emu / EMU_PER_PX);
}

/** Cinquantièmes de pour cent (`w:w w:type="pct"`, `5000` → `100`). */
export function fiftiethsToPercent(fiftieths: number): number {
  return round2(fiftieths / 50);
}

/** Interligne multiple `w:line` en 240e (`276` → `1.15`). */
export function lineToMultiple(line: number): number {
  return round2(line / 240);
}

/** Couleur `#rrggbb` minuscule : `RRGGBB` → `#rrggbb` ; `auto`, `none`, vide ou invalide → `undefined`. */
export function hexColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(trimmed)) return undefined;
  return `#${trimmed.toLowerCase()}`;
}

/** Couleur de bordure : comme `hexColor` mais `auto` (et absent) → noir, comme Word l'affiche. */
export function borderColor(value: string | null | undefined): string {
  return hexColor(value) ?? '#000000';
}

/**
 * Surlignages nommés de Word (`w:highlight`), valeurs d'affichage de Word. Clés en
 * minuscules : la recherche se fait sur le nom abaissé (`darkBlue`, `DarkBlue` et
 * `darkblue` désignent la même couleur).
 */
const HIGHLIGHT_COLORS: Readonly<Record<string, string>> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkblue: '#000080',
  darkcyan: '#008080',
  darkgreen: '#008000',
  darkmagenta: '#800080',
  darkred: '#800000',
  darkyellow: '#808000',
  darkgray: '#808080',
  lightgray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff',
};

/** Surlignage nommé → `#rrggbb`, `none` ou inconnu → `undefined`. */
export function highlightColor(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return HIGHLIGHT_COLORS[name.trim().toLowerCase()];
}

/**
 * Style de bordure OOXML (`w:val`) → style du contrat. `nil`/`none` → `null` (pas de
 * bordure, annule une bordure héritée). Les motifs exotiques (3D, artistiques) sont
 * ramenés au trait le plus proche.
 */
export function borderStyleOf(value: string | null | undefined): BorderStyle | null {
  const val = (value ?? '').trim();
  if (val === '' || val === 'nil' || val === 'none') return null;
  if (/^(?:dotted|dotDash|dotDotDash)$/i.test(val)) return val === 'dotted' ? 'dotted' : 'dashed';
  if (/^dash/i.test(val)) return 'dashed';
  if (/^(?:double|triple|thinThick|thickThin|thinThickThin|thickThinThick)/i.test(val)) {
    return 'double';
  }
  return 'solid';
}

/**
 * Booléen OOXML (`w:b`, `w:i`, `w:keepNext`…) : l'élément présent sans `w:val` vaut
 * vrai ; `0`, `false`, `off` valent faux (et annulent la valeur héritée).
 */
export function onOff(value: string | null | undefined): boolean {
  const val = (value ?? '').trim().toLowerCase();
  return val === '' || val === '1' || val === 'true' || val === 'on';
}
