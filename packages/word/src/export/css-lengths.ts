/**
 * Longueurs CSS → pixels, points et twips ; interligne et `padding`. Module de `css.ts`
 * (ré-exporté par lui) : découpage L45, aucune logique modifiée.
 */

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
