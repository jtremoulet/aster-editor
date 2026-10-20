import type { FidelityExample, FidelityProperty, FidelityPropertyGroup } from './types';

/**
 * Comptage des propriétés comparées et calcul du score pondéré. Chaque appel à `record`
 * est une occurrence : conservée si les deux chaînes canoniques sont égales, perdue sinon
 * (les cinq premières pertes servent d'exemples). Le score est la moyenne pondérée des
 * taux `kept / total` par groupe ; un groupe sans occurrence ne compte pas.
 */

/** Poids des groupes, figés par le brief L28. */
export const GROUP_WEIGHTS: Readonly<Record<FidelityPropertyGroup, number>> = {
  text: 3,
  'paragraph-style': 2,
  'paragraph-format': 2,
  'run-format': 2,
  list: 1,
  table: 2,
  image: 1,
  note: 1,
  'header-footer': 2,
  section: 2,
  'package-part': 2,
};

const GROUP_ORDER: readonly FidelityPropertyGroup[] = [
  'text',
  'paragraph-style',
  'paragraph-format',
  'run-format',
  'list',
  'table',
  'image',
  'note',
  'header-footer',
  'section',
  'package-part',
];

const MAX_EXAMPLES = 5;

interface Counter {
  readonly group: FidelityPropertyGroup;
  total: number;
  kept: number;
  readonly examples: FidelityExample[];
}

export class Tally {
  private readonly counters = new Map<string, Counter>();

  /** Une occurrence de `name` : conservée si `expected === actual`. */
  record(
    group: FidelityPropertyGroup,
    name: string,
    where: string,
    expected: string,
    actual: string,
  ): boolean {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = { group, total: 0, kept: 0, examples: [] };
      this.counters.set(name, counter);
    }
    counter.total += 1;
    const kept = expected === actual;
    if (kept) counter.kept += 1;
    else if (counter.examples.length < MAX_EXAMPLES) {
      counter.examples.push({ where, expected, actual });
    }
    return kept;
  }

  /** Propriétés dans l'ordre des groupes puis des noms, prêtes pour le rapport. */
  properties(): FidelityProperty[] {
    return Array.from(this.counters.entries())
      .map(([name, counter]) => ({
        name,
        group: counter.group,
        total: counter.total,
        kept: counter.kept,
        lost: counter.total - counter.kept,
        examples: counter.examples,
      }))
      .sort(
        (a, b) =>
          GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
          a.name.localeCompare(b.name),
      );
  }
}

/**
 * Score pondéré : pour chaque groupe ayant au moins une occurrence, taux `kept / total`
 * agrégé sur ses propriétés, pondéré par `GROUP_WEIGHTS`. Arrondi à trois décimales ;
 * `1` quand rien n'a été comparé.
 */
export function computeScore(properties: readonly FidelityProperty[]): number {
  const totals = new Map<FidelityPropertyGroup, { total: number; kept: number }>();
  for (const property of properties) {
    const entry = totals.get(property.group) ?? { total: 0, kept: 0 };
    entry.total += property.total;
    entry.kept += property.kept;
    totals.set(property.group, entry);
  }
  let weightSum = 0;
  let weighted = 0;
  for (const [group, { total, kept }] of totals) {
    if (total === 0) continue;
    const weight = GROUP_WEIGHTS[group];
    weightSum += weight;
    weighted += (weight * kept) / total;
  }
  if (weightSum === 0) return 1;
  return Math.round((weighted / weightSum) * 1000) / 1000;
}
