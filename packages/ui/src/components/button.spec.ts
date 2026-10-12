import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { createCommandButton, createPlainButton, setDisabled } from './button';

describe('createPlainButton', () => {
  it('neutralise le mousedown pour ne pas voler le focus à l’éditeur', () => {
    const button = createPlainButton({ text: 'x' });
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
  });

  it('laisse le click passer normalement', () => {
    const button = createPlainButton({ text: 'x' });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('rend un bouton type=button, hors tabulation quand il est un item de toolbar', () => {
    const plain = createPlainButton();
    expect(plain.getAttribute('type')).toBe('button');
    expect(plain.hasAttribute('data-toolbar-item')).toBe(false);
    const item = createPlainButton({ toolbarItem: true, icon: 'bold', text: 'Gras' });
    expect(item.hasAttribute('data-toolbar-item')).toBe(true);
    expect(item.tabIndex).toBe(-1);
    expect(item.querySelector('.aster-toolbar__icon')).not.toBeNull();
    expect(item.querySelector('.aster-toolbar__text')?.textContent).toBe('Gras');
  });

  it('setDisabled pose et retire aria-disabled', () => {
    const button = createPlainButton();
    setDisabled(button, true);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    setDisabled(button, false);
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });
});

describe('createCommandButton', () => {
  let editor: MockEditor;
  let host: HTMLElement;

  beforeEach(() => {
    editor = createMockEditor();
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('exécute la commande au click, redonne le focus, et garde le focus au mousedown', () => {
    const widget = createCommandButton(editor, { type: 'button', command: 'bold' });
    expect(widget).not.toBeNull();
    const button = widget?.element as HTMLButtonElement;
    host.append(button);
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
    expect(editor.calls).toEqual([]);
    button.click();
    expect(editor.calls).toEqual([{ id: 'bold', args: undefined }]);
    expect(editor.focusCalls).toBe(1);
    widget?.destroy();
  });

  it('retourne null pour une commande inconnue', () => {
    expect(createCommandButton(editor, { type: 'button', command: 'ghost' })).toBeNull();
  });
});
