import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx.js';

/**
 * Régénère les attendus stylés `fixtures/docx/expected/*.html` depuis le chemin par défaut
 * (`styled` depuis la 0.6, L46) : 01-06 et 08-10 (la 07, fixture de charge, n'a pas
 * d'attendu) puis 11-20. Les attendus du chemin `semantic` (mammoth) vivent dans
 * `expected/semantic/` et ne sont pas régénérés ici : ils figent le comportement 0.4.x.
 * Inactif par défaut : `ASTER_REGEN=1 npx vitest run src/docx/reader/regen-expected.spec.ts`,
 * puis relire le diff git avant de figer. À utiliser quand une décision de sérialisation change.
 */
const FIXTURES = join(import.meta.env.ASTER_FIXTURES, 'docx');
const NAMES = [
  '01-headings-lists',
  '02-tables',
  '03-images',
  '04-rapport-client',
  '05-tableaux-complexes',
  '06-styles-francais',
  '08-variables-braces',
  '09-variables-mergefields',
  '10-variables-content-controls',
  '11-styles-inline',
  '12-paragraphes',
  '13-styles-nommes',
  '14-tableaux-riches',
  '15-listes-numerotation',
  '16-sections',
  '17-objets-perdus',
  '18-sections-triple',
  '19-tabulations-bordures',
  '20-champs-en-tete',
];

describe.skipIf(!process.env.ASTER_REGEN)('régénération des attendus du lecteur stylé', () => {
  it.each(NAMES)('%s', async (name) => {
    const buffer = await readFile(join(FIXTURES, `${name}.docx`));
    const result = await importDocx(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      { fidelity: 'styled' },
    );
    await writeFile(join(FIXTURES, 'expected', `${name}.html`), result.html, 'utf8');
    expect(result.html.length).toBeGreaterThan(0);
  });
});
