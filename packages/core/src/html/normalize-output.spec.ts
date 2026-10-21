import { describe, expect, it } from 'vitest';
import { normalizeOutputHtml } from './normalize-output.js';

describe('normalizeOutputHtml', () => {
  it('rend le HTML sans table strictement identique', () => {
    const html = '<p>a</p><ul><li><p>b</p></li></ul>';
    expect(normalizeOutputHtml(html)).toBe(html);
  });

  it('retire colgroup, le min-width et les colspan/rowspan à 1', () => {
    const input =
      '<table style="min-width: 50px"><colgroup><col style="min-width: 25px"><col></colgroup>' +
      '<tbody><tr><th colspan="1" rowspan="1"><p>a</p></th></tr></tbody></table>';
    expect(normalizeOutputHtml(input)).toBe(
      '<table><tbody><tr><th><p>a</p></th></tr></tbody></table>',
    );
  });

  it('conserve les colspan et rowspan réels', () => {
    const input =
      '<table><tbody><tr><td colspan="2" rowspan="3"><p>a</p></td></tr></tbody></table>';
    expect(normalizeOutputHtml(input)).toBe(input);
  });

  it('conserve les autres styles de la table', () => {
    const input = '<table style="min-width: 50px; width: 100%"><tbody></tbody></table>';
    expect(normalizeOutputHtml(input)).toBe('<table style="width: 100%"><tbody></tbody></table>');
  });

  it('est idempotent', () => {
    const once = normalizeOutputHtml(
      '<table style="min-width: 1px"><colgroup><col></colgroup><tbody><tr><td colspan="1"><p>x</p></td></tr></tbody></table>',
    );
    expect(normalizeOutputHtml(once)).toBe(once);
  });
});
