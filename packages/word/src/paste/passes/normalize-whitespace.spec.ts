import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare';
import { normalizeWhitespace } from './normalize-whitespace';

const NBSP = String.fromCharCode(160);

describe('normalizeWhitespace', () => {
  it('remplace les insécables entre mots par des espaces et réduit les suites d’espaces', () => {
    const html = `<p>a${NBSP}b   c\n\td</p>`;
    expect(runPass(html, normalizeWhitespace)).toBe('<p>a b c d</p>');
  });

  it('réduit un mso-spacerun déballé à un seul espace, même réparti sur plusieurs nœuds', () => {
    const html = '<p>Texte avec un<span>   </span>espace</p>';
    expect(runPass(html, normalizeWhitespace)).toBe('<p>Texte avec un<span> </span>espace</p>');
  });

  it('trime le texte aux bords des blocs et retire les blancs entre blocs', () => {
    const html =
      '<p>  a  </p>\n  <ul>\n <li> b </li>\n</ul>\n<table> <tr> <td> c </td> </tr> </table>';
    expect(runPass(html, normalizeWhitespace)).toBe(
      '<p>a</p><ul><li>b</li></ul><table><tbody><tr><td>c</td></tr></tbody></table>',
    );
  });

  it('conserve un espace significatif entre deux éléments inline', () => {
    const html = '<p><strong>a</strong> <em>b</em></p>';
    expect(runPass(html, normalizeWhitespace)).toBe(html);
  });

  it('sort les espaces de bord des marques inline', () => {
    const html = '<p>x<em> a </em><u> b</u><strong>c </strong>d</p>';
    expect(runPass(html, normalizeWhitespace)).toBe(
      '<p>x <em>a</em> <u>b</u><strong>c</strong> d</p>',
    );
  });

  it('laisse intact le contenu des pre', () => {
    const html = '<pre>  a   b  </pre>';
    expect(runPass(html, normalizeWhitespace)).toBe(html);
  });
});
