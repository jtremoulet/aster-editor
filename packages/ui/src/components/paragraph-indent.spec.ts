import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import {
  createIndentButton,
  currentIndentLeft,
  isInList,
  nextIndentLeft,
} from './paragraph-indent';
import { INDENT_STEP_PT } from './paragraph-layout';

describe('nextIndentLeft', () => {
  it('ajoute ou retire 18 pt, borné à 0, arrondi au centième', () => {
    expect(INDENT_STEP_PT).toBe(18);
    expect(nextIndentLeft(0, 'increase')).toBe(18);
    expect(nextIndentLeft(18, 'increase')).toBe(36);
    expect(nextIndentLeft(36, 'decrease')).toBe(18);
    expect(nextIndentLeft(10, 'decrease')).toBe(0);
    expect(nextIndentLeft(0, 'decrease')).toBe(0);
    expect(nextIndentLeft(0.1 + 0.2, 'increase')).toBe(18.3);
  });
});

describe('createIndentButton', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let increase: ToolbarWidget;
  let decrease: ToolbarWidget;

  const mount = (commands?: readonly string[]): void => {
    editor = createMockEditor(commands ? { commands } : {});
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    increase = createIndentButton(editor, 'increase');
    decrease = createIndentButton(editor, 'decrease');
    host.append(increase.element, decrease.element);
  };

  beforeEach(() => mount());

  afterEach(() => {
    increase.destroy();
    decrease.destroy();
    host.remove();
  });

  const button = (widget: ToolbarWidget): HTMLButtonElement => widget.element as HTMLButtonElement;

  it('rend deux boutons de toolbar avec icône, libellé i18n et sans aria-pressed', () => {
    expect(button(increase).getAttribute('aria-label')).toBe('Increase indent');
    expect(button(decrease).getAttribute('aria-label')).toBe('Decrease indent');
    expect(button(increase).hasAttribute('data-toolbar-item')).toBe(true);
    expect(button(increase).querySelector('.aster-toolbar__icon svg')).not.toBeNull();
    expect(button(increase).hasAttribute('aria-pressed')).toBe(false);
    expect(button(increase).dataset['widget']).toBe('indentIncrease');
    expect(button(decrease).dataset['widget']).toBe('indentDecrease');
    expect(button(increase).disabled).toBe(false);
    // Retrait nul : rien à diminuer.
    expect(button(decrease).disabled).toBe(true);
  });

  it('hors liste, augmente indentLeftPt de 18 pt via paragraph.setLayout puis refocalise', () => {
    button(increase).click();
    expect(editor.calls).toEqual([{ id: 'paragraph.setLayout', args: { indentLeftPt: 18 } }]);
    expect(editor.focusCalls).toBe(1);
    editor.attributes.set('paragraph', { indentLeftPt: 18 });
    expect(currentIndentLeft(editor)).toBe(18);
    button(increase).click();
    expect(editor.calls[1]).toEqual({ id: 'paragraph.setLayout', args: { indentLeftPt: 36 } });
  });

  it('diminue borné à 0 et se désactive à 0, y compris sur un titre', () => {
    editor.attributes.set('heading', { level: 2, indentLeftPt: 10 });
    decrease.update();
    expect(button(decrease).disabled).toBe(false);
    button(decrease).click();
    expect(editor.calls).toEqual([{ id: 'paragraph.setLayout', args: { indentLeftPt: 0 } }]);
    editor.attributes.set('heading', { level: 2, indentLeftPt: 0 });
    decrease.update();
    expect(button(decrease).disabled).toBe(true);
    button(decrease).click();
    expect(editor.calls).toHaveLength(1);
  });

  it('dans une liste, délègue à indent / outdent du core', () => {
    editor.activeNodes.add('bulletList');
    expect(isInList(editor)).toBe(true);
    increase.update();
    decrease.update();
    expect(button(decrease).disabled).toBe(false);
    button(increase).click();
    button(decrease).click();
    expect(editor.calls).toEqual([
      { id: 'indent', args: undefined },
      { id: 'outdent', args: undefined },
    ]);
  });

  it('dans une liste sans commande de liste exécutable, retombe sur le paragraphe', () => {
    editor.activeNodes.add('orderedList');
    editor.disabled.add('indent');
    button(increase).click();
    expect(editor.calls).toEqual([{ id: 'paragraph.setLayout', args: { indentLeftPt: 18 } }]);
    increase.destroy();
    decrease.destroy();
    host.remove();
    mount(['paragraph.setLayout', 'paragraph.unsetLayout']);
    editor.activeNodes.add('taskList');
    button(increase).click();
    expect(editor.calls).toEqual([{ id: 'paragraph.setLayout', args: { indentLeftPt: 18 } }]);
  });

  it('se désactive sans paragraph.setLayout ni liste, et en lecture seule', () => {
    editor.disabled.add('paragraph.setLayout');
    increase.update();
    expect(button(increase).disabled).toBe(true);
    editor.disabled.delete('paragraph.setLayout');
    editor.setReadOnly(true);
    increase.update();
    expect(button(increase).disabled).toBe(true);
  });

  it('suit la locale et neutralise le mousedown', () => {
    editor.i18n.setLocale('fr');
    increase.update();
    expect(button(increase).getAttribute('aria-label')).toBe('Augmenter le retrait');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button(increase).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('destroy retire l’écouteur de clic', () => {
    increase.destroy();
    button(increase).click();
    expect(editor.calls).toEqual([]);
  });
});
