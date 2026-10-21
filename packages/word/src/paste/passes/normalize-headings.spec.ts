import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare.js';
import { normalizeHeadings } from './normalize-headings.js';

describe('normalizeHeadings', () => {
  it('convertit MsoTitle en h1 et MsoHeadingN en hN, plafonné à h6', () => {
    const html =
      '<p class=MsoTitle>T</p><p class=MsoHeading2>H2</p><p class="MsoHeading9 autre">H9</p>';
    expect(runPass(html, normalizeHeadings)).toBe('<h1>T</h1><h2>H2</h2><h6>H9</h6>');
  });

  it('conserve les h1-h6 émis par Word et le style du paragraphe renommé', () => {
    const html = '<h1>Gardé</h1><p class=MsoTitle style="text-align:center">T</p>';
    expect(runPass(html, normalizeHeadings)).toBe(
      '<h1>Gardé</h1><h1 style="text-align:center">T</h1>',
    );
  });

  it('enveloppe les citations dans un blockquote, consécutives dans le même', () => {
    const html =
      '<p class=MsoQuote>a</p><p class=MsoIntenseQuote>b</p><p class=MsoNormal>c</p><p class=MsoQuote>d</p>';
    expect(runPass(html, normalizeHeadings)).toBe(
      '<blockquote><p>a</p><p>b</p></blockquote><p class="MsoNormal">c</p><blockquote><p>d</p></blockquote>',
    );
  });

  it('laisse MsoListParagraph sans mso-list en paragraphe', () => {
    expect(runPass('<p class=MsoListParagraph>x</p>', normalizeHeadings)).toBe(
      '<p class="MsoListParagraph">x</p>',
    );
  });
});
