import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeHtmlForCompare, parseHtml } from '../testing/html-compare';
import { untyped } from '../testing/untyped';
import { defaultParse, extractFragment, normalizeWordHtml } from './normalize-word-html';

const fixture = (name: string): string =>
  readFileSync(`${import.meta.env.ASTER_FIXTURES}word-html/${name}.html`, 'utf8');
const expected = (name: string): string =>
  readFileSync(`${import.meta.env.ASTER_FIXTURES}word-html/expected/${name}.html`, 'utf8');

const NBSP = String.fromCharCode(160);

/** Paragraphe de liste Word tel que collé sans feuille de style : niveau, marqueur, texte. */
const li = (list: string, level: number, marker: string, text: string, lfo = 1): string =>
  `<p class=MsoListParagraph style='mso-list:${list} level${level} lfo${lfo}'>` +
  `<span style='mso-list:Ignore'>${marker}<span>&nbsp;</span></span>${text}</p>`;

/** Enrobage complet du presse-papier Word : feuille de style dans le head, fragment balisé. */
const clipboard = (css: string, body: string): string =>
  `<html><head><style><!--\n${css}\n--></style></head><body><!--StartFragment-->${body}<!--EndFragment--></body></html>`;

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
    expect(normalizeWordHtml(untyped<string>(undefined))).toBe('');
  });

  it('retire la balise ouverte et jamais fermée d’un presse-papier coupé avant EndFragment (W-12)', () => {
    expect(normalizeWordHtml('<html><body><!--StartFragment--><p class=MsoNormal>x</p>\n<')).toBe(
      '<p>x</p>',
    );
    expect(
      normalizeWordHtml(
        '<html><body><!--StartFragment--><p class=MsoNormal>Un</p><p class=MsoNormal>De</p><p cl',
      ),
    ).toBe('<p>Un</p><p>De</p>');
    expect(
      normalizeWordHtml(
        '<html><body><!--StartFragment--><p class=MsoNormal>Un</p><p class=MsoNormal>De',
      ),
    ).toBe('<p>Un</p><p>De</p>');
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

describe('normalizeWordHtml, pipeline complet sur les cas de la revue', () => {
  it('ne prend pas mso-yfti-firstrow:yes pour un en-tête et garde le gras d’une cellule isolée (W-3)', () => {
    const html =
      `<table class=MsoTableGrid border=1><tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'>` +
      `<td><p class=MsoNormal>Alice</p></td><td><p class=MsoNormal><b>Dev</b></p></td></tr>` +
      `<tr style='mso-yfti-irow:1;mso-yfti-lastrow:yes'><td><p class=MsoNormal>Bob</p></td><td><p class=MsoNormal>Design</p></td></tr></table>`;
    expect(normalizeWordHtml(html)).toBe(
      '<table><tbody><tr><td>Alice</td><td><strong>Dev</strong></td></tr><tr><td>Bob</td><td>Design</td></tr></tbody></table>',
    );
  });

  it('conserve l’alignement du paragraphe unique d’une cellule (W-9)', () => {
    const html =
      `<table><tr><td><p class=MsoNormal align=right style='text-align:right'>12,50 €</p></td></tr>` +
      `<tr><td><p class=MsoNormal style='text-align:center'>x</p><p class=MsoNormal>y</p></td></tr></table>`;
    expect(normalizeWordHtml(html)).toBe(
      '<table><tbody><tr><td><p style="text-align:right">12,50 €</p></td></tr><tr><td><p style="text-align:center">x</p><p>y</p></td></tr></tbody></table>',
    );
  });

  it('garde l’espace entre un texte et une image inline (W-6)', () => {
    expect(
      normalizeWordHtml('<p class=MsoNormal>Fin <img src="https://x.io/b.png" alt="b"></p>'),
    ).toBe('<p>Fin <img src="https://x.io/b.png" alt="b"></p>');
    expect(
      normalizeWordHtml('<p class=MsoNormal><img src="https://x.io/a.png" alt="a"> Légende</p>'),
    ).toBe('<p><img src="https://x.io/a.png" alt="a"> Légende</p>');
  });

  it('sans feuille de style, lit c./d. comme alpha avec départ et 1.1. comme décimal (W-7)', () => {
    expect(normalizeWordHtml(li('l0', 1, 'c.', 'Trois') + li('l0', 1, 'd.', 'Quatre'))).toBe(
      '<ol type="a" start="3"><li><p>Trois</p></li><li><p>Quatre</p></li></ol>',
    );
    expect(normalizeWordHtml(li('l0', 1, '1.', 'Un') + li('l0', 2, '1.1.', 'Un-un'))).toBe(
      '<ol><li><p>Un</p><ol><li><p>Un-un</p></li></ol></li></ol>',
    );
    expect(normalizeWordHtml(li('l0', 1, 'i.', 'Neuf') + li('l0', 1, 'j.', 'Dix'))).toBe(
      '<ol type="a" start="9"><li><p>Neuf</p></li><li><p>Dix</p></li></ol>',
    );
    expect(normalizeWordHtml(li('l0', 1, 'i.', 'Un') + li('l0', 1, 'ii.', 'Deux'))).toBe(
      '<ol type="i"><li><p>Un</p></li><li><p>Deux</p></li></ol>',
    );
  });

  it('applique l’override @list lX:levelN lfoM, format et départ compris (W-8)', () => {
    const html = clipboard(
      `@list l0:level1 {mso-level-number-format:alpha-lower;}\n@list l0:level1 lfo2 {mso-level-start-at:5; mso-level-number-format:roman-lower;}`,
      li('l0', 1, 'v.', 'Cinq', 2),
    );
    expect(normalizeWordHtml(html)).toBe('<ol type="i" start="5"><li><p>Cinq</p></li></ol>');
  });

  it('reconstruit une liste à puce image dans une cellule de table', () => {
    const bullet =
      `<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>` +
      `<img src="file:///C:/x/image001.gif" width=11 height=11><span>&nbsp;</span></span>Puce</p>`;
    const html = clipboard(
      '@list l0:level1 {mso-level-number-format:image;}',
      `<table><tr><td>${bullet}${li('l0', 1, '', 'Deux')}</td></tr></table>`,
    );
    expect(normalizeWordHtml(html)).toBe(
      '<table><tbody><tr><td><ul><li><p>Puce</p></li><li><p>Deux</p></li></ul></td></tr></tbody></table>',
    );
  });

  it('retire un marqueur mso-list sur un titre et un marqueur Ignore sans paragraphe', () => {
    const heading =
      "<h1 style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span>Titre</h1>";
    expect(normalizeWordHtml(heading)).toBe('<h1>Titre</h1>');
    expect(normalizeWordHtml("<span style='mso-list:Ignore'>·</span>Texte")).toBe('Texte');
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

  it('coupe une balise ouverte en fin de chaîne quand EndFragment manque, sans quadratique (W-12)', () => {
    expect(extractFragment('<!--StartFragment--><p>x</p>\n<')).toBe(
      '<!--StartFragment--><p>x</p>\n',
    );
    expect(extractFragment('<!--StartFragment--><p>x</p><!--EndFr')).toBe(
      '<!--StartFragment--><p>x</p>',
    );
    expect(extractFragment('<!--StartFragment--><p>x</p>')).toBe('<!--StartFragment--><p>x</p>');
    const hostile = '<!--StartFragment-->' + '<'.repeat(500_000) + '>';
    const started = performance.now();
    expect(extractFragment(hostile)).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('defaultParse', () => {
  it('parse avec le DOMParser de l’environnement', () => {
    expect(defaultParse('<p>x</p>').body.innerHTML).toBe('<p>x</p>');
  });
});
