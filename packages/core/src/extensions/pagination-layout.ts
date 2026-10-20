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
}

/** Résultat d'une pagination : coupures dans l'ordre et nombre total de pages. */
export interface PaginationResult {
  readonly gaps: readonly PageGap[];
  readonly pageCount: number;
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

/**
 * Répartit des blocs insécables sur des pages de hauteur utile `pageHeight` (px).
 *
 * - `heights[i]` : hauteur rendue du bloc `i`, marges comprises.
 * - `breaks` : index des blocs devant lesquels une coupure est **forcée** (saut de page
 *   explicite, `pageBreakBefore`). Un index hors plage ou `0` est ignoré : la première
 *   page existe toujours, une coupure forcée en tête ne crée pas de page vide avant elle.
 *
 * Règles : un bloc qui dépasserait la page passe entier à la suivante, sauf s'il est le
 * premier de sa page (il la déborde alors, seul). Un bloc de hauteur nulle (saut de page
 * explicite, remplacé visuellement par la coupure, R30-01) n'ouvre jamais de page à lui
 * seul, même après un bloc qui déborde : il reste sur la page courante et la coupure
 * forcée qui le suit fait le travail. Une coupure forcée remet le compteur à zéro même
 * si la page courante est vide (deux sauts consécutifs = une page vide, comme Word).
 * `pageHeight` nulle, négative ou infinie : une seule page, aucune coupure.
 */
export function paginate(
  heights: readonly number[],
  pageHeight: number,
  breaks: ReadonlySet<number> | readonly number[] = [],
): PaginationResult {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0 || heights.length === 0) {
    return EMPTY_PAGINATION;
  }
  const forced = breaks instanceof Set ? breaks : new Set(breaks);
  const gaps: PageGap[] = [];
  let used = 0;
  let page = 1;
  for (let index = 0; index < heights.length; index += 1) {
    const height = sanitizeHeight(heights[index]);
    const forcedHere = index > 0 && forced.has(index);
    const overflows = used > 0 && height > 0 && used + height > pageHeight + HEIGHT_EPSILON;
    if (forcedHere || overflows) {
      page += 1;
      gaps.push({ index, page, fill: Math.max(0, pageHeight - used) });
      used = 0;
    }
    used += height;
  }
  return gaps.length === 0 ? EMPTY_PAGINATION : { gaps, pageCount: page };
}

/** Vrai si deux résultats décrivent les mêmes coupures (au pixel près pour `fill`). */
export function samePagination(a: PaginationResult, b: PaginationResult): boolean {
  if (a === b) {
    return true;
  }
  if (a.pageCount !== b.pageCount || a.gaps.length !== b.gaps.length) {
    return false;
  }
  return a.gaps.every((gap, position) => {
    const other = b.gaps[position];
    return (
      other !== undefined &&
      gap.index === other.index &&
      gap.page === other.page &&
      Math.round(gap.fill) === Math.round(other.fill)
    );
  });
}
