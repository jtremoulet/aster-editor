import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor.js';
import { registerUiTranslations } from '../toolbar/create-toolbar.js';
import {
  SLASH_MENU_PLUGIN_KEY,
  buildSlashItems,
  createSlashMenu,
  createSlashMenuPanel,
  filterSlashItems,
  normalizeQuery,
  runSlashItem,
  type SlashMenuItem,
  type SlashMenuPanel,
} from './slash-menu.js';

const item = (id: string, label: string, keywords: string[] = []): SlashMenuItem => ({
  id,
  icon: 'paragraph',
  label,
  keywords,
  run: () => true,
});

describe('normalizeQuery et filterSlashItems', () => {
  const ITEMS = [
    item('paragraph', 'Paragraphe', ['p', 'text']),
    item('heading-1', 'Titre 1', ['h1']),
    item('bulletList', 'Liste à puces', ['ul']),
    item('horizontalRule', 'Séparateur', ['hr']),
  ];

  it('ignore casse, accents et espaces', () => {
    expect(normalizeQuery('  Séparateur ')).toBe('separateur');
    expect(filterSlashItems('SEPA', ITEMS).map((i) => i.id)).toEqual(['horizontalRule']);
  });

  it('renvoie tout pour une requête vide, filtre par libellé ou alias, préfixes d’abord', () => {
    expect(filterSlashItems('', ITEMS)).toEqual(ITEMS);
    expect(filterSlashItems('h1', ITEMS).map((i) => i.id)).toEqual(['heading-1']);
    expect(filterSlashItems('p', ITEMS).map((i) => i.id)).toEqual([
      'paragraph',
      'bulletList',
      'horizontalRule',
    ]);
    expect(filterSlashItems('nothing', ITEMS)).toEqual([]);
  });
});

describe('buildSlashItems', () => {
  it('propose les blocs exécutables, les titres 1-3 avec raccourci, le tableau 3×3 et la variable', () => {
    const editor = createMockEditor({ shortcuts: { bulletList: 'Mod-Shift-8' } });
    registerUiTranslations(editor);
    const items = buildSlashItems(editor);
    expect(items.map((i) => i.id)).toEqual([
      'paragraph',
      'heading:{"level":1}',
      'heading:{"level":2}',
      'heading:{"level":3}',
      'bulletList',
      'orderedList',
      'taskList',
      'blockquote',
      'codeBlock',
      'horizontalRule',
      'table.insert:{"rows":3,"cols":3,"withHeaderRow":true}',
      'variable',
    ]);
    expect(items[1]?.label).toBe('Heading 1');
    expect(items[1]?.shortcut).toBe('Mod-Alt-1');
    expect(items[1]?.icon).toBe('heading-1');
    expect(items[4]?.shortcut).toBe('Mod-Shift-8');
    expect(items[4]?.icon).toBe('bullet-list');
    expect(items[10]?.label).toBe('3 × 3 table');
    items[1]?.run();
    items[10]?.run();
    expect(editor.calls).toEqual([
      { id: 'heading', args: { level: 1 } },
      { id: 'table.insert', args: { rows: 3, cols: 3, withHeaderRow: true } },
    ]);
  });

  it('omet les commandes refusées, et image / lien sans openWidget', () => {
    const editor = createMockEditor();
    registerUiTranslations(editor);
    editor.disabled.add('paragraph');
    editor.disabled.add('heading:{"level":2}');
    const ids = buildSlashItems(editor).map((i) => i.id);
    expect(ids).not.toContain('paragraph');
    expect(ids).not.toContain('heading:{"level":2}');
    expect(ids).toContain('heading:{"level":1}');
    expect(ids).not.toContain('image');
    expect(ids).not.toContain('link');
    expect(ids).not.toContain('pageBreak');
  });

  it('ajoute image et lien quand openWidget est fourni et les commandes existent', () => {
    const editor = createMockEditor();
    registerUiTranslations(editor);
    const openWidget = vi.fn(() => true);
    const items = buildSlashItems(editor, { openWidget });
    const image = items.find((i) => i.id === 'image');
    const link = items.find((i) => i.id === 'link');
    expect(image?.label).toBe('Image…');
    expect(link?.label).toBe('Link…');
    image?.run();
    link?.run();
    expect(openWidget.mock.calls).toEqual([['image'], ['link']]);
    const limited = createMockEditor({ commands: ['bold'] });
    expect(buildSlashItems(limited, { openWidget })).toEqual([]);
  });

  it('variable : insère {{ via insertContent quand la commande Tiptap existe', () => {
    const editor = createMockEditor();
    const insertContent = vi.fn(() => true);
    Object.assign(editor.tiptap.commands as unknown as Record<string, unknown>, { insertContent });
    const variable = buildSlashItems(editor).find((i) => i.id === 'variable');
    expect(variable?.run()).toBe(true);
    expect(insertContent).toHaveBeenCalledWith('{{');
    const bare = createMockEditor();
    expect(
      buildSlashItems(bare)
        .find((i) => i.id === 'variable')
        ?.run(),
    ).toBe(false);
  });
});

