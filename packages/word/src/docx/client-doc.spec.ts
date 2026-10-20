import { appendFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDocx } from './import-docx';

const CLIENT = join(import.meta.env.ASTER_FIXTURES, 'docx', 'client', 'Modele_Demo_DER.docx');
const LOG = process.env.ASTER_CLIENT_DOC_LOG;

/** Trace facultative (fichier désigné par `ASTER_CLIENT_DOC_LOG`) pour inspecter le résultat. */
function log(...parts: unknown[]): void {
  if (LOG) appendFileSync(LOG, `${parts.map(String).join(' ')}\n`);
}

async function clientDoc(): Promise<ArrayBuffer> {
  const buffer = await readFile(CLIENT);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Document client réel (non commité, `fixtures/docx/client/` est ignoré par git) : la
 * session 3 mesure dessus ce que les chemins `semantic` et `styled` conservent. Le champ
 * `BankingSolicitorByIncident` est imbriqué dans le résultat d'un autre champ de fusion :
 * seul le champ extérieur compte, d'où 14 variables pour 15 noms.
 */
describe.skipIf(!existsSync(CLIENT))('document client Modele_Demo_DER', () => {
  it('chemin sémantique : variables, tableaux, texte', async () => {
    const result = await importDocx(await clientDoc(), { fidelity: 'semantic' });
    const names = result.variables.map((v) => v.name);
    log('semantic variables', names.length, names.join(','));
    log('semantic warnings', result.warnings.map((w) => w.code).join(','));
    expect(result.html).toContain('FICHE INFORMATION CONSEILLER');
    expect((result.html.match(/<table/g) ?? []).length).toBe(8);
    expect(names.length).toBe(14);
  });

  it('chemin stylé : ne rejette pas, mêmes variables, mise en page lue', async () => {
    const result = await importDocx(await clientDoc(), { fidelity: 'styled' });
    const semantic = await importDocx(await clientDoc(), { fidelity: 'semantic' });
    const names = result.variables.map((v) => v.name);
    log('styled variables', names.length, names.join(','));
    log('styled warnings', result.warnings.map((w) => `${w.code}:${w.message}`).join(' | '));
    log('styled layout', JSON.stringify(result.layout));
    log('styled lost', JSON.stringify(result.lost));
    log('styled html', result.html);
    expect(result.html).toContain('FICHE INFORMATION CONSEILLER');
    expect((result.html.match(/<table/g) ?? []).length).toBe(8);
    expect(names).toEqual(semantic.variables.map((v) => v.name));
  });
});
