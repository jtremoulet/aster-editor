/**
 * Alignement de deux séquences de blocs (ou de runs) pour le rapport de fidélité. Même
 * longueur : alignement par position, le plus fidèle quand rien n'a été inséré ni
 * supprimé. Longueurs différentes : préfixe et suffixe communs retirés, puis LCS sur les
 * clés du milieu, borné (`MAX_LCS_CELLS`) ; au-delà, appariement glouton monotone par clé
 * pour rester linéaire en pratique sur des centaines de blocs.
 */

/** Paire alignée : `a` et `b` sont des index, `undefined` pour un élément sans vis-à-vis. */
export interface AlignedPair {
  readonly a?: number;
  readonly b?: number;
}

/** Au-delà de ce nombre de cellules de la table LCS, l'appariement glouton prend le relais. */
export const MAX_LCS_CELLS = 1_000_000;

function lcsPairs(a: readonly string[], b: readonly string[]): [number, number][] {
  const rows = a.length;
  const cols = b.length;
  // Table (rows + 1) × (cols + 1) de longueurs de LCS, remplie de la fin vers le début.
  const width = cols + 1;
  const table = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      const index = i * width + j;
      table[index] =
        a[i] === b[j]
          ? (table[index + width + 1] ?? 0) + 1
          : Math.max(table[index + width] ?? 0, table[index + 1] ?? 0);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/** Appariement glouton : chaque clé de `a` prend la première occurrence encore libre dans `b` après la précédente. */
function greedyPairs(a: readonly string[], b: readonly string[]): [number, number][] {
  const positions = new Map<string, number[]>();
  b.forEach((key, index) => {
    const list = positions.get(key);
    if (list) list.push(index);
    else positions.set(key, [index]);
  });
  const pairs: [number, number][] = [];
  let cursor = 0;
  a.forEach((key, i) => {
    const list = positions.get(key);
    if (!list) return;
    const j = list.find((candidate) => candidate >= cursor);
    if (j === undefined) return;
    pairs.push([i, j]);
    cursor = j + 1;
  });
  return pairs;
}

/** Développe une liste de paires appariées en séquence complète, avec les orphelins des deux côtés. */
function expand(
  pairs: readonly [number, number][],
  aLength: number,
  bLength: number,
): AlignedPair[] {
  const out: AlignedPair[] = [];
  let i = 0;
  let j = 0;
  for (const [pa, pb] of pairs) {
    while (i < pa) out.push({ a: i++ });
    while (j < pb) out.push({ b: j++ });
    out.push({ a: pa, b: pb });
    i = pa + 1;
    j = pb + 1;
  }
  while (i < aLength) out.push({ a: i++ });
  while (j < bLength) out.push({ b: j++ });
  return out;
}

/**
 * Aligne deux séquences par leurs clés. Les paires sont rendues dans l'ordre, les
 * éléments sans vis-à-vis intercalés à leur place (`a` seul = supprimé, `b` seul = inséré).
 */
export function alignSequences(a: readonly string[], b: readonly string[]): AlignedPair[] {
  if (a.length === b.length) return a.map((_, index) => ({ a: index, b: index }));
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const middleA = a.slice(prefix, a.length - suffix);
  const middleB = b.slice(prefix, b.length - suffix);
  const middle =
    (middleA.length + 1) * (middleB.length + 1) <= MAX_LCS_CELLS
      ? lcsPairs(middleA, middleB)
      : greedyPairs(middleA, middleB);
  const pairs: [number, number][] = [];
  for (let k = 0; k < prefix; k += 1) pairs.push([k, k]);
  for (const [i, j] of middle) pairs.push([prefix + i, prefix + j]);
  for (let k = 0; k < suffix; k += 1) {
    pairs.push([a.length - suffix + k, b.length - suffix + k]);
  }
  return expand(pairs, a.length, b.length);
}
