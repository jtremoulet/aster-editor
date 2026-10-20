import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { isBlankRichText, requiredRichText } from './required-rich-text';

describe('requiredRichText', () => {
  it('refuse la chaîne vide, null et le HTML sans texte', () => {
    for (const value of ['', '<p></p>', '<h1> </h1><ul><li><p></p></li></ul>']) {
      expect(isBlankRichText(value)).toBe(true);
      expect(requiredRichText(new FormControl(value))).toEqual({ requiredRichText: true });
    }
    expect(requiredRichText(new FormControl<string | null>(null))).toEqual({
      requiredRichText: true,
    });
  });

  it.each([
    ['<p></p>', true],
    ['<p><br></p>', true],
    ['<p>&nbsp;</p>', true],
    ['<p> </p>', true],
    ['<p><img src="x"></p>', false],
    ['<table><tbody><tr><td><p></p></td></tr></tbody></table>', false],
    ['<hr>', false],
  ])('%s → vide : %s', (html, blank) => {
    expect(isBlankRichText(html)).toBe(blank);
    expect(requiredRichText(new FormControl(html))).toEqual(
      blank ? { requiredRichText: true } : null,
    );
  });

  it('accepte un document avec du texte', () => {
    expect(requiredRichText(new FormControl('<p>Bonjour</p>'))).toBeNull();
    expect(isBlankRichText('<ul><li><p>x</p></li></ul>')).toBe(false);
  });
});
