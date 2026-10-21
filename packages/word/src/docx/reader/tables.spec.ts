import { beforeAll, describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx';
import { buildDocx, run as runXml, W_NS } from '../preprocess/minimal-docx';
import { MAX_COLUMNS, convertTable } from './tables';
import {
  buildPackage,
  createTestContext,
  fragment,
  paragraphXml,
  renderBody,
  stubStyles,
} from './testing-blocks';
import type { ConverterContext, DocxPackage, TableStyleProps } from './types';

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
    // B1 : bottom direct dashed 2pt, left nil explicite qui annule le trait du style → transparent 0pt.
    expect(html).toContain(
      '<td style="border-top: 0.5pt dotted #222222; border-bottom: 2pt dashed #ff0000; border-left: 0pt solid transparent; background-color: #eeeeee; padding: 1pt 2pt 1pt 2pt"><p>B1</p></td>',
    );
    // Style de tableau courant transmis au contexte des cellules.
    expect(styled.tableStyle).toBeNull();
  });

  it('gridSpan → colspan, colwidth sur toutes les lignes depuis tblGrid (comme le core, L49)', async () => {
    const html = await convert(
      '<w:tbl><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="4800"/><w:gridCol w:w="2400"/></w:tblGrid>' +
        row(cell('AB1', '<w:gridSpan w:val="2"/>') + cell('C1')) +
        row(cell('A2') + cell('B2') + cell('C2')) +
        '</w:tbl>',
    );
    expect(html).toContain(
      '<td colspan="2" colwidth="160,320"><p>AB1</p></td><td colwidth="160"><p>C1</p></td>',
    );
    expect(html).toContain(
      '<tr><td colwidth="160"><p>A2</p></td><td colwidth="320"><p>B2</p></td><td colwidth="160"><p>C2</p></td></tr>',
    );
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

  it('R25-01 : gridSpan géant plafonné à 63 sans grille, aux colonnes restantes avec grille', async () => {
    const started = performance.now();
    const html = await convert(
      `<w:tbl>${row(cell('A', '<w:gridSpan w:val="100000000"/>') + cell('B'))}</w:tbl>`,
    );
    expect(performance.now() - started).toBeLessThan(1000);
    expect(html).toContain(`<td colspan="${String(MAX_COLUMNS)}"><p>A</p></td><td><p>B</p></td>`);
    const gridded = await convert(
      '<w:tbl><w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid>' +
        row(cell('A') + cell('BC', '<w:gridSpan w:val="1000000000"/>')) +
        '</w:tbl>',
    );
    expect(gridded).toContain(
      '<td colwidth="100"><p>A</p></td><td colspan="2" colwidth="100,100"><p>BC</p></td>',
    );
    // Cellule au-delà de la grille : colspan 1, sans colwidth.
    const beyond = await convert(
      '<w:tbl><w:tblGrid><w:gridCol w:w="1500"/></w:tblGrid>' +
        row(cell('A') + cell('B', '<w:gridSpan w:val="4"/>')) +
        '</w:tbl>',
    );
    expect(beyond).toContain('<td colwidth="100"><p>A</p></td><td><p>B</p></td>');
  });

  it('R25-08 : gridSpan au-delà de la grille plafonné ; continuation d’une autre largeur non fusionnée', async () => {
    const over = await convert(
      '<w:tbl><w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid>' +
        row(cell('A', '<w:gridSpan w:val="3"/>')) +
        row(cell('B') + cell('C')) +
        '</w:tbl>',
    );
    expect(over).toContain(
      '<tr><td colspan="2" colwidth="100,100"><p>A</p></td></tr><tr><td colwidth="100"><p>B</p></td><td colwidth="100"><p>C</p></td></tr>',
    );
    const narrower = await convert(
      '<w:tbl><w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid>' +
        row(cell('A', '<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>') + cell('B')) +
        row(cell('', '<w:vMerge/>') + cell('X') + cell('Y')) +
        row(cell('', '<w:vMerge/>') + cell('Z', '<w:gridSpan w:val="2"/>')) +
        '</w:tbl>',
    );
    // L'origine (2 colonnes) n'absorbe pas une continuation d'une colonne : pas de chevauchement,
    // et l'origine est fermée pour les lignes suivantes.
    expect(narrower).toBe(
      '<table><tbody>' +
        '<tr><td colspan="2" colwidth="100,100"><p>A</p></td><td colwidth="100"><p>B</p></td></tr>' +
        '<tr><td colwidth="100"><p></p></td><td colwidth="100"><p>X</p></td><td colwidth="100"><p>Y</p></td></tr>' +
        '<tr><td colwidth="100"><p></p></td><td colspan="2" colwidth="100,100"><p>Z</p></td></tr>' +
        '</tbody></table>',
    );
  });

  it('R25-09 : tableau sans ligne → rien, avec avertissement reader ; ligne vide conservée', async () => {
    const fresh = await createTestContext(pkg);
    expect((await convertTable(fragment('<w:tbl><w:tblPr/></w:tbl>'), fresh)).html).toBe('');
    expect(fresh.warnings).toEqual([
      { code: 'reader', message: expect.stringContaining('sans ligne') },
    ]);
    expect(
      await renderBody(
        '<w:p><w:r><w:t>avant</w:t></w:r></w:p><w:tbl/><w:p><w:r><w:t>après</w:t></w:r></w:p>',
        fresh,
      ),
    ).toBe('<p>avant</p><p>après</p>');
    // Imbriqué dans une cellule : la cellule reste valide (`<p></p>`).
    expect(await convert('<w:tbl><w:tr><w:tc><w:tbl/></w:tc></w:tr></w:tbl>')).toBe(
      '<table><tbody><tr><td><p></p></td></tr></tbody></table>',
    );
    expect(await convert('<w:tbl><w:tr/><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>')).toBe(
      '<table><tbody><tr></tr><tr><td><p></p></td></tr></tbody></table>',
    );
  });

  it('`w:jc` → data-align center / right, left et start omis, après data-docx-style', async () => {
    const html = await convert(
      `<w:tbl><w:tblPr><w:jc w:val="center"/><w:tblW w:type="dxa" w:w="6000"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
    );
    expect(html).toContain('<table style="width: 300pt" data-align="center">');
    expect(html).not.toContain('margin');
    expect(
      await convert(`<w:tbl><w:tblPr><w:jc w:val="end"/></w:tblPr>${row(cell('A'))}</w:tbl>`),
    ).toContain('<table data-align="right">');
    expect(
      await convert(
        `<w:tbl><w:tblPr><w:tblStyle w:val="X"/><w:jc w:val="right"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
      ),
    ).toContain('<table data-docx-style="X" data-align="right">');
    for (const value of ['left', 'start', 'both', '']) {
      expect(
        await convert(
          `<w:tbl><w:tblPr><w:jc w:val="${value}"/></w:tblPr>${row(cell('A'))}</w:tbl>`,
        ),
      ).toContain('<table><tbody>');
    }
  });

  describe('bordures nil explicites et couleurs (session 4)', () => {
    const GREY =
      '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/></w:tblBorders>';

    it('la couleur exacte est conservée, `auto` seul devient noir', async () => {
      const html = await convert(
        `<w:tbl><w:tblPr>${GREY}</w:tblPr>${row(cell('A') + cell('B', '<w:tcBorders><w:bottom w:val="single" w:sz="4" w:color="auto"/></w:tcBorders>'))}</w:tbl>`,
      );
      expect(html).toContain(
        '<table style="border-top: 0.5pt solid #bfbfbf; border-right: 0.5pt solid #bfbfbf; border-bottom: 0.5pt solid #bfbfbf; border-left: 0.5pt solid #bfbfbf">',
      );
      expect(html).toContain('<td style="border-right: 0.5pt solid #bfbfbf"><p>A</p></td>');
      expect(html).toContain(
        '<td style="border-bottom: 0.5pt solid #000000; border-left: 0.5pt solid #bfbfbf"><p>B</p></td>',
      );
      expect(html).not.toContain('#000000; border-left: 0.5pt solid #000000');
    });

    it('nil explicite : transparent 0pt s’il annule un trait intérieur ou extérieur, omis sinon', async () => {
      const html = await convert(
        `<w:tbl><w:tblPr>${GREY}</w:tblPr>` +
          row(
            cell('nil gauche', '<w:tcBorders><w:left w:val="nil"/></w:tcBorders>') +
              cell(
                'nil bas',
                '<w:tcBorders><w:bottom w:val="nil" w:color="auto" w:sz="0"/></w:tcBorders>',
              ),
          ) +
          row(cell('A2') + cell('B2')) +
          '</w:tbl>',
      );
      // Arête extérieure gauche : le `nil` annule la bordure gauche du tableau.
      expect(html).toContain(
        '<td style="border-right: 0.5pt solid #bfbfbf; border-bottom: 0.5pt solid #bfbfbf; border-left: 0pt solid transparent"><p>nil gauche</p></td>',
      );
      // Arête intérieure basse : le `nil` annule `insideH`.
      expect(html).toContain(
        '<td style="border-bottom: 0pt solid transparent; border-left: 0.5pt solid #bfbfbf"><p>nil bas</p></td>',
      );
      // Sans bordure à annuler (tableau nu) : rien n'est émis.
      const bare = await convert(
        `<w:tbl>${row(cell('A', '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/></w:tcBorders>'))}</w:tbl>`,
      );
      expect(bare).toBe('<table><tbody><tr><td><p>A</p></td></tr></tbody></table>');
    });
  });

  describe('styles conditionnels (session 4)', () => {
    const conditionalStyles = (): ReturnType<typeof stubStyles> =>
      stubStyles({
        tableStyle: (id) =>
          id === 'Cond'
            ? ({
                cellBorders: [{ side: 'top', style: 'solid', widthPt: 0.5, color: '#bfbfbf' }],
                runDefaults: { fontSizePt: 9 },
                conditional: {
                  firstRow: { cellShading: '#d9e2f3', run: { bold: true } },
                  band1Horz: { cellShading: '#f2f2f2' },
                  lastRow: {
                    cellBorders: {
                      top: { side: 'top', style: 'double', widthPt: 1.5, color: '#2f5496' },
                    },
                  },
                  firstCol: { run: { italic: true } },
                },
              } as TableStyleProps)
            : null,
      });

    async function conditional(tblLook: string, rows: string): Promise<string> {
      const spying = await createTestContext(pkg, {}, { styles: conditionalStyles() });
      return (
        await convertTable(
          fragment(`<w:tbl><w:tblPr><w:tblStyle w:val="Cond"/>${tblLook}</w:tblPr>${rows}</w:tbl>`),
          spying,
        )
      ).html;
    }

    const THREE_ROWS =
      row(cell('H1') + cell('H2')) + row(cell('A') + cell('B')) + row(cell('C') + cell('D'));

    it('tblLook firstRow (true/1) : fond et gras sur la première ligne, band1Horz sur la ligne suivante', async () => {
      for (const look of [
        '<w:tblLook w:firstRow="true" w:lastRow="false" w:noHBand="false" w:noVBand="true"/>',
        '<w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:noHBand="0" w:noVBand="1"/>',
        '<w:tblLook w:val="0420"/>',
      ]) {
        const html = await conditional(look, THREE_ROWS);
        expect(html, look).toContain(
          '<td style="border-top: 0.5pt solid #bfbfbf; background-color: #d9e2f3"><p>H1</p></td>',
        );
        expect(html, look).toContain(
          '<td style="border-top: 0.5pt solid #bfbfbf; background-color: #f2f2f2"><p>A</p></td>',
        );
        expect(html, look).toContain('<td style="border-top: 0.5pt solid #bfbfbf"><p>C</p></td>');
      }
    });

    it('lastRow prime sur band, firstCol applique ses runs, noHBand retire les bandes', async () => {
      const html = await conditional(
        '<w:tblLook w:firstRow="1" w:lastRow="1" w:firstColumn="1" w:noHBand="1" w:noVBand="1"/>',
        THREE_ROWS,
      );
      expect(html).toContain('<td style="border-top: 1.5pt double #2f5496"><p>C</p></td>');
      expect(html).not.toContain('#f2f2f2');
      // Masque nul explicite : aucune première ligne, les bandes seules (band1Horz sur la ligne 0).
      const none = await conditional('<w:tblLook w:val="0000"/>', THREE_ROWS);
      expect(none).not.toContain('#d9e2f3');
      expect(none).toContain('background-color: #f2f2f2"><p>H1</p></td>');
    });

    it('R42-02 : un nil conditionnel (bottom, insideV) de firstRow retire les traits du style sur la première ligne', async () => {
      const styles =
        `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W_NS}">` +
        '<w:style w:type="table" w:styleId="G"><w:name w:val="G"/><w:tblPr><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/></w:tblBorders></w:tblPr>' +
        '<w:tblStylePr w:type="firstRow"><w:tcPr><w:tcBorders><w:bottom w:val="nil"/><w:insideV w:val="nil"/></w:tcBorders></w:tcPr></w:tblStylePr></w:style></w:styles>';
      const p = (text: string): string => `<w:p>${runXml(text)}</w:p>`;
      const body =
        '<w:tbl><w:tblPr><w:tblStyle w:val="G"/><w:tblLook w:firstRow="1"/></w:tblPr>' +
        `<w:tr><w:tc>${p('h1')}</w:tc><w:tc>${p('h2')}</w:tc></w:tr><w:tr><w:tc>${p('a')}</w:tc><w:tc>${p('b')}</w:tc></w:tr></w:tbl><w:p/>`;
      const { html } = await importDocx(await buildDocx(body, { 'word/styles.xml': styles }), {
        fidelity: 'styled',
      });
      // En-tête : seul le trait du haut du style reste ; corps : les quatre traits intérieurs.
      expect(html).toContain('<td style="border-top: 0.5pt solid #bfbfbf"><p>h1</p></td>');
      expect(html).toContain('<td style="border-top: 0.5pt solid #bfbfbf"><p>h2</p></td>');
      expect(html).toContain(
        '<td style="border-top: 0.5pt solid #bfbfbf; border-right: 0.5pt solid #bfbfbf; border-bottom: 0.5pt solid #bfbfbf; border-left: 0.5pt solid #bfbfbf"><p>a</p></td>',
      );
      // Un `nil` direct de cellule reste la bordure transparente du contrat (X8).
      const direct = body.replace(
        `<w:tc>${p('a')}</w:tc>`,
        `<w:tc><w:tcPr><w:tcBorders><w:left w:val="nil"/></w:tcBorders></w:tcPr>${p('a')}</w:tc>`,
      );
      const withDirect = await importDocx(await buildDocx(direct, { 'word/styles.xml': styles }), {
        fidelity: 'styled',
      });
      expect(withDirect.html).toContain('border-left: 0pt solid transparent"><p>a</p></td>');
    });

    it('R42-06 : tblLook absent ou vide → défaut de Word (première ligne, bandes horizontales), comme <w:tblLook/>', async () => {
      const absent = await conditional('', THREE_ROWS);
      const empty = await conditional('<w:tblLook/>', THREE_ROWS);
      // Mêmes propriétés directes ; seul l'élément explicite, même vide, sérialise ses
      // drapeaux effectifs (`data-docx-look`, L49), l'absence ne sérialise rien.
      expect(empty).toBe(
        absent.replace(
          '<table data-docx-style="Cond">',
          '<table data-docx-style="Cond" data-docx-look="firstRow firstColumn noVBand">',
        ),
      );
      expect(absent).not.toContain('data-docx-look');
      expect(absent).toContain(
        '<td style="border-top: 0.5pt solid #bfbfbf; background-color: #d9e2f3"><p>H1</p></td>',
      );
      expect(absent).toContain(
        '<td style="border-top: 0.5pt solid #bfbfbf; background-color: #f2f2f2"><p>A</p></td>',
      );
      expect(absent).toContain('<td style="border-top: 0.5pt solid #bfbfbf"><p>C</p></td>');
    });

    it('L49 : data-docx-look sérialise les drapeaux effectifs d’un w:tblLook explicite, dans l’ordre du contrat, après data-align', async () => {
      const opening = (html: string): string => html.slice(0, html.indexOf('<tbody>'));
      for (const look of [
        '<w:tblLook w:firstRow="true" w:lastRow="false" w:noHBand="false" w:noVBand="true"/>',
        '<w:tblLook w:firstRow="1" w:noVBand="1"/>',
        '<w:tblLook w:val="0420"/>',
      ]) {
        expect(opening(await conditional(look, THREE_ROWS)), look).toBe(
          '<table data-docx-style="Cond" data-docx-look="firstRow noVBand">',
        );
      }
      expect(
        opening(
          await conditional(
            '<w:tblLook w:noVBand="1" w:lastColumn="1" w:firstRow="1" w:lastRow="1" w:noHBand="1" w:firstColumn="1"/>',
            THREE_ROWS,
          ),
        ),
      ).toBe(
        '<table data-docx-style="Cond" data-docx-look="firstRow lastRow firstColumn lastColumn noHBand noVBand">',
      );
      // Masque nul : aucun drapeau, pas représentable par le contrat (`null` = pas de drapeau).
      expect(opening(await conditional('<w:tblLook w:val="0000"/>', THREE_ROWS))).toBe(
        '<table data-docx-style="Cond">',
      );
      // Sans style conditionnel, l'élément est sérialisé quand même : l'export le réécrit tel quel.
      const plain = await convert(
        '<w:tbl><w:tblPr><w:jc w:val="center"/><w:tblLook w:val="04A0"/></w:tblPr>' +
          row(cell('A')) +
          '</w:tbl>',
      );
      expect(opening(plain)).toBe(
        '<table data-align="center" data-docx-look="firstRow firstColumn noVBand">',
      );
    });

    it('le style conditionnel ne remplace pas un fond direct et transmet ses runs au contexte des cellules', async () => {
      const seen: unknown[] = [];
      const base = await createTestContext(pkg, {}, { styles: conditionalStyles() });
      const spying: ConverterContext = {
        ...base,
        convert: {
          ...base.convert,
          blocks: async (container, inner) => {
            seen.push(inner.tableStyle?.runDefaults);
            return base.convert.blocks(container, inner);
          },
        },
      };
      const html = (
        await convertTable(
          fragment(
            '<w:tbl><w:tblPr><w:tblStyle w:val="Cond"/><w:tblLook w:firstRow="1" w:firstColumn="1" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
              row(cell('H1', '<w:shd w:val="clear" w:fill="FF0000"/>') + cell('H2')) +
              row(cell('A') + cell('B')) +
              '</w:tbl>',
          ),
          spying,
        )
      ).html;
      expect(html).toContain('background-color: #ff0000"><p>H1</p>');
      expect(seen).toEqual([
        { fontSizePt: 9, italic: true, bold: true },
        { fontSizePt: 9, bold: true },
        { fontSizePt: 9, italic: true },
        { fontSizePt: 9 },
      ]);
    });
  });
});
