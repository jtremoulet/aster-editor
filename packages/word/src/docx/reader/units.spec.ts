import { describe, expect, it } from 'vitest';
import { fragment } from './testing-blocks';
import {
  borderDeclarations,
  borderStyleOf,
  cssColor,
  emuToPx,
  mergePadding,
  paddingValue,
  readBorders,
  readCellMargins,
  readGridColumns,
  shadingColor,
  twipsToMm,
  twipsToPt,
  twipsToPx,
} from './units-blocks';

describe('units-blocks : conversions', () => {
  it('convertit twips, EMU et huitièmes de point', () => {
    expect(twipsToPt(720)).toBe(36);
    expect(twipsToPt(1134)).toBe(56.7);
    expect(twipsToMm(1134)).toBe(20);
    expect(twipsToMm(720)).toBe(12.7);
    expect(twipsToMm(708)).toBe(12.49);
    expect(twipsToPx(2400)).toBe(160);
    expect(emuToPx(914400)).toBe(96);
    expect(emuToPx(2286000)).toBe(240);
  });

  it('mappe les styles de bordure Word sur les quatre du contrat', () => {
    expect(borderStyleOf('single')).toBe('solid');
    expect(borderStyleOf('thick')).toBe('solid');
    expect(borderStyleOf('dashed')).toBe('dashed');
    expect(borderStyleOf('dotDash')).toBe('dashed');
    expect(borderStyleOf('dotted')).toBe('dotted');
    expect(borderStyleOf('double')).toBe('double');
    expect(borderStyleOf('thinThickSmallGap')).toBe('double');
    expect(borderStyleOf('nil')).toBeNull();
    expect(borderStyleOf('none')).toBeNull();
    expect(borderStyleOf('')).toBeNull();
  });

  it('normalise les couleurs et les fonds', () => {
    expect(cssColor('FF0000')).toBe('#ff0000');
    expect(cssColor('auto')).toBe('#000000');
    expect(cssColor('rouge', '#123456')).toBe('#123456');
    expect(shadingColor(fragment('<w:shd w:val="clear" w:fill="D9E2F3" w:color="auto"/>'))).toBe(
      '#d9e2f3',
    );
    expect(shadingColor(fragment('<w:shd w:val="clear" w:fill="auto"/>'))).toBeUndefined();
    expect(shadingColor(fragment('<w:shd w:val="solid" w:color="00FF00" w:fill="auto"/>'))).toBe(
      '#00ff00',
    );
    expect(shadingColor(null)).toBeUndefined();
  });

  it('lit les bordures par côté, `nil` donnant null', () => {
    const borders = readBorders(
      fragment(
        '<w:tblBorders><w:top w:val="single" w:sz="24" w:color="000000"/><w:right w:val="nil"/>' +
          '<w:insideH w:val="dashed" w:sz="4" w:color="FF0000"/><w:start w:val="double" w:color="auto"/></w:tblBorders>',
      ),
    );
    expect(borders.top).toEqual({ side: 'top', style: 'solid', widthPt: 3, color: '#000000' });
    expect(borders.right).toBeNull();
    expect(borders.bottom).toBeUndefined();
    expect(borders.insideH).toEqual({
      side: 'top',
      style: 'dashed',
      widthPt: 0.5,
      color: '#ff0000',
    });
    // `w:sz` absent : filet fin par défaut.
    expect(borders.left).toEqual({ side: 'left', style: 'double', widthPt: 0.5, color: '#000000' });
    expect(readBorders(null)).toEqual({});
  });

  it('sérialise les bordures dans l’ordre top, right, bottom, left', () => {
    const declarations = borderDeclarations({
      left: { side: 'left', style: 'solid', widthPt: 1, color: '#000000' },
      top: { side: 'top', style: 'dotted', widthPt: 0.5, color: '#ff0000' },
      right: null,
    });
    expect(declarations).toEqual([
      ['border-top', '0.5pt dotted #ff0000'],
      ['border-right', undefined],
      ['border-bottom', undefined],
      ['border-left', '1pt solid #000000'],
    ]);
  });

  it('lit et fusionne les marges de cellule avec les défauts de Word', () => {
    const margins = readCellMargins(
      fragment('<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:type="nil"/></w:tcMar>'),
    );
    expect(margins).toEqual({ top: 4, left: 0 });
    expect(mergePadding(undefined)).toBeUndefined();
    expect(mergePadding(undefined, {}, {})).toBeUndefined();
    expect(mergePadding(undefined, margins)).toEqual([4, 5.4, 0, 0]);
    expect(mergePadding([1, 2, 3, 4], { right: 8 })).toEqual([1, 8, 3, 4]);
    expect(paddingValue([4, 5.4, 0, 0])).toBe('4pt 5.4pt 0pt 0pt');
    expect(paddingValue(undefined)).toBeUndefined();
  });

  it('lit la grille de colonnes en pixels', () => {
    const table = fragment(
      '<w:tbl><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="4800"/></w:tblGrid></w:tbl>',
    );
    expect(readGridColumns(table)).toEqual([160, 320]);
    expect(readGridColumns(fragment('<w:tbl/>'))).toEqual([]);
  });
});
