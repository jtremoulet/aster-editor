import { describe, expect, it } from 'vitest';
import { parseHtml } from '../testing/html-compare';
import {
  collectTextNodes,
  getStyleProperty,
  isBlank,
  isBlockElement,
  parseStyle,
  renameElement,
  serializeStyle,
  unwrap,
  wrapChildren,
} from './dom-utils';

describe('parseStyle / serializeStyle', () => {
  it('découpe les déclarations, ignore les morceaux invalides et normalise les noms', () => {
    expect(parseStyle("Color: Red; font-family:'A, B'; ; broken ; mso-x:")).toEqual([
      ['color', 'Red'],
      ['font-family', "'A, B'"],
    ]);
    expect(parseStyle(null)).toEqual([]);
  });

  it('sérialise en style compact et rend null pour une liste vide', () => {
    expect(
      serializeStyle([
        ['color', 'red'],
        ['text-align', 'center'],
      ]),
    ).toBe('color:red;text-align:center');
    expect(serializeStyle([])).toBeNull();
  });

  it('lit une propriété sur un élément', () => {
    const doc = parseHtml('<p style="text-align:center">x</p>');
    const paragraph = doc.body.firstElementChild;
    expect(paragraph && getStyleProperty(paragraph, 'text-align')).toBe('center');
    expect(paragraph && getStyleProperty(paragraph, 'color')).toBeUndefined();
  });
});

describe('isBlank / isBlockElement', () => {
  it('considère vides les blancs, insécables et chaînes nulles', () => {
    expect(isBlank(`  ${String.fromCharCode(160)}\n`)).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank('a')).toBe(false);
  });

  it('distingue blocs, inline et nœuds texte', () => {
    const doc = parseHtml('<p>a<span>b</span></p>');
    const paragraph = doc.body.firstElementChild;
    expect(isBlockElement(paragraph)).toBe(true);
    expect(isBlockElement(paragraph?.lastElementChild ?? null)).toBe(false);
    expect(isBlockElement(paragraph?.firstChild ?? null)).toBe(false);
    expect(isBlockElement(null)).toBe(false);
  });
});

describe('manipulation d’arbre', () => {
  it('unwrap remplace un élément par ses enfants et ignore un élément détaché', () => {
    const doc = parseHtml('<p><span>a<b>b</b></span></p>');
    const span = doc.querySelector('span');
    if (span) {
      unwrap(span);
    }
    expect(doc.body.innerHTML).toBe('<p>a<b>b</b></p>');
    expect(() => unwrap(doc.createElement('span'))).not.toThrow();
  });

  it('renameElement garde uniquement les attributs demandés', () => {
    const doc = parseHtml('<p class="x" style="color:red" lang="fr">a</p>');
    const paragraph = doc.body.firstElementChild;
    if (paragraph) {
      renameElement(doc, paragraph, 'h1');
    }
    expect(doc.body.innerHTML).toBe('<h1 style="color:red">a</h1>');
  });

  it('wrapChildren enveloppe le contenu dans une nouvelle balise', () => {
    const doc = parseHtml('<p>a<em>b</em></p>');
    const paragraph = doc.body.firstElementChild;
    if (paragraph) {
      wrapChildren(doc, paragraph, 'strong');
    }
    expect(doc.body.innerHTML).toBe('<p><strong>a<em>b</em></strong></p>');
  });

  it('collectTextNodes parcourt en profondeur en sautant les balises exclues', () => {
    const doc = parseHtml('<p>a<pre>b</pre><span>c</span></p>');
    const texts = collectTextNodes(doc.body, new Set(['pre'])).map((text) => text.data);
    expect(texts).toEqual(['a', 'c']);
  });
});
