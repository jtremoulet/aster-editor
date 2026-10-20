import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../export/export-docx';
import { importDocx } from '../import-docx';
import { compareDocx } from './compare-docx';

const DIR = join(import.meta.env.ASTER_FIXTURES, 'docx');
const CLIENT = join(DIR, 'client', 'Modele_Demo_DER.docx');
const LAYOUT_FIXTURES = [
  '11-styles-inline.docx',
  '12-paragraphes.docx',
  '13-styles-nommes.docx',
  '14-tableaux-riches.docx',
  '15-listes-numerotation.docx',
  '16-sections.docx',
  '17-objets-perdus.docx',
];

/** Seuil bas de l'aller-retour sans gabarit : l'export neuf perd volontairement les parties annexes. */
const ROUNDTRIP_MIN_SCORE = 0.3;

function fixture(name: string): ArrayBuffer {
  const bytes = readFileSync(join(DIR, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Import stylé puis export neuf avec `layout` : le gabarit (L27) n'est pas encore branché. */
async function roundTrip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const imported = await importDocx(buffer, { fidelity: 'styled' });
  const blob = await exportDocx(imported.html, { layout: imported.layout });
  return blob.arrayBuffer();
}

describe('compareDocx sur les fixtures de mise en page', () => {
  it.each(LAYOUT_FIXTURES)(
    '%s comparé à lui-même : score 1, toutes parties identiques',
    async (name) => {
      const buffer = fixture(name);
      const report = await compareDocx(buffer, buffer.slice(0));
      expect(report.score).toBe(1);
      expect(report.changedParts).toEqual([]);
      expect(report.identicalParts).toContain('word/styles.xml');
      expect(report.identicalParts).not.toContain('word/document.xml');
      expect(report.identicalParts).not.toContain('docProps/core.xml');
      expect(report.properties.every((p) => p.lost === 0)).toBe(true);
      expect(report.properties.some((p) => p.group === 'text')).toBe(true);
    },
  );

  it.each(LAYOUT_FIXTURES)('%s aller-retour sans gabarit : score cohérent', async (name) => {
    const original = fixture(name);
    const report = await compareDocx(original, await roundTrip(original));
    expect(report.score).toBeGreaterThanOrEqual(ROUNDTRIP_MIN_SCORE);
    expect(report.score).toBeLessThan(1);
    // L'export neuf réécrit styles.xml : la partie est forcément différente ou absente.
    expect(report.changedParts.some((part) => part.path === 'word/styles.xml')).toBe(true);
    // Le texte survit presque toujours ; les blocs coupés par un saut de page ou une
    // tabulation (cadratin à l'export) expliquent les quelques paragraphes désalignés.
    const text = report.properties.find((p) => p.name === 'paragraph.text');
    expect(text).toBeDefined();
    expect(text && text.kept / text.total).toBeGreaterThanOrEqual(0.7);
  });

  // TODO L27 : activer quand `exportDocx({ template })` est intégré.
  it.skip.each(LAYOUT_FIXTURES)('%s aller-retour dans le gabarit : score >= 0,98', async (name) => {
    const original = fixture(name);
    const imported = await importDocx(original, { fidelity: 'styled' });
    const blob = await exportDocx(imported.html, { template: imported.template });
    const report = await compareDocx(original, await blob.arrayBuffer());
    expect(report.score).toBeGreaterThanOrEqual(0.98);
    expect(report.changedParts.filter((part) => part.summary !== 'ajoutée')).toEqual([]);
  });

  it('17-objets-perdus : les objets non représentables sont listés', async () => {
    const buffer = fixture('17-objets-perdus.docx');
    const report = await compareDocx(buffer, buffer.slice(0));
    expect(report.lost.length).toBeGreaterThan(0);
    expect(report.lost.map((item) => item.kind)).toContain('textbox');
  });

  it('16-sections : deux sections, en-têtes et pieds comparés', async () => {
    const buffer = fixture('16-sections.docx');
    const report = await compareDocx(buffer, buffer.slice(0));
    const count = report.properties.find((p) => p.name === 'section.count');
    expect(count?.kept).toBe(1);
    expect(report.properties.some((p) => p.name === 'header.default.text')).toBe(true);
    expect(report.properties.some((p) => p.name === 'footer.default.text')).toBe(true);
    expect(report.properties.find((p) => p.name === 'section.pgSz')?.total).toBe(2);
  });
});

describe.skipIf(!existsSync(CLIENT))('compareDocx sur le document client', () => {
  function client(): ArrayBuffer {
    const bytes = readFileSync(CLIENT);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  it('comparé à lui-même : score 1', async () => {
    const buffer = client();
    const report = await compareDocx(buffer, buffer.slice(0));
    expect(report.score).toBe(1);
    expect(report.changedParts).toEqual([]);
  });

  it('aller-retour sans gabarit : ne plante pas, score mesuré', async () => {
    const original = client();
    const report = await compareDocx(original, await roundTrip(original));
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(1);
    if (process.env.ASTER_CLIENT_DOC_LOG) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(
        process.env.ASTER_CLIENT_DOC_LOG,
        `client fidelity score ${String(report.score)}\n${JSON.stringify(report.properties.map((p) => [p.name, p.total, p.kept]))}\n`,
      );
    }
  });
});
