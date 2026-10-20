import { describe, expect, it } from 'vitest';
import { runPass } from '../testing/dom';
import { footnotes } from './footnotes';

/** Sortie typique de mammoth pour un appel de note et sa liste finale. */
const MAMMOTH_NOTE =
  '<p>Texte<sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup>.</p>' +
  '<ol><li id="footnote-1"><p>Note une. <a href="#footnote-ref-1">↑</a></p></li></ol>';

describe('footnotes', () => {
  it('garde les notes en remplaçant les ancres par du texte simple', () => {
    const { html, warnings } = runPass(footnotes, MAMMOTH_NOTE);
    expect(html).toBe(
      '<p>Texte<sup>[1]</sup>.</p><ol data-footnotes=""><li data-footnote="footnote-1"><p>Note une.</p></li></ol>',
    );
    expect(warnings).toEqual([]);
  });

  it('supprime notes et appels avec footnotes: false et avertit', () => {
    const { html, warnings } = runPass(footnotes, MAMMOTH_NOTE, { footnotes: false });
    expect(html).toBe('<p>Texte.</p>');
    expect(warnings).toEqual([
      { code: 'footnotes-dropped', message: expect.stringContaining('1 note') },
    ]);
  });

  it('ne supprime que l’ancre quand le sup contient autre chose', () => {
    const { html } = runPass(
      footnotes,
      '<p>Texte<sup>x<a href="#footnote-1" id="footnote-ref-1">[1]</a></sup>.</p><ol><li id="footnote-1"><p>N</p></li></ol>',
      { footnotes: false },
    );
    expect(html).toBe('<p>Texte<sup>x</sup>.</p>');
  });

  it('gère aussi les notes de fin', () => {
    const { html } = runPass(
      footnotes,
      '<p>T<sup><a href="#endnote-1" id="endnote-ref-1">[1]</a></sup></p><ol><li id="endnote-1"><p>Fin <a href="#endnote-ref-1">↑</a></p></li></ol>',
    );
    expect(html).toBe(
      '<p>T<sup>[1]</sup></p><ol data-footnotes=""><li data-footnote="endnote-1"><p>Fin</p></li></ol>',
    );
  });

  it('ne touche pas une liste ordonnée ordinaire ni les liens externes', () => {
    const input = '<ol><li><p>a</p></li></ol><p><a href="https://example.com">lien</a></p>';
    const { html, warnings } = runPass(footnotes, input, { footnotes: false });
    expect(html).toBe(input);
    expect(warnings).toEqual([]);
  });

  it('retire le lien de retour sans laisser de nœud texte vide', () => {
    const { html } = runPass(
      footnotes,
      '<ol><li id="footnote-1"><p><a href="#footnote-ref-1">↑</a></p></li></ol>',
    );
    expect(html).toBe('<ol data-footnotes=""><li data-footnote="footnote-1"><p></p></li></ol>');
  });
});
