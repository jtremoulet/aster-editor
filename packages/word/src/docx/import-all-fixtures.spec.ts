import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importDocx } from './import-docx';

const DIR = `${import.meta.env.ASTER_FIXTURES}docx/`;

/**
 * Filet de sécurité sur l'ensemble des fixtures .docx, y compris les documents réalistes
 * (`04-rapport-client`, `05-tableaux-complexes`, `06-styles-francais`, `07-long`) : chaque
 * fichier s'importe sans rejet, produit du HTML non vide et aucun avertissement de type
 * `error`. Les attendus fins vivent dans `import-docx.spec.ts`.
 */
describe('importDocx sur toutes les fixtures', () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith('.docx'));

  it('trouve au moins les 7 fixtures', () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  it.each(files)('%s s’importe sans erreur', async (name) => {
    const bytes = readFileSync(`${DIR}${name}`);
    const result = await importDocx(new Uint8Array(bytes));
    expect(result.html.length).toBeGreaterThan(50);
    expect(result.warnings.filter((w) => w.message.startsWith('error'))).toEqual([]);
  });

  it('04-rapport-client : titres, listes mixtes, table fusionnée, image, note, lien', async () => {
    const result = await importDocx(new Uint8Array(readFileSync(`${DIR}04-rapport-client.docx`)));
    const html = result.html;
    expect(html).toContain('<h1>Rapport d’audit technique</h1>');
    expect(html).toContain('<h1>1. Contexte</h1>');
    expect(html).toMatch(/<ul>[\s\S]*<ul>[\s\S]*<ul>/);
    expect(html).toMatch(/<ol>[\s\S]*<ol>/);
    expect(html).toContain('colspan="3"');
    expect(html).toContain('<img');
    expect(html).toContain('href="https://example.com/audit/2026"');
    expect(html).toContain('data-footnotes');
    expect(html).toContain('<mark>satisfaisant</mark>');
    expect(html).toContain('<sup>2</sup>');
  });

  it('06-styles-francais : les styles « Titre 1 », « Citation », « Code » sont mappés', async () => {
    const result = await importDocx(new Uint8Array(readFileSync(`${DIR}06-styles-francais.docx`)));
    expect(result.html).toContain('<h1>Titre de niveau 1');
    expect(result.html).toContain('<h2>Titre de niveau 2');
    expect(result.html).toContain('<blockquote>');
    expect(result.html).toContain('<pre>');
    expect(result.html).toContain('<strong>Fort</strong>');
    expect(result.html).toContain('<em>Accentuation</em>');
  });

  it('07-long : 300 paragraphes et 15 tables en moins de 3 s', async () => {
    const started = performance.now();
    const result = await importDocx(new Uint8Array(readFileSync(`${DIR}07-long.docx`)));
    expect(performance.now() - started).toBeLessThan(3000);
    expect((result.html.match(/<table/g) ?? []).length).toBe(15);
    expect((result.html.match(/<p>/g) ?? []).length).toBeGreaterThan(300);
  });
});
