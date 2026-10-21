import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare.js';
import { normalizeTables } from './normalize-tables.js';

/** Cellule Word après `cleanInlineStyles` : attributs de layout encore présents, `<p>` déjà nettoyé. */
const cell = (content: string, attrs = ''): string =>
  `<td width=200 valign=top style='border:solid 1pt;padding:0cm' ${attrs}><p>${content}</p></td>`;

describe('normalizeTables', () => {
  it('retire les attributs de layout de la table, des lignes et des cellules', () => {
    const html =
      "<table border=1 cellspacing=0 cellpadding=0 width=600 style='border-collapse:collapse'>" +
      `<tr style='mso-yfti-irow:1'>${cell('a')}</tr><tr>${cell('b')}</tr></table>`;
    expect(runPass(html, normalizeTables)).toBe(
      '<table><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table>',
    );
  });

  it('conserve colspan et rowspan supérieurs à un, jette ceux à un', () => {
    const html = `<table><tr>${cell('a', 'colspan=2 rowspan=1')}</tr><tr>${cell('b')}${cell('c')}</tr></table>`;
    expect(runPass(html, normalizeTables)).toContain('<td colspan="2">a</td>');
    expect(runPass(html, normalizeTables)).not.toContain('rowspan');
  });

  it('conserve colspan et rowspan combinés sur une même cellule', () => {
    const html =
      `<table><tr>${cell('a', 'colspan=2 rowspan=2')}${cell('b')}</tr>` +
      `<tr>${cell('c')}</tr><tr>${cell('d')}${cell('e')}${cell('f')}</tr></table>`;
    expect(runPass(html, normalizeTables)).toContain('<td colspan="2" rowspan="2">a</td>');
  });

  it('garde le <p> unique d’une cellule quand il porte un alignement (W-9)', () => {
    const html =
      `<table><tr><td><p style="text-align:right">12,50 €</p></td></tr>` +
      `<tr><td><p style="text-align:center">x</p><p>y</p></td></tr></table>`;
    expect(runPass(html, normalizeTables)).toBe(
      '<table><tbody><tr><td><p style="text-align:right">12,50 €</p></td></tr><tr><td><p style="text-align:center">x</p><p>y</p></td></tr></tbody></table>',
    );
  });

  it('ignore mso-yfti-firstrow:yes, que Word pose sur la première ligne de toute table (W-3)', () => {
    const html =
      `<table><tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'>${cell('Alice')}${cell('<strong>Dev</strong>')}</tr>` +
      `<tr style='mso-yfti-irow:1;mso-yfti-lastrow:yes'>${cell('Bob')}${cell('Design')}</tr></table>`;
    expect(runPass(html, normalizeTables)).toBe(
      '<table><tbody><tr><td>Alice</td><td><strong>Dev</strong></td></tr><tr><td>Bob</td><td>Design</td></tr></tbody></table>',
    );
  });

  it('ne promeut pas une table de données dont la première ligne n’est pas en gras', () => {
    const html = `<table><tr>${cell('2024')}${cell('12')}</tr><tr>${cell('2025')}${cell('15')}</tr></table>`;
    const out = runPass(html, normalizeTables);
    expect(out).not.toContain('<thead>');
    expect(out).not.toContain('<th>');
  });

  it('promeut la première ligne en thead quand toutes ses cellules sont en gras, sans garder le gras', () => {
    const html = `<table><tr>${cell('<b>Nom</b>')}${cell('<strong><em>Rôle</em></strong>')}</tr><tr>${cell('Alice')}${cell('Dev')}</tr></table>`;
    expect(runPass(html, normalizeTables)).toBe(
      '<table><thead><tr><th>Nom</th><th><em>Rôle</em></th></tr></thead><tbody><tr><td>Alice</td><td>Dev</td></tr></tbody></table>',
    );
  });

  it('ne crée pas d’en-tête si une cellule n’est pas en gras, est vide, ou si la table n’a qu’une ligne', () => {
    const mixed = `<table><tr>${cell('<b>a</b>')}${cell('b')}</tr><tr>${cell('c')}${cell('d')}</tr></table>`;
    expect(runPass(mixed, normalizeTables)).not.toContain('<thead>');
    const empty = `<table><tr>${cell('')}</tr><tr>${cell('c')}</tr></table>`;
    expect(runPass(empty, normalizeTables)).not.toContain('<thead>');
    const single = `<table><tr>${cell('<b>a</b>')}</tr></table>`;
    expect(runPass(single, normalizeTables)).not.toContain('<thead>');
  });

  it('garde le thead existant et retire colgroup et caption', () => {
    const html =
      '<table><caption>C</caption><colgroup><col width=1></colgroup><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>';
    expect(runPass(html, normalizeTables)).toBe(
      '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>',
    );
  });

  it('ne déballe pas une cellule qui contient plusieurs paragraphes', () => {
    const html = '<table><tr><td><p>a</p><p>b</p></td></tr></table>';
    expect(runPass(html, normalizeTables)).toContain('<td><p>a</p><p>b</p></td>');
  });

  it('traite une table imbriquée indépendamment', () => {
    const html = `<table><tr>${cell('x')}</tr><tr><td><table><tr>${cell('inner')}</tr></table></td></tr></table>`;
    const out = runPass(html, normalizeTables);
    expect(out).toContain('<td><table><tbody><tr><td>inner</td></tr></tbody></table></td>');
  });
});
