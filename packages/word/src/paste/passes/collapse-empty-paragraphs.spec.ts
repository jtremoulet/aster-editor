import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare';
import { collapseEmptyParagraphs } from './collapse-empty-paragraphs';

describe('collapseEmptyParagraphs', () => {
  it('supprime les paragraphes ne contenant que des insécables, des espaces ou des br', () => {
    const html = '<p>a</p><p>&nbsp;</p><p>   </p><p><br></p><p><span>&nbsp;</span></p><p>b</p>';
    expect(runPass(html, collapseEmptyParagraphs)).toBe('<p>a</p><p>b</p>');
  });

  it('conserve un paragraphe qui porte une image', () => {
    const html = '<p><img src="a.png"></p>';
    expect(runPass(html, collapseEmptyParagraphs)).toBe(html);
  });

  it('retire les br en fin de bloc et les br orphelins sous le corps', () => {
    const html = '<p>a<br><br></p><br class="Apple-interchange-newline"><h1>b <br></h1>';
    expect(runPass(html, collapseEmptyParagraphs)).toBe('<p>a</p><h1>b </h1>');
  });

  it('garde un paragraphe vide plutôt qu’un document vide', () => {
    expect(runPass('<p>&nbsp;</p><p><br></p>', collapseEmptyParagraphs)).toBe('<p></p>');
  });

  it('ne crée rien quand le corps était déjà vide', () => {
    expect(runPass('', collapseEmptyParagraphs)).toBe('');
  });
});
