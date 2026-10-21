import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor.js';
import { registerUiTranslations } from '../toolbar/create-toolbar.js';
import type { Dropdown } from './dropdown.js';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  createFontFamilyMenu,
  createFontSizeMenu,
} from './font-menu.js';

describe('font menus', () => {
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

  it('fontFamily : liste les polices + défaut, envoie family ou null', () => {
    editor.attributes.set('textStyle', { fontFamily: 'Georgia' });
    const menu = createFontFamilyMenu(editor) as Dropdown;
    host.append(menu.element);
    expect(menu.trigger.querySelector('.aster-toolbar__text')?.textContent).toBe('Georgia');
    menu.open();
    const items = menu.panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    expect(items.length).toBe(FONT_FAMILIES.length + 1);
    expect(items[0]?.textContent).toBe('Default font');
    expect(items[2]?.getAttribute('aria-checked')).toBe('true');
    expect(items[2]?.style.fontFamily).toBe('Georgia');
    items[1]?.click();
    expect(editor.calls).toEqual([{ id: 'fontFamily', args: { family: 'Arial' } }]);
    menu.open();
    menu.panel.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.click();
    expect(editor.calls[1]).toEqual({ id: 'fontFamily', args: { family: null } });
  });

  it('fontSize : liste les tailles + défaut, envoie size ou null', () => {
    const menu = createFontSizeMenu(editor) as Dropdown;
    host.append(menu.element);
    expect(menu.trigger.querySelector('.aster-toolbar__text')?.textContent).toBe('Default size');
    menu.open();
    const items = menu.panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    expect(items.length).toBe(FONT_SIZES.length + 1);
    expect(items[0]?.getAttribute('aria-checked')).toBe('true');
    items[3]?.click();
    expect(editor.calls).toEqual([{ id: 'fontSize', args: { size: '14px' } }]);
    editor.attributes.set('textStyle', { fontSize: '14px' });
    menu.update();
    expect(menu.trigger.querySelector('.aster-toolbar__text')?.textContent).toBe('14px');
  });
});
