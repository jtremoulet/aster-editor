import { describe, expect, it } from 'vitest';
import {
  EMPTY_PAGINATION,
  MM_TO_PX,
  cssLengthToPx,
  paginate,
  samePagination,
} from './pagination-layout';

describe('paginate (calcul pur)', () => {
  it('garde tout sur une page quand les blocs tiennent', () => {
    const result = paginate([10, 20, 30], 100);
    expect(result).toBe(EMPTY_PAGINATION);
    expect(result.pageCount).toBe(1);
    expect(result.gaps).toEqual([]);
    expect(paginate([50, 50], 100).gaps).toEqual([]);
  });

  it('fait passer entier le bloc qui déborde et mémorise l’espace resté libre', () => {
    const result = paginate([40, 40, 40, 40, 40], 100);
    expect(result.pageCount).toBe(3);
    expect(result.gaps).toEqual([
      { index: 2, page: 2, fill: 20 },
      { index: 4, page: 3, fill: 20 },
    ]);
  });

  it('un bloc plus haut qu’une page occupe sa page seul', () => {
    const result = paginate([30, 250, 30, 30], 100);
    expect(result.gaps).toEqual([
      { index: 1, page: 2, fill: 70 },
      { index: 2, page: 3, fill: 0 },
    ]);
    expect(result.pageCount).toBe(3);
    // En tête de document, il ne crée pas de page vide avant lui.
    expect(paginate([250, 30], 100).gaps).toEqual([{ index: 1, page: 2, fill: 0 }]);
  });

  it('un saut explicite force la coupure et remet le compteur à zéro', () => {
    const result = paginate([10, 10, 10, 10], 100, [2]);
    expect(result.gaps).toEqual([{ index: 2, page: 2, fill: 80 }]);
    expect(result.pageCount).toBe(2);
    // Même forme avec un Set ; une coupure forcée vaut même sur une page presque vide.
    expect(paginate([10, 10, 10], 100, new Set([1, 2])).gaps).toEqual([
      { index: 1, page: 2, fill: 90 },
      { index: 2, page: 3, fill: 90 },
    ]);
    // Deux sauts de page consécutifs (hauteur nulle) donnent une page vide, comme Word.
    expect(paginate([10, 0, 0, 10], 100, [1, 2, 3]).gaps).toEqual([
      { index: 1, page: 2, fill: 90 },
      { index: 2, page: 3, fill: 100 },
      { index: 3, page: 4, fill: 100 },
    ]);
    // Un saut avant le premier bloc ou hors plage est ignoré.
    expect(paginate([10, 10], 100, [0, 7, -1]).gaps).toEqual([]);
  });

  it('R30-01 : un bloc de hauteur nulle (saut explicite) n’ouvre jamais de page à lui seul', () => {
    // Bloc qui déborde sa page, puis le `hr` (hauteur 0) et la coupure forcée après lui :
    // avant le correctif, le hr « débordait » (200 + 0 > 100) et ouvrait une page vide.
    expect(paginate([200, 0, 10], 100, [2]).gaps).toEqual([{ index: 2, page: 2, fill: 0 }]);
    // Près du bas d'une page, même chose : la coupure est posée après le hr, pas avant.
    expect(paginate([40, 40, 0, 10], 113, [3])).toEqual({
      gaps: [{ index: 3, page: 2, fill: 33 }],
      pageCount: 2,
    });
  });

  it('un tableau (bloc insécable) qui déborde passe entier à la page suivante', () => {
    const table = 90;
    const result = paginate([30, table, 10], 100);
    expect(result.gaps).toEqual([{ index: 1, page: 2, fill: 70 }]);
    expect(result.pageCount).toBe(2);
  });

  it('compte les pages et tolère les hauteurs absurdes', () => {
    expect(paginate([Number.NaN, -5, Number.POSITIVE_INFINITY, 10], 100).pageCount).toBe(1);
    expect(paginate([60, 60, 60, 60, 60, 60], 100).pageCount).toBe(6);
    // Arrondi sous-pixel : 50 + 50,3 tient encore dans 100.
    expect(paginate([50, 50.3], 100).gaps).toEqual([]);
    expect(paginate([50, 51], 100).gaps).toHaveLength(1);
  });

  it('hauteur de page nulle, négative ou infinie, ou aucun bloc : une seule page', () => {
    expect(paginate([10, 10], 0)).toBe(EMPTY_PAGINATION);
    expect(paginate([10, 10], -1)).toBe(EMPTY_PAGINATION);
    expect(paginate([10, 10], Number.NaN)).toBe(EMPTY_PAGINATION);
    expect(paginate([], 100)).toBe(EMPTY_PAGINATION);
  });
});

describe('samePagination', () => {
  it('compare coupures et nombre de pages, au pixel près pour le remplissage', () => {
    const a = paginate([40, 40, 40], 100);
    const b = paginate([40, 40, 40.2], 100);
    expect(samePagination(a, a)).toBe(true);
    expect(samePagination(a, b)).toBe(true);
    expect(samePagination(a, EMPTY_PAGINATION)).toBe(false);
    expect(samePagination(a, paginate([40, 40, 40, 40, 40], 100))).toBe(false);
    expect(samePagination(paginate([60, 60], 100), paginate([70, 60], 100))).toBe(false);
    expect(samePagination(paginate([10, 95], 100), paginate([10, 95], 100, [1]))).toBe(true);
  });
});

describe('cssLengthToPx', () => {
  it('convertit les unités absolues en px CSS', () => {
    expect(cssLengthToPx('297mm')).toBeCloseTo(297 * MM_TO_PX, 6);
    expect(cssLengthToPx('1in')).toBe(96);
    expect(cssLengthToPx('2.54cm')).toBeCloseTo(96, 6);
    expect(cssLengthToPx('72pt')).toBe(96);
    expect(cssLengthToPx('1pc')).toBe(16);
    expect(cssLengthToPx('4Q')).toBeCloseTo(MM_TO_PX, 6);
    expect(cssLengthToPx(' 120px ')).toBe(120);
    expect(cssLengthToPx('0')).toBe(0);
    expect(cssLengthToPx('-1.5e1px')).toBe(-15);
  });

  it('rend null pour une valeur vide, relative ou illisible', () => {
    expect(cssLengthToPx('')).toBeNull();
    expect(cssLengthToPx('auto')).toBeNull();
    expect(cssLengthToPx('2em')).toBeNull();
    expect(cssLengthToPx('50%')).toBeNull();
    expect(cssLengthToPx('10')).toBeNull();
    expect(cssLengthToPx('calc(1in + 2px)')).toBeNull();
  });
});
