import { describe, expect, it } from 'vitest';
import { runPass } from '../testing/dom.js';
import { stripEmptyParagraphs } from './strip-empty-paragraphs.js';

describe('stripEmptyParagraphs', () => {
  it('supprime les paragraphes vides, blancs ou en espaces insécables', () => {
    const { html } = runPass(stripEmptyParagraphs, '<p>a</p><p></p><p>  </p><p>&nbsp;</p><p>b</p>');
    expect(html).toBe('<p>a</p><p>b</p>');
  });

  it('garde le paragraphe vide qui est le seul bloc d’une cellule ou d’un li', () => {
    const input =
      '<table><tbody><tr><td><p></p></td></tr></tbody></table><ul><li><p></p></li></ul>';
    expect(runPass(stripEmptyParagraphs, input).html).toBe(input);
  });

  it('supprime les paragraphes vides d’une cellule ou d’un li quand un autre bloc reste (W-13)', () => {
    const { html } = runPass(
      stripEmptyParagraphs,
      '<table><tbody><tr><td><p>a</p><p> </p></td><th><p></p><p>b</p></th></tr></tbody></table>' +
        '<ul><li><p>a</p><p>&nbsp;</p></li><li><p></p><p>b</p></li></ul>',
    );
    expect(html).toBe(
      '<table><tbody><tr><td><p>a</p></td><th><p>b</p></th></tr></tbody></table>' +
        '<ul><li><p>a</p></li><li><p>b</p></li></ul>',
    );
  });

  it('garde le paragraphe vide de tête d’un li qui ouvre sur une sous-liste', () => {
    const input = '<ul><li><p></p><ul><li><p>b</p></li></ul></li></ul>';
    expect(runPass(stripEmptyParagraphs, input).html).toBe(input);
  });

  it('garde un paragraphe sans texte mais porteur d’une image ou d’un saut de ligne', () => {
    const input = '<p><img src="a.png" alt=""></p><p><br></p>';
    expect(runPass(stripEmptyParagraphs, input).html).toBe(input);
  });

  it('supprime un paragraphe vide imbriqué dans une citation', () => {
    const { html } = runPass(stripEmptyParagraphs, '<blockquote><p>a</p><p></p></blockquote>');
    expect(html).toBe('<blockquote><p>a</p></blockquote>');
  });
});
