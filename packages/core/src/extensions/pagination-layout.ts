/**
 * Calcul pur de la pagination approximative (session 3, lot L30) : aucune dépendance au
 * DOM, testable seul. Le plugin `pagination.ts` mesure les blocs rendus et appelle
 * `paginate` ; ce fichier ne connaît que des hauteurs en pixels.
 *
 * Modèle : chaque bloc de premier niveau est **insécable** (paragraphe, titre, liste,
 * tableau, image…). Un bloc qui ne tient pas dans le reste de la page passe entier à la
 * page suivante ; un bloc plus haut qu'une page occupe sa page seul et la déborde. C'est
 * une approximation assumée (Word coupe les paragraphes et les tableaux ligne à ligne).
 */

/** Pixels CSS par millimètre : 1 in = 96 px = 25,4 mm, valeur exacte de la spécification CSS. */
export const MM_TO_PX = 96 / 25.4;

/** Tolérance de comparaison des hauteurs, en px : absorbe les arrondis sous-pixel du rendu. */
const HEIGHT_EPSILON = 0.5;

/** Facteur px par unité pour les longueurs CSS absolues. */
const CSS_UNIT_TO_PX: Readonly<Record<string, number>> = {
  px: 1,
  mm: MM_TO_PX,
  cm: MM_TO_PX * 10,
  q: MM_TO_PX / 4,
  in: 96,
  pt: 96 / 72,
  pc: 16,
};

const CSS_LENGTH_PATTERN = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i;

/**
 * Convertit une longueur CSS absolue (`297mm`, `11in`, `72pt`, `120px`, `0`) en pixels CSS.
 * `null` pour une valeur vide, relative (`em`, `%`, `vh`…) ou illisible : l'appelant
 * retombe alors sur les métriques résolues depuis `DocumentLayout`.
 */
export function cssLengthToPx(value: string): number | null {
  const match = CSS_LENGTH_PATTERN.exec(value);
  if (!match || match[1] === undefined) {
    return null;
  }
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }
  const unit = (match[2] ?? '').toLowerCase();
  if (unit === '') {
    return amount === 0 ? 0 : null;
  }
  const factor = CSS_UNIT_TO_PX[unit];
  return factor === undefined ? null : amount * factor;
}

/** Une coupure de page : posée **avant** le bloc d'index `index`. */
export interface PageGap {
  /** Index du bloc de premier niveau qui ouvre la nouvelle page. */
  readonly index: number;
  /** Numéro (1-based) de la page qui commence après la coupure. */
  readonly page: number;
  /** Espace resté libre en bas de la page précédente, en px (jamais négatif). */
  readonly fill: number;
  /**
   * Numéro (1-based) du segment, donc de la section, auquel appartient la page qui
   * commence après la coupure (session 4, L44). Absent quand `paginate` a reçu une seule
   * hauteur utile.
   */
  readonly section?: number;
}

/**
 * Un segment de pagination (session 4, L44) : à partir du bloc `start` (index du premier
 * bloc d'une section), les pages ont la hauteur utile `pageHeight` (px). Le premier
 * segment couvre toujours le début du document, quel que soit son `start`.
 */
export interface PageSegment {
  readonly start: number;
  readonly pageHeight: number;
}

/** Variables CSS d'une section (`--aster-page-*` → valeur), telles que posées sur ses coupures. */
export type SectionCssVariables = Readonly<Record<string, string>>;

/** Résultat d'une pagination : coupures dans l'ordre et nombre total de pages. */
export interface PaginationResult {
  readonly gaps: readonly PageGap[];
  readonly pageCount: number;
  /**
   * Variables CSS mesurées de chaque section (index 0 = section 1), posées par
   * `measurePagination` quand le document a au moins un saut de section ; jamais par
   * `paginate`, qui ne connaît que des hauteurs.
   */
  readonly sections?: readonly SectionCssVariables[];
}

/** Résultat d'un document d'une seule page (ou d'une pagination inactive). */
export const EMPTY_PAGINATION: PaginationResult = Object.freeze({
  gaps: Object.freeze([]) as readonly PageGap[],
  pageCount: 1,
});

