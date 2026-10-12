import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare';
import type { ListLevelFormat } from '../types';
import { parseListFormats, rebuildLists } from './rebuild-lists';

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
    expect(formats.get('l0:level1')).toBe('bullet');
    expect(formats.get('l0:level2')).toBe('decimal');
    expect(formats.get('l1:level1')).toBe('alpha-lower');
  });

  it('traite les puces image comme des puces et les formats inconnus comme décimal', () => {
    const formats = parseListFormats(
      '@list l0:level1 {mso-level-number-format:image;} @list l0:level2 {mso-level-number-format:chinese;}',
    );
    expect(formats.get('l0:level1')).toBe('bullet');
    expect(formats.get('l0:level2')).toBe('decimal');
  });

  it('renvoie une map vide sans feuille de style', () => {
    expect(parseListFormats('<p>rien</p>').size).toBe(0);
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
    const formats = new Map<string, ListLevelFormat>([['l0:level1', 'decimal']]);
    expect(runPass(item('l0', 1, '·', 'A'), rebuildLists, {}, formats)).toMatch(/^<ol>/);
  });

  it('reporte la numérotation de départ et les formats romains ou majuscules', () => {
    expect(runPass(item('l0', 1, '3.', 'A'), rebuildLists)).toMatch(/^<ol start="3">/);
    expect(runPass(item('l0', 1, 'IV.', 'A'), rebuildLists)).toMatch(/^<ol type="I">/);
    expect(runPass(item('l0', 1, 'B.', 'A'), rebuildLists)).toMatch(/^<ol type="A">/);
    expect(runPass(item('l0', 1, '(b)', 'A'), rebuildLists)).toMatch(/^<ol type="a">/);
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
