import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsterOptions } from '@aster-editor/core';
import type * as Core from '@aster-editor/core';
import { createEditor } from '@aster-editor/core';
import { createAster } from './create-aster';
import { createMockEditor, type MockEditor } from './testing/mock-editor';

vi.mock('@aster-editor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return { ...actual, createEditor: vi.fn() };
});

describe('createAster', () => {
  let host: HTMLElement;
  let editor: MockEditor;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    editor = createMockEditor();
    vi.mocked(createEditor).mockImplementation((options: AsterOptions) => {
      options.element.append(editor.element);
      return editor;
    });
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it('crée .aster[data-theme=light] avec toolbar puis contenu, et passe les options au core', () => {
    const instance = createAster(host, { placeholder: 'Hi', locale: 'fr' });
    const root = host.querySelector<HTMLElement>('.aster');
    expect(root).toBe(instance.element);
    expect(root?.getAttribute('data-theme')).toBe('light');
    expect(root?.children[0]?.className).toBe('aster__toolbar');
    expect(root?.children[1]?.className).toBe('aster__content');
    expect(root?.querySelector('.aster__toolbar .aster-toolbar')).not.toBeNull();
    expect(root?.querySelector('.aster__content .aster-content')).toBe(editor.element);
    const passed = vi.mocked(createEditor).mock.calls[0]?.[0];
    expect(passed?.placeholder).toBe('Hi');
    expect(passed?.locale).toBe('fr');
    expect(passed?.element.className).toBe('aster__content');
    expect(passed).not.toHaveProperty('toolbar');
    expect(passed).not.toHaveProperty('theme');
    expect(instance.editor).toBe(editor);
    expect(instance.toolbar).not.toBeNull();
  });

  it('monte le preset standard par défaut et enregistre les chaînes UI', () => {
    createAster(host);
    expect(host.querySelectorAll('.aster-toolbar__group').length).toBe(8);
    expect(editor.i18n.t('ui.toolbar.label')).toBe('Formatting toolbar');
  });

  it('respecte toolbar: false et une config custom', () => {
    const none = createAster(host, { toolbar: false });
    expect(none.toolbar).toBeNull();
    expect(none.element.querySelector('.aster__toolbar')).toBeNull();
    none.destroy();
    const custom = createAster(host, { toolbar: [['bold']] });
    expect(custom.element.querySelectorAll('[data-toolbar-item]').length).toBe(1);
  });

  it('monte le menu contextuel de table sur le contenu, retiré au destroy', () => {
    const instance = createAster(host, { toolbar: false });
    editor.activeNodes.add('table');
    const rightClick = (): MouseEvent => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      editor.contentElement.dispatchEvent(event);
      return event;
    };
    expect(rightClick().defaultPrevented).toBe(true);
    expect(editor.element.querySelector('.aster-table-context-menu')).not.toBeNull();
    instance.destroy();
    expect(rightClick().defaultPrevented).toBe(false);
  });

  it('applique le thème demandé et setTheme le change', () => {
    const instance = createAster(host, { theme: 'night' });
    expect(instance.element.getAttribute('data-theme')).toBe('night');
    instance.setTheme('custom');
    expect(instance.element.getAttribute('data-theme')).toBe('custom');
  });

  it('ferme le menu contextuel de table en lecture seule et quand la sélection quitte le tableau', () => {
    const instance = createAster(host, { toolbar: false });
    editor.activeNodes.add('table');
    const menu = (): HTMLElement | null =>
      editor.element.querySelector('.aster-table-context-menu');
    const open = (): void => {
      editor.contentElement.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
      expect(menu()?.hasAttribute('hidden')).toBe(false);
    };
    open();
    // Vue source ou `setReadOnly(true)` : l'éditeur émet `readOnlyChange`.
    editor.setReadOnly(true);
    expect(menu()?.hasAttribute('hidden')).toBe(true);
    editor.setReadOnly(false);
    open();
    editor.activeNodes.delete('table');
    editor.emit('selectionChange', { editor });
    expect(menu()?.hasAttribute('hidden')).toBe(true);
    instance.destroy();
    expect(editor.listenerCount()).toBe(0);
  });

  it('destroy détruit toolbar et éditeur, retire l’élément, idempotent', () => {
    const instance = createAster(host);
    // 3 abonnements de la toolbar (selectionChange, readOnlyChange, localeChange)
    // + 2 du menu contextuel de table (readOnlyChange, selectionChange).
    expect(editor.listenerCount()).toBe(5);
    instance.destroy();
    expect(editor.isDestroyed()).toBe(true);
    expect(editor.listenerCount()).toBe(0);
    expect(host.children.length).toBe(0);
    instance.destroy();
    expect(host.children.length).toBe(0);
  });
});
