import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_COMMAND_IDS } from '@aster-editor/core';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import {
  CAPS_OPTIONS,
  CAPS_SET_COMMAND,
  CAPS_UNSET_COMMAND,
  createCapsMenu,
  currentCaps,
} from './caps';

/** Commandes standard plus les commandes additives de casse annoncées par L23. */
const COMMANDS: readonly string[] = [...STANDARD_COMMAND_IDS, CAPS_SET_COMMAND, CAPS_UNSET_COMMAND];

describe('createCapsMenu', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  beforeEach(() => {
    editor = createMockEditor({
      commands: COMMANDS,
      stateless: [CAPS_SET_COMMAND, CAPS_UNSET_COMMAND],
    });
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    widget = createCapsMenu(editor);
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

  it('rend un menu Normal / MAJUSCULES / Petites capitales avec « Normal » coché par défaut', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Case');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().querySelector('.aster-toolbar__icon svg')).not.toBeNull();
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    expect(CAPS_OPTIONS.map((option) => option.value)).toEqual([null, 'all', 'small']);
    open();
    expect(panel().getAttribute('role')).toBe('menu');
    expect(items().map((node) => node.textContent)).toEqual(['Normal', 'UPPERCASE', 'Small caps']);
    expect(item('Normal').getAttribute('aria-checked')).toBe('true');
    expect(item('UPPERCASE').classList.contains('aster-caps__item--all')).toBe(true);
    expect(document.activeElement).toBe(items()[0]);
  });

  it('lit la casse courante sur la marque textStyle et enfonce le déclencheur', () => {
    expect(currentCaps(editor)).toBeNull();
    editor.attributes.set('textStyle', { caps: 'small' });
    expect(currentCaps(editor)).toBe('small');
    widget.update();
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    open();
    expect(item('Small caps').getAttribute('aria-checked')).toBe('true');
    expect(item('Normal').getAttribute('aria-checked')).toBe('false');
    editor.attributes.set('textStyle', { caps: 'weird' });
    expect(currentCaps(editor)).toBeNull();
  });

  it('une casse envoie text.setCaps { caps }, « Normal » envoie text.unsetCaps, puis ferme et refocalise', () => {
    open();
    item('UPPERCASE').click();
    expect(editor.calls).toEqual([{ id: 'text.setCaps', args: { caps: 'all' } }]);
    expect(isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
    open();
    item('Small caps').click();
    expect(editor.calls[1]).toEqual({ id: 'text.setCaps', args: { caps: 'small' } });
    open();
    item('Normal').click();
    expect(editor.calls[2]).toEqual({ id: 'text.unsetCaps', args: undefined });
  });

  it('se désactive quand text.setCaps n’est pas exécutable, désactive « Normal » sans unsetCaps', () => {
    editor.setReadOnly(true);
    widget.update();
    expect(trigger().disabled).toBe(true);
    editor.setReadOnly(false);
    editor.disabled.add(CAPS_UNSET_COMMAND);
    widget.update();
    expect(trigger().disabled).toBe(false);
    open();
    expect(item('Normal').disabled).toBe(true);
    expect(item('UPPERCASE').disabled).toBe(false);
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
    expect(trigger().getAttribute('aria-label')).toBe('Casse');
    open();
    expect(items().map((node) => node.textContent)).toEqual([
      'Normal',
      'MAJUSCULES',
      'Petites capitales',
    ]);
    expect(editor.calls).toEqual([]);
  });
});
