import type { Tally } from './tally';
import type { FidelityPropertyGroup } from './types';
import { fmt } from './values';

/**
 * Contexte et primitives d'enregistrement partagés par les comparateurs de blocs et de
 * tableaux : une propriété n'est comptée que si l'un des deux côtés la pose, et un
 * vis-à-vis absent perd toutes ses propriétés.
 */

export interface CompareContext {
  readonly tally: Tally;
  readonly ignoreRevisionIds: boolean;
}

/** Valeur « actuelle » d'un bloc, d'une cellule ou d'un run sans vis-à-vis : tout est perdu. */
export const MISSING = '(bloc absent)';

/** Largeurs de colonnes et de cellules : un passage par des pixels entiers déplace jusqu'à 0,375 pt. */
export const WIDTH_TOLERANCE_PT = 0.5;

/** Vrai si deux nombres (ou deux listes de nombres de même longueur) sont égaux à `tolerance` près. */
export function within(a: unknown, b: unknown, tolerance: number): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tolerance;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => within(value, b[index], tolerance));
  }
  return false;
}

/**
 * Compte `name` quand au moins un côté pose une valeur. `present` faux = le vis-à-vis
 * n'existe pas : l'occurrence est perdue même si la valeur attendue est vide.
 */
export function recordIfAny(
  ctx: CompareContext,
  group: FidelityPropertyGroup,
  name: string,
  where: string,
  expected: unknown,
  actual: unknown,
  present = true,
): void {
  if (expected === undefined && actual === undefined) return;
  ctx.tally.record(group, name, where, fmt(expected), present ? fmt(actual) : MISSING);
}

/** Comme `recordIfAny`, mais une valeur numérique à `tolerance` près compte comme conservée. */
export function recordWithin(
  ctx: CompareContext,
  group: FidelityPropertyGroup,
  name: string,
  where: string,
  expected: unknown,
  actual: unknown,
  present: boolean,
  tolerance: number,
): void {
  if (expected === undefined && actual === undefined) return;
  const kept = present && within(expected, actual, tolerance);
  ctx.tally.record(
    group,
    name,
    where,
    fmt(expected),
    kept ? fmt(expected) : present ? fmt(actual) : MISSING,
  );
}
