import { describe, expect, it } from 'vitest';
import {
  LAYOUT_NUMBER_LIMIT,
  betweenBorder,
  borderDeclarations,
  formatBorderValue,
  formatNumber,
  formatPt,
  isBlockBorder,
  isLayoutNumber,
  joinDeclarations,
  normalizeColor,
  parseBorderValue,
  parsePt,
  parseSideBorders,
  parseStyleDeclarations,
  readStyleProperty,
  roundLayoutNumber,
  sanitizeBorderSpace,
  sanitizeBorders,
} from './layout-css';

describe('layout-css', () => {
  it('formate les points avec au plus deux décimales', () => {
    expect(formatPt(6)).toBe('6pt');
    expect(formatPt(6.5)).toBe('6.5pt');
    expect(formatPt(1.005)).toBe('1pt');
    expect(formatPt(1.2345)).toBe('1.23pt');
    expect(formatPt(-18)).toBe('-18pt');
    expect(formatNumber(1.15)).toBe('1.15');
    expect(formatNumber(1.5)).toBe('1.5');
    expect(roundLayoutNumber(2.999)).toBe(3);
  });

  it('R23-05 : borne les nombres à ±100 000, jamais Infinity ni NaN en sortie', () => {
    expect(LAYOUT_NUMBER_LIMIT).toBe(100_000);
    expect(formatPt(1e307)).toBe('100000pt');
    expect(formatPt(-1e307)).toBe('-100000pt');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('100000');
    expect(roundLayoutNumber(1e307)).toBe(100_000);
    expect(isLayoutNumber(100_000)).toBe(true);
    expect(isLayoutNumber(-100_000)).toBe(true);
    expect(isLayoutNumber(100_000.01)).toBe(false);
    expect(isLayoutNumber(1e307)).toBe(false);
    expect(isLayoutNumber(Number.NaN)).toBe(false);
    expect(isLayoutNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isLayoutNumber('6')).toBe(false);
    expect(parsePt('100000000pt')).toBeNull();
    expect(parsePt('100000pt')).toBe(100_000);
    expect(parsePt('200000px')).toBeNull();
    expect(isBlockBorder({ side: 'top', style: 'solid', widthPt: 1e307, color: '#000' })).toBe(
      false,
    );
    expect(
      sanitizeBorders([{ side: 'top', style: 'solid', widthPt: 1e307, color: '#000' }]),
    ).toBeNull();
  });

  it('lit les longueurs en pt, px (×0,75) et 0 sans unité, refuse le reste', () => {
    expect(parsePt('6pt')).toBe(6);
    expect(parsePt(' 6.25PT ')).toBe(6.25);
    expect(parsePt('8px')).toBe(6);
    expect(parsePt('0')).toBe(0);
    expect(parsePt('-18pt')).toBe(-18);
    expect(parsePt('12')).toBeNull();
    expect(parsePt('1em')).toBeNull();
    expect(parsePt('50%')).toBeNull();
    expect(parsePt('auto')).toBeNull();
    expect(parsePt('')).toBeNull();
    expect(parsePt(null)).toBeNull();
  });

  it('découpe un style en déclarations, dernière valeur gagnante, propriétés en minuscules', () => {
    const declarations = parseStyleDeclarations(' Margin-Top: 6pt ; color:red; margin-top: 8pt;;');
    expect([...declarations.entries()]).toEqual([
      ['margin-top', '8pt'],
      ['color', 'red'],
    ]);
    expect(parseStyleDeclarations(null).size).toBe(0);
    expect(parseStyleDeclarations('nonsense').size).toBe(0);
    const element = document.createElement('p');
    element.setAttribute('style', 'line-height: 1.15');
    expect(readStyleProperty(element, 'line-height')).toBe('1.15');
    expect(readStyleProperty(element, 'margin-top')).toBeNull();
  });

  it('normalise les couleurs en #rrggbb minuscules', () => {
    expect(normalizeColor('#ABCDEF')).toBe('#abcdef');
    expect(normalizeColor('#abc')).toBe('#aabbcc');
    expect(normalizeColor('#aabbccdd')).toBe('#aabbcc');
    expect(normalizeColor('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(normalizeColor('rgba(0,0,0,0.5)')).toBe('#000000');
    expect(normalizeColor('Red')).toBe('red');
    expect(normalizeColor('nonsense')).toBeNull();
    expect(normalizeColor('none')).toBeNull();
    expect(normalizeColor('')).toBeNull();
    expect(normalizeColor('#12')).toBeNull();
    expect(normalizeColor(undefined)).toBeNull();
  });

  it('lit et écrit une bordure, ordre des jetons libre, défauts 1pt solid #000000', () => {
    expect(parseBorderValue('top', '1pt solid #000000')).toEqual({
      side: 'top',
      style: 'solid',
      widthPt: 1,
      color: '#000000',
    });
    expect(parseBorderValue('left', 'dashed red 2px')).toEqual({
      side: 'left',
      style: 'dashed',
      widthPt: 1.5,
      color: 'red',
    });
    expect(parseBorderValue('bottom', 'double')).toEqual({
      side: 'bottom',
      style: 'double',
      widthPt: 1,
      color: '#000000',
    });
    expect(parseBorderValue('bottom', 'thin solid')).toMatchObject({ widthPt: 0.75 });
    expect(parseBorderValue('bottom', 'medium solid')).toMatchObject({ widthPt: 2.25 });
    expect(parseBorderValue('bottom', 'thick solid')).toMatchObject({ widthPt: 3.75 });
    expect(parseBorderValue('bottom', 'none')).toBeNull();
    expect(parseBorderValue('bottom', 'hidden')).toBeNull();
    expect(parseBorderValue('bottom', 'nonsense')).toBeNull();
    expect(parseBorderValue('bottom', '')).toBeNull();
    expect(
      formatBorderValue({ side: 'top', style: 'dotted', widthPt: 0.5, color: '#FF0000' }),
    ).toBe('0.5pt dotted #ff0000');
  });

  it('lit les bordures par côté, le raccourci border valant pour les quatre', () => {
    const all = parseSideBorders(parseStyleDeclarations('border: 1pt solid #000000'));
    expect(all.map((border) => border.side)).toEqual(['top', 'right', 'bottom', 'left']);
    const mixed = parseSideBorders(
      parseStyleDeclarations(
        'border: 1pt solid #000000; border-left: none; border-bottom: 2pt double #ff0000',
      ),
    );
    expect(mixed.map((border) => `${border.side}:${border.widthPt}`)).toEqual([
      'top:1',
      'right:1',
      'bottom:2',
    ]);
    expect(parseSideBorders(parseStyleDeclarations('color: red'))).toEqual([]);
  });

  it('sérialise les bordures dans l’ordre top/right/bottom/left, between à part', () => {
    const borders = sanitizeBorders([
      { side: 'left', style: 'solid', widthPt: 1, color: '#000000' },
      { side: 'between', style: 'dotted', widthPt: 0.5, color: '#ABC' },
      { side: 'top', style: 'dashed', widthPt: 2.345, color: 'rgb(0,0,255)' },
      { side: 'top', style: 'solid', widthPt: 1, color: '#000000' },
      { side: 'nope', style: 'solid', widthPt: 1, color: '#000000' },
      { side: 'right', style: 'solid', widthPt: Number.NaN, color: '#000000' },
      'garbage',
    ]);
    expect(borders).toHaveLength(4);
    expect(borderDeclarations(borders ?? [])).toEqual([
      'border-top: 1pt solid #000000',
      'border-left: 1pt solid #000000',
    ]);
    expect(betweenBorder(borders ?? [])).toEqual({
      side: 'between',
      style: 'dotted',
      widthPt: 0.5,
      color: '#aabbcc',
    });
    expect(betweenBorder([])).toBeNull();
    expect(sanitizeBorders([])).toBeNull();
    expect(sanitizeBorders('x')).toBeNull();
    expect(isBlockBorder({ side: 'top', style: 'solid', widthPt: 1, color: '#000' })).toBe(true);
    expect(isBlockBorder({ side: 'top', style: 'wavy', widthPt: 1, color: '#000' })).toBe(false);
    expect(isBlockBorder(null)).toBe(false);
  });

  it('joint les déclarations avec « ; » et rend null sans déclaration', () => {
    expect(joinDeclarations(['a: 1', 'b: 2'])).toBe('a: 1; b: 2');
    expect(joinDeclarations([])).toBeNull();
  });

  describe('spacePt (session 4, L41-C)', () => {
    it('parseSideBorders lit padding-<côté> comme spacePt, seulement avec une bordure sur ce côté', () => {
      const borders = parseSideBorders(
        parseStyleDeclarations(
          'border-top: 1pt solid #000000; border-bottom: 1pt solid #000000; padding-top: 4pt; padding-left: 2pt; padding-bottom: 0pt',
        ),
      );
      expect(borders).toEqual([
        { side: 'top', style: 'solid', widthPt: 1, color: '#000000', spacePt: 4 },
        { side: 'bottom', style: 'solid', widthPt: 1, color: '#000000', spacePt: 0 },
      ]);
      // Un padding illisible, négatif ou en em n'est pas un spacePt ; le raccourci `padding` non plus.
      expect(
        parseSideBorders(
          parseStyleDeclarations(
            'border: 1pt solid #000; padding-top: -1pt; padding-right: 1em; padding: 3pt',
          ),
        ).map((border) => border.spacePt),
      ).toEqual([undefined, undefined, undefined, undefined]);
      expect(
        parseSideBorders(parseStyleDeclarations('border-left: 1pt solid red; padding-left: 8px')),
      ).toEqual([{ side: 'left', style: 'solid', widthPt: 1, color: 'red', spacePt: 6 }]);
    });

    it('borderDeclarations émet padding-<côté> juste après les border-*, dans l’ordre, pour les bordures à spacePt', () => {
      expect(
        borderDeclarations([
          { side: 'left', style: 'solid', widthPt: 1, color: '#000000', spacePt: 2 },
          { side: 'top', style: 'solid', widthPt: 1, color: '#000000', spacePt: 1 },
          { side: 'bottom', style: 'dashed', widthPt: 0.5, color: '#ff0000' },
          { side: 'between', style: 'solid', widthPt: 1, color: '#000000', spacePt: 3 },
        ]),
      ).toEqual([
        'border-top: 1pt solid #000000',
        'border-bottom: 0.5pt dashed #ff0000',
        'border-left: 1pt solid #000000',
        'padding-top: 1pt',
        'padding-left: 2pt',
      ]);
      expect(
        borderDeclarations([{ side: 'top', style: 'solid', widthPt: 1, color: '#000' }]),
      ).toEqual(['border-top: 1pt solid #000000']);
    });

    it('sanitizeBorders garde un spacePt valide, arrondi, et retire le reste', () => {
      expect(
        sanitizeBorders([
          { side: 'top', style: 'solid', widthPt: 1, color: '#000', spacePt: 1.126 },
          { side: 'right', style: 'solid', widthPt: 1, color: '#000', spacePt: -2 },
          { side: 'bottom', style: 'solid', widthPt: 1, color: '#000', spacePt: 'x' },
          { side: 'left', style: 'solid', widthPt: 1, color: '#000', spacePt: 1e307 },
        ]),
      ).toEqual([
        { side: 'top', style: 'solid', widthPt: 1, color: '#000000', spacePt: 1.13 },
        { side: 'right', style: 'solid', widthPt: 1, color: '#000000' },
        { side: 'bottom', style: 'solid', widthPt: 1, color: '#000000' },
        { side: 'left', style: 'solid', widthPt: 1, color: '#000000' },
      ]);
      expect(sanitizeBorderSpace(0)).toBe(0);
      expect(sanitizeBorderSpace(undefined)).toBeNull();
      expect(sanitizeBorderSpace(Number.POSITIVE_INFINITY)).toBeNull();
    });
  });
});
