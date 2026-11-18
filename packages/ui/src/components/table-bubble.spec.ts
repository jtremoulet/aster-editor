import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor.js';
import { registerUiTranslations } from '../toolbar/create-toolbar.js';
import type { Bubble } from './bubble.js';
import { TABLE_BUBBLE_ACTIONS, createTableBubble, currentTablePos } from './table-bubble.js';

describe('createTableBubble', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let bubble: Bubble;

  const mount = (options?: Parameters<typeof createMockEditor>[0]): void => {
    editor = createMockEditor(options);
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    host.append(editor.element);
    bubble = createTableBubble(editor);
  };

  beforeEach(() => mount());

  afterEach(() => {
    bubble.destroy();
    host.remove();
  });

  const enterTable = (inside = true): void => {
    if (inside) editor.activeNodes.add('table');
    else editor.activeNodes.delete('table');
    editor.emit('selectionChange', { editor });
  };
  const buttons = (): HTMLButtonElement[] =>
    Array.from(bubble.element.querySelectorAll<HTMLButtonElement>('button'));
  const button = (id: string): HTMLButtonElement => {
    const found = buttons().find((candidate) => candidate.dataset['command'] === id);
    if (!found) throw new Error(`bouton ${id} introuvable`);
    return found;
  };

  it('apparaît dans un tableau avec ligne, colonne, Vider et Supprimer, disparaît en sortant', () => {
    expect(bubble.isOpen()).toBe(false);
    enterTable();
    expect(bubble.isOpen()).toBe(true);
    expect(bubble.element.classList.contains('aster-table-bubble')).toBe(true);
    expect(bubble.element.getAttribute('aria-label')).toBe('Table actions');
    expect(buttons().map((candidate) => candidate.dataset['command'])).toEqual(
      TABLE_BUBBLE_ACTIONS.flatMap((action) => (action === 'separator' ? [] : [action.id])),
    );
    expect(bubble.element.querySelectorAll('.aster-bubble__separator').length).toBe(1);
    // Les deux actions demandées sont écrites en clair, les autres en icône seule.
    expect(button('table.clear').textContent).toBe('Clear');
    expect(button('table.clear').getAttribute('aria-label')).toBe('Clear table');
    expect(button('table.delete').textContent).toBe('Delete');
    expect(button('table.delete').title).toBe('Delete table');
    expect(button('table.delete').classList.contains('aster-bubble__button--danger')).toBe(true);
    expect(button('table.addRowAfter').textContent).toBe('');
    expect(button('table.addRowAfter').querySelector('svg')).not.toBeNull();
    enterTable(false);
    expect(bubble.isOpen()).toBe(false);
    expect(buttons()).toEqual([]);
  });

  it('chaque bouton lance sa commande ; Supprimer referme la bulle', () => {
    enterTable();
    button('table.clear').click();
    expect(editor.calls).toEqual([{ id: 'table.clear', args: undefined }]);
    expect(bubble.isOpen()).toBe(true);
    button('table.addColumnAfter').click();
    // Le tableau vient d'être supprimé : la sélection n'y est plus.
    editor.activeNodes.delete('table');
    button('table.delete').click();
    expect(editor.calls.map((call) => call.id)).toEqual([
      'table.clear',
      'table.addColumnAfter',
      'table.delete',
    ]);
    expect(bubble.isOpen()).toBe(false);
  });

  it('grise une commande non exécutable et se reconstruit quand elle le redevient', () => {
    editor.disabled.add('table.clear');
    enterTable();
    expect(button('table.clear').disabled).toBe(true);
    button('table.clear').click();
    expect(editor.calls).toEqual([]);
    editor.disabled.delete('table.clear');
    editor.emit('selectionChange', { editor });
    expect(button('table.clear').disabled).toBe(false);
  });

  it('reste cachée en lecture seule et quand une image est sélectionnée', () => {
    enterTable();
    editor.setReadOnly(true);
    expect(bubble.isOpen()).toBe(false);
    editor.setReadOnly(false);
    expect(bubble.isOpen()).toBe(true);
    editor.activeNodes.add('image');
    editor.emit('selectionChange', { editor });
    expect(bubble.isOpen()).toBe(false);
  });

  it('omet les commandes absentes du registre, sans séparateur orphelin, et ne s’ouvre pas sans aucune', () => {
    bubble.destroy();
    host.remove();
    mount({ commands: ['table.delete', 'bold'] });
    enterTable();
    expect(buttons().map((candidate) => candidate.dataset['command'])).toEqual(['table.delete']);
    expect(bubble.element.querySelectorAll('.aster-bubble__separator').length).toBe(0);
    bubble.destroy();
    host.remove();
    mount({ commands: ['bold'] });
    enterTable();
    expect(bubble.isOpen()).toBe(false);
  });

  it('currentTablePos vaut -1 sans état ProseMirror (éditeur de test)', () => {
    expect(currentTablePos(editor)).toBe(-1);
  });

  it('se désabonne à la destruction', () => {
    const before = editor.listenerCount();
    const other = createTableBubble(editor);
    expect(editor.listenerCount()).toBeGreaterThan(before);
    other.destroy();
    expect(editor.listenerCount()).toBe(before);
  });
});
