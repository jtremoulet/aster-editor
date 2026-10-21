import { describe, expect, it } from 'vitest';
import { parseHtml, runPass } from '../../testing/html-compare.js';
import {
  stripConditionalComments,
  stripConditionalCommentsText,
} from './strip-conditional-comments.js';

describe('stripConditionalCommentsText', () => {
  it('jette le contenu des commentaires conditionnels cachés', () => {
    const html = '<p>a</p><!--[if gte mso 9]><xml><o:x/></xml><![endif]--><p>b</p>';
    expect(stripConditionalCommentsText(html)).toBe('<p>a</p><p>b</p>');
  });

  it('retire les marqueurs révélés en gardant leur contenu', () => {
    const html = '<p><![if !supportLists]><span>·</span><![endif]>Item</p>';
    expect(stripConditionalCommentsText(html)).toBe('<p><span>·</span>Item</p>');
  });

  it('couvre un commentaire conditionnel sur plusieurs lignes', () => {
    const html = '<!--[if gte vml 1]>\n<v:shape>\n</v:shape>\n<![endif]-->x';
    expect(stripConditionalCommentsText(html)).toBe('x');
  });
});

describe('stripConditionalComments', () => {
  it('retire tous les nœuds commentaire du document', () => {
    const html = '<!--StartFragment--><p>a<!-- note --></p><!--EndFragment-->';
    expect(runPass(html, stripConditionalComments)).toBe('<p>a</p>');
  });

  it('retire les commentaires bogus produits par le parseur pour les marqueurs révélés', () => {
    const doc = parseHtml('<p><![if !supportLists]>x<![endif]></p>');
    stripConditionalComments(doc, {
      keepColors: false,
      keepAlignment: true,
      listFormats: new Map(),
    });
    expect(doc.body.innerHTML).toBe('<p>x</p>');
  });
});
