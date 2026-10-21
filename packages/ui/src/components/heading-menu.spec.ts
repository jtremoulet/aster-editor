import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor.js';
import { registerUiTranslations } from '../toolbar/create-toolbar.js';
import type { Dropdown } from './dropdown.js';
import { createHeadingMenu } from './heading-menu.js';

describe('createHeadingMenu', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let menu: Dropdown;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    menu = createHeadingMenu(editor) as Dropdown;
    host.append(menu.element);
  });

  afterEach(() => {
    host.remove();
  });

  const text = (): string => menu.trigger.querySelector('.aster-toolbar__text')?.textContent ?? '';

  it('affiche « Paragraph » par défaut et liste Paragraphe + 6 titres', () => {
    expect(text()).toBe('Paragraph');
    expect(menu.trigger.getAttribute('aria-label')).toBe('Text style');
    menu.open();
    const items = menu.panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    expect(items.length).toBe(7);
    expect(items[0]?.getAttribute('aria-checked')).toBe('true');
    expect(items[3]?.querySelector('.aster-toolbar__text')?.textContent).toBe('Heading 3');
  });

  it('reflète le niveau actif dans le déclencheur et la coche', () => {
    editor.active.add('heading:{"level":2}');
    menu.update();
    expect(text()).toBe('Heading 2');
    menu.open();
    const items = menu.panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    expect(items[0]?.getAttribute('aria-checked')).toBe('false');
    expect(items[2]?.getAttribute('aria-checked')).toBe('true');
  });

  it('exécute heading {level} ou paragraph au clic, puis ferme', () => {
    menu.open();
    menu.panel.querySelector<HTMLButtonElement>('.aster-menu__item--h4')?.click();
    expect(editor.calls).toEqual([{ id: 'heading', args: { level: 4 } }]);
    expect(menu.isOpen()).toBe(false);
    menu.open();
    menu.panel.querySelector<HTMLButtonElement>('.aster-menu__item--paragraph')?.click();
    expect(editor.calls[1]).toEqual({ id: 'paragraph', args: undefined });
    expect(editor.focusCalls).toBe(2);
  });

  it('suit la locale', () => {
    editor.i18n.setLocale('fr');
    menu.update();
    expect(text()).toBe('Paragraphe');
    editor.active.add('heading:{"level":1}');
    menu.update();
    expect(text()).toBe('Titre 1');
  });
});
