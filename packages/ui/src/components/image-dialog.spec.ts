import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IMAGE_EDIT_EVENT } from '@aster-editor/core';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import { createImageDialog } from './image-dialog';

describe('createImageDialog', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let dialog: ToolbarWidget;

  function mount(commands?: readonly string[]): void {
    editor = createMockEditor(commands ? { commands } : {});
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    dialog = createImageDialog(editor);
    host.append(dialog.element);
  }

  afterEach(() => {
    dialog.destroy();
    host.remove();
  });

  beforeEach(() => mount());

  const trigger = (): HTMLButtonElement =>
    dialog.element.querySelector<HTMLButtonElement>('.aster-dropdown__trigger')!;
  const panel = (): HTMLElement =>
    dialog.element.querySelector<HTMLElement>('.aster-dropdown__panel')!;
  const isOpen = (): boolean => !panel().hasAttribute('hidden');
  const open = (): void => {
    if (!isOpen()) trigger().click();
  };
  const input = (type: string): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`input[type="${type}"]`)!;
  const inputById = (prefix: string): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`input[id^="aster-image-${prefix}-"]`)!;
  const radio = (value: string): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === text,
    )!;

  describe('mode insertion', () => {
    it('ouvre un dialogue avec URL, alt, titre, largeur, alignement, fichier et actions', () => {
      open();
      expect(panel().getAttribute('role')).toBe('dialog');
      expect(panel().getAttribute('aria-label')).toBe('Image');
      expect(input('url')).toBeDefined();
      expect(inputById('alt').type).toBe('text');
      expect(inputById('title').type).toBe('text');
      expect(inputById('width').type).toBe('number');
      expect(panel().querySelectorAll('input[type="radio"]').length).toBe(3);
      expect(panel().querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
        'Alignment',
      );
      expect(input('file').getAttribute('accept')).toBe('image/*');
      expect(button('From a file…')).toBeDefined();
      expect(button('Insert')).toBeDefined();
      expect(button('Cancel')).toBeDefined();
    });

    it('Insérer appelle image.insert avec src et alt, sans alt vide', () => {
      open();
      input('url').value = 'https://img/x.png';
      inputById('alt').value = 'A cat';
      button('Insert').click();
      expect(editor.calls).toEqual([
        { id: 'image.insert', args: { src: 'https://img/x.png', alt: 'A cat' } },
      ]);
      expect(isOpen()).toBe(false);
      open();
      input('url').value = 'https://img/y.png';
      input('url').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      expect(editor.calls[1]).toEqual({ id: 'image.insert', args: { src: 'https://img/y.png' } });
    });

    it('transmet titre et largeur à image.insert, puis l’alignement via image.setAttributes', () => {
      open();
      input('url').value = 'https://img/x.png';
      inputById('title').value = 'Légende';
      inputById('width').value = '240';
      radio('center').checked = true;
      button('Insert').click();
      expect(editor.calls).toEqual([
        { id: 'image.insert', args: { src: 'https://img/x.png', title: 'Légende', width: 240 } },
        { id: 'image.setAttributes', args: { align: 'center' } },
      ]);
    });

    it('refuse une URL vide', () => {
      open();
      button('Insert').click();
      expect(editor.calls).toEqual([]);
      expect(input('url').getAttribute('aria-invalid')).toBe('true');
      expect(isOpen()).toBe(true);
    });

    it('« Depuis un fichier » ouvre le sélecteur et délègue à image.upload', () => {
      open();
      const file = input('file');
      let clicked = 0;
      file.addEventListener('click', (event) => {
        clicked += 1;
        event.preventDefault();
      });
      button('From a file…').click();
      expect(clicked).toBe(1);
      const picked = new File(['x'], 'photo.png', { type: 'image/png' });
      Object.defineProperty(file, 'files', { value: [picked] });
      file.dispatchEvent(new Event('change'));
      expect(editor.calls).toEqual([{ id: 'image.upload', args: { file: picked } }]);
      expect(isOpen()).toBe(false);
    });

    it('masque le bouton fichier si image.upload est absente', () => {
      dialog.destroy();
      host.remove();
      mount(['image.insert']);
      open();
      expect(panel().querySelector('input[type="file"]')).toBeNull();
      button('Cancel').click();
      expect(isOpen()).toBe(false);
    });
  });

  describe('mode édition', () => {
    beforeEach(() => {
      editor.activeNodes.add('image');
      editor.attributes.set('image', {
        src: 'https://img/x.png',
        alt: 'Chat',
        title: 'Un chat',
        width: 320,
        align: 'right',
      });
      dialog.update();
    });

    it('préremplit les champs depuis l’image sélectionnée, sans URL ni fichier', () => {
      expect(trigger().getAttribute('aria-pressed')).toBe('true');
      open();
      expect(panel().getAttribute('aria-label')).toBe('Edit image');
      expect(panel().classList.contains('aster-image-dialog--editing')).toBe(true);
      expect(panel().querySelector('input[type="url"]')).toBeNull();
      expect(panel().querySelector('input[type="file"]')).toBeNull();
      expect(inputById('alt').value).toBe('Chat');
      expect(inputById('title').value).toBe('Un chat');
      expect(inputById('width').value).toBe('320');
      expect(radio('right').checked).toBe(true);
      expect(radio('left').checked).toBe(false);
      expect(button('Apply')).toBeDefined();
      expect(button('Insert')).toBeUndefined();
    });

    it('Appliquer appelle image.setAttributes avec alt, title, width et align', () => {
      open();
      inputById('alt').value = 'Nouveau';
      inputById('title').value = '';
      inputById('width').value = '200';
      radio('center').checked = true;
      button('Apply').click();
      expect(editor.calls).toEqual([
        {
          id: 'image.setAttributes',
          args: { alt: 'Nouveau', title: '', width: 200, align: 'center' },
        },
      ]);
      expect(isOpen()).toBe(false);
      expect(editor.focusCalls).toBe(1);
    });

    it('une largeur vide est envoyée comme 0 (retour à l’automatique)', () => {
      open();
      inputById('width').value = '';
      inputById('alt').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      expect(editor.calls[0]?.args).toEqual({
        alt: 'Chat',
        title: 'Un chat',
        width: 0,
        align: 'right',
      });
    });

    it('revient en mode insertion quand l’image n’est plus sélectionnée', () => {
      editor.activeNodes.delete('image');
      dialog.update();
      open();
      expect(panel().querySelector('input[type="url"]')).not.toBeNull();
      expect(button('Insert')).toBeDefined();
    });
  });

  describe('événement aster:image-edit', () => {
    it('ouvre le dialogue en mode édition quand le core émet l’événement', () => {
      editor.activeNodes.add('image');
      editor.attributes.set('image', { src: 'https://img/x.png', alt: 'Chat' });
      editor.contentElement.dispatchEvent(
        new CustomEvent(IMAGE_EDIT_EVENT, { bubbles: true, detail: { pos: 3 } }),
      );
      expect(isOpen()).toBe(true);
      expect(panel().getAttribute('aria-label')).toBe('Edit image');
      expect(inputById('alt').value).toBe('Chat');
    });

    it('ignore l’événement si image.setAttributes n’est pas exécutable', () => {
      editor.disabled.add('image.setAttributes');
      editor.element.dispatchEvent(new CustomEvent(IMAGE_EDIT_EVENT, { detail: { pos: 3 } }));
      expect(isOpen()).toBe(false);
    });

    it('destroy retire l’écouteur', () => {
      dialog.destroy();
      editor.activeNodes.add('image');
      editor.element.dispatchEvent(new CustomEvent(IMAGE_EDIT_EVENT, { detail: { pos: 3 } }));
      expect(isOpen()).toBe(false);
    });
  });
});