describe('createSlashMenuPanel', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let panel: SlashMenuPanel;
  let onDismiss: ReturnType<typeof vi.fn<() => void>>;
  let command: ReturnType<typeof vi.fn<(item: SlashMenuItem) => void>>;
  const ITEMS = [
    item('a', 'Alpha', []),
    item('b', 'Beta'),
    { ...item('c', 'Gamma'), shortcut: 'Mod-b' },
  ];

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    host.append(editor.element);
    onDismiss = vi.fn();
    command = vi.fn();
    panel = createSlashMenuPanel(editor, { onDismiss });
  });

  afterEach(() => {
    panel.destroy();
    host.remove();
  });

  const options = (): HTMLButtonElement[] =>
    Array.from(panel.element.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  const key = (name: string): KeyboardEvent =>
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });

  it('rend icône, libellé et raccourci, première entrée surlignée, positionné sous le curseur', () => {
    panel.update({
      items: ITEMS,
      command,
      clientRect: () =>
        ({ left: 30, top: 10, right: 40, bottom: 30, width: 10, height: 20 }) as DOMRect,
    });
    expect(panel.isOpen()).toBe(true);
    expect(panel.element.getAttribute('role')).toBe('listbox');
    expect(panel.element.getAttribute('aria-label')).toBe('Insert a block');
    expect(options().length).toBe(3);
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
    expect(options()[0]?.querySelector('svg')).not.toBeNull();
    expect(options()[0]?.querySelector('.aster-slash-menu__label')?.textContent).toBe('Alpha');
    expect(options()[2]?.querySelector('kbd')?.textContent).toBe('Ctrl+B');
    expect(options()[0]?.querySelector('kbd')).toBeNull();
    expect(panel.element.style.left).toBe('30px');
    expect(panel.element.style.top).toBe('34px');
  });

  it('navigue au clavier, Entrée et Tab choisissent, Échap est consommé', () => {
    panel.update({ items: ITEMS, command });
    expect(panel.onKeyDown(key('ArrowDown'))).toBe(true);
    expect(panel.selectedIndex()).toBe(1);
    expect(panel.onKeyDown(key('ArrowUp'))).toBe(true);
    expect(panel.onKeyDown(key('ArrowUp'))).toBe(true);
    expect(panel.selectedIndex()).toBe(2);
    expect(panel.onKeyDown(key('Enter'))).toBe(true);
    expect(command).toHaveBeenLastCalledWith(ITEMS[2]);
    expect(panel.onKeyDown(key('Tab'))).toBe(true);
    expect(panel.onKeyDown(key('Escape'))).toBe(true);
    expect(panel.onKeyDown(key('x'))).toBe(false);
  });

  it('sans résultat : message visible, Entrée non consommée', () => {
    panel.update({ items: [], command });
    expect(panel.element.hasAttribute('hidden')).toBe(false);
    expect(panel.element.querySelector('.aster-slash-menu__empty')?.textContent).toBe(
      'No matching block',
    );
    expect(panel.selectedIndex()).toBe(-1);
    expect(panel.onKeyDown(key('Enter'))).toBe(false);
  });

  it('clic et survol choisissent / surlignent, mousedown neutralisé, clic extérieur → onDismiss', () => {
    panel.update({ items: ITEMS, command });
    options()[1]?.dispatchEvent(new PointerEvent('pointerenter'));
    expect(panel.selectedIndex()).toBe(1);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    options()[1]?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
    options()[1]?.click();
    expect(command).toHaveBeenCalledWith(ITEMS[1]);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    panel.hide();
    expect(panel.isOpen()).toBe(false);
    expect(panel.element.hasAttribute('hidden')).toBe(true);
    expect(panel.onKeyDown(key('ArrowDown'))).toBe(false);
  });
});

describe('createSlashMenu et runSlashItem', () => {
  it('enregistre le plugin /, le retire au destroy', () => {
    const editor = createMockEditor();
    const menu = createSlashMenu(editor);
    expect(editor.plugins.length).toBe(1);
    expect(editor.plugins[0]?.spec.key).toBe(SLASH_MENU_PLUGIN_KEY);
    expect(menu.panel.isOpen()).toBe(false);
    menu.destroy();
    expect(editor.plugins.length).toBe(0);
    expect(editor.element.contains(menu.panel.element)).toBe(false);
  });

  it('runSlashItem supprime le texte /xxx puis exécute l’entrée et rend le focus', () => {
    const editor = createMockEditor();
    const run = vi.fn(() => true);
    expect(runSlashItem(editor, { from: 1, to: 4 }, { ...item('x', 'X'), run })).toBe(true);
    expect(editor.deletedRanges).toEqual([{ from: 1, to: 4 }]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(editor.focusCalls).toBe(1);
    editor.setReadOnly(true);
    expect(runSlashItem(editor, { from: 1, to: 4 }, { ...item('x', 'X'), run })).toBe(false);
    expect(editor.deletedRanges.length).toBe(1);
  });
});
