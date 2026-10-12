import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { isBlankRichText, requiredRichText } from './required-rich-text';

describe('requiredRichText', () => {
  it('refuse la chaîne vide, le paragraphe vide et le HTML sans texte', () => {
    for (const value of ['', '<p></p>', '<p>&nbsp;</p>', '<h1> </h1><ul><li><p></p></li></ul>']) {
      expect(isBlankRichText(value)).toBe(true);
      expect(requiredRichText(new FormControl(value))).toEqual({ requiredRichText: true });
    }
    expect(requiredRichText(new FormControl<string | null>(null))).toEqual({
      requiredRichText: true,
    });
  });

  it('accepte un document avec du texte', () => {
    expect(requiredRichText(new FormControl('<p>Bonjour</p>'))).toBeNull();
    expect(isBlankRichText('<ul><li><p>x</p></li></ul>')).toBe(false);
  });
});
