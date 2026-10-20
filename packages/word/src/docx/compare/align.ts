/**
 * Alignement de deux séquences de blocs (ou de runs) pour le rapport de fidélité.
 * Préfixe et suffixe communs retirés, puis LCS sur les clés du milieu, borné
 * (`MAX_LCS_CELLS`) ; au-delà, appariement guidé par les clés **uniques** des deux côtés :
 * plus longue sous-suite croissante de leurs positions (patience diff, R30-06), puis LCS ou
 * nouvel ancrage dans chaque trou entre deux ancres, glouton monotone en dernier recours.
 * Entre deux paires appariées, un trou de **même longueur** des deux côtés est apparié par
 * position (blocs modifiés, R30-09) : deux séquences de même longueur dont tout colle
 * restent alignées par position, à coût nul, et un bloc retiré plus un bloc ajouté coûtent
 * plus qu'un bloc retiré.
 */

/** Paire alignée : `a` et `b` sont des index, `undefined` pour un élément sans vis-à-vis. */
export interface AlignedPair {
  readonly a?: number;
  readonly b?: number;
}

/** Au-delà de ce nombre de cellules de la table LCS, l'ancrage par clés uniques prend le relais. */
export const MAX_LCS_CELLS = 1_000_000;

type Pair = [number, number];

function lcsPairs(a: readonly string[], b: readonly string[]): Pair[] {
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
  const pairs: Pair[] = [];
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
function greedyPairs(a: readonly string[], b: readonly string[]): Pair[] {
  const positions = new Map<string, number[]>();
  b.forEach((key, index) => {
    const list = positions.get(key);
    if (list) list.push(index);
    else positions.set(key, [index]);
  });
  const pairs: Pair[] = [];
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

/** Position de chaque clé présente **une seule fois** dans la séquence. */
function uniquePositions(keys: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const positions = new Map<string, number>();
  keys.forEach((key, index) => {
    if (counts.get(key) === 1) positions.set(key, index);
  });
  return positions;
}

/**
 * Ancres : clés uniques des deux côtés, prises dans l'ordre de `a`, dont on garde la plus
 * longue sous-suite croissante en `b` (patience sorting, O(m log m)). Un bloc déplacé du
 * début à la fin ne fait plus sauter tout le reste, comme le faisait le glouton.
 */
function anchorPairs(a: readonly string[], b: readonly string[]): Pair[] {
  const inB = uniquePositions(b);
  const candidates: Pair[] = [];
  for (const [key, i] of uniquePositions(a)) {
    const j = inB.get(key);
    if (j !== undefined) candidates.push([i, j]);
  }
  candidates.sort((x, y) => x[0] - y[0]);
  // `tails[k]` : index dans `candidates` de la fin de la plus petite sous-suite de longueur k + 1.
  const tails: number[] = [];
  const previous: number[] = new Array<number>(candidates.length).fill(-1);
  candidates.forEach(([, j], index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const tail = candidates[tails[mid] ?? 0];
      if (tail !== undefined && tail[1] < j) low = mid + 1;
      else high = mid;
    }
    previous[index] = low > 0 ? (tails[low - 1] ?? -1) : -1;
    tails[low] = index;
  });
  const chain: Pair[] = [];
  for (let at = tails[tails.length - 1] ?? -1; at >= 0; at = previous[at] ?? -1) {
    const pair = candidates[at];
    if (pair) chain.push(pair);
  }
  return chain.reverse();
}

/** Tranche à aligner : bornes dans `a` et `b`, résultat décalé d'`offsetA` / `offsetB`. */
interface Span {
  readonly a: readonly string[];
  readonly b: readonly string[];
  readonly offsetA: number;
  readonly offsetB: number;
}

/**
 * Paires du milieu, après retrait du préfixe et du suffixe : LCS quand la table tient,
 * sinon ancrage par clés uniques et traitement des trous entre ancres (pile explicite,
 * un trou sans aucune ancre tombe sur le glouton). Les paires sont rendues triées.
 */
function middlePairs(a: readonly string[], b: readonly string[]): Pair[] {
  const pairs: Pair[] = [];
  const stack: Span[] = [{ a, b, offsetA: 0, offsetB: 0 }];
  for (let span = stack.pop(); span !== undefined; span = stack.pop()) {
    const { offsetA, offsetB } = span;
    if (span.a.length === 0 || span.b.length === 0) continue;
    const shift = (list: readonly Pair[]): void => {
      for (const [i, j] of list) pairs.push([offsetA + i, offsetB + j]);
    };
    if ((span.a.length + 1) * (span.b.length + 1) <= MAX_LCS_CELLS) {
      shift(lcsPairs(span.a, span.b));
      continue;
    }
    const anchors = anchorPairs(span.a, span.b);
    if (anchors.length === 0) {
      shift(greedyPairs(span.a, span.b));
      continue;
    }
    shift(anchors);
    let fromA = 0;
    let fromB = 0;
    for (const [i, j] of [...anchors, [span.a.length, span.b.length] as Pair]) {
      if (i > fromA && j > fromB) {
        stack.push({
          a: span.a.slice(fromA, i),
          b: span.b.slice(fromB, j),
          offsetA: offsetA + fromA,
          offsetB: offsetB + fromB,
        });
      }
      fromA = i + 1;
      fromB = j + 1;
    }
  }
  return pairs.sort((x, y) => x[0] - y[0]);
}

/**
 * Développe une liste de paires appariées en séquence complète. Entre deux paires, un trou
 * de même longueur des deux côtés est apparié par position (blocs modifiés) ; sinon les
 * orphelins sont intercalés à leur place (`a` seul = supprimé, `b` seul = inséré).
 */
function expand(pairs: readonly Pair[], aLength: number, bLength: number): AlignedPair[] {
  const out: AlignedPair[] = [];
  let i = 0;
  let j = 0;
  for (const [pa, pb] of [...pairs, [aLength, bLength] as Pair]) {
    if (pa - i === pb - j) {
      while (i < pa) out.push({ a: i++, b: j++ });
    } else {
      while (i < pa) out.push({ a: i++ });
      while (j < pb) out.push({ b: j++ });
    }
    if (pa < aLength) out.push({ a: pa, b: pb });
    i = pa + 1;
    j = pb + 1;
  }
  return out;
}

/**
 * Aligne deux séquences par leurs clés. Les paires sont rendues dans l'ordre, les
 * éléments sans vis-à-vis intercalés à leur place (`a` seul = supprimé, `b` seul = inséré).
 */
export function alignSequences(a: readonly string[], b: readonly string[]): AlignedPair[] {
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
  const pairs: Pair[] = [];
  for (let k = 0; k < prefix; k += 1) pairs.push([k, k]);
  for (const [i, j] of middlePairs(
    a.slice(prefix, a.length - suffix),
    b.slice(prefix, b.length - suffix),
  )) {
    pairs.push([prefix + i, prefix + j]);
  }
  for (let k = 0; k < suffix; k += 1) {
    pairs.push([a.length - suffix + k, b.length - suffix + k]);
  }
  return expand(pairs, a.length, b.length);
}
