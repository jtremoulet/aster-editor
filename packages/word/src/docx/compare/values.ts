import { round2 } from '../reader/units';

/**
 * Normalisation des valeurs comparées par le rapport de fidélité : tout passe par une
 * chaîne canonique (nombres arrondis à deux décimales, couleurs en minuscules, clés
 * d'objet triées, `undefined` rendu `(absent)`) pour que l'égalité soit une égalité de
 * chaînes et que les exemples du rapport soient lisibles.
 */

/** Valeur absente d'un côté, affichée telle quelle dans les exemples. */
export const ABSENT = '(absent)';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function canonical(value: unknown): unknown {
  if (typeof value === 'number') return round2(value);
  if (typeof value === 'string') return HEX_COLOR.test(value) ? value.toLowerCase() : value;
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = canonical(item);
    }
    return out;
  }
  return value;
}

/** Chaîne canonique d'une valeur quelconque, `(absent)` pour `undefined` et `null`. */
export function fmt(value: unknown): string {
  if (value === undefined || value === null) return ABSENT;
  const normalized = canonical(value);
  if (typeof normalized === 'string') return normalized;
  if (typeof normalized === 'number' || typeof normalized === 'boolean') return String(normalized);
  return JSON.stringify(normalized);
}

/** Vrai si les deux valeurs ont la même chaîne canonique. */
export function same(a: unknown, b: unknown): boolean {
  return fmt(a) === fmt(b);
}
