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

  it('ignore les mots-clés, pourcentages et valeurs nulles', () => {
    expect(parseFontSize('large')).toBeNull();
    expect(parseFontSize('120%')).toBeNull();
    expect(parseFontSize('0px')).toBeNull();
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
