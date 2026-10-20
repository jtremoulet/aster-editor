import { describe, expect, it } from 'vitest';
import {
  parseAlignment,
  parseColor,
  parseFontFamily,
  parseFontSize,
  parsePixels,
  parseStyle,
} from './css';

describe('parseStyle', () => {
  it('découpe les déclarations en map, clés en minuscules et valeurs trimées', () => {
    const map = parseStyle(' Color : #fff ; font-size:12px;;broken; : x; empty:');
    expect(map.get('color')).toBe('#fff');
    expect(map.get('font-size')).toBe('12px');
    expect(map.size).toBe(2);
  });

  it('rend une map vide sans attribut style', () => {
    expect(parseStyle(null).size).toBe(0);
  });
});

describe('parseColor', () => {
  it('convertit hex court, hex long, rgb et rgba en RRGGBB', () => {
    expect(parseColor('#f0a')).toBe('FF00AA');
    expect(parseColor('#F0A8')).toBe('FF00AA');
    expect(parseColor('#ff0000')).toBe('FF0000');
    expect(parseColor('#ff000080')).toBe('FF0000');
    expect(parseColor('rgb(0, 128, 255)')).toBe('0080FF');
    expect(parseColor('rgba(300, 0, 12.6, 0.5)')).toBe('FF000D');
    expect(parseColor('rgb(1 2 3 / 50%)')).toBe('010203');
  });

  it('accepte rgb() en pourcentages et hsl()/hsla() (M-6)', () => {
    expect(parseColor('rgb(100%, 0%, 0%)')).toBe('FF0000');
    expect(parseColor('rgb(0% 50% 100%)')).toBe('0080FF');
    expect(parseColor('hsl(0, 100%, 50%)')).toBe('FF0000');
    expect(parseColor('hsl(120deg 100% 25%)')).toBe('008000');
    expect(parseColor('hsla(240, 100%, 50%, 0.5)')).toBe('0000FF');
    expect(parseColor('hsl(0, 0%, 100%)')).toBe('FFFFFF');
    expect(parseColor('hsl(-120, 100%, 50%)')).toBe('0000FF');
    expect(parseColor('hsl(0, 100, 50)')).toBeNull();
  });

  it('accepte les noms courants et rejette le reste', () => {
    expect(parseColor('Red')).toBe('FF0000');
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('inherit')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor('var(--x)')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
});

describe('parseFontSize', () => {
  it('convertit px, pt, em et rem en demi-points', () => {
    expect(parseFontSize('16px')).toBe(24);
    expect(parseFontSize('11pt')).toBe(22);
    expect(parseFontSize('1.5em')).toBe(36);
    expect(parseFontSize('1rem')).toBe(24);
  });

  it('lit les pourcentages et mots-clés absolus relativement à 11 pt (M-6)', () => {
    expect(parseFontSize('100%')).toBe(22);
    expect(parseFontSize('200%')).toBe(44);
    expect(parseFontSize('medium')).toBe(22);
    expect(parseFontSize('Large')).toBe(26);
    expect(parseFontSize('small')).toBe(20);
    expect(parseFontSize('xx-large')).toBe(44);
  });

  it('ignore les mots-clés relatifs et valeurs nulles', () => {
    expect(parseFontSize('larger')).toBeNull();
    expect(parseFontSize('0px')).toBeNull();
    expect(parseFontSize('0%')).toBeNull();
    expect(parseFontSize(undefined)).toBeNull();
  });
});

describe('parseFontFamily', () => {
  it('garde la première famille sans guillemets', () => {
    expect(parseFontFamily('"Times New Roman", serif')).toBe('Times New Roman');
    expect(parseFontFamily("'Arial'")).toBe('Arial');
  });

  it('rejette vide et inherit', () => {
    expect(parseFontFamily('')).toBeNull();
    expect(parseFontFamily('inherit')).toBeNull();
    expect(parseFontFamily(undefined)).toBeNull();
  });
});

describe('parseAlignment', () => {
  it('reconnaît center, right/end et justify, pas left', () => {
    expect(parseAlignment('center')).toBe('center');
    expect(parseAlignment('Right')).toBe('right');
    expect(parseAlignment('end')).toBe('right');
    expect(parseAlignment('justify')).toBe('both');
    expect(parseAlignment('left')).toBeNull();
    expect(parseAlignment(undefined)).toBeNull();
  });
});

describe('parsePixels', () => {
  it('lit les entiers nus, px et pt', () => {
    expect(parsePixels('320')).toBe(320);
    expect(parsePixels('320px')).toBe(320);
    expect(parsePixels('24pt')).toBe(32);
  });

  it('rejette auto, pourcentages et zéro', () => {
    expect(parsePixels('auto')).toBeNull();
    expect(parsePixels('50%')).toBeNull();
    expect(parsePixels('0')).toBeNull();
    expect(parsePixels(null)).toBeNull();
  });
});

describe('mise en page du contrat (L27)', () => {
  it('parsePoints : unités absolues, signe, relatives refusées', async () => {
    const { parsePoints } = await import('./css');
    expect(parsePoints('18pt')).toBe(18);
    expect(parsePoints('-14.15pt')).toBe(-14.15);
    expect(parsePoints('16px')).toBe(12);
    expect(parsePoints('1in')).toBe(72);
    expect(parsePoints('2.54cm')).toBe(72);
    expect(parsePoints('36')).toBe(36);
    expect(parsePoints('1.5em')).toBeNull();
    expect(parsePoints('auto')).toBeNull();
  });

  it('parseBorder : raccourci dans tout ordre, couleurs hex / rgb / nommées, none', async () => {
    const { parseBorder } = await import('./css');
    expect(parseBorder('1pt solid #000000')).toEqual({
      style: 'solid',
      widthPt: 1,
      color: '000000',
    });
    expect(parseBorder('dashed rgb(255, 0, 0) 2px')).toEqual({
      style: 'dashed',
      widthPt: 1.5,
      color: 'FF0000',
    });
    expect(parseBorder('double red')).toEqual({ style: 'double', widthPt: 2.25, color: 'FF0000' });
    expect(parseBorder('thin')).toEqual({ style: 'solid', widthPt: 0.75, color: '000000' });
    expect(parseBorder('none')).toBeNull();
    expect(parseBorder('0')).toBeNull();
    expect(parseBorder(undefined)).toBeUndefined();
    expect(parseBorder('bidule')).toBeUndefined();
  });

  it('parseBorders : raccourci, côtés, propriétés longues', async () => {
    const { parseBorders, parseStyle } = await import('./css');
    const borders = parseBorders(
      parseStyle(
        'border: 1pt solid #000; border-left: none; border-top-color: #ff0000; border-bottom-width: 2pt',
      ),
    );
    expect(borders.get('top')).toEqual({ style: 'solid', widthPt: 1, color: 'FF0000' });
    expect(borders.get('right')).toEqual({ style: 'solid', widthPt: 1, color: '000000' });
    expect(borders.get('bottom')).toEqual({ style: 'solid', widthPt: 2, color: '000000' });
    expect(borders.get('left')).toBeNull();
    expect(parseBorders(parseStyle('border-right-style: dotted')).get('right')).toEqual({
      style: 'dotted',
      widthPt: 2.25,
      color: '000000',
    });
    expect(parseBorders(parseStyle('color: red')).size).toBe(0);
  });

  it('parseLineHeight, parsePadding, highlightName', async () => {
    const { parseLineHeight, parsePadding, highlightName } = await import('./css');
    expect(parseLineHeight('1.15')).toEqual({ kind: 'multiple', value: 1.15 });
    expect(parseLineHeight('150%')).toEqual({ kind: 'multiple', value: 1.5 });
    expect(parseLineHeight('14pt')).toEqual({ kind: 'exact', points: 14 });
    expect(parseLineHeight('normal')).toBeNull();
    expect(parsePadding('4pt')).toEqual([4, 4, 4, 4]);
    expect(parsePadding('2pt 4pt')).toEqual([2, 4, 2, 4]);
    expect(parsePadding('1pt 2pt 3pt')).toEqual([1, 2, 3, 2]);
    expect(parsePadding('1pt 2pt 3pt 4pt')).toEqual([1, 2, 3, 4]);
    expect(parsePadding('1pt x')).toBeNull();
    expect(highlightName('FFFF00')).toBe('yellow');
    expect(highlightName('c0c0c0')).toBe('lightGray');
    expect(highlightName('F2F2F2')).toBeNull();
  });
});
