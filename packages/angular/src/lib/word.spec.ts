import { describe, expect, it } from 'vitest';
import { importWord } from './word';

/**
 * `importWord` ne force plus de chemin de lecture (L46) : sans `importFidelity`, la lib
 * applique son propre défaut (`styled` depuis la 0.6) ; seul un chemin explicite est
 * transmis. Vérifié sur une vraie fixture : le chemin stylé renseigne la mise en page, le
 * chemin mammoth la laisse vide.
 */

/** Lit une fixture `.docx` du dépôt (même recette que le spec du composant). */
async function fixtureFile(name: string): Promise<File> {
  const fsModule = 'node:fs';
  const processModule = 'node:process';
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync(path: string): Uint8Array;
    existsSync(path: string): boolean;
  };
  const process = (await import(/* @vite-ignore */ processModule)) as { cwd(): string };
  let root = process.cwd();
  for (let i = 0; i < 4 && !fs.existsSync(`${root}/fixtures`); i += 1) {
    root = `${root}/..`;
  }
  return new File([new Uint8Array(fs.readFileSync(`${root}/fixtures/docx/${name}`))], name);
}

describe('importWord', () => {
  it('sans fidelity : le défaut de la lib (styled) lit la mise en page et le gabarit', async () => {
    const file = await fixtureFile('13-styles-nommes.docx');
    const result = await importWord(file, { upload: undefined, fidelity: undefined });
    expect(result.layout.page?.size).toBe('A4');
    expect(result.html).toContain('data-docx-style="Heading1"');
    expect(result.template.byteLength).toBe(file.size);
  }, 20_000);

  it('fidelity semantic : chemin mammoth, mise en page vide, HTML sans style Word', async () => {
    const file = await fixtureFile('13-styles-nommes.docx');
    const result = await importWord(file, { upload: undefined, fidelity: 'semantic' });
    expect(result.layout).toEqual({});
    expect(result.html).not.toContain('data-docx-style');
    expect(result.html).toContain('<h1>');
  }, 20_000);

  it('fidelity styled explicite : même résultat que le défaut', async () => {
    const file = await fixtureFile('13-styles-nommes.docx');
    const explicit = await importWord(file, { upload: undefined, fidelity: 'styled' });
    const byDefault = await importWord(file, { upload: undefined, fidelity: undefined });
    expect(explicit.html).toBe(byDefault.html);
    expect(explicit.layout).toEqual(byDefault.layout);
  }, 20_000);
});