/** Hauteur finie et positive ou nulle ; `NaN`, `Infinity` et négatifs comptent pour 0. */
function sanitizeHeight(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Hauteur utile exploitable : finie et strictement positive. */
function isUsableHeight(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Segment normalisé : trié, hauteur toujours exploitable, numéro de section d'origine. */
interface ResolvedSegment {
  readonly start: number;
  readonly pageHeight: number;
  readonly section: number;
}

/**
 * Normalise l'argument `pageHeight` de `paginate` : une hauteur seule devient un segment
 * unique ; une liste est triée par `start` (ordre stable) en gardant le numéro de section
 * d'origine (position dans la liste + 1). Un segment à hauteur inexploitable hérite de la
 * précédente (ou de la première exploitable pour les premiers) : une section mal mesurée
 * ne décale jamais la numérotation. `null` si aucune hauteur n'est exploitable.
 */
function resolveSegments(pageHeight: number | readonly PageSegment[]): ResolvedSegment[] | null {
  if (typeof pageHeight === 'number') {
    return isUsableHeight(pageHeight) ? [{ start: 0, pageHeight, section: 1 }] : null;
  }
  const firstUsable = pageHeight.find((segment) => isUsableHeight(segment.pageHeight));
  if (firstUsable === undefined) {
    return null;
  }
  let previous = firstUsable.pageHeight;
  const resolved = pageHeight.map((segment, position): ResolvedSegment => {
    const height = isUsableHeight(segment.pageHeight) ? segment.pageHeight : previous;
    previous = height;
    const start = Number.isFinite(segment.start) ? Math.max(0, Math.floor(segment.start)) : 0;
    return { start, pageHeight: height, section: position + 1 };
  });
  return resolved.sort((a, b) => a.start - b.start);
}

/**
 * Répartit des blocs insécables sur des pages de hauteur utile `pageHeight` (px).
 *
 * - `heights[i]` : hauteur rendue du bloc `i`, marges comprises.
 * - `pageHeight` : une hauteur utile pour tout le document, ou (session 4, L44) une liste
 *   de segments `{ start, pageHeight }` : à partir du bloc `start`, la hauteur utile
 *   change. Chaque coupure porte alors `section` (position du segment + 1). Le saut de
 *   section lui-même est une coupure **forcée** que l'appelant ajoute à `breaks` (sauf
 *   section `continuous` : la hauteur change sans coupure).
 * - `breaks` : index des blocs devant lesquels une coupure est **forcée** (saut de page
 *   explicite, `pageBreakBefore`, saut de section). Un index hors plage ou `0` est
 *   ignoré : la première page existe toujours, une coupure forcée en tête ne crée pas de
 *   page vide avant elle.
 *
 * Règles : un bloc qui dépasserait la page passe entier à la suivante, sauf s'il est le
 * premier de sa page (il la déborde alors, seul). Un bloc de hauteur nulle (saut de page
 * explicite, remplacé visuellement par la coupure, R30-01) n'ouvre jamais de page à lui
 * seul, même après un bloc qui déborde : il reste sur la page courante et la coupure
 * forcée qui le suit fait le travail. Une coupure forcée remet le compteur à zéro même
 * si la page courante est vide (deux sauts consécutifs = une page vide, comme Word).
 * `pageHeight` nulle, négative ou infinie : une seule page, aucune coupure.
 *
 * Approximation des segments : le remplissage d'une coupure forcée au changement de
 * segment est calculé avec la hauteur de la section qui se termine ; une coupure par
 * débordement dans une section `continuous` (hauteur changée en cours de page) l'est
 * avec la hauteur de la nouvelle section, qui est celle « en vigueur » au bloc coupé.
 */
export function paginate(
  heights: readonly number[],
  pageHeight: number | readonly PageSegment[],
  breaks: ReadonlySet<number> | readonly number[] = [],
): PaginationResult {
  const segments = resolveSegments(pageHeight);
  const first = segments?.[0];
  if (!segments || first === undefined || heights.length === 0) {
    return EMPTY_PAGINATION;
  }
  const sectioned = typeof pageHeight !== 'number';
  const forced = breaks instanceof Set ? breaks : new Set(breaks);
  const gaps: PageGap[] = [];
  let used = 0;
  let page = 1;
  let position = 0;
  let current = first;
  for (let index = 0; index < heights.length; index += 1) {
    const height = sanitizeHeight(heights[index]);
    const closing = current;
    let next = segments[position + 1];
    while (next !== undefined && next.start <= index) {
      position += 1;
      current = next;
      next = segments[position + 1];
    }
    const forcedHere = index > 0 && forced.has(index);
    const overflows = used > 0 && height > 0 && used + height > current.pageHeight + HEIGHT_EPSILON;
    if (forcedHere || overflows) {
      page += 1;
      const capacity = forcedHere ? closing.pageHeight : current.pageHeight;
      const fill = Math.max(0, capacity - used);
      gaps.push(
        sectioned ? { index, page, fill, section: current.section } : { index, page, fill },
      );
      used = 0;
    }
    used += height;
  }
  return gaps.length === 0 ? EMPTY_PAGINATION : { gaps, pageCount: page };
}

/** Vrai si deux jeux de variables de section ont les mêmes noms et les mêmes valeurs. */
function sameSectionVariables(a: SectionCssVariables, b: SectionCssVariables): boolean {
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every((name) => a[name] === b[name]);
}

/**
 * Vrai si deux résultats décrivent les mêmes coupures (au pixel près pour `fill`), les
 * mêmes sections par coupure et les mêmes variables de section (L44 : un changement de
 * mise en page d'une section doit redessiner ses coupures même à coupures égales).
 */
export function samePagination(a: PaginationResult, b: PaginationResult): boolean {
  if (a === b) {
    return true;
  }
  if (a.pageCount !== b.pageCount || a.gaps.length !== b.gaps.length) {
    return false;
  }
  const sectionsA = a.sections ?? [];
  const sectionsB = b.sections ?? [];
  if (
    sectionsA.length !== sectionsB.length ||
    !sectionsA.every((section, position) => {
      const other = sectionsB[position];
      return other !== undefined && sameSectionVariables(section, other);
    })
  ) {
    return false;
  }
  return a.gaps.every((gap, position) => {
    const other = b.gaps[position];
    return (
      other !== undefined &&
      gap.index === other.index &&
      gap.page === other.page &&
      gap.section === other.section &&
      Math.round(gap.fill) === Math.round(other.fill)
    );
  });
}
