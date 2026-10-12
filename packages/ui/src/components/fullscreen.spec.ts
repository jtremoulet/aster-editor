import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsterOptions } from '@aster-editor/core';
import type * as Core from '@aster-editor/core';
import { createEditor } from '@aster-editor/core';
import { createAster } from '../create-aster';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import { createWidget } from '../toolbar/widgets';
import {
  FULLSCREEN_CLASS,
  createFullscreen,
  createFullscreenButton,
  getFullscreen,
} from './fullscreen';

vi.mock('@aster-editor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return { ...actual, createEditor: vi.fn() };
});

const escape = (target: HTMLElement): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('plein écran', () => {
  let editor: MockEditor;
  let host: HTMLElement;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    host.className = 'aster';
    host.append(editor.element);
    document.body.append(host);
  });

  afterEach(() => {
    getFullscreen(editor).destroy();
    host.remove();
    vi.clearAllMocks();
  });

  describe('contrôleur', () => {
    it('getFullscreen partage une instance par éditeur', () => {
      expect(getFullscreen(editor)).toBe(getFullscreen(editor));
    });

    it('set ajoute puis retire la classe sur la racine .aster et notifie', () => {
      const fullscreen = getFullscreen(editor);
      const listener = vi.fn();
      fullscreen.onChange(listener);
      fullscreen.set(true);
      expect(fullscreen.isActive()).toBe(true);
      expect(host.classList.contains(FULLSCREEN_CLASS)).toBe(true);
      fullscreen.set(true);
      expect(listener).toHaveBeenCalledTimes(1);
      fullscreen.toggle();
      expect(fullscreen.isActive()).toBe(false);
      expect(host.classList.contains(FULLSCREEN_CLASS)).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('Échap dans l’éditeur quitte le plein écran, pas si l’événement est déjà consommé', () => {
      const fullscreen = getFullscreen(editor);
      fullscreen.set(true);
      const consumed = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      consumed.preventDefault();
      editor.contentElement.dispatchEvent(consumed);
      expect(fullscreen.isActive()).toBe(true);
      expect(escape(editor.contentElement).defaultPrevented).toBe(true);
      expect(fullscreen.isActive()).toBe(false);
      // Hors plein écran, Échap n'est plus écouté.
      expect(escape(editor.contentElement).defaultPrevented).toBe(false);
    });

    it('retombe sur l’hôte de l’éditeur sans racine .aster', () => {
      host.className = '';
      const fullscreen = createFullscreen(editor);
      fullscreen.set(true);
      expect(editor.element.classList.contains(FULLSCREEN_CLASS)).toBe(true);
      fullscreen.destroy();
      expect(editor.element.classList.contains(FULLSCREEN_CLASS)).toBe(false);
      fullscreen.set(true);
      expect(fullscreen.isActive()).toBe(false);
    });
  });

  describe('widget fullscreen', () => {
    it('bascule au clic, reflète aria-pressed, libellé et icône, actif en lecture seule', () => {
      editor.setReadOnly(true);
      const widget = createWidget(editor, 'fullscreen')!;
      const button = widget.element as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-label')).toBe('Full screen');
      expect(button.getAttribute('aria-pressed')).toBe('false');
      const enterIcon = button.innerHTML;
      button.click();
      expect(getFullscreen(editor).isActive()).toBe(true);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(button.getAttribute('aria-label')).toBe('Exit full screen');
      expect(button.innerHTML).not.toBe(enterIcon);
      escape(editor.contentElement);
      expect(button.getAttribute('aria-pressed')).toBe('false');
      widget.destroy();
    });

    it('se désabonne au destroy et suit la locale', () => {
      const widget = createFullscreenButton(editor);
      const button = widget.element as HTMLButtonElement;
      editor.i18n.setLocale('fr');
      widget.update();
      expect(button.getAttribute('aria-label')).toBe('Plein écran');
      widget.destroy();
      getFullscreen(editor).set(true);
      expect(button.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('via createAster', () => {
    it('expose setFullscreen / isFullscreen, Échap quitte, destroy nettoie', () => {
      const mock = createMockEditor();
      vi.mocked(createEditor).mockImplementation((options: AsterOptions) => {
        options.element.append(mock.element);
        return mock;
      });
      const root = document.createElement('div');
      document.body.append(root);
      const instance = createAster(root, { toolbar: 'full' });
      const button = instance.element.querySelector<HTMLButtonElement>('.aster-fullscreen-button')!;
      expect(instance.isFullscreen()).toBe(false);
      instance.setFullscreen(true);
      expect(instance.isFullscreen()).toBe(true);
      expect(instance.element.classList.contains(FULLSCREEN_CLASS)).toBe(true);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      escape(mock.contentElement);
      expect(instance.isFullscreen()).toBe(false);
      instance.setFullscreen(true);
      instance.destroy();
      expect(instance.element.classList.contains(FULLSCREEN_CLASS)).toBe(false);
      expect(instance.isFullscreen()).toBe(false);
      root.remove();
    });
  });
});
