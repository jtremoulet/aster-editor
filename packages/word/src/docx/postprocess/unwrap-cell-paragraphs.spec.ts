import { describe, expect, it } from 'vitest';
import { runPass } from '../testing/dom.js';
import { unwrapCellParagraphs } from './unwrap-cell-paragraphs.js';

describe('unwrapCellParagraphs', () => {
  it('garde tel quel le paragraphe unique d’une cellule', () => {
    const input = '<table><tbody><tr><td><p>a</p></td><th><p>b</p></th></tr></tbody></table>';
    expect(runPass(unwrapCellParagraphs, input).html).toBe(input);
  });

  it('donne un paragraphe vide à une cellule vide ou blanche', () => {
    const { html } = runPass(
      unwrapCellParagraphs,
      '<table><tbody><tr><td></td><td>  </td></tr></tbody></table>',
    );
    expect(html).toBe('<table><tbody><tr><td><p></p></td><td><p></p></td></tr></tbody></table>');
  });

  it('enveloppe le texte inline nu dans un paragraphe', () => {
    const { html } = runPass(
      unwrapCellParagraphs,
      '<table><tbody><tr><td>a <strong>b</strong></td></tr></tbody></table>',
    );
    expect(html).toBe(
      '<table><tbody><tr><td><p>a <strong>b</strong></p></td></tr></tbody></table>',
    );
  });

  it('enveloppe l’inline autour des blocs existants sans les toucher', () => {
    const { html } = runPass(
      unwrapCellParagraphs,
      '<table><tbody><tr><td>avant<p>bloc</p>après<ul><li>x</li></ul></td></tr></tbody></table>',
    );
    expect(html).toBe(
      '<table><tbody><tr><td><p>avant</p><p>bloc</p><p>après</p><ul><li>x</li></ul></td></tr></tbody></table>',
    );
  });

  it('conserve plusieurs paragraphes dans une cellule', () => {
    const input = '<table><tbody><tr><td><p>a</p><p>b</p></td></tr></tbody></table>';
    expect(runPass(unwrapCellParagraphs, input).html).toBe(input);
  });
});
