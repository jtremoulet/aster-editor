import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare.js';
import type { ListLevelDeclaration } from '../types.js';
import { parseListFormats, rebuildLists } from './rebuild-lists.js';

/** Durée d'exécution d'une fonction synchrone, en millisecondes. */
const ms = (fn: () => unknown): number => {
  const started = performance.now();
  fn();
  return performance.now() - started;
};

/** Paragraphe de liste Word minimal : niveau, marqueur et texte. */
const item = (list: string, level: number, marker: string, text: string, lfo = 1): string =>
  `<p class=MsoListParagraph style='mso-list:${list} level${level} lfo${lfo}'>` +
  `<span style='font-family:Symbol'><span style='mso-list:Ignore'>${marker}<span>&nbsp; </span></span></span>` +
  `<span lang=FR>${text}</span></p>`;

describe('parseListFormats', () => {
  it('lit les formats déclarés et considère décimal quand le format est omis', () => {
    const css = `@list l0:level1 {mso-level-number-format:bullet;} @list l0:level2
      {mso-level-text:"%2.";} @list l1:level1 {mso-level-number-format:alpha-lower;}`;
    const formats = parseListFormats(css);
    expect(formats.get('l0:level1')?.format).toBe('bullet');
    expect(formats.get('l0:level2')?.format).toBe('decimal');
    expect(formats.get('l1:level1')?.format).toBe('alpha-lower');
    expect(formats.get('l1:level1')?.start).toBeUndefined();
  });

  it('traite les puces image comme des puces et les formats inconnus comme décimal', () => {
    const formats = parseListFormats(
      '@list l0:level1 {mso-level-number-format:image;} @list l0:level2 {mso-level-number-format:chinese;}',
    );
    expect(formats.get('l0:level1')?.format).toBe('bullet');
    expect(formats.get('l0:level2')?.format).toBe('decimal');
  });

  it('renvoie une map vide sans feuille de style', () => {
    expect(parseListFormats('<p>rien</p>').size).toBe(0);
  });

  it('indexe les overrides d’instance lfoM:lX:levelN avec leur départ, en héritant du format de base (W-8)', () => {
    const css = `@list l0:level1 {mso-level-number-format:alpha-lower;}
      @list l0:level1 lfo2 {mso-level-start-at:5; mso-level-number-format:roman-lower;}
      @list l0:level1 lfo3 {mso-level-start-at:7;}`;
    const formats = parseListFormats(css);
    expect(formats.get('l0:level1')).toEqual({ format: 'alpha-lower', start: undefined });
    expect(formats.get('lfo2:l0:level1')).toEqual({ format: 'roman-lower', start: 5 });
    expect(formats.get('lfo3:l0:level1')).toEqual({ format: 'alpha-lower', start: 7 });
  });

  it('reste linéaire sur une accolade jamais fermée : 1 Mo en moins de 100 ms (W-2)', () => {
    const hostile = '@list l0:level1 {'.repeat(60_000);
    expect(hostile.length).toBeGreaterThan(1_000_000);
    const elapsed = ms(() => parseListFormats(hostile));
    expect(elapsed).toBeLessThan(100);
  });
});

