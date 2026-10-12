import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { createToolbar } from './create-toolbar';
import { FULL_PRESET, MINIMAL_PRESET, STANDARD_PRESET, resolveToolbarConfig } from './presets';

const BUTTON = '[data-toolbar-item]';

describe('createToolbar', () => {
  let editor: MockEditor;
  let container: HTMLElement;

  beforeEach(() => {
    editor = createMockEditor({ shortcuts: { bold: 'Mod-b', undo: 'Mod-z' } });
    container = document.createElement('div');
    document.body.append(container);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('rend le preset standard avec un groupe par entrée et un bouton par item', () => {
    const toolbar = createToolbar(editor, container, 'standard');
    const root = container.querySelector('.aster-toolbar');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('role')).toBe('toolbar');
    expect(root?.getAttribute('aria-label')).toBe('Formatting toolbar');
    const groups = container.querySelectorAll('.aster-toolbar__group');
    expect(groups.length).toBe(STANDARD_PRESET.length);
    const expectedItems = STANDARD_PRESET.reduce((sum, group) => sum + group.length, 0);
    expect(container.querySelectorAll(BUTTON).length).toBe(expectedItems);
    toolbar.destroy();
  });

  it('rend les presets full et minimal avec le bon nombre de groupes', () => {
    const full = createToolbar(editor, container, 'full');
    expect(container.querySelectorAll('.aster-toolbar__group').length).toBe(FULL_PRESET.length);
    full.destroy();
    const minimal = createToolbar(editor, container, 'minimal');
    expect(container.querySelectorAll('.aster-toolbar__group').length).toBe(MINIMAL_PRESET.length);
    expect(container.querySelectorAll(BUTTON).length).toBe(6);
    minimal.destroy();
  });

  it('utilise standard par défaut', () => {
    createToolbar(editor, container);
    expect(container.querySelectorAll('.aster-toolbar__group').length).toBe(STANDARD_PRESET.length);
  });

  it('ne rend rien avec false et retourne une toolbar vide', () => {
    const toolbar = createToolbar(editor, container, false);
    expect(container.children.length).toBe(0);
    expect(toolbar.element.childElementCount).toBe(0);
    toolbar.update();
    toolbar.destroy();
  });

  it('résout un preset inconnu sur standard avec un avertissement', () => {
    expect(resolveToolbarConfig('weird' as 'full')).toBe(STANDARD_PRESET);
    expect(console.warn).toHaveBeenCalled();
  });

  it('accepte une config custom : chaînes, objets bouton avec args, dropdown', () => {
    createToolbar(editor, container, [
      ['bold', { command: 'heading', args: { level: 2 }, labelKey: 'command.heading.level' }],
      [
        {
          type: 'dropdown',
          id: 'align',
          labelKey: 'command.alignLeft',
          items: [{ command: 'alignLeft' }],
        },
      ],
    ]);
    const buttons = container.querySelectorAll<HTMLButtonElement>(BUTTON);
    expect(buttons.length).toBe(3);
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Heading {level}');
    expect(buttons[2]?.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('ignore un item dont la commande est inconnue avec un console.warn', () => {
    createToolbar(editor, container, [['bold', 'nope', { command: 'alsoNope' }]]);
    expect(container.querySelectorAll(BUTTON).length).toBe(1);
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain('nope');
  });

  it('ignore un widget inconnu ou sans commande enregistrée', () => {
    const limited = createMockEditor({ commands: ['bold'] });
    createToolbar(limited, container, [
      [{ type: 'widget', widget: 'table' }, { type: 'widget', widget: 'ghost' }, 'bold'],
    ]);
    expect(container.querySelectorAll(BUTTON).length).toBe(1);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('pose aria-label, type=button et le raccourci lisible dans le title', () => {
    createToolbar(editor, container, [['bold', 'italic']]);
    const bold = container.querySelector<HTMLButtonElement>('[data-command="bold"]');
    expect(bold?.getAttribute('type')).toBe('button');
    expect(bold?.getAttribute('aria-label')).toBe('Bold');
    expect(bold?.getAttribute('title')).toMatch(/^Bold \((Ctrl\+B|⌘B)\)$/);
    const italic = container.querySelector<HTMLButtonElement>('[data-command="italic"]');
    expect(italic?.getAttribute('title')).toBe('Italic');
  });

  it('chaque bouton porte une icône SVG', () => {
    createToolbar(editor, container, 'full');
    for (const button of container.querySelectorAll(BUTTON)) {
      expect(button.querySelector('svg')).not.toBeNull();
    }
  });

  it('reflète isActive et canRun après selectionChange', () => {
    createToolbar(editor, container, [['bold', 'undo']]);
    const bold = container.querySelector<HTMLButtonElement>('[data-command="bold"]');
    const undo = container.querySelector<HTMLButtonElement>('[data-command="undo"]');
    expect(bold?.getAttribute('aria-pressed')).toBe('false');
    expect(undo?.disabled).toBe(false);

    editor.active.add('bold');
    editor.disabled.add('undo');
    editor.emit('selectionChange', { editor });

    expect(bold?.getAttribute('aria-pressed')).toBe('true');
    expect(bold?.classList.contains('aster-toolbar__button--active')).toBe(true);
    expect(undo?.disabled).toBe(true);
    expect(undo?.getAttribute('aria-disabled')).toBe('true');
  });

  it('désactive tous les boutons en lecture seule', () => {
    createToolbar(editor, container, 'minimal');
    editor.setReadOnly(true);
    for (const button of container.querySelectorAll<HTMLButtonElement>(BUTTON)) {
      expect(button.disabled).toBe(true);
    }
    editor.setReadOnly(false);
    expect(container.querySelector<HTMLButtonElement>('[data-command="bold"]')?.disabled).toBe(
      false,
    );
  });

  it('un clic exécute la commande avec ses args puis redonne le focus', () => {
    createToolbar(editor, container, [[{ command: 'heading', args: { level: 3 } }, 'bold']]);
    const heading = container.querySelector<HTMLButtonElement>('[data-command="heading"]');
    heading?.click();
    expect(editor.calls).toEqual([{ id: 'heading', args: { level: 3 } }]);
    expect(editor.focusCalls).toBe(1);
    container.querySelector<HTMLButtonElement>('[data-command="bold"]')?.click();
    expect(editor.calls[1]).toEqual({ id: 'bold', args: undefined });
  });

  it('un bouton désactivé ne déclenche rien au clic', () => {
    editor.disabled.add('bold');
    createToolbar(editor, container, [['bold']]);
    container.querySelector<HTMLButtonElement>('[data-command="bold"]')?.click();
    expect(editor.calls).toEqual([]);
  });

  it('navigue aux flèches avec roving tabindex, Home et End', () => {
    createToolbar(editor, container, [['bold', 'italic'], ['underline']]);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(BUTTON));
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);

    const press = (target: HTMLElement, key: string): void => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };
    buttons[0]?.focus();
    press(buttons[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    press(buttons[1]!, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[2]);
    press(buttons[2]!, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
    press(buttons[0]!, 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[2]);
    press(buttons[2]!, 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    press(buttons[0]!, 'End');
    expect(document.activeElement).toBe(buttons[2]);
    press(buttons[2]!, 'Enter');
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('saute les boutons désactivés dans la navigation', () => {
    editor.disabled.add('italic');
    createToolbar(editor, container, [['bold', 'italic', 'underline']]);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(BUTTON));
    buttons[0]?.focus();
    buttons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('retraduit les libellés au changement de locale', () => {
    createToolbar(editor, container, [['bold']]);
    const bold = container.querySelector<HTMLButtonElement>('[data-command="bold"]');
    expect(bold?.getAttribute('aria-label')).toBe('Bold');
    editor.i18n.setLocale('fr');
    expect(bold?.getAttribute('aria-label')).toBe('Gras');
    expect(container.querySelector('.aster-toolbar')?.getAttribute('aria-label')).toBe(
      'Barre de mise en forme',
    );
  });

  it('enregistre les traductions ui.* fr et en au montage', () => {
    createToolbar(editor, container, 'minimal');
    expect(editor.i18n.t('ui.link.url')).toBe('URL');
    editor.i18n.setLocale('fr');
    expect(editor.i18n.t('ui.link.newTab')).toBe('Ouvrir dans un nouvel onglet');
  });

  it('destroy se désabonne, vide le conteneur et ne réagit plus', () => {
    const toolbar = createToolbar(editor, container, [['bold']]);
    expect(editor.listenerCount()).toBe(3);
    const bold = container.querySelector<HTMLButtonElement>('[data-command="bold"]');
    toolbar.destroy();
    expect(editor.listenerCount()).toBe(0);
    expect(container.children.length).toBe(0);
    bold?.click();
    expect(editor.calls).toEqual([]);
    editor.active.add('bold');
    editor.emit('selectionChange', { editor });
    expect(bold?.getAttribute('aria-pressed')).toBe('false');
  });
});
