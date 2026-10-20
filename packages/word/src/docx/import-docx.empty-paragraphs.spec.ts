import { describe, expect, it } from 'vitest';
import { exportDocx } from '../export/export-docx';
import { importDocx } from './import-docx';
import type { DocxImportOptions } from './types';

/** Export puis import, pour mesurer ce qu'un aller-retour Word conserve. */
async function roundTrip(html: string, options: DocxImportOptions = {}): Promise<string> {
  const blob = await exportDocx(html);
  return (await importDocx(await blob.arrayBuffer(), options)).html;
}

describe('importDocx : paragraphes vides (sauts de ligne de l’auteur)', () => {
  it('conserve par défaut les paragraphes vides entre deux textes', async () => {
    expect(await roundTrip('<p>a</p><p></p><p>b</p>')).toBe('<p>a</p><p></p><p>b</p>');
  });

  it('conserve plusieurs lignes vides consécutives, y compris en fin de document', async () => {
    expect(await roundTrip('<p>a</p><p></p><p></p><p>b</p><p></p>')).toBe(
      '<p>a</p><p></p><p></p><p>b</p><p></p>',
    );
  });

  it('conserve une ligne vide avant une puce de variable', async () => {
    const html = '<p>a</p><p></p><p><span data-aster-variable="nom">{{nom}}</span></p>';
    expect(await roundTrip(html)).toBe(html);
  });

  it('conserve une ligne vide dans une cellule et après une liste', async () => {
    // Un item de liste à plusieurs paragraphes se scinde déjà à l'aller-retour (limite
    // connue de l'export des listes, indépendante des lignes vides) : on ne le teste pas ici.
    const html =
      '<table><tbody><tr><td><p>a</p><p></p><p>b</p></td></tr></tbody></table><ul><li><p>c</p></li></ul><p></p><p>d</p>';
    expect(await roundTrip(html)).toBe(html);
  });

  it('`emptyParagraphs: "drop"` retrouve le nettoyage des lignes vides', async () => {
    expect(await roundTrip('<p>a</p><p></p><p>b</p>', { emptyParagraphs: 'drop' })).toBe(
      '<p>a</p><p>b</p>',
    );
  });

  it('un document vide rend un paragraphe vide, jamais une chaîne sans bloc', async () => {
    expect(await roundTrip('')).toBe('<p></p>');
  });
});
