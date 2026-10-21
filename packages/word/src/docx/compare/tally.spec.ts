import { describe, expect, it } from 'vitest';
import { computeScore, GROUP_WEIGHTS, Tally } from './tally.js';
import type { FidelityProperty } from './types.js';

function prop(
  group: FidelityProperty['group'],
  total: number,
  kept: number,
  name = `${group}.x`,
): FidelityProperty {
  return { name, group, total, kept, lost: total - kept, examples: [] };
}

describe('Tally', () => {
  it('compte total, conservé, perdu et garde cinq exemples au plus', () => {
    const tally = new Tally();
    for (let i = 0; i < 8; i += 1) {
      tally.record('text', 'paragraph.text', `paragraphe ${String(i + 1)}`, 'a', i < 2 ? 'a' : 'b');
    }
    const [property] = tally.properties();
    expect(property).toMatchObject({
      name: 'paragraph.text',
      group: 'text',
      total: 8,
      kept: 2,
      lost: 6,
    });
    expect(property?.examples).toHaveLength(5);
    expect(property?.examples[0]).toEqual({ where: 'paragraphe 3', expected: 'a', actual: 'b' });
  });

  it('record renvoie vrai quand l’occurrence est conservée', () => {
    const tally = new Tally();
    expect(tally.record('text', 'n', 'w', 'x', 'x')).toBe(true);
    expect(tally.record('text', 'n', 'w', 'x', 'y')).toBe(false);
  });

  it('trie les propriétés par groupe (ordre du contrat) puis par nom', () => {
    const tally = new Tally();
    tally.record('section', 'section.pgSz', 'w', 'a', 'a');
    tally.record('text', 'paragraph.text', 'w', 'a', 'a');
    tally.record('run-format', 'run.color', 'w', 'a', 'a');
    tally.record('run-format', 'run.bold', 'w', 'a', 'a');
    expect(tally.properties().map((p) => p.name)).toEqual([
      'paragraph.text',
      'run.bold',
      'run.color',
      'section.pgSz',
    ]);
  });
});

describe('computeScore', () => {
  it('vaut 1 sans occurrence et 1 quand tout est conservé', () => {
    expect(computeScore([])).toBe(1);
    expect(computeScore([prop('text', 3, 3), prop('table', 2, 2)])).toBe(1);
  });

  it('moyenne pondérée calculée à la main, arrondie à trois décimales', () => {
    // text 3 × 0,5 + paragraph-style 2 × 1 + list 1 × 0 = 3,5 sur 6 = 0,58333…
    const score = computeScore([
      prop('text', 4, 2),
      prop('paragraph-style', 1, 1),
      prop('list', 2, 0),
    ]);
    expect(score).toBe(0.583);
  });

  it('agrège plusieurs propriétés d’un même groupe avant de pondérer', () => {
    // run-format : (1 + 0) / (1 + 3) = 0,25 ; package-part : 1. (2 × 0,25 + 2 × 1) / 4 = 0,625.
    const score = computeScore([
      prop('run-format', 1, 1, 'run.bold'),
      prop('run-format', 3, 0, 'run.color'),
      prop('package-part', 5, 5),
    ]);
    expect(score).toBe(0.625);
  });

  it('un groupe sans occurrence ne compte pas', () => {
    expect(computeScore([prop('text', 2, 1), prop('image', 0, 0)])).toBe(0.5);
  });

  it('les poids sont ceux du brief', () => {
    expect(GROUP_WEIGHTS).toEqual({
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
    });
  });
});
