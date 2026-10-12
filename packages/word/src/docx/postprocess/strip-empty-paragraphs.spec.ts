import { describe, expect, it } from 'vitest';
import { runPass } from '../testing/dom';
import { stripEmptyParagraphs } from './strip-empty-paragraphs';

describe('stripEmptyParagraphs', () => {
  it('supprime les paragraphes vides, blancs ou en espaces insécables', () => {
    const { html } = runPass(stripEmptyParagraphs, '<p>a</p><p></p><p>  </p><p>&nbsp;</p><p>b</p>');
    expect(html).toBe('<p>a</p><p>b</p>');
  });

  it('garde les paragraphes vides dans les cellules et les li', () => {
    const input =
      '<table><tbody><tr><td><p></p></td></tr></tbody></table><ul><li><p></p></li></ul>';
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
