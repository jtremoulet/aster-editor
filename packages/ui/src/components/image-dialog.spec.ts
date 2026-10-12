import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { Dropdown } from './dropdown';
import { createImageDialog } from './image-dialog';

describe('createImageDialog', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let dialog: Dropdown;

  function mount(commands?: readonly string[]): void {
    editor = createMockEditor(commands ? { commands } : {});
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    dialog = createImageDialog(editor) as Dropdown;
    host.append(dialog.element);
  }

  afterEach(() => {
    host.remove();
  });

  beforeEach(() => mount());

  const input = (type: string): HTMLInputElement =>
    dialog.panel.querySelector<HTMLInputElement>(`input[type="${type}"]`)!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(dialog.panel.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === text,
    )!;

  it('ouvre un dialogue avec URL, alt, bouton fichier et actions', () => {
    dialog.open();
    expect(dialog.panel.getAttribute('role')).toBe('dialog');
    expect(input('url')).toBeDefined();
    expect(input('text')).toBeDefined();
    expect(input('file').getAttribute('accept')).toBe('image/*');
    expect(button('From a file…')).toBeDefined();
    expect(button('Insert')).toBeDefined();
    expect(button('Cancel')).toBeDefined();
  });

  it('Insérer appelle image.insert avec src et alt, sans alt vide', () => {
    dialog.open();
    input('url').value = 'https://img/x.png';
    input('text').value = 'A cat';
    button('Insert').click();
    expect(editor.calls).toEqual([
      { id: 'image.insert', args: { src: 'https://img/x.png', alt: 'A cat' } },
    ]);
    expect(dialog.isOpen()).toBe(false);
    dialog.open();
    input('url').value = 'https://img/y.png';
    input('url').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(editor.calls[1]).toEqual({ id: 'image.insert', args: { src: 'https://img/y.png' } });
  });

  it('refuse une URL vide', () => {
    dialog.open();
    button('Insert').click();
    expect(editor.calls).toEqual([]);
    expect(input('url').getAttribute('aria-invalid')).toBe('true');
    expect(dialog.isOpen()).toBe(true);
  });

  it('« Depuis un fichier » ouvre le sélecteur et délègue à image.upload', () => {
    dialog.open();
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
    expect(dialog.isOpen()).toBe(false);
  });

  it('masque le bouton fichier si image.upload est absente', () => {
    host.remove();
    mount(['image.insert']);
    dialog.open();
    expect(dialog.panel.querySelector('input[type="file"]')).toBeNull();
    button('Cancel').click();
    expect(dialog.isOpen()).toBe(false);
  });
});
