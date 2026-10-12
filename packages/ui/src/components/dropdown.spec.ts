import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { createCommandDropdown, createDropdown, createMenuItem } from './dropdown';

const key = (target: EventTarget, name: string): void => {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
};

describe('createDropdown', () => {
  let editor: MockEditor;
  let host: HTMLElement;

  beforeEach(() => {
    editor = createMockEditor();
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  function mount(items = 3): ReturnType<typeof createDropdown> {
    const dropdown = createDropdown({
      editor,
      labelKey: 'command.heading',
      icon: 'heading',
      renderPanel: (panel, instance) => {
        for (let i = 0; i < items; i++) {
          panel.append(
            createMenuItem({ text: `item ${i}`, onSelect: () => instance.close(false) }),
          );
        }
      },
    });
    host.append(dropdown.element);
    return dropdown;
  }

  it('ouvre au clic, pose aria-expanded et focalise la première entrée', () => {
    const dropdown = mount();
    expect(dropdown.trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(dropdown.panel.hasAttribute('hidden')).toBe(true);
    dropdown.trigger.click();
    expect(dropdown.isOpen()).toBe(true);
    expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(dropdown.panel.hasAttribute('hidden')).toBe(false);
    expect(dropdown.panel.querySelectorAll('[role="menuitem"]').length).toBe(3);
    expect(document.activeElement?.textContent).toBe('item 0');
    dropdown.trigger.click();
    expect(dropdown.isOpen()).toBe(false);
  });

  it('se ferme à Échap et redonne le focus au déclencheur', () => {
    const dropdown = mount();
    dropdown.open();
    key(dropdown.panel.querySelector('[role="menuitem"]')!, 'Escape');
    expect(dropdown.isOpen()).toBe(false);
    expect(document.activeElement).toBe(dropdown.trigger);
  });

  it('se ferme au clic extérieur mais pas au clic intérieur', () => {
    const dropdown = mount();
    dropdown.open();
    dropdown.panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(dropdown.isOpen()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(dropdown.isOpen()).toBe(false);
  });

  it('se ferme après sélection et vide le panneau', () => {
    const dropdown = mount();
    dropdown.open();
    dropdown.panel.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click();
    expect(dropdown.isOpen()).toBe(false);
    expect(dropdown.panel.childElementCount).toBe(0);
  });

  it('navigue aux flèches haut/bas dans le menu, en boucle', () => {
    const dropdown = mount();
    dropdown.open();
    const items = Array.from(dropdown.panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    key(items[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key(items[1]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[2]);
    key(items[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key(items[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    key(items[2]!, 'Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('le mousedown du déclencheur ne vole pas le focus à l’éditeur', () => {
    const dropdown = mount();
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    dropdown.trigger.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
    expect(dropdown.isOpen()).toBe(false);
    dropdown.trigger.click();
    expect(dropdown.isOpen()).toBe(true);
  });

  it('ArrowDown sur le déclencheur ouvre le menu', () => {
    const dropdown = mount();
    key(dropdown.trigger, 'ArrowDown');
    expect(dropdown.isOpen()).toBe(true);
  });

  it('se désactive en lecture seule et refuse de s’ouvrir', () => {
    const dropdown = mount();
    editor.setReadOnly(true);
    dropdown.update();
    expect(dropdown.trigger.disabled).toBe(true);
    dropdown.open();
    expect(dropdown.isOpen()).toBe(false);
  });

  it('destroy ferme et retire les écouteurs', () => {
    const dropdown = mount();
    dropdown.open();
    dropdown.destroy();
    expect(dropdown.isOpen()).toBe(false);
    dropdown.trigger.click();
    expect(dropdown.isOpen()).toBe(false);
  });
});

describe('createCommandDropdown', () => {
  let editor: MockEditor;
  let host: HTMLElement;

  beforeEach(() => {
    editor = createMockEditor();
    host = document.createElement('div');
    document.body.append(host);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('rend une entrée par commande connue, cochée si active, et exécute au clic', () => {
    editor.active.add('alignCenter');
    const dropdown = createCommandDropdown(editor, {
      type: 'dropdown',
      id: 'align',
      labelKey: 'command.alignLeft',
      items: [{ command: 'alignLeft' }, { command: 'alignCenter' }, { command: 'ghost' }],
    });
    host.append(dropdown.element);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(dropdown.trigger.getAttribute('aria-pressed')).toBe('true');
    dropdown.open();
    const items = dropdown.panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    expect(items.length).toBe(2);
    expect(items[1]?.getAttribute('aria-checked')).toBe('true');
    expect(items[0]?.textContent).toBe('Align left');
    items[0]?.click();
    expect(editor.calls).toEqual([{ id: 'alignLeft', args: undefined }]);
    expect(editor.focusCalls).toBe(1);
    expect(dropdown.isOpen()).toBe(false);
  });
});
