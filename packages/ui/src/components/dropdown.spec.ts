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

  it('un second clic sur le déclencheur rend le focus au déclencheur s’il était dans le panneau', () => {
    const dropdown = mount();
    dropdown.trigger.click();
    expect(dropdown.panel.contains(document.activeElement)).toBe(true);
    dropdown.trigger.click();
    expect(dropdown.isOpen()).toBe(false);
    expect(document.activeElement).toBe(dropdown.trigger);
  });

  it('se ferme quand le focus sort du dropdown, pas quand il circule dedans ni vers nulle part', () => {
    const dropdown = mount();
    const outside = document.createElement('button');
    host.append(outside);
    dropdown.open();
    const items = Array.from(dropdown.panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const focusout = (from: HTMLElement, relatedTarget: EventTarget | null): void => {
      from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
    };
    focusout(items[0]!, items[1]!);
    expect(dropdown.isOpen()).toBe(true);
    focusout(items[0]!, dropdown.trigger);
    expect(dropdown.isOpen()).toBe(true);
    // Fenêtre qui perd le focus, sélecteur de fichier natif : relatedTarget nul, on garde.
    focusout(items[0]!, null);
    expect(dropdown.isOpen()).toBe(true);
    focusout(items[0]!, outside);
    expect(dropdown.isOpen()).toBe(false);
    // Idem pour un dialogue : Tab hors du panneau le ferme.
    const dialog = createDropdown({
      editor,
      labelKey: 'ui.link.title',
      panelRole: 'dialog',
      renderPanel: (panel) => panel.append(document.createElement('input')),
    });
    host.append(dialog.element);
    dialog.open();
    focusout(dialog.panel.querySelector('input')!, outside);
    expect(dialog.isOpen()).toBe(false);
    dialog.destroy();
  });

  it('rend le focus à l’éditeur si le panneau se ferme parce que le dropdown se désactive', () => {
    const dropdown = mount();
    dropdown.open();
    expect(dropdown.panel.contains(document.activeElement)).toBe(true);
    editor.setReadOnly(true);
    dropdown.update();
    expect(dropdown.isOpen()).toBe(false);
    expect(dropdown.trigger.disabled).toBe(true);
    expect(editor.focusCalls).toBe(1);
    // Focus sur le déclencheur qui devient disabled : le navigateur le lâcherait sur body.
    editor.setReadOnly(false);
    dropdown.update();
    dropdown.open();
    dropdown.trigger.focus();
    editor.setReadOnly(true);
    dropdown.update();
    expect(editor.focusCalls).toBe(2);
    // Focus ailleurs : rien à rendre.
    editor.setReadOnly(false);
    dropdown.update();
    expect(dropdown.trigger.disabled).toBe(false);
    editor.setReadOnly(true);
    dropdown.update();
    expect(editor.focusCalls).toBe(2);
  });

  it('aligne le panneau à droite quand il déborde du viewport', () => {
    const dropdown = mount();
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 758, configurable: true });
    dropdown.panel.getBoundingClientRect = (): DOMRect =>
      ({ left: 563, right: 903, width: 340, top: 0, bottom: 100, height: 100 }) as DOMRect;
    try {
      dropdown.open();
      expect(dropdown.panel.classList.contains('aster-dropdown__panel--flip')).toBe(true);
      dropdown.close();
      expect(dropdown.panel.classList.contains('aster-dropdown__panel--flip')).toBe(false);
      dropdown.panel.getBoundingClientRect = (): DOMRect =>
        ({ left: 10, right: 350, width: 340, top: 0, bottom: 100, height: 100 }) as DOMRect;
      dropdown.open();
      expect(dropdown.panel.classList.contains('aster-dropdown__panel--flip')).toBe(false);
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
    }
  });

  it('update() reconstruit un menu ouvert en gardant le focus sur l’entrée de même rang', () => {
    let label = 'avant';
    const dropdown = createDropdown({
      editor,
      labelKey: 'command.heading',
      renderPanel: (panel) => {
        for (let i = 0; i < 3; i++) {
          panel.append(createMenuItem({ text: `${label} ${i}`, onSelect: () => undefined }));
        }
      },
    });
    host.append(dropdown.element);
    dropdown.open();
    const items = (): HTMLElement[] =>
      Array.from(dropdown.panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    items()[1]!.focus();
    label = 'après';
    dropdown.update();
    expect(items().map((item) => item.textContent)).toEqual(['après 0', 'après 1', 'après 2']);
    expect(document.activeElement).toBe(items()[1]);
    dropdown.destroy();
  });

  it('update() ne touche pas à un dialogue ouvert (saisie en cours)', () => {
    const dialog = createDropdown({
      editor,
      labelKey: 'ui.link.title',
      panelRole: 'dialog',
      renderPanel: (panel) => panel.append(document.createElement('input')),
    });
    host.append(dialog.element);
    dialog.open();
    const input = dialog.panel.querySelector('input')!;
    input.value = 'https://aster.invalid/';
    dialog.update();
    expect(dialog.panel.querySelector('input')).toBe(input);
    expect(input.value).toBe('https://aster.invalid/');
    dialog.destroy();
  });

  it('ne pose aria-pressed sur le déclencheur que si isActive est fourni', () => {
    const dropdown = mount();
    expect(dropdown.trigger.hasAttribute('aria-pressed')).toBe(false);
    const stateful = createDropdown({
      editor,
      labelKey: 'command.heading',
      isActive: () => true,
      renderPanel: () => undefined,
    });
    expect(stateful.trigger.getAttribute('aria-pressed')).toBe('true');
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

  it('rend des menuitem (sans aria-checked) et aucun aria-pressed pour des commandes sans isActive', () => {
    const stateless = createMockEditor({
      commands: ['undo', 'redo', 'bold'],
      stateless: ['undo', 'redo'],
    });
    const actions = createCommandDropdown(stateless, {
      type: 'dropdown',
      id: 'history',
      labelKey: 'command.undo',
      items: [{ command: 'undo' }, { command: 'redo' }],
    });
    host.append(actions.element);
    expect(actions.trigger.hasAttribute('aria-pressed')).toBe(false);
    actions.open();
    expect(actions.panel.querySelectorAll('[role="menuitem"]').length).toBe(2);
    expect(actions.panel.querySelectorAll('[role="menuitemradio"]').length).toBe(0);
    expect(actions.panel.querySelector('[aria-checked]')).toBeNull();
    actions.close();
    // Mixte : seules les entrées à état sont cochables, le déclencheur reflète celles-ci.
    stateless.active.add('bold');
    const mixed = createCommandDropdown(stateless, {
      type: 'dropdown',
      id: 'mixed',
      labelKey: 'command.undo',
      items: [{ command: 'undo' }, { command: 'bold' }],
    });
    host.append(mixed.element);
    expect(mixed.trigger.getAttribute('aria-pressed')).toBe('true');
    mixed.open();
    expect(mixed.panel.querySelector('[role="menuitem"]')?.textContent).toBe('Undo');
    expect(mixed.panel.querySelector('[role="menuitemradio"]')?.getAttribute('aria-checked')).toBe(
      'true',
    );
  });
});
