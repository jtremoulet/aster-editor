import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import {
  UNDERLINE_STYLES,
  applyUnderlineStyle,
  createUnderlineStyleMenu,
  currentUnderlineStyle,
} from './underline-style';

describe('createUnderlineStyleMenu', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    widget = createUnderlineStyleMenu(editor);
    host.append(widget.element);
  });

  afterEach(() => {
    widget.destroy();
    host.remove();
  });

  const trigger = (): HTMLButtonElement =>
    widget.element.querySelector<HTMLButtonElement>('.aster-dropdown__trigger')!;
  const panel = (): HTMLElement =>
    widget.element.querySelector<HTMLElement>('.aster-dropdown__panel')!;
  const isOpen = (): boolean => !panel().hasAttribute('hidden');
  const open = (): void => trigger().click();
  const items = (): HTMLButtonElement[] =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  const item = (text: string): HTMLButtonElement =>
    items().find((node) => node.textContent === text)!;

  it('rend un menu Simple / Double / Pointillé / Tirets / Ondulé, rien de coché hors soulignement', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Underline style');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().querySelector('.aster-toolbar__icon svg')).not.toBeNull();
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    expect(UNDERLINE_STYLES).toEqual(['solid', 'double', 'dotted', 'dashed', 'wavy']);
    open();
    expect(panel().getAttribute('role')).toBe('menu');
    expect(items().map((node) => node.textContent)).toEqual([
      'Single',
      'Double',
      'Dotted',
      'Dashed',
      'Wavy',
    ]);
    expect(items().every((node) => node.getAttribute('aria-checked') === 'false')).toBe(true);
    // Aperçu du trait sur chaque libellé.
    expect(
      item('Wavy').querySelector<HTMLElement>('.aster-toolbar__text')?.style.textDecorationStyle,
    ).toBe('wavy');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('lit le style courant : solid implicite quand la marque est active sans attribut', () => {
    expect(currentUnderlineStyle(editor)).toBeNull();
    editor.active.add('underline');
    expect(currentUnderlineStyle(editor)).toBe('solid');
    editor.attributes.set('underline', { decorationStyle: 'double' });
    expect(currentUnderlineStyle(editor)).toBe('double');
    editor.attributes.set('underline', { decorationStyle: 'bogus' });
    expect(currentUnderlineStyle(editor)).toBe('solid');
    widget.update();
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    editor.attributes.set('underline', { decorationStyle: 'dotted' });
    open();
    expect(item('Dotted').getAttribute('aria-checked')).toBe('true');
    expect(item('Single').getAttribute('aria-checked')).toBe('false');
  });

  it('une entrée pose la marque underline avec decorationStyle via la chaîne Tiptap, ferme et refocalise', () => {
    open();
    item('Dashed').click();
    expect(editor.chains).toEqual([
      [
        { method: 'focus', args: [] },
        { method: 'setMark', args: ['underline', { decorationStyle: 'dashed' }] },
      ],
    ]);
    expect(editor.calls).toEqual([]);
    expect(isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
    expect(applyUnderlineStyle(editor, 'wavy')).toBe(true);
    expect(editor.chains[1]?.[1]).toEqual({
      method: 'setMark',
      args: ['underline', { decorationStyle: 'wavy' }],
    });
  });

  it('se désactive quand la commande underline n’est pas exécutable', () => {
    editor.setReadOnly(true);
    widget.update();
    expect(trigger().disabled).toBe(true);
    editor.setReadOnly(false);
    editor.disabled.add('underline');
    widget.update();
    expect(trigger().disabled).toBe(true);
  });

  it('Échap ferme et rend le focus ; mousedown neutralisé ; libellés fr', () => {
    open();
    items()[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    trigger().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    editor.i18n.setLocale('fr');
    widget.update();
    expect(trigger().getAttribute('aria-label')).toBe('Style de soulignement');
    open();
    expect(items().map((node) => node.textContent)).toEqual([
      'Simple',
      'Double',
      'Pointillé',
      'Tirets',
      'Ondulé',
    ]);
    expect(editor.chains).toEqual([]);
  });
});
