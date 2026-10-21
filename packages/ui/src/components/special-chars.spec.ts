import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor.js';
import { registerUiTranslations } from '../toolbar/create-toolbar.js';
import { createWidget } from '../toolbar/widgets.js';
import type { ToolbarWidget } from '../types.js';
import { SPECIAL_CHARS_COLUMNS, SPECIAL_CHAR_GROUPS, createSpecialChars } from './special-chars.js';

describe('createSpecialChars', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  const trigger = (): HTMLButtonElement => widget.element.querySelector('button')!;
  const panel = (): HTMLElement => widget.element.querySelector('.aster-dropdown__panel')!;
  const tabs = (): HTMLButtonElement[] =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const cells = (): HTMLButtonElement[] =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('.aster-special-chars__char'));
  const isOpen = (): boolean => !panel().hasAttribute('hidden');
  const key = (target: HTMLElement, name: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    vi.spyOn(editor, 'insertHTML');
    host = document.createElement('div');
    document.body.append(host, editor.element);
    widget = createSpecialChars(editor);
    host.append(widget.element);
  });

  afterEach(() => {
    widget.destroy();
    host.remove();
    editor.element.remove();
    vi.restoreAllMocks();
  });

  it('rend un déclencheur dialog avec icône et libellé i18n, et un panneau à onglets', () => {
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-label')).toBe('Special characters');
    expect(trigger().querySelector('svg')).not.toBeNull();
    trigger().click();
    expect(isOpen()).toBe(true);
    expect(panel().getAttribute('aria-label')).toBe('Special characters');
    expect(tabs().map((tab) => tab.textContent)).toEqual(['Symbols', 'Emojis']);
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true');
    expect(cells().length).toBe(SPECIAL_CHAR_GROUPS[0]!.chars.length);
    expect(cells()[0]?.textContent).toBe('→');
    expect(document.activeElement).toBe(cells()[0]);
  });

  it('un clic sur une cellule insère le caractère échappé et referme le panneau', () => {
    trigger().click();
    const arrow = cells().find((cell) => cell.dataset['char'] === '→')!;
    arrow.click();
    expect(editor.insertHTML).toHaveBeenCalledWith('→');
    expect(isOpen()).toBe(false);
  });

  it('l’espace insécable a un glyphe visible, un libellé et insère le caractère 160', () => {
    trigger().click();
    const nbsp = cells().find((cell) => cell.dataset['char'] === String.fromCharCode(160))!;
    expect(nbsp.textContent).toBe('⍽');
    expect(nbsp.getAttribute('aria-label')).toBe('Insert Non-breaking space');
    nbsp.click();
    expect(editor.insertHTML).toHaveBeenCalledWith(String.fromCharCode(160));
  });

  it('l’onglet Emojis affiche vingt emojis et reste mémorisé à la réouverture', () => {
    trigger().click();
    tabs()[1]!.click();
    expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('false');
    expect(cells().length).toBe(20);
    expect(cells()[0]?.textContent).toBe('😀');
    cells()[0]!.click();
    expect(editor.insertHTML).toHaveBeenCalledWith('😀');
    trigger().click();
    expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(cells().length).toBe(20);
  });

  it('les flèches naviguent entre onglets et dans la grille, Échap referme', () => {
    trigger().click();
    tabs()[0]!.focus();
    expect(key(tabs()[0]!, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tabs()[1]);
    expect(cells().length).toBe(20);
    key(tabs()[1]!, 'ArrowRight');
    expect(document.activeElement).toBe(tabs()[0]);
    key(tabs()[0]!, 'End');
    expect(document.activeElement).toBe(tabs()[1]);
    key(tabs()[1]!, 'Home');
    expect(document.activeElement).toBe(tabs()[0]);

    const grid = cells();
    grid[0]!.focus();
    key(grid[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(grid[1]);
    key(grid[1]!, 'ArrowDown');
    expect(document.activeElement).toBe(grid[1 + SPECIAL_CHARS_COLUMNS]);
    key(grid[1 + SPECIAL_CHARS_COLUMNS]!, 'ArrowUp');
    expect(document.activeElement).toBe(grid[1]);
    key(grid[1]!, 'ArrowLeft');
    expect(document.activeElement).toBe(grid[0]);
    key(grid[0]!, 'ArrowLeft');
    expect(document.activeElement).toBe(grid[grid.length - 1]);
    key(grid[grid.length - 1]!, 'Home');
    expect(document.activeElement).toBe(grid[0]);
    key(grid[0]!, 'End');
    expect(document.activeElement).toBe(grid[grid.length - 1]);
    expect(grid[grid.length - 1]?.tabIndex).toBe(0);
    expect(grid[0]?.tabIndex).toBe(-1);
    expect(key(grid[grid.length - 1]!, 'Tab').defaultPrevented).toBe(false);
    key(grid[grid.length - 1]!, 'Escape');
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  it('se désactive en lecture seule et suit la locale', () => {
    editor.setReadOnly(true);
    widget.update();
    expect(trigger().disabled).toBe(true);
    editor.setReadOnly(false);
    editor.i18n.setLocale('fr');
    widget.update();
    expect(trigger().getAttribute('aria-label')).toBe('Caractères spéciaux');
    trigger().click();
    expect(tabs().map((tab) => tab.textContent)).toEqual(['Symboles', 'Emojis']);
    expect(cells()[0]?.getAttribute('aria-label')).toBe('Insérer →');
  });

  it('est enregistré comme widget « specialChars » sans condition de commande', () => {
    expect(createWidget(createMockEditor({ commands: [] }), 'specialChars')).not.toBeNull();
  });
});
