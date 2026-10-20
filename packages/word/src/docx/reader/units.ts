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

/**
 * Entier d'un attribut OOXML, `undefined` si absent ou non numérique. Les valeurs
 * décimales (`"12.5"`, tolérées par certains producteurs) sont acceptées.
 */
export function numberAttr(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

/** Surlignages nommés de Word (`w:highlight`), valeurs d'affichage de Word. */
const HIGHLIGHT_COLORS: Readonly<Record<string, string>> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff',
};

/** Surlignage nommé → `#rrggbb`, `none` ou inconnu → `undefined`. */
export function highlightColor(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return HIGHLIGHT_COLORS[name] ?? HIGHLIGHT_COLORS[name.toLowerCase()];
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
