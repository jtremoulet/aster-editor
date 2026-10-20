import { describe, expect, it } from 'vitest';
import { parseFragment, runPass } from '../testing/dom';
import { normalizeLists } from './normalize-lists';
import { runPostprocess } from './run-postprocess';

describe('normalizeLists', () => {
  it('n’insère pas de paragraphe vide devant un titre ou une citation en tête de li (W-13)', () => {
    const input = '<ol><li><h2>Titre</h2></li><li><blockquote><p>q</p></blockquote></li></ol>';
    expect(runPass(normalizeLists, input).html).toBe(input);
  });

  it('ne laisse aucun paragraphe vide visible dans les li après tout le post-traitement (W-13)', () => {
    const doc = parseFragment(
      '<ol><li><h2>Titre</h2></li><li><p>a</p><p> </p></li><li><ol><li>b</li></ol></li></ol>',
    );
    runPostprocess(doc, { options: { footnotes: true, emptyParagraphs: 'drop' }, warnings: [] });
    expect(doc.body.innerHTML).toBe(
      '<ol><li><h2>Titre</h2></li><li><p>a</p></li><li><p></p><ol><li><p>b</p></li></ol></li></ol>',
    );
  });

  it('enveloppe le texte inline d’un li dans un paragraphe', () => {
    const { html } = runPass(normalizeLists, '<ul><li>a</li><li><strong>b</strong> c</li></ul>');
    expect(html).toBe('<ul><li><p>a</p></li><li><p><strong>b</strong> c</p></li></ul>');
  });

  it('enveloppe le texte avant une sous-liste imbriquée, sans toucher à la sous-liste', () => {
    const { html } = runPass(normalizeLists, '<ul><li>a<ul><li>b</li></ul></li></ul>');
    expect(html).toBe('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>');
  });

  it('laisse un li déjà structuré en blocs tel quel', () => {
    const input = '<ol><li><p>a</p><ol><li><p>b</p></li></ol></li></ol>';
    expect(runPass(normalizeLists, input).html).toBe(input);
  });

  it('rattache une sous-liste sortie au niveau de la liste au li précédent', () => {
    const { html } = runPass(normalizeLists, '<ul><li>a</li><ul><li>b</li></ul><li>c</li></ul>');
    expect(html).toBe('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li><li><p>c</p></li></ul>');
  });

  it('crée un li porteur quand une sous-liste orpheline ouvre la liste', () => {
    const { html } = runPass(normalizeLists, '<ol><ol><li>b</li></ol></ol>');
    expect(html).toBe('<ol><li><p></p><ol><li><p>b</p></li></ol></li></ol>');
  });

  it('donne un paragraphe vide à un li vide', () => {
    const { html } = runPass(normalizeLists, '<ul><li></li><li>   </li></ul>');
    expect(html).toBe('<ul><li><p></p></li><li><p></p></li></ul>');
  });

  it('gère trois niveaux d’imbrication', () => {
    const { html } = runPass(
      normalizeLists,
      '<ul><li>1<ul><li>2<ul><li>3</li></ul></li></ul></li></ul>',
    );
    expect(html).toBe(
      '<ul><li><p>1</p><ul><li><p>2</p><ul><li><p>3</p></li></ul></li></ul></li></ul>',
    );
  });
});
