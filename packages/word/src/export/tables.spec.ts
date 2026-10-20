import { describe, expect, it } from 'vitest';
import { exportDocx } from './export-docx';
import { MAX_ROW_SPAN, MAX_TABLE_COLUMNS } from './tables';
import { toDocumentXml } from './testing/sample';
import type { DocxExportWarning } from './types';

/** Nombre d'occurrences d'une sous-chaîne. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Durée d'un export en millisecondes, avec ses avertissements. */
async function timedExport(
  html: string,
): Promise<{ readonly ms: number; readonly warnings: DocxExportWarning[] }> {
  const warnings: DocxExportWarning[] = [];
  const start = performance.now();
  await exportDocx(html, { onWarning: (warning) => warnings.push(warning) });
  return { ms: performance.now() - start, warnings };
}

describe('fusions de cellules démesurées (R16 E-3)', () => {
  it('borne colspan="1000000" à 63 colonnes, en moins de 500 ms, avec avertissement', async () => {
    const { ms, warnings } = await timedExport(
      '<table><tr><td colspan="1000000">large</td></tr><tr><td>a</td><td>b</td></tr></table>',
    );
    expect(ms).toBeLessThan(500);
    expect(warnings).toEqual([
      { code: 'table-span-clamped', message: expect.stringContaining('colspan="1000000"') },
    ]);
    const { xml } = await toDocumentXml('<table><tr><td colspan="1000000">large</td></tr></table>');
    expect(xml).toContain(`<w:gridSpan w:val="${String(MAX_TABLE_COLUMNS)}"/>`);
    expect(count(xml, '<w:gridCol')).toBe(MAX_TABLE_COLUMNS);
  });

  it('borne <col span="99999999"> en moins de 100 ms', async () => {
    const { ms, warnings } = await timedExport(
      '<table><colgroup><col span="99999999" style="width:10px"></colgroup><tr><td>a</td></tr></table>',
    );
    expect(ms).toBeLessThan(100);
    expect(warnings).toEqual([
      { code: 'table-span-clamped', message: expect.stringContaining('span="99999999"') },
    ]);
  });

  it('borne rowspan="1000000" à 65 534 sans parcourir un million de lignes', async () => {
    const { ms, warnings } = await timedExport(
      '<table><tr><td rowspan="1000000">haut</td><td>a</td></tr><tr><td>b</td></tr></table>',
    );
    expect(ms).toBeLessThan(500);
    expect(warnings).toEqual([
      { code: 'table-span-clamped', message: expect.stringContaining('rowspan="1000000"') },
    ]);
    const { xml } = await toDocumentXml(
      '<table><tr><td rowspan="1000000">haut</td><td>a</td></tr><tr><td>b</td></tr></table>',
    );
    // La fusion verticale est posée et continuée sur la seule ligne suivante.
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(count(xml, '<w:vMerge w:val="continue"/>')).toBe(1);
    expect(MAX_ROW_SPAN).toBe(65_534);
  });

  it('ne borne pas une fusion dans la limite et n’avertit pas', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<table><tr><td colspan="63">a</td></tr><tr><td rowspan="3">b</td></tr></table>',
    );
    expect(xml).toContain('<w:gridSpan w:val="63"/>');
    expect(warnings).toEqual([]);
  });

  it('exporte une table de plus de 63 colonnes sans la tronquer (limite Word documentée)', async () => {
    const cells = Array.from({ length: 70 }, (_, i) => `<td>${String(i)}</td>`).join('');
    const { ms, warnings } = await timedExport(`<table><tr>${cells}</tr></table>`);
    expect(ms).toBeLessThan(1000);
    expect(warnings).toEqual([]);
    const { xml } = await toDocumentXml(`<table><tr>${cells}</tr></table>`);
    expect(count(xml, '<w:tc>')).toBe(70);
    expect(count(xml, '<w:gridCol')).toBe(70);
  });
});
