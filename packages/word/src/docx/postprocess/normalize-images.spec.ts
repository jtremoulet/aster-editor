import { describe, expect, it } from 'vitest';
import { runPass } from '../testing/dom.js';
import { normalizeImages } from './normalize-images.js';

describe('normalizeImages', () => {
  it('ajoute un alt vide quand il manque', () => {
    const { html } = runPass(normalizeImages, '<p><img src="a.png"></p>');
    expect(html).toBe('<p><img src="a.png" alt=""></p>');
  });

  it('conserve un alt existant', () => {
    const input = '<p><img src="a.png" alt="Logo"></p>';
    expect(runPass(normalizeImages, input).html).toBe(input);
  });

  it('retire les dimensions nulles ou auto et garde les autres', () => {
    const { html } = runPass(
      normalizeImages,
      '<p><img src="a.png" alt="" width="0" height="0px"><img src="b.png" alt="" width="auto" height="120"></p>',
    );
    expect(html).toBe('<p><img src="a.png" alt=""><img src="b.png" alt="" height="120"></p>');
  });

  it('retire aussi une dimension vide', () => {
    const { html } = runPass(normalizeImages, '<p><img src="a.png" alt="" width=""></p>');
    expect(html).toBe('<p><img src="a.png" alt=""></p>');
  });
});
