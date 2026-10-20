import type { BlockBorder, BorderSide, BorderStyle } from '../api';

/**
 * Helpers de sérialisation CSS partagés par les extensions de mise en page (paragraphe,
 * run, tableau). Le contrat (`api/layout.ts`) fige la forme des valeurs : points avec au
 * plus deux décimales, couleurs en `#rrggbb` minuscules, bordures `1pt solid #000000`.
 * Tout passe par ici pour que `setHTML(getHTML())` relise exactement ce qu'il a écrit.
 */

/** Côtés de bordure portés par un `style` inline, dans l'ordre de sérialisation. */
export const CSS_BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;

export type CssBorderSide = (typeof CSS_BORDER_SIDES)[number];

/** Styles de trait de bordure reconnus (ceux du contrat). */
const BORDER_STYLES: readonly BorderStyle[] = ['solid', 'dashed', 'dotted', 'double'];

/** Facteur de conversion CSS : 1 px = 0,75 pt. */
const PT_PER_PX = 0.75;

/**
 * Mots-clés de couleur acceptés tels quels (Word n'en produit jamais, mais un HTML collé
 * peut en contenir). Les 16 couleurs de base, le gris dans ses deux graphies, `orange`
 * et `transparent`. Tout autre mot n'est pas une couleur.
 */
const COLOR_KEYWORDS: ReadonlySet<string> = new Set([
  'aqua',
  'black',
  'blue',
  'fuchsia',
  'gray',
  'grey',
  'green',
  'lime',
  'maroon',
  'navy',
  'olive',
  'orange',
  'purple',
  'red',
  'silver',
  'teal',
  'transparent',
  'white',
  'yellow',
]);

/**
 * Borne absolue des nombres de mise en page (points, multiples d'interligne) : ±100 000.
 * Word plafonne bien plus bas (retraits ≤ 1 584 pt, espacements ≤ 1 584 pt), une valeur
 * au-delà vient d'une erreur ou d'une attaque ; surtout, `value * 100` déborde vers
 * `Infinity` dès 1e307 et finirait sérialisé en `Infinitypt` que personne ne relit.
 */
export const LAYOUT_NUMBER_LIMIT = 100_000;

/**
 * Arrondit à deux décimales au plus, sans zéro superflu (`6` → `6`, `6.5` → `6.5`), en
 * bornant d'abord à ±`LAYOUT_NUMBER_LIMIT` : jamais `Infinity` en sortie. Un `NaN` ressort
 * `NaN` — c'est aux appelants de garder `isLayoutNumber` en amont.
 */
export function roundLayoutNumber(value: number): number {
  const clamped = Math.max(-LAYOUT_NUMBER_LIMIT, Math.min(LAYOUT_NUMBER_LIMIT, value));
  return Math.round(clamped * 100) / 100;
}

/** Formate une longueur en points : `6pt`, `6.5pt`, jamais plus de deux décimales. */
export function formatPt(value: number): string {
  return `${roundLayoutNumber(value)}pt`;
}

/** Formate un nombre sans unité (interligne multiple) avec au plus deux décimales. */
export function formatNumber(value: number): string {
  return String(roundLayoutNumber(value));
}

/** Vrai pour un nombre fini, seule valeur acceptée dans les attributs numériques. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Vrai pour un nombre de mise en page acceptable : fini et dans ±`LAYOUT_NUMBER_LIMIT`.
 * C'est la garde à poser avant tout `roundLayoutNumber` / `formatPt` sur une valeur qui
 * vient de l'extérieur (arguments de commande, attributs posés par `setJSON`, HTML).
 */
export function isLayoutNumber(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= LAYOUT_NUMBER_LIMIT;
}

/**
 * Lit une longueur CSS en points. Accepte `pt`, `px` (converti), `0` sans unité ; refuse
 * tout le reste (`em`, `%`, `auto`) : on ne sait pas les convertir sans contexte. Une
 * longueur hors de ±`LAYOUT_NUMBER_LIMIT` est refusée comme une valeur illisible.
 */
