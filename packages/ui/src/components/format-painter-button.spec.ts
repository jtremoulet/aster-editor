import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FORMAT_PAINTER_CHANGE_EVENT } from '@aster-editor/core';
import { createMockEditor, type MockEditor } from '../testing/mock-editor.js';
import { registerUiTranslations } from '../toolbar/create-toolbar.js';
import { FORMAT_PAINTER_LOCKED_CLASS, createFormatPainterButton } from './format-painter-button.js';
import type { FormatPainterButton } from './format-painter-button.js';

const COMMANDS = ['bold', 'formatPainter.copy', 'formatPainter.paste'];

describe('createFormatPainterButton', () => {
  let editor: MockEditor;
  let widget: FormatPainterButton;

  beforeEach(() => {
    editor = createMockEditor({
      commands: COMMANDS,
      shortcuts: { 'formatPainter.copy': 'Mod-Shift-c' },
    });
    registerUiTranslations(editor);
    widget = createFormatPainterButton(editor);
  });

  afterEach(() => {
    widget.destroy();
  });

  /** Le mock n'a pas de presse-papier : l'état « chargé » est piloté par `active`. */
  const load = (loaded: boolean): void => {
    if (loaded) editor.active.add('formatPainter.copy');
    else editor.active.delete('formatPainter.copy');
    editor.element.dispatchEvent(new CustomEvent(FORMAT_PAINTER_CHANGE_EVENT, { bubbles: true }));
  };
  const button = (): HTMLButtonElement => widget.element as HTMLButtonElement;

  it('rend un bouton de toolbar relâché avec libellé, raccourci et icône', () => {
    expect(button().getAttribute('data-toolbar-item')).toBe('');
    expect(button().dataset['widget']).toBe('formatPainter');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().getAttribute('aria-label')).toBe('Format painter');
    expect(button().getAttribute('title')).toBe('Format painter (Ctrl+Shift+C)');
    expect(button().querySelector('svg')).not.toBeNull();
    expect(widget.isLoaded()).toBe(false);
    expect(widget.isLocked()).toBe(false);
  });

  it('un clic copie quand le presse-papier est vide, puis applique et vide', () => {
    button().click();
    expect(editor.calls).toEqual([{ id: 'formatPainter.copy', args: undefined }]);
    expect(editor.focusCalls).toBe(1);
    load(true);
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().classList.contains('aster-toolbar__button--active')).toBe(true);
    expect(button().getAttribute('aria-label')).toBe(
      'Format painter: click to apply, double-click to lock',
    );
    button().click();
    expect(editor.calls[1]).toEqual({ id: 'formatPainter.paste', args: undefined });
    // `clearFormatClipboard` est un no-op sur le mock : on simule l'événement du core.
    load(false);
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('un double-clic verrouille : les clics appliquent sans vider, un second double-clic libère', () => {
    load(true);
    button().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(editor.calls).toEqual([{ id: 'formatPainter.copy', args: undefined }]);
    expect(widget.isLocked()).toBe(true);
    expect(button().classList.contains(FORMAT_PAINTER_LOCKED_CLASS)).toBe(true);
    expect(button().getAttribute('aria-label')).toBe(
      'Format painter locked: double-click to unlock',
    );
    button().click();
    expect(editor.calls[1]).toEqual({ id: 'formatPainter.paste', args: undefined });
    expect(widget.isLocked()).toBe(true);
    button().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(widget.isLocked()).toBe(false);
    expect(button().classList.contains(FORMAT_PAINTER_LOCKED_CLASS)).toBe(false);
    expect(editor.calls.length).toBe(2);
  });

  it('suit l’événement aster:format-painter-change (raccourci clavier) et se désactive en lecture seule', () => {
    load(true);
    expect(widget.isLoaded()).toBe(true);
    expect(button().getAttribute('aria-pressed')).toBe('true');
    editor.setReadOnly(true);
    widget.update();
    expect(button().disabled).toBe(true);
    button().click();
    button().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(editor.calls).toEqual([]);
    widget.destroy();
    load(false);
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });
});
