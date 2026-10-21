import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeHtmlForCompare } from '../testing/html-compare.js';
import { normalizeGoogleDocsHtml } from './normalize-google-docs-html.js';

const fixture = (name: string): string =>
  readFileSync(`${import.meta.env.ASTER_FIXTURES}word-html/${name}.html`, 'utf8');
const expected = (name: string): string =>
  readFileSync(`${import.meta.env.ASTER_FIXTURES}word-html/expected/${name}.html`, 'utf8');

const GUID = '<b style="font-weight:normal;" id="docs-internal-guid-1234">';

describe('normalizeGoogleDocsHtml', () => {
  it('produit le HTML attendu pour google-docs-basic', () => {
    const out = normalizeGoogleDocsHtml(fixture('google-docs-basic'));
    expect(normalizeHtmlForCompare(out)).toBe(
      normalizeHtmlForCompare(expected('google-docs-basic')),
    );
    expect(out).not.toMatch(/style=|dir=|role=|aria-|docs-internal-guid|class=/);
  });

  it('retire l’enveloppe interne et traduit gras, italique et souligné', () => {
    const html =
      `${GUID}<p dir="ltr"><span style="font-weight:700">g</span><span style="font-style:italic">i</span>` +
      '<span style="text-decoration:underline">u</span></p></b>';
    expect(normalizeGoogleDocsHtml(html)).toBe('<p><strong>g</strong><em>i</em><u>u</u></p>');
  });

  it('réimbrique une sous-liste orpheline dans le li précédent, ou dans un li neuf', () => {
    const html = `${GUID}<ul><ul><li><p>sans parent</p></li></ul><li><p>a</p></li><ol><li><p>b</p></li></ol></ul></b>`;
    expect(normalizeGoogleDocsHtml(html)).toBe(
      '<ul><li><ul><li><p>sans parent</p></li></ul></li><li><p>a</p><ol><li><p>b</p></li></ol></li></ul>',
    );
  });

  it('conserve les titres, les liens et les tables', () => {
    const html = `${GUID}<h2 dir="ltr"><span>T</span></h2><table><tbody><tr><td><p>c</p></td></tr></tbody></table><p><a href="https://x.io" style="text-decoration:none"><span style="color:#1155cc;text-decoration:underline">L</span></a></p></b>`;
    expect(normalizeGoogleDocsHtml(html)).toBe(
      '<h2>T</h2><table><tbody><tr><td>c</td></tr></tbody></table><p><a href="https://x.io">L</a></p>',
    );
  });

  it('garde un vrai <b> gras qui n’est pas l’enveloppe', () => {
    expect(normalizeGoogleDocsHtml(`${GUID}<p><b>x</b></p></b>`)).toBe('<p><strong>x</strong></p>');
    expect(normalizeGoogleDocsHtml('<p><b style="font-weight:normal">x</b></p>')).toBe('<p>x</p>');
  });

  it('remonte list-style-type des li en attribut type du ol (W-11)', () => {
    const alpha = `${GUID}<ol start="3"><li style="list-style-type:lower-alpha;"><p><span>c</span></p></li></ol></b>`;
    expect(normalizeGoogleDocsHtml(alpha)).toBe('<ol start="3" type="a"><li><p>c</p></li></ol>');
    const nested =
      `${GUID}<ol><li style="list-style-type:upper-roman"><p>I</p></li>` +
      `<ol><li style="list-style-type:upper-alpha"><p>A</p></li></ol>` +
      `<li style="list-style-type:decimal"><p>II</p></li></ol></b>`;
    expect(normalizeGoogleDocsHtml(nested)).toBe(
      '<ol type="I"><li><p>I</p><ol type="A"><li><p>A</p></li></ol></li><li><p>II</p></li></ol>',
    );
    expect(
      normalizeGoogleDocsHtml(`${GUID}<ul><li style="list-style-type:disc"><p>u</p></li></ul></b>`),
    ).toBe('<ul><li><p>u</p></li></ul>');
  });

  it('déballe le div sans attribut utile autour d’une table (W-11)', () => {
    const html = `${GUID}<div dir="ltr" align="left"><table><tbody><tr><td><p><span>A</span></p></td><td><p>B</p></td></tr></tbody></table></div></b>`;
    expect(normalizeGoogleDocsHtml(html)).toBe(
      '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>',
    );
    const centered = `${GUID}<div align="center"><table><tbody><tr><td><p>A</p></td></tr></tbody></table></div></b>`;
    expect(normalizeGoogleDocsHtml(centered)).toBe(
      '<div style="text-align:center"><table><tbody><tr><td>A</td></tr></tbody></table></div>',
    );
  });

  it('ne lève pas sur une entrée vide ou tronquée', () => {
    expect(normalizeGoogleDocsHtml('')).toBe('');
    expect(normalizeGoogleDocsHtml(fixture('google-docs-basic').slice(0, 700))).not.toContain(
      'style=',
    );
  });
});