export function parsePt(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = /^(-?\d+(?:\.\d+)?)(pt|px)?$/i.exec(value.trim());
  if (!match || match[1] === undefined) {
    return null;
  }
  const number = Number.parseFloat(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const pt = unit === 'px' ? number * PT_PER_PX : number;
  if (!isLayoutNumber(pt)) {
    return null;
  }
  if (unit === '' && number !== 0) {
    return null;
  }
  return roundLayoutNumber(pt);
}

/**
 * Découpe un attribut `style` en déclarations ordonnées, propriété en minuscules. Une
 * propriété répétée garde sa dernière valeur. Les `;` dans une valeur ne sont pas gérés
 * (jamais produits par le core, hors `url()`, que la mise en page n'utilise pas).
 */
export function parseStyleDeclarations(style: string | null | undefined): Map<string, string> {
  const declarations = new Map<string, string>();
  if (!style) {
    return declarations;
  }
  for (const chunk of style.split(';')) {
    const colon = chunk.indexOf(':');
    if (colon < 0) {
      continue;
    }
    const property = chunk.slice(0, colon).trim().toLowerCase();
    const value = chunk.slice(colon + 1).trim();
    if (property !== '' && value !== '') {
      declarations.set(property, value);
    }
  }
  return declarations;
}

/** Lit une propriété du `style` inline d'un élément, `null` si absente. */
export function readStyleProperty(element: HTMLElement, property: string): string | null {
  return parseStyleDeclarations(element.getAttribute('style')).get(property) ?? null;
}

/** Deux chiffres hexadécimaux pour une composante 0-255. */
function hex2(component: number): string {
  return Math.max(0, Math.min(255, Math.round(component)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * Normalise une couleur CSS en `#rrggbb` minuscules : `#RGB`, `#RRGGBB`, `rgb()` et
 * `rgba()` (alpha ignoré). Un mot-clé connu (`red`, `transparent`) est gardé tel quel en
 * minuscules ; une valeur vide, `none` ou un mot inconnu donne `null`.
 */
export function normalizeColor(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'none' || trimmed === 'initial' || trimmed === 'inherit') {
    return null;
  }
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(trimmed);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-f]{8}$/.test(trimmed)) {
    return trimmed.slice(0, 7);
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/.exec(
    trimmed,
  );
  if (rgb && rgb[1] !== undefined && rgb[2] !== undefined && rgb[3] !== undefined) {
    return `#${hex2(Number(rgb[1]))}${hex2(Number(rgb[2]))}${hex2(Number(rgb[3]))}`;
  }
  return COLOR_KEYWORDS.has(trimmed) ? trimmed : null;
}

/** Vrai si la valeur est un style de bordure du contrat. */
export function isBorderStyle(value: unknown): value is BorderStyle {
  return typeof value === 'string' && (BORDER_STYLES as readonly string[]).includes(value);
}

/** Vrai si la valeur est un côté de bordure du contrat (`between` compris). */
export function isBorderSide(value: unknown): value is BorderSide {
  return (
    typeof value === 'string' &&
    ((CSS_BORDER_SIDES as readonly string[]).includes(value) || value === 'between')
  );
}

/** Vrai si l'objet est une `BlockBorder` complète et valide. */
export function isBlockBorder(value: unknown): value is BlockBorder {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isBorderSide(candidate['side']) &&
    isBorderStyle(candidate['style']) &&
    isLayoutNumber(candidate['widthPt']) &&
    typeof candidate['color'] === 'string'
  );
}

/** Ne garde que les bordures valides d'une valeur d'attribut, `null` s'il n'en reste aucune. */
export function sanitizeBorders(value: unknown): BlockBorder[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const borders = value.filter(isBlockBorder).map((border) => ({
    side: border.side,
    style: border.style,
    widthPt: roundLayoutNumber(border.widthPt),
    color: normalizeColor(border.color) ?? '#000000',
  }));
  return borders.length > 0 ? borders : null;
}

/** Valeur CSS d'une bordure : `1pt solid #000000`. */
export function formatBorderValue(border: BlockBorder): string {
  return `${formatPt(border.widthPt)} ${border.style} ${normalizeColor(border.color) ?? '#000000'}`;
}

/**
 * Lit une valeur de bordure CSS (`1pt solid #000000`, `solid 1px red`, ordre libre).
 * `none` ou `hidden` donnent `null`. Épaisseur par défaut 1pt, style `solid`, couleur noire,
 * pour accepter un `border-bottom: solid` minimaliste.
 */
export function parseBorderValue(
  side: BorderSide,
  value: string | null | undefined,
): BlockBorder | null {
  if (!value) {
    return null;
  }
  // Jetons séparés par des blancs, sauf à l'intérieur de parenthèses (`rgb(255, 0, 0)`).
  const tokens = value.trim().match(/[a-z-]+\([^)]*\)|\S+/gi) ?? [];
  if (tokens.some((token) => token === 'none' || token === 'hidden')) {
    return null;
  }
  let widthPt: number | null = null;
  let style: BorderStyle | null = null;
  let color: string | null = null;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (isBorderStyle(lower)) {
      style = lower;
      continue;
    }
    const pt = parsePt(lower);
    if (pt !== null) {
      widthPt = pt;
      continue;
    }
    if (lower === 'thin') {
      widthPt = 0.75;
      continue;
    }
    if (lower === 'medium') {
      widthPt = 2.25;
      continue;
    }
    if (lower === 'thick') {
      widthPt = 3.75;
      continue;
    }
    color = normalizeColor(lower) ?? color;
  }
  if (widthPt === null && style === null && color === null) {
    return null;
  }
  return { side, style: style ?? 'solid', widthPt: widthPt ?? 1, color: color ?? '#000000' };
}