describe('rebuildLists', () => {
  it('reconstruit une liste à puces plate depuis le marqueur', () => {
    const html = item('l0', 1, '·', 'Un') + item('l0', 1, '·', 'Deux');
    expect(runPass(html, rebuildLists)).toBe(
      '<ul><li><p><span lang="FR">Un</span></p></li><li><p><span lang="FR">Deux</span></p></li></ul>',
    );
  });

  it('reconstruit une liste numérotée imbriquée sur deux niveaux avec type alphabétique', () => {
    const html = item('l1', 1, '1.', 'A') + item('l1', 2, 'a)', 'B') + item('l1', 1, '2.', 'C');
    const out = runPass(html, rebuildLists);
    expect(out).toContain('<ol><li><p><span lang="FR">A</span></p><ol type="a"><li>');
    expect(out).toMatch(/<\/ol><\/li><li><p><span lang="FR">C<\/span><\/p><\/li><\/ol>$/);
  });

  it('respecte une liste interrompue par un paragraphe normal', () => {
    const html = item('l0', 1, '·', 'A') + '<p class=MsoNormal>Texte</p>' + item('l0', 1, '·', 'B');
    expect(runPass(html, rebuildLists)).toBe(
      '<ul><li><p><span lang="FR">A</span></p></li></ul><p class="MsoNormal">Texte</p><ul><li><p><span lang="FR">B</span></p></li></ul>',
    );
  });

  it('sépare deux instances de liste qui se suivent au même niveau', () => {
    const html = item('l0', 1, '·', 'A', 1) + item('l1', 1, '1.', 'B', 2);
    expect(runPass(html, rebuildLists)).toBe(
      '<ul><li><p><span lang="FR">A</span></p></li></ul><ol><li><p><span lang="FR">B</span></p></li></ol>',
    );
  });

  it('gère un saut de niveau sans inventer de niveau intermédiaire', () => {
    const html = item('l0', 1, '·', 'A') + item('l0', 3, 'i.', 'B') + item('l0', 1, '·', 'C');
    expect(runPass(html, rebuildLists)).toBe(
      '<ul><li><p><span lang="FR">A</span></p><ol type="i"><li><p><span lang="FR">B</span></p></li></ol></li><li><p><span lang="FR">C</span></p></li></ul>',
    );
  });

  it('démarre une liste directement au niveau 2 sans conteneur vide', () => {
    expect(runPass(item('l0', 2, 'o', 'Seul'), rebuildLists)).toBe(
      '<ul><li><p><span lang="FR">Seul</span></p></li></ul>',
    );
  });

  it('préfère le format déclaré dans la feuille de style au texte du marqueur', () => {
    const formats = new Map<string, ListLevelDeclaration>([['l0:level1', { format: 'decimal' }]]);
    expect(runPass(item('l0', 1, '·', 'A'), rebuildLists, {}, formats)).toMatch(/^<ol>/);
  });

  it('applique l’override d’instance avant la déclaration de base et son départ (W-8)', () => {
    const formats = new Map<string, ListLevelDeclaration>([
      ['l0:level1', { format: 'alpha-lower' }],
      ['lfo2:l0:level1', { format: 'roman-lower', start: 5 }],
    ]);
    expect(runPass(item('l0', 1, 'v.', 'A', 2), rebuildLists, {}, formats)).toMatch(
      /^<ol type="i" start="5">/,
    );
    // Marqueur illisible dans le format déclaré : c'est mso-level-start-at qui donne le départ.
    expect(runPass(item('l0', 1, '·', 'A', 2), rebuildLists, {}, formats)).toMatch(
      /^<ol type="i" start="5">/,
    );
    // Marqueur lisible : il prime, un fragment peut commencer au milieu d'une liste.
    expect(runPass(item('l0', 1, 'vii.', 'A', 2), rebuildLists, {}, formats)).toMatch(
      /^<ol type="i" start="7">/,
    );
    expect(runPass(item('l0', 1, 'b.', 'A', 1), rebuildLists, {}, formats)).toMatch(
      /^<ol type="a" start="2">/,
    );
  });

  it('reporte la numérotation de départ, décimale, romaine ou alphabétique', () => {
    expect(runPass(item('l0', 1, '3.', 'A'), rebuildLists)).toMatch(/^<ol start="3">/);
    expect(runPass(item('l0', 1, 'IV.', 'A'), rebuildLists)).toMatch(/^<ol type="I" start="4">/);
    expect(runPass(item('l0', 1, 'B.', 'A'), rebuildLists)).toMatch(/^<ol type="A" start="2">/);
    expect(runPass(item('l0', 1, '(b)', 'A'), rebuildLists)).toMatch(/^<ol type="a" start="2">/);
    expect(runPass(item('l0', 1, '1.', 'A'), rebuildLists)).toMatch(/^<ol><li>/);
    expect(runPass(item('l0', 1, 'a.', 'A'), rebuildLists)).toMatch(/^<ol type="a"><li>/);
  });

  it('sans feuille de style, lit c. d. l. m. comme des lettres, pas du romain (W-7)', () => {
    expect(runPass(item('l0', 1, 'c.', 'A') + item('l0', 1, 'd.', 'B'), rebuildLists)).toMatch(
      /^<ol type="a" start="3">/,
    );
    expect(runPass(item('l0', 1, 'l.', 'A'), rebuildLists)).toMatch(/^<ol type="a" start="12">/);
    expect(runPass(item('l0', 1, 'm.', 'A'), rebuildLists)).toMatch(/^<ol type="a" start="13">/);
    expect(runPass(item('l0', 1, 'D.', 'A'), rebuildLists)).toMatch(/^<ol type="A" start="4">/);
  });

  it('désambiguïse i. v. x. isolés par le marqueur suivant au même niveau (W-7)', () => {
    expect(runPass(item('l0', 1, 'i.', 'A') + item('l0', 1, 'ii.', 'B'), rebuildLists)).toMatch(
      /^<ol type="i"><li>/,
    );
    expect(runPass(item('l0', 1, 'i.', 'A') + item('l0', 1, 'j.', 'B'), rebuildLists)).toMatch(
      /^<ol type="a" start="9">/,
    );
    expect(runPass(item('l0', 1, 'x.', 'A') + item('l0', 1, 'y.', 'B'), rebuildLists)).toMatch(
      /^<ol type="a" start="24">/,
    );
    expect(runPass(item('l0', 1, 'v.', 'A'), rebuildLists)).toMatch(/^<ol type="i" start="5">/);
    // Une sous-liste intercalée ne compte pas : le suivant au même niveau est bien `j.`.
    const nested = item('l0', 1, 'i.', 'A') + item('l0', 2, '·', 'B') + item('l0', 1, 'j.', 'C');
    expect(runPass(nested, rebuildLists)).toMatch(/^<ol type="a" start="9">/);
    expect(runPass(item('l0', 1, 'vi.', 'A') + item('l0', 1, 'vii.', 'B'), rebuildLists)).toMatch(
      /^<ol type="i" start="6">/,
    );
  });

  it('reconnaît la numérotation juridique 1.1. comme décimale (W-7)', () => {
    const html = item('l0', 1, '1.', 'Un') + item('l0', 2, '1.1.', 'Un-un');
    expect(runPass(html, rebuildLists)).toBe(
      '<ol><li><p><span lang="FR">Un</span></p><ol><li><p><span lang="FR">Un-un</span></p></li></ol></li></ol>',
    );
    expect(runPass(item('l0', 2, '2.3', 'A'), rebuildLists)).toMatch(/^<ol start="3">/);
  });

  it('retire une puce image avec son marqueur', () => {
    const html =
      "<p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>" +
      '<img src="file:///C:/x/image001.gif" width="11" height="11"><span>&nbsp;</span></span>Puce</p>';
    expect(runPass(html, rebuildLists)).toBe('<ul><li><p>Puce</p></li></ul>');
  });

  it('retire un marqueur Ignore sans paragraphe parent', () => {
    expect(runPass("<span style='mso-list:Ignore'>·</span>Texte", rebuildLists)).toBe('Texte');
  });

  it('laisse un titre porteur de mso-list tel quel, marqueur retiré', () => {
    const html =
      "<h1 style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>1.</span>Titre</h1>";
    expect(runPass(html, rebuildLists)).toBe('<h1 style="mso-list:l0 level1 lfo1">Titre</h1>');
  });

  it('change de type au même niveau quand une puce suit un numéro dans la même instance', () => {
    const html = item('l0', 1, '1.', 'A') + item('l0', 1, '·', 'B');
    expect(runPass(html, rebuildLists)).toBe(
      '<ol><li><p><span lang="FR">A</span></p></li></ol><ul><li><p><span lang="FR">B</span></p></li></ul>',
    );
  });

  it('retire le marqueur même sans texte et traite les marqueurs orphelins', () => {
    const html =
      "<p style='mso-list:l0 level1 lfo1'>Sans marqueur</p>" +
      "<ul><li><span style='mso-list:Ignore'>·</span>Déjà en liste</li></ul>";
    expect(runPass(html, rebuildLists)).toBe(
      '<ul><li><p>Sans marqueur</p></li></ul><ul><li>Déjà en liste</li></ul>',
    );
  });

  it('ignore un style mso-list mal formé', () => {
    expect(runPass("<p style='mso-list:oops'>x</p>", rebuildLists)).toBe(
      '<p style="mso-list:oops">x</p>',
    );
  });

  it('reconstruit les listes à l’intérieur d’une cellule de table', () => {
    const html = `<table><tr><td>${item('l0', 1, '·', 'A')}</td></tr></table>`;
    expect(runPass(html, rebuildLists)).toContain('<td><ul><li><p>');
  });
});
