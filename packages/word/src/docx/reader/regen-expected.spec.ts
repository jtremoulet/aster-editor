import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx';

/**
 * Régénère `fixtures/docx/expected/11-19.html` depuis le chemin `styled`. Inactif par
 * défaut : `ASTER_REGEN=1 npx vitest run src/docx/reader/regen-expected.spec.ts`, puis
 * relire le diff git avant de figer. À utiliser quand une décision de sérialisation change.
 */
const FIXTURES = join(import.meta.env.ASTER_FIXTURES, 'docx');
const NAMES = [
  '11-styles-inline',
  '12-paragraphes',
  '13-styles-nommes',
  '14-tableaux-riches',
  '15-listes-numerotation',
  '16-sections',
  '17-objets-perdus',
  '18-sections-triple',
  '19-tabulations-bordures',
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