/**
 * Lit les bordures d'un élément depuis son `style` : `border` (raccourci, quatre côtés)
 * puis `border-<côté>` qui l'emporte côté par côté. Ordre de sortie : top, right, bottom,
 * left. `null` sans bordure.
 */
export function parseSideBorders(declarations: Map<string, string>): BlockBorder[] {
  const borders: BlockBorder[] = [];
  const shorthand = declarations.get('border') ?? null;
  for (const side of CSS_BORDER_SIDES) {
    const own = declarations.get(`border-${side}`);
    const border = parseBorderValue(side, own ?? shorthand);
    if (border) {
      borders.push(border);
    }
  }
  return borders;
}

/**
 * Déclarations `border-<côté>` d'une liste de bordures, dans l'ordre top, right, bottom,
 * left ; la dernière bordure d'un même côté l'emporte. `between` est ignoré ici (il n'a
 * pas d'équivalent CSS, le paragraphe le porte en `data-border-between`).
 */
export function borderDeclarations(borders: readonly BlockBorder[]): string[] {
  const bySide = new Map<CssBorderSide, BlockBorder>();
  for (const border of borders) {
    if (border.side !== 'between') {
      bySide.set(border.side, border);
    }
  }
  const declarations: string[] = [];
  for (const side of CSS_BORDER_SIDES) {
    const border = bySide.get(side);
    if (border) {
      declarations.push(`border-${side}: ${formatBorderValue(border)}`);
    }
  }
  return declarations;
}

/** Bordure `between` d'une liste, la dernière s'il y en a plusieurs, sinon `null`. */
export function betweenBorder(borders: readonly BlockBorder[]): BlockBorder | null {
  let found: BlockBorder | null = null;
  for (const border of borders) {
    if (border.side === 'between') {
      found = border;
    }
  }
  return found;
}

/** Assemble des déclarations en un attribut `style` (`a: 1; b: 2`), `null` si aucune. */
export function joinDeclarations(declarations: readonly string[]): string | null {
  return declarations.length > 0 ? declarations.join('; ') : null;
}
