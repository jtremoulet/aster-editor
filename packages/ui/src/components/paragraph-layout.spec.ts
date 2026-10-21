import { describe, expect, it } from 'vitest';
import * as publicApi from '../index.js';
import { createMockEditor } from '../testing/mock-editor.js';
import {
  MAX_BORDER_WIDTH_PT,
  MAX_LINE_HEIGHT_MULTIPLE,
  MAX_PARAGRAPH_PT,
  MIN_BORDER_WIDTH_PT,
  canEditBlockLayout,
  createCheckbox,
  createNumberField,
  currentBlockLayout,
  formatNumber,
  isOutOfRange,
  numberInputValue,
  parseNumberInput,
  readFlag,
  readNumber,
  setBlockLayout,
  unsetBlockLayout,
} from './paragraph-layout.js';

describe('paragraph-layout (helpers partagés)', () => {
  it('currentBlockLayout lit le paragraphe ou le titre sous le curseur, rien sinon', () => {
    const editor = createMockEditor();
    expect(currentBlockLayout(editor)).toEqual({});
    editor.attributes.set('heading', { level: 2, lineHeight: 1.5 });
    expect(currentBlockLayout(editor)).toEqual({ level: 2, lineHeight: 1.5 });
    editor.attributes.delete('heading');
    editor.attributes.set('paragraph', { lineHeight: 2 });
    expect(currentBlockLayout(editor)).toEqual({ lineHeight: 2 });
  });

  it('R26-12 (F8) : sélection paragraphe + titre, un attribut qui diffère est indéterminé', () => {
    const editor = createMockEditor();
    editor.attributes.set('paragraph', {
      lineHeight: 1.5,
      spacingBeforePt: 6,
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#000000' }],
      keepWithNext: null,
    });
    editor.attributes.set('heading', {
      level: 2,
      lineHeight: 2,
      spacingBeforePt: 6,
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#000000' }],
    });
    // `lineHeight` diffère → absent ; `spacingBeforePt` et `borders` (égalité structurelle)
    // sont communs ; `keepWithNext: null` côté paragraphe = absent côté titre.
    expect(currentBlockLayout(editor)).toEqual({
      spacingBeforePt: 6,
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#000000' }],
      keepWithNext: null,
    });
  });

  it('currentBlockLayout tolère un tiptap qui lève', () => {
    const editor = createMockEditor();
    editor.tiptap.getAttributes = () => {
      throw new Error('no schema');
    };
    expect(currentBlockLayout(editor)).toEqual({});
  });

  it('readNumber et readFlag ignorent les valeurs absentes ou d’un autre type', () => {
    const record = { a: 1.5, b: '2', c: null, d: Number.NaN, e: true, f: 'true' };
    expect(readNumber(record, 'a')).toBe(1.5);
    expect(readNumber(record, 'b')).toBeNull();
    expect(readNumber(record, 'c')).toBeNull();
    expect(readNumber(record, 'd')).toBeNull();
    expect(readNumber(record, 'zz')).toBeNull();
    expect(readFlag(record, 'e')).toBe(true);
    expect(readFlag(record, 'f')).toBe(false);
    expect(readFlag(record, 'zz')).toBe(false);
  });

  it('parseNumberInput accepte virgule, point, unités et signale vide / invalide', () => {
    expect(parseNumberInput('6')).toBe(6);
    expect(parseNumberInput(' 6,5 ')).toBe(6.5);
    expect(parseNumberInput('6.5pt')).toBe(6.5);
    expect(parseNumberInput('12 mm')).toBe(12);
    expect(parseNumberInput('-3')).toBe(-3);
    expect(parseNumberInput('.5')).toBe(0.5);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('   ')).toBeNull();
    expect(parseNumberInput('abc')).toBe('invalid');
    expect(parseNumberInput('1.2.3')).toBe('invalid');
    expect(parseNumberInput('5.')).toBe(5);
  });

  it('R26-05 (F6) : parseNumberInput accepte la notation exposant comme <input type="number">', () => {
    expect(parseNumberInput('1e3')).toBe(1000);
    expect(parseNumberInput('1E3')).toBe(1000);
    expect(parseNumberInput('1e9')).toBe(1e9);
    expect(parseNumberInput('2.5e-1')).toBe(0.25);
    expect(parseNumberInput('1e')).toBe('invalid');
    expect(parseNumberInput('e3')).toBe('invalid');
    expect(parseNumberInput('1e400')).toBe('invalid');
  });

  it('R26-05 : parseNumberInput rejette une saisie longue invalide en temps linéaire', () => {
    const input = `${'1'.repeat(60_000)}x`;
    const start = performance.now();
    expect(parseNumberInput(input)).toBe('invalid');
    // Regex quadratique d'origine : 782 ms sur cette entrée ; corrigée : < 1 ms.
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('R26-04 : bornes Word exportées et isOutOfRange', () => {
    expect(MAX_PARAGRAPH_PT).toBe(1584);
    expect(MAX_LINE_HEIGHT_MULTIPLE).toBe(132);
    expect(MIN_BORDER_WIDTH_PT).toBe(0.25);
    expect(MAX_BORDER_WIDTH_PT).toBe(6);
    expect(isOutOfRange(5, 0, 10)).toBe(false);
    expect(isOutOfRange(0, 0, 10)).toBe(false);
    expect(isOutOfRange(10, 0, 10)).toBe(false);
    expect(isOutOfRange(-1, 0, 10)).toBe(true);
    expect(isOutOfRange(11, 0, 10)).toBe(true);
    expect(isOutOfRange(1e9)).toBe(false);
    expect(isOutOfRange(1e9, undefined, 1584)).toBe(true);
    expect(isOutOfRange(-1e9, -1584)).toBe(true);
  });

  it('R26-16 : createNumberField, createCheckbox et les bornes sont exportés publiquement', () => {
    expect(publicApi.createNumberField).toBe(createNumberField);
    expect(publicApi.createCheckbox).toBe(createCheckbox);
    expect(publicApi.MAX_PARAGRAPH_PT).toBe(MAX_PARAGRAPH_PT);
    expect(publicApi.MIN_BORDER_WIDTH_PT).toBe(MIN_BORDER_WIDTH_PT);
  });

  it('formatNumber suit la locale avec au plus deux décimales', () => {
    expect(formatNumber(1.15, 'en')).toBe('1.15');
    expect(formatNumber(1.15, 'fr')).toBe('1,15');
    expect(formatNumber(1.157, 'en')).toBe('1.16');
    expect(formatNumber(2, 'fr')).toBe('2');
  });

  it('numberInputValue produit une valeur de champ number (point, deux décimales, vide)', () => {
    expect(numberInputValue(null)).toBe('');
    expect(numberInputValue(6)).toBe('6');
    expect(numberInputValue(6.333)).toBe('6.33');
  });

  it('setBlockLayout / unsetBlockLayout / canEditBlockLayout passent par le registre', () => {
    const editor = createMockEditor();
    expect(canEditBlockLayout(editor)).toBe(true);
    expect(setBlockLayout(editor, { lineHeight: 1.5 })).toBe(true);
    expect(unsetBlockLayout(editor, ['lineHeight'])).toBe(true);
    expect(editor.calls).toEqual([
      { id: 'paragraph.setLayout', args: { lineHeight: 1.5 } },
      { id: 'paragraph.unsetLayout', args: { attrs: ['lineHeight'] } },
    ]);
    editor.disabled.add('paragraph.setLayout');
    expect(canEditBlockLayout(editor)).toBe(false);
    expect(setBlockLayout(editor, { lineHeight: 1 })).toBe(false);
    const bare = createMockEditor({ commands: ['bold'] });
    expect(canEditBlockLayout(bare)).toBe(false);
  });

  it('createNumberField et createCheckbox construisent des champs libellés', () => {
    const field = createNumberField({
      id: 'f1',
      label: 'Avant',
      value: 6.5,
      min: 0,
      step: 0.5,
      placeholder: 'auto',
      className: 'extra',
    });
    expect(field.wrapper.className).toBe('aster-dialog__field extra');
    expect(field.wrapper.querySelector('label')?.getAttribute('for')).toBe('f1');
    expect(field.wrapper.querySelector('label')?.textContent).toBe('Avant');
    expect(field.input.type).toBe('number');
    expect(field.input.value).toBe('6.5');
    expect(field.input.getAttribute('min')).toBe('0');
    expect(field.input.hasAttribute('max')).toBe(false);
    expect(field.input.getAttribute('step')).toBe('0.5');
    expect(field.input.getAttribute('placeholder')).toBe('auto');
    const anyStep = createNumberField({ id: 'f2', label: 'x', value: null, max: 1584 });
    expect(anyStep.input.getAttribute('step')).toBe('any');
    expect(anyStep.input.getAttribute('max')).toBe('1584');
    expect(anyStep.input.value).toBe('');
    const check = createCheckbox('Garder', true, 'keep');
    expect(check.wrapper.tagName).toBe('LABEL');
    expect(check.wrapper.textContent).toBe('Garder');
    expect(check.input.checked).toBe(true);
    expect(check.input.classList.contains('keep')).toBe(true);
  });
});
