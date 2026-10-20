import { describe, expect, it } from 'vitest';
import { runPass } from '../testing/dom';
import { normalizeTables } from './normalize-tables';

describe('normalizeTables', () => {
  it('enveloppe les lignes nues dans un tbody', () => {
    const { html } = runPass(
      normalizeTables,
      '<table><tr><td>a</td></tr><tr><td>b</td></tr></table>',
    );
    expect(html).toBe('<table><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table>');
  });

  it('promeut la première ligne en thead/th quand toutes ses cellules sont en gras', () => {
    const { html } = runPass(
      normalizeTables,
      '<table><tr><td><p><strong>A</strong></p></td><td><strong>B</strong></td></tr><tr><td>1</td><td>2</td></tr></table>',
    );
    expect(html).toBe(
      '<table><thead><tr><th><p><strong>A</strong></p></th><th><strong>B</strong></th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
  });

  it('ne promeut pas une première ligne partiellement en gras', () => {
    const { html } = runPass(
      normalizeTables,
      '<table><tr><td><strong>A</strong></td><td>B</td></tr></table>',
    );
    expect(html).toBe(
      '<table><tbody><tr><td><strong>A</strong></td><td>B</td></tr></tbody></table>',
    );
  });

  it('ne promeut pas une première ligne vide ou mêlant gras et texte', () => {
    const { html } = runPass(
      normalizeTables,
      '<table><tr><td></td></tr></table><table><tr><td><p><strong>A</strong> suite</p></td></tr></table>',
    );
    expect(html).toBe(
      '<table><tbody><tr><td></td></tr></tbody></table><table><tbody><tr><td><p><strong>A</strong> suite</p></td></tr></tbody></table>',
    );
  });

  it('conserve un thead existant et ses th, et complète le tbody', () => {
    const { html } = runPass(
      normalizeTables,
      '<table><thead><tr><th>H</th></tr></thead><tr><td>1</td></tr></table>',
    );
    expect(html).toBe(
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
    );
  });

  it('conserve colspan et rowspan, y compris sur les cellules promues', () => {
    const { html } = runPass(
      normalizeTables,
      '<table><tr><td colspan="2"><strong>A</strong></td></tr><tr><td rowspan="2">1</td><td>2</td></tr></table>',
    );
    expect(html).toContain('<th colspan="2"><strong>A</strong></th>');
    expect(html).toContain('<td rowspan="2">1</td>');
  });

  it('garde caption et colgroup en tête de table', () => {
    const { html } = runPass(
      normalizeTables,
      '<table><caption>C</caption><tr><td>1</td></tr></table>',
    );
    expect(html).toBe('<table><caption>C</caption><tbody><tr><td>1</td></tr></tbody></table>');
  });

  it('ignore une table sans ligne', () => {
    const { html } = runPass(normalizeTables, '<table></table>');
    expect(html).toBe('<table></table>');
  });

  it('ne touche pas une table déjà sectionnée', () => {
    const input =
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    expect(runPass(normalizeTables, input).html).toBe(input);
  });
});
