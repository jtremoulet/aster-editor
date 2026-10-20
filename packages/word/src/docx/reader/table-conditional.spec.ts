import { describe, expect, it } from 'vitest';
import {
  applyConditionalFormats,
  conditionalTypesOf,
  readBandSizes,
  readConditionalFormats,
  readTableLook,
  type TableLook,
} from './table-conditional';
import { fragment } from './testing-blocks';
import type { TableStyleProps } from './types';

const ALL_OFF: TableLook = {
  firstRow: false,
  lastRow: false,
  firstColumn: false,
  lastColumn: false,
  noHBand: false,
  noVBand: false,
};

const ONE: { readonly rows: number; readonly columns: number } = { rows: 1, columns: 1 };

describe('readTableLook', () => {
  it('attributs nommés : 1/true vrais, 0/false ou absents faux', () => {
    expect(
      readTableLook(
        fragment(
          '<w:tblPr><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>',
        ),
      ),
    ).toEqual({ ...ALL_OFF, firstRow: true, firstColumn: true, noVBand: true });
    expect(
      readTableLook(
        fragment(
          '<w:tblPr><w:tblLook w:firstRow="true" w:lastRow="false" w:noVBand="on"/></w:tblPr>',
        ),
      ),
    ).toEqual({ ...ALL_OFF, firstRow: true, noVBand: true });
  });

  it('masque w:val hexadécimal (Word 2007) sans attribut nommé ; absent ou illisible → rien', () => {
    expect(readTableLook(fragment('<w:tblPr><w:tblLook w:val="04A0"/></w:tblPr>'))).toEqual({
      ...ALL_OFF,
      firstRow: true,
      firstColumn: true,
      noVBand: true,
    });
    expect(readTableLook(fragment('<w:tblPr><w:tblLook w:val="07E0"/></w:tblPr>'))).toEqual({
      firstRow: true,
      lastRow: true,
      firstColumn: true,
      lastColumn: true,
      noHBand: true,
      noVBand: true,
    });
    expect(readTableLook(fragment('<w:tblPr><w:tblLook w:val="zz"/></w:tblPr>'))).toEqual(ALL_OFF);
    expect(readTableLook(fragment('<w:tblPr/>'))).toBeNull();
    expect(readTableLook(null)).toBeNull();
  });

  it('tailles de bandes : 1 par défaut, entiers ≥ 1 seulement', () => {
    expect(readBandSizes(null)).toEqual({ rows: 1, columns: 1 });
    expect(
      readBandSizes(
        fragment(
          '<w:tblPr><w:tblStyleRowBandSize w:val="2"/><w:tblStyleColBandSize w:val="0"/></w:tblPr>',
        ),
      ),
    ).toEqual({ rows: 2, columns: 1 });
  });
});

describe('conditionalTypesOf', () => {
  const at = (row: number, column: number, look: Partial<TableLook>, rowCount = 4, last = false) =>
    conditionalTypesOf({ row, rowCount, column, lastColumn: last }, { ...ALL_OFF, ...look }, ONE);

  it('bandes horizontales comptées après la première ligne, hors dernière ligne', () => {
    expect(at(0, 0, { firstRow: true })).toEqual(['band1Vert', 'firstRow']);
    expect(at(1, 0, { firstRow: true })).toEqual(['band1Vert', 'band1Horz']);
    expect(at(2, 0, { firstRow: true })).toEqual(['band1Vert', 'band2Horz']);
    expect(at(3, 0, { firstRow: true, lastRow: true })).toEqual(['band1Vert', 'lastRow']);
    // Sans première ligne : la ligne 0 est band1.
    expect(at(0, 1, { noVBand: true })).toEqual(['band1Horz']);
    expect(at(1, 1, { noVBand: true })).toEqual(['band2Horz']);
    expect(at(1, 1, { noVBand: true, noHBand: true })).toEqual([]);
  });

  it('colonnes : firstCol / lastCol priment sur les bandes verticales, ordre croissant de priorité', () => {
    expect(at(1, 0, { firstColumn: true, noHBand: true })).toEqual(['firstCol']);
    expect(at(1, 1, { firstColumn: true, noHBand: true })).toEqual(['band1Vert']);
    expect(at(1, 2, { firstColumn: true, noHBand: true })).toEqual(['band2Vert']);
    expect(at(1, 2, { firstColumn: true, lastColumn: true, noHBand: true }, 4, true)).toEqual([
      'lastCol',
    ]);
    expect(at(0, 0, { firstRow: true, firstColumn: true, noHBand: true, noVBand: true })).toEqual([
      'firstCol',
      'firstRow',
    ]);
  });

  it('bandes par paquets de tblStyleRowBandSize', () => {
    const bands = { rows: 2, columns: 1 };
    const rows = [0, 1, 2, 3, 4].map(
      (row) =>
        conditionalTypesOf(
          { row, rowCount: 6, column: 0, lastColumn: false },
          { ...ALL_OFF, firstRow: true, noVBand: true },
          bands,
        )[0],
    );
    expect(rows).toEqual(['firstRow', 'band1Horz', 'band1Horz', 'band2Horz', 'band2Horz']);
  });
});

