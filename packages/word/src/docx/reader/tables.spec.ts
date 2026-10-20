import { beforeAll, describe, expect, it } from 'vitest';
import { convertTable } from './tables';
import {
  buildPackage,
  createTestContext,
  fragment,
  paragraphXml,
  renderBody,
  stubStyles,
} from './testing-blocks';
import type { ConverterContext, DocxPackage } from './types';

function cell(text: string, tcPr = ''): string {
  return `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ''}${text === '' ? '<w:p/>' : paragraphXml(text)}</w:tc>`;
}

function row(cells: string, trPr = ''): string {
  return `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}${cells}</w:tr>`;
}

const BORDERS_ALL =
  '<w:tblBorders><w:top w:val="single" w:sz="24" w:color="000000"/><w:left w:val="single" w:sz="8" w:color="000000"/>' +
  '<w:bottom w:val="single" w:sz="8" w:color="000000"/><w:right w:val="none" w:sz="0" w:color="auto"/>' +
  '<w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>';

describe('convertTable', () => {
  let pkg: DocxPackage;
  let ctx: ConverterContext;

  beforeAll(async () => {
    pkg = await buildPackage('');
    ctx = await createTestContext(pkg);
  });

  async function convert(xml: string): Promise<string> {
    return (await convertTable(fragment(xml), ctx)).html;
  }

  it('rend un tableau nu dans un tbody, cellule vide → <p></p>', async () => {
    const html = await convert(`<w:tbl>${row(cell('A') + cell(''))}</w:tbl>`);
    expect(html).toBe('<table><tbody><tr><td><p>A</p></td><td><p></p></td></tr></tbody></table>');
  });

  it('largeur : pct → %, dxa → pt, auto → rien', async () => {
    expect(
      await convert(
        `<w:tbl><w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
      ),
    ).toContain('<table style="width: 100%">');
    expect(
      await convert(
        `<w:tbl><w:tblPr><w:tblW w:type="pct" w:w="2500"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
      ),
    ).toContain('<table style="width: 50%">');
    expect(
      await convert(
        `<w:tbl><w:tblPr><w:tblW w:type="pct" w:w="33.5%"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
      ),
    ).toContain('<table style="width: 33.5%">');
    expect(
      await convert(
        `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="6000"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
      ),
    ).toContain('<table style="width: 300pt">');
    expect(
      await convert(
        `<w:tbl><w:tblPr><w:tblW w:type="auto" w:w="0"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
      ),
    ).toContain('<table><tbody>');
  });

  it('bordures du tableau sur <table>, intérieures sur les cellules, `none` omis', async () => {
    const html = await convert(
      `<w:tbl><w:tblPr>${BORDERS_ALL}</w:tblPr>${row(cell('A1') + cell('B1'))}${row(cell('A2') + cell('B2'))}</w:tbl>`,
    );
    expect(html).toContain(
      '<table style="border-top: 3pt solid #000000; border-bottom: 1pt solid #000000; border-left: 1pt solid #000000">',
    );
    // A1 : bord droit (insideV) et bord bas (insideH) seulement.
    expect(html).toContain(
      '<td style="border-right: 0.5pt solid #000000; border-bottom: 0.5pt solid #000000"><p>A1</p></td>',
    );
    // B2 : dernière cellule, dernière ligne : bord haut et bord gauche.
    expect(html).toContain(
      '<td style="border-top: 0.5pt solid #000000; border-left: 0.5pt solid #000000"><p>B2</p></td>',
    );
  });

  it('tcBorders priment sur les bordures intérieures et sur le style, `nil` retire', async () => {
    const styled = await createTestContext(
      pkg,
      {},
      {
        styles: stubStyles({
          tableStyle: (id) =>
            id === 'Grid'
              ? {
                  borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#111111' }],
                  cellBorders: [
                    { side: 'top', style: 'dotted', widthPt: 0.5, color: '#222222' },
                    { side: 'left', style: 'dotted', widthPt: 0.5, color: '#222222' },
                  ],
                  cellShading: '#eeeeee',
                  cellPaddingPt: [1, 2, 1, 2],
                }
              : null,
        }),
      },
    );
    const table = fragment(
      `<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/>${BORDERS_ALL}</w:tblPr>` +
        row(
          cell('A1') +
            cell(
              'B1',
              '<w:tcBorders><w:bottom w:val="dashed" w:sz="16" w:color="FF0000"/><w:left w:val="nil"/></w:tcBorders>',
            ),
        ) +
        row(cell('A2') + cell('B2')) +
        '</w:tbl>',
    );
    const html = (await convertTable(table, styled)).html;
    expect(html).toContain(
      '<table style="border-top: 3pt solid #000000; border-bottom: 1pt solid #000000; border-left: 1pt solid #000000" data-docx-style="Grid">',
    );
    // A1 : top dotted du style (arête extérieure, pas d'insideH), left dotted du style, right/bottom insideV/insideH.
    expect(html).toContain(
      '<td style="border-top: 0.5pt dotted #222222; border-right: 0.5pt solid #000000; border-bottom: 0.5pt solid #000000; border-left: 0.5pt dotted #222222; background-color: #eeeeee; padding: 1pt 2pt 1pt 2pt"><p>A1</p></td>',
    );
    // B1 : bottom direct dashed 2pt, left nil → omis.
    expect(html).toContain(
      '<td style="border-top: 0.5pt dotted #222222; border-bottom: 2pt dashed #ff0000; background-color: #eeeeee; padding: 1pt 2pt 1pt 2pt"><p>B1</p></td>',
    );
    // Style de tableau courant transmis au contexte des cellules.
    expect(styled.tableStyle).toBeNull();
  });

  it('gridSpan → colspan, colwidth sur la première ligne depuis tblGrid', async () => {
    const html = await convert(
      '<w:tbl><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="4800"/><w:gridCol w:w="2400"/></w:tblGrid>' +
        row(cell('AB1', '<w:gridSpan w:val="2"/>') + cell('C1')) +
        row(cell('A2') + cell('B2') + cell('C2')) +
        '</w:tbl>',
    );
    expect(html).toContain(
      '<td colspan="2" colwidth="160,320"><p>AB1</p></td><td colwidth="160"><p>C1</p></td>',
    );
    expect(html).toContain('<tr><td><p>A2</p></td><td><p>B2</p></td><td><p>C2</p></td></tr>');
  });

  it('vMerge : restart ouvre, continuation fusionne et omet la cellule', async () => {
    const html = await convert(
      '<w:tbl>' +
        row(cell('A1', '<w:vMerge w:val="restart"/>') + cell('B1')) +
        row(cell('', '<w:vMerge/>') + cell('B2')) +
        row(cell('', '<w:vMerge w:val="continue"/>') + cell('B3')) +
        row(cell('A4') + cell('B4')) +
        '</w:tbl>',
    );
    expect(html).toBe(
      '<table><tbody>' +
        '<tr><td rowspan="3"><p>A1</p></td><td><p>B1</p></td></tr>' +
        '<tr><td><p>B2</p></td></tr>' +
        '<tr><td><p>B3</p></td></tr>' +
        '<tr><td><p>A4</p></td><td><p>B4</p></td></tr>' +
        '</tbody></table>',
    );
  });

  it('vMerge continuation orpheline (sans restart) reste une cellule normale', async () => {
    const html = await convert(`<w:tbl>${row(cell('A1', '<w:vMerge/>') + cell('B1'))}</w:tbl>`);
    expect(html).toContain('<tr><td><p>A1</p></td><td><p>B1</p></td></tr>');
  });

  it('tblHeader → th sur toute la ligne', async () => {
    const html = await convert(
      `<w:tbl>${row(cell('H1') + cell('H2'), '<w:tblHeader/>')}${row(cell('A') + cell('B'))}</w:tbl>`,
    );
    expect(html).toContain('<tr><th><p>H1</p></th><th><p>H2</p></th></tr><tr><td><p>A</p></td>');
  });

  it('fond, alignement vertical et marges de cellule dans l’ordre du contrat', async () => {
    const html = await convert(
      '<w:tbl><w:tblPr><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
        row(
          cell(
            'A',
            '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/><w:vAlign w:val="center"/>',
          ) +
            cell(
              'B',
              '<w:tcMar><w:left w:w="200" w:type="dxa"/></w:tcMar><w:vAlign w:val="bottom"/>',
            ),
        ) +
        '</w:tbl>',
    );
    expect(html).toContain(
      '<td style="background-color: #d9e2f3; vertical-align: middle; padding: 2pt 4pt 2pt 4pt"><p>A</p></td>',
    );
    expect(html).toContain(
      '<td style="vertical-align: bottom; padding: 2pt 4pt 2pt 10pt"><p>B</p></td>',
    );
  });

  it('transmet le style de tableau et l’alignement vertical au contexte des cellules', async () => {
    const seen: { style: unknown; align: unknown }[] = [];
    const spy = await createTestContext(
      pkg,
      {},
      {
        styles: stubStyles({ tableStyle: () => ({ cellShading: '#abcdef' }) }),
      },
    );
    const spying: ConverterContext = {
      ...spy,
      convert: {
        ...spy.convert,
        blocks: async (container, inner) => {
          seen.push({ style: inner.tableStyle, align: inner.cellVerticalAlign });
          return spy.convert.blocks(container, inner);
        },
      },
    };
    await convertTable(
      fragment(
        `<w:tbl><w:tblPr><w:tblStyle w:val="X"/></w:tblPr>${row(cell('A', '<w:vAlign w:val="center"/>'))}</w:tbl>`,
      ),
      spying,
    );
    expect(seen).toEqual([{ style: { cellShading: '#abcdef' }, align: 'middle' }]);
  });

  it('tableau imbriqué : récursif, paragraphe vide conservé après', async () => {
    const html = await renderBody(
      '<w:tbl>' +
        row(`<w:tc>${paragraphXml('Externe')}<w:tbl>${row(cell('Interne'))}</w:tbl><w:p/></w:tc>`) +
        '</w:tbl>',
      ctx,
    );
    expect(html).toBe(
      '<table><tbody><tr><td><p>Externe</p><table><tbody><tr><td><p>Interne</p></td></tr></tbody></table><p></p></td></tr></tbody></table>',
    );
  });

  it('ignore `w:jc` (alignement du tableau hors contrat) sans planter', async () => {
    const html = await convert(
      `<w:tbl><w:tblPr><w:jc w:val="center"/><w:tblW w:type="dxa" w:w="6000"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
    );
    expect(html).toContain('<table style="width: 300pt">');
    expect(html).not.toContain('margin');
  });
});
