import { describe, expect, it } from 'vitest';
import { uiEn } from '../i18n/ui-en.js';
import { uiFr } from '../i18n/ui-fr.js';
import { isRecord, readNumberOrString, readString } from './guards.js';

describe('guards', () => {
  it('isRecord accepte un objet non nul, refuse null, tableaux et primitifs', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ href: 'x' })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it('readString et readNumberOrString lisent champ par champ, null sinon', () => {
    const record: Record<string, unknown> = { href: 'https://a.b/', width: 240, w: '50%', n: 1 };
    expect(readString(record, 'href')).toBe('https://a.b/');
    expect(readString(record, 'width')).toBeNull();
    expect(readString(record, 'absent')).toBeNull();
    expect(readNumberOrString(record, 'width')).toBe(240);
    expect(readNumberOrString(record, 'w')).toBe('50%');
    expect(readNumberOrString(record, 'absent')).toBeNull();
    expect(readNumberOrString({ width: null }, 'width')).toBeNull();
  });
});

describe('dictionnaires ui.*', () => {
  it('fr et en ont les mêmes clés, sans les clés mortes ui.dropdown.open et ui.table.insert', () => {
    const en = Object.keys(uiEn).sort();
    const fr = Object.keys(uiFr).sort();
    expect(fr).toEqual(en);
    expect(en).not.toContain('ui.dropdown.open');
    expect(en).not.toContain('ui.table.insert');
  });
});