describe('readConditionalFormats et applyConditionalFormats', () => {
  const tblStylePr = (type: string, inner: string): Element =>
    fragment(`<w:tblStylePr w:type="${type}">${inner}</w:tblStylePr>`);

  it('accumule bordures, fond et runs par type le long de la chaîne ; types inconnus et vides ignorés', () => {
    const formats = readConditionalFormats(
      [
        {
          tblStylePrs: [
            tblStylePr(
              'firstRow',
              '<w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:fill="D9E2F3"/><w:tcBorders><w:bottom w:val="single" w:sz="8" w:color="2F5496"/></w:tcBorders></w:tcPr>',
            ),
            tblStylePr('nwCell', '<w:rPr><w:i/></w:rPr>'),
            tblStylePr('band2Horz', '<w:pPr><w:jc w:val="center"/></w:pPr>'),
          ],
        },
        {
          tblStylePrs: [
            tblStylePr('firstRow', '<w:rPr><w:color w:val="FFFFFF"/></w:rPr>'),
            tblStylePr('band1Horz', '<w:tcPr><w:shd w:val="clear" w:fill="F2F2F2"/></w:tcPr>'),
          ],
        },
      ],
      {},
    );
    expect(formats).toEqual({
      band1Horz: { cellShading: '#f2f2f2' },
      firstRow: {
        cellBorders: [{ side: 'bottom', style: 'solid', widthPt: 1, color: '#2f5496' }],
        cellShading: '#d9e2f3',
        run: { bold: true, color: '#ffffff' },
      },
    });
    expect(readConditionalFormats([{ tblStylePrs: [] }], {})).toBeUndefined();
  });

  it('fond le style de base avec les formats, du moins au plus prioritaire, sans muter la base', () => {
    const base: TableStyleProps = {
      cellBorders: [{ side: 'top', style: 'solid', widthPt: 0.5, color: '#bfbfbf' }],
      cellShading: '#ffffff',
      runDefaults: { fontSizePt: 9 },
    };
    const formats = {
      band1Horz: { cellShading: '#f2f2f2', run: { italic: true } },
      firstRow: {
        cellShading: '#d9e2f3',
        run: { bold: true },
        cellBorders: [{ side: 'bottom', style: 'solid', widthPt: 1, color: '#2f5496' }] as const,
      },
    };
    expect(applyConditionalFormats(base, formats, ['band1Horz', 'firstRow'])).toEqual({
      cellBorders: [
        { side: 'top', style: 'solid', widthPt: 0.5, color: '#bfbfbf' },
        { side: 'bottom', style: 'solid', widthPt: 1, color: '#2f5496' },
      ],
      cellShading: '#d9e2f3',
      runDefaults: { fontSizePt: 9, italic: true, bold: true },
    });
    expect(base.cellShading).toBe('#ffffff');
    // Aucun type applicable, ou types sans format : le même objet.
    expect(applyConditionalFormats(base, formats, [])).toBe(base);
    expect(applyConditionalFormats(base, formats, ['lastRow'])).toBe(base);
  });
});
