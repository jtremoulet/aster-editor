import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor.js';
import { registerUiTranslations } from '../toolbar/create-toolbar.js';
import { COLOR_PALETTE, createColorPicker } from './color-picker.js';

describe('createColorPicker', () => {
  let editor: MockEditor;
  let host: HTMLElement;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('propose 20 pastilles nommées plus « aucune couleur »', () => {
    const picker = createColorPicker(editor, 'textColor');
    host.append(picker.element);
    const trigger = picker.element.querySelector<HTMLButtonElement>('button')!;
    expect(trigger.getAttribute('aria-label')).toBe('Text color');
    trigger.click();
    const swatches = picker.element.querySelectorAll<HTMLButtonElement>(
      '.aster-color-picker__swatch',
    );
    expect(swatches.length).toBe(COLOR_PALETTE.length);
    expect(swatches.length).toBe(20);
    expect(swatches[0]?.getAttribute('aria-label')).toBe('Black');
    expect(picker.element.querySelector('.aster-color-picker__none')?.textContent).toBe('No color');
  });

  it('un clic sur une pastille envoie la couleur, « aucune » envoie null', () => {
    const picker = createColorPicker(editor, 'backgroundColor');
    host.append(picker.element);
    const trigger = picker.element.querySelector<HTMLButtonElement>('button')!;
    trigger.click();
    picker.element.querySelector<HTMLButtonElement>('[data-color="#d32f2f"]')?.click();
    expect(editor.calls).toEqual([{ id: 'backgroundColor', args: { color: '#d32f2f' } }]);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    picker.element.querySelector<HTMLButtonElement>('.aster-color-picker__none')?.click();
    expect(editor.calls[1]).toEqual({ id: 'backgroundColor', args: { color: null } });
    expect(editor.focusCalls).toBe(2);
  });

  it('coche la couleur courante et met à jour l’aperçu du déclencheur', () => {
    editor.attributes.set('textStyle', { color: '#1565C0' });
    const picker = createColorPicker(editor, 'textColor');
    host.append(picker.element);
    const trigger = picker.element.querySelector<HTMLButtonElement>('button')!;
    expect(trigger.getAttribute('aria-pressed')).toBe('true');
    const preview = picker.element.querySelector<HTMLElement>('.aster-color-picker__preview')!;
    expect(preview.style.getPropertyValue('--aster-swatch')).toBe('#1565c0');
    trigger.click();
    expect(
      picker.element.querySelector('[data-color="#1565c0"]')?.getAttribute('aria-checked'),
    ).toBe('true');
    editor.attributes.delete('textStyle');
    picker.update();
    expect(preview.classList.contains('aster-color-picker__preview--empty')).toBe(true);
    expect(trigger.getAttribute('aria-pressed')).toBe('false');
  });
});
