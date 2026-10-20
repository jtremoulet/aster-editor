import { describe, expect, it } from 'vitest';
import { readBorder } from './properties';
import { fragment } from './testing-blocks';
import {
  booleanAttribute,
  borderColor,
  borderDeclarations,
  borderStyleOf,
  eighthPointsToPt,
  emuToPx,
  emuToPxInt,
  mergePadding,
  numberAttr,
  numericAttribute,
  paddingValue,
  ptToPx,
  readBorderElement,
  readBorders,
  readCellMargins,
  readGridColumns,
  shadingColor,
  twipsToMm,
  twipsToPt,
  twipsToPx,
} from './units';

describe('units : conversions', () => {
  it('convertit twips, EMU, points et huitièmes de point', () => {
    expect(twipsToPt(720)).toBe(36);
    expect(twipsToPt(1134)).toBe(56.7);
    expect(twipsToMm(1134)).toBe(20);
    expect(twipsToMm(720)).toBe(12.7);
    expect(twipsToMm(708)).toBe(12.49);
    expect(twipsToPx(2400)).toBe(160);
    expect(emuToPxInt(914400)).toBe(96);
    expect(emuToPxInt(2286000)).toBe(240);
    // Deux décimales pour le comparateur, entier pour les dimensions d'image.
    expect(emuToPx(952500)).toBe(100);
    expect(emuToPx(956000)).toBe(100.37);
    expect(emuToPxInt(956000)).toBe(100);
    expect(ptToPx(72)).toBe(96);
    expect(eighthPointsToPt(4)).toBe(0.5);
  });

  it('F24 : attributs numériques stricts, hexadécimal et exposant rejetés pour les blocs aussi', () => {
    expect(numberAttr('12')).toBe(12);
    expect(numberAttr(' 12.5 ')).toBe(12.5);
    expect(numberAttr('-720')).toBe(-720);
    expect(numberAttr('0x20')).toBeUndefined();
    expect(numberAttr('1e3')).toBeUndefined();
    expect(numberAttr('Infinity')).toBeUndefined();
    expect(numberAttr('')).toBeUndefined();
    expect(numberAttr(null)).toBeUndefined();
    const col = fragment('<w:gridCol w:w="0x960"/>');
    expect(numericAttribute(col, 'w')).toBeUndefined();
    expect(numericAttribute(fragment('<w:gridCol w:w="2400"/>'), 'w')).toBe(2400);
    expect(numericAttribute(fragment('<w:gridCol w:w="1e12"/>'), 'w')).toBeUndefined();
    expect(numericAttribute(null, 'w')).toBeUndefined();
  });

  it('lit les booléens Word : présent sans valeur vrai, 0/false/off faux', () => {
    expect(booleanAttribute(fragment('<w:tblHeader/>'))).toBe(true);
    expect(booleanAttribute(fragment('<w:tblHeader w:val="1"/>'))).toBe(true);
    expect(booleanAttribute(fragment('<w:tblHeader w:val="0"/>'))).toBe(false);
    expect(booleanAttribute(fragment('<w:tblHeader w:val="off"/>'))).toBe(false);
    expect(booleanAttribute(null)).toBe(false);
  });

  it('mappe les styles de bordure Word sur les quatre du contrat', () => {
    expect(borderStyleOf('single')).toBe('solid');
    expect(borderStyleOf('thick')).toBe('solid');
    expect(borderStyleOf('wave')).toBe('solid');
    expect(borderStyleOf('dashed')).toBe('dashed');
    expect(borderStyleOf('dashSmallGap')).toBe('dashed');
    expect(borderStyleOf('dashDotStroked')).toBe('dashed');
    expect(borderStyleOf('dotDash')).toBe('dashed');
    expect(borderStyleOf('dotDotDash')).toBe('dashed');
    expect(borderStyleOf('dotted')).toBe('dotted');
    expect(borderStyleOf('double')).toBe('double');
    expect(borderStyleOf('triple')).toBe('double');
    expect(borderStyleOf('doubleWave')).toBe('double');
    expect(borderStyleOf('thinThickSmallGap')).toBe('double');
    expect(borderStyleOf('thickThinLargeGap')).toBe('double');
    expect(borderStyleOf('thinThickThinMediumGap')).toBe('double');
    expect(borderStyleOf('nil')).toBeNull();
    expect(borderStyleOf('none')).toBeNull();
    expect(borderStyleOf('')).toBeNull();
    expect(borderStyleOf(null)).toBeNull();
  });

  it('normalise les couleurs et les fonds', () => {
    expect(borderColor('FF0000')).toBe('#ff0000');
    expect(borderColor('auto')).toBe('#000000');
    expect(borderColor('rouge', '#123456')).toBe('#123456');
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

  it('R42-05 : un seul lecteur de bordure, `properties.readBorder` est `readBorderElement`', () => {
    expect(readBorder).toBe(readBorderElement);
    expect(readBorder(fragment('<w:bottom w:val="single" w:sz="0"/>'), 'bottom')).toEqual({
      side: 'bottom',
      style: 'solid',
      widthPt: 0.5,
      color: '#000000',
    });
  });

  it('L45 : `w:space` des bordures directes lu en `spacePt`, comme `readBorder` ; hors bornes ignoré', () => {
    expect(
      readBorderElement(fragment('<w:top w:val="single" w:sz="4" w:space="0"/>'), 'top'),
    ).toEqual({ side: 'top', style: 'solid', widthPt: 0.5, color: '#000000', spacePt: 0 });
    expect(
      readBorderElement(fragment('<w:left w:val="single" w:sz="8" w:space="4"/>'), 'left'),
    ).toEqual({ side: 'left', style: 'solid', widthPt: 1, color: '#000000', spacePt: 4 });
    expect(readBorderElement(fragment('<w:top w:val="single" w:sz="4"/>'), 'top')).toEqual({
      side: 'top',
      style: 'solid',
      widthPt: 0.5,
      color: '#000000',
    });
    expect(
      readBorderElement(fragment('<w:top w:val="single" w:sz="4" w:space="-1"/>'), 'top'),
    ).not.toHaveProperty('spacePt');
    expect(
      readBorderElement(fragment('<w:top w:val="single" w:sz="4" w:space="0x4"/>'), 'top'),
    ).not.toHaveProperty('spacePt');
    // `w:sz` nul, hexadécimal ou au-delà de 12 pt : filet fin.
    expect(readBorderElement(fragment('<w:top w:val="single" w:sz="0"/>'), 'top')?.widthPt).toBe(
      0.5,
    );
    expect(readBorderElement(fragment('<w:top w:val="single" w:sz="0x10"/>'), 'top')?.widthPt).toBe(
      0.5,
    );
    expect(readBorderElement(fragment('<w:top w:val="single" w:sz="200"/>'), 'top')?.widthPt).toBe(
      0.5,
    );
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
