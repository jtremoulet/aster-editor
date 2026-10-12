import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeHtmlForCompare, parseHtml } from '../testing/html-compare';
import { defaultParse, extractFragment, normalizeWordHtml } from './normalize-word-html';

const fixture = (name: string): string =>
  readFileSync(`${import.meta.env.ASTER_FIXTURES}word-html/${name}.html`, 'utf8');
const expected = (name: string): string =>
  readFileSync(`${import.meta.env.ASTER_FIXTURES}word-html/expected/${name}.html`, 'utf8');

const NBSP = String.fromCharCode(160);

/** Signes résiduels de Word qui ne doivent jamais survivre au pipeline. */
function expectClean(html: string): void {
  expect(html).not.toMatch(/mso-/i);
  expect(html).not.toMatch(/<o:p/i);
  expect(html).not.toMatch(/class=/i);
  expect(html).not.toMatch(/font-family|font-size/i);
  expect(html).not.toMatch(/<!--/);
  expect(html).not.toContain(NBSP);
}

describe('normalizeWordHtml sur les fixtures', () => {
  it.each([
    'word-365-list-nested',
    'word-365-table',
    'word-2016-headings',
    'word-365-list-3-levels',
    'word-365-list-no-style',
  ])('produit le HTML attendu pour %s', (name) => {
    const out = normalizeWordHtml(fixture(name));
    expectClean(out);
    expect(normalizeHtmlForCompare(out)).toBe(normalizeHtmlForCompare(expected(name)));
  });

  it('reconstruit les listes imbriquées, le paragraphe intermédiaire et la sous-liste alphabétique', () => {
    const out = normalizeWordHtml(fixture('word-365-list-nested'));
    expect(out).toContain(
      '<ul><li><p>Fruits</p><ul><li><p>Pommes</p></li><li><p>Poires <strong>bio</strong></p></li></ul></li><li><p>Légumes</p></li></ul>',
    );
    expect(out).toContain('<p>Un paragraphe entre deux listes.</p><ol><li>');
    expect(out).toContain('<ol type="a"><li><p>À 180 degrés</p></li>');
  });

  it('rend une table avec thead, th et colspan sans attribut de layout', () => {
    const out = normalizeWordHtml(fixture('word-365-table'));
    expect(out).toContain(
      '<table><thead><tr><th>Nom</th><th>Rôle</th><th>Ville</th></tr></thead><tbody>',
    );
    expect(out).toContain('<td colspan="2">Cellule fusionnée</td>');
    expect(out).not.toMatch(/border|cellspacing|cellpadding|width|valign/);
  });

  it('rend titres, citation, alignement, lien et marques inline sans police ni couleur', () => {
    const out = normalizeWordHtml(fixture('word-2016-headings'));
    expect(out).toMatch(/^<h1>Rapport annuel<\/h1><h1>Introduction<\/h1>/);
    expect(out).toContain('<h2>Contexte</h2>');
    expect(out).toContain(
      '<blockquote><p>Une citation mise en forme avec le style Citation.</p></blockquote>',
    );
    expect(out).toContain(
      '<p style="text-align:center"><em>Paragraphe centré en italique.</em></p>',
    );
    expect(out).toContain('<a href="https://example.com/rapport">le rapport complet</a>');
    expect(out).toContain(
      'H<sub>2</sub>O et exposant x<sup>2</sup>, texte <s>barré</s> et <u>souligné</u>.',
    );
    expect(out).toContain('<p>Texte avec un espace multiple et une insécable.</p>');
    expect(out).not.toContain('color');
  });

  it('garde la couleur rouge avec keepColors, sans colorer le lien', () => {
    const out = normalizeWordHtml(fixture('word-2016-headings'), { keepColors: true });
    expect(out).toContain('<span style="color:red">résultats</span>');
    expect(out).toContain('<a href="https://example.com/rapport">le rapport complet</a>');
  });

  it('retire l’alignement avec keepAlignment à faux', () => {
    const out = normalizeWordHtml(fixture('word-2016-headings'), { keepAlignment: false });
    expect(out).toContain('<p><em>Paragraphe centré en italique.</em></p>');
  });

  it('accepte un parseur injecté', () => {
    let calls = 0;
    const parse = (html: string): Document => {
      calls += 1;
      return parseHtml(html);
    };
    expect(normalizeWordHtml('<p class=MsoNormal>x<o:p></o:p></p>', { parse })).toBe('<p>x</p>');
    expect(calls).toBe(1);
  });
});

describe('normalizeWordHtml, robustesse', () => {
  it('rend une chaîne vide pour une entrée vide ou non textuelle', () => {
    expect(normalizeWordHtml('')).toBe('');
    expect(normalizeWordHtml(undefined as unknown as string)).toBe('');
  });

  it('laisse passer du HTML de navigateur ordinaire en le nettoyant à peine', () => {
    expect(normalizeWordHtml('<p>Bonjour <b>monde</b></p>')).toBe(
      '<p>Bonjour <strong>monde</strong></p>',
    );
  });

  it('ne lève pas sur du HTML tronqué ou mal formé', () => {
    const truncated = fixture('word-365-list-nested').slice(0, 1800);
    expect(() => normalizeWordHtml(truncated)).not.toThrow();
    expect(normalizeWordHtml('<p class=MsoNormal><span style="mso-list:l0 level1')).toBe('<p></p>');
    expect(normalizeWordHtml('<table><tr><td>x')).toBe(
      '<table><tbody><tr><td>x</td></tr></tbody></table>',
    );
  });

  it('utilise tout le HTML sans marqueurs de fragment, en jetant la feuille de style', () => {
    const html =
      '<html><head><style>p{}</style></head><body><p class=MsoNormal>x</p></body></html>';
    expect(normalizeWordHtml(html)).toBe('<p>x</p>');
  });
});

describe('extractFragment', () => {
  it('isole le contenu entre StartFragment et EndFragment', () => {
    expect(extractFragment('<body>a<!--StartFragment-->b<!--EndFragment-->c</body>')).toBe('b');
  });

  it('rend tout le HTML si un marqueur manque ou si l’ordre est inversé', () => {
    expect(extractFragment('<!--StartFragment-->b')).toBe('<!--StartFragment-->b');
    const reversed = '<!--EndFragment-->b<!--StartFragment-->';
    expect(extractFragment(reversed)).toBe(reversed);
  });
});

describe('defaultParse', () => {
  it('parse avec le DOMParser de l’environnement', () => {
    expect(defaultParse('<p>x</p>').body.innerHTML).toBe('<p>x</p>');
  });
});
