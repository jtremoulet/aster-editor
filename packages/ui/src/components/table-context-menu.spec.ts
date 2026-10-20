import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import {
  clampToViewport,
  createTableContextMenu,
  type TableContextMenu,
} from './table-context-menu';
import { TABLE_ACTIONS } from './table-grid-picker';

describe('clampToViewport', () => {
  it('garde la position si le menu tient, sinon le ramène avec 8px de marge, jamais négatif', () => {
    expect(clampToViewport(40, 200, 1024)).toBe(40);
    expect(clampToViewport(900, 200, 1024)).toBe(816);
    expect(clampToViewport(10, 2000, 1024)).toBe(0);
  });
});

describe('createTableContextMenu', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let menu: TableContextMenu;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    host.append(editor.element);
    menu = createTableContextMenu(editor);
  });

  afterEach(() => {
    menu.destroy();
    host.remove();
  });

  const rightClick = (): MouseEvent => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 50,
      button: 2,
    });
    editor.contentElement.dispatchEvent(event);
    return event;
  };
  const items = (): HTMLButtonElement[] =>
    Array.from(menu.element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  const item = (text: string): HTMLButtonElement =>
    items().find((node) => node.textContent === text)!;

  it('ne fait rien hors d’un tableau', () => {
    const event = rightClick();
    expect(event.defaultPrevented).toBe(false);
    expect(menu.isOpen()).toBe(false);
    expect(menu.element.isConnected).toBe(false);
  });

  it('s’ouvre au clic droit dans un tableau, positionné au curseur, avec toutes les actions', () => {
    editor.activeNodes.add('table');
    const event = rightClick();
    expect(event.defaultPrevented).toBe(true);
    expect(menu.isOpen()).toBe(true);
    expect(menu.element.isConnected).toBe(true);
    expect(editor.element.contains(menu.element)).toBe(true);
    expect(menu.element.getAttribute('role')).toBe('menu');
    expect(menu.element.getAttribute('aria-label')).toBe('Table menu');
    expect(menu.element.style.left).toBe('40px');
    expect(menu.element.style.top).toBe('50px');
    expect(items().length).toBe(TABLE_ACTIONS.length);
    expect(items().map((node) => node.textContent)).toContain('Delete table');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('reste dans le viewport quand le curseur est près du bord droit ou bas', () => {
    editor.activeNodes.add('table');
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
    // jsdom ne fait pas de mise en page : on simule un menu de 200 × 320.
    menu.element.getBoundingClientRect = (): DOMRect =>
      ({ width: 200, height: 320, left: 0, top: 0, right: 200, bottom: 320 }) as DOMRect;
    try {
      menu.open(250, 400);
      expect(menu.element.style.left).toBe('92px');
      expect(menu.element.style.top).toBe('172px');
      menu.close();
      menu.open(20, 30);
      expect(menu.element.style.left).toBe('20px');
      expect(menu.element.style.top).toBe('30px');
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true });
    }
  });

  it('grise les actions non exécutables', () => {
    editor.activeNodes.add('table');
    editor.disabled.add('table.mergeCells');
    rightClick();
    expect(item('Merge cells').disabled).toBe(true);
    expect(item('Delete row').disabled).toBe(false);
    item('Merge cells').click();
    expect(editor.calls).toEqual([]);
    expect(menu.isOpen()).toBe(true);
  });

  it('une action lance la commande, ferme le menu et rend le focus', () => {
    editor.activeNodes.add('table');
    rightClick();
    item('Delete row').click();
    expect(editor.calls).toEqual([{ id: 'table.deleteRow', args: undefined }]);
    expect(menu.isOpen()).toBe(false);
    expect(menu.element.hasAttribute('hidden')).toBe(true);
    expect(editor.focusCalls).toBe(1);
  });

  it('se ferme à Échap et au clic extérieur, pas au clic intérieur', () => {
    editor.activeNodes.add('table');
    rightClick();
    menu.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(menu.isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);

    rightClick();
    items()[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isOpen()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });

  it('les flèches naviguent entre les entrées actives', () => {
    editor.activeNodes.add('table');
    editor.disabled.add('table.addRowAfter');
    rightClick();
    const enabled = items().filter((node) => !node.disabled);
    expect(document.activeElement).toBe(enabled[0]);
    menu.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(enabled[1]);
    menu.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(enabled[enabled.length - 1]);
    menu.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(enabled[enabled.length - 1]);
  });

  it('un second clic droit remplace le menu ouvert', () => {
    editor.activeNodes.add('table');
    rightClick();
    rightClick();
    expect(menu.isOpen()).toBe(true);
    expect(editor.element.querySelectorAll('.aster-context-menu').length).toBe(1);
  });

  it('reste fermé en lecture seule et via open() sans table', () => {
    editor.activeNodes.add('table');
    editor.setReadOnly(true);
    expect(rightClick().defaultPrevented).toBe(false);
    expect(menu.isOpen()).toBe(false);
    editor.setReadOnly(false);
    menu.open(10, 10);
    expect(menu.isOpen()).toBe(true);
    editor.activeNodes.delete('table');
    menu.update();
    expect(menu.isOpen()).toBe(false);
  });

  it('ne s’ouvre pas sans commande table.* enregistrée', () => {
    menu.destroy();
    editor = createMockEditor({ commands: ['bold'] });
    registerUiTranslations(editor);
    editor.activeNodes.add('table');
    menu = createTableContextMenu(editor);
    menu.open(0, 0);
    expect(menu.isOpen()).toBe(false);
  });

  it('destroy ferme, retire l’élément et l’écouteur contextmenu', () => {
    editor.activeNodes.add('table');
    rightClick();
    menu.destroy();
    expect(menu.isOpen()).toBe(false);
    expect(menu.element.isConnected).toBe(false);
    expect(rightClick().defaultPrevented).toBe(false);
    expect(menu.isOpen()).toBe(false);
  });
});
