import { describe, expect, it } from 'vitest';
import { alignSequences, MAX_LCS_CELLS } from './align';

describe('alignSequences', () => {
  it('même longueur : alignement par position, même si les clés diffèrent', () => {
    expect(alignSequences(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { a: 0, b: 0 },
      { a: 1, b: 1 },
      { a: 2, b: 2 },
    ]);
  });

  it('bloc inséré : LCS, l’insertion est intercalée à sa place', () => {
    expect(alignSequences(['a', 'b', 'c'], ['a', 'x', 'b', 'c'])).toEqual([
      { a: 0, b: 0 },
      { b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 3 },
    ]);
  });

  it('bloc supprimé : l’orphelin de l’original est conservé dans l’ordre', () => {
    expect(alignSequences(['a', 'b', 'c', 'd'], ['a', 'd'])).toEqual([
      { a: 0, b: 0 },
      { a: 1 },
      { a: 2 },
      { a: 3, b: 1 },
    ]);
  });

  it('séquences vides et sans rien en commun', () => {
    expect(alignSequences([], ['a'])).toEqual([{ b: 0 }]);
    expect(alignSequences(['a'], [])).toEqual([{ a: 0 }]);
    expect(alignSequences(['a', 'b'], ['c'])).toEqual([{ a: 0 }, { a: 1 }, { b: 0 }]);
  });

  it('préfixe et suffixe communs retirés avant la LCS, clés répétées appariées dans l’ordre', () => {
    expect(alignSequences(['', 'a', '', 'b'], ['', 'a', '', '', 'b'])).toEqual([
      { a: 0, b: 0 },
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { b: 3 },
      { a: 3, b: 4 },
    ]);
  });

  it('au-delà de la borne LCS, appariement glouton monotone en temps linéaire', () => {
    const size = Math.ceil(Math.sqrt(MAX_LCS_CELLS)) + 10;
    const a = Array.from({ length: size }, (_, i) => `k${String(i)}`);
    const b = [...a.slice(0, 5), 'inséré', ...a.slice(5)];
    // Tous les éléments diffèrent au milieu : le préfixe/suffixe ne suffit pas, la table serait trop grande.
    const shuffled = b.map((key, i) => (i % 2 === 0 ? key : `${key}!`));
    const started = performance.now();
    const pairs = alignSequences(a, shuffled);
    expect(performance.now() - started).toBeLessThan(500);
    const matched = pairs.filter((pair) => pair.a !== undefined && pair.b !== undefined);
    expect(matched.length).toBeGreaterThan(size / 2 - 5);
    // Monotone : les index croissent des deux côtés.
    for (let i = 1; i < matched.length; i += 1) {
      expect(matched[i]?.a).toBeGreaterThan(matched[i - 1]?.a ?? -1);
      expect(matched[i]?.b).toBeGreaterThan(matched[i - 1]?.b ?? -1);
    }
    expect(pairs.filter((pair) => pair.a !== undefined).length).toBe(a.length);
    expect(pairs.filter((pair) => pair.b !== undefined).length).toBe(shuffled.length);
  });
});
