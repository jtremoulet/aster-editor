import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { Dropdown } from './dropdown';
import { TABLE_GRID_COLS, TABLE_GRID_ROWS, createTableGridPicker } from './table-grid-picker';

describe('createTableGridPicker', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let picker: Dropdown;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    picker = createTableGridPicker(editor) as Dropdown;
    host.append(picker.element);
  });

  afterEach(() => {
    host.remove();
  });

  const cell = (row: number, col: number): HTMLButtonElement =>
    picker.panel.querySelector<HTMLButtonElement>(`[data-row="${row}"][data-col="${col}"]`)!;

  it('rend une grille 10×8 de cellules nommées', () => {
    expect(picker.trigger.getAttribute('aria-label')).toBe('Insert table');
    picker.open();
    const cells = picker.panel.querySelectorAll('.aster-table-picker__cell');
    expect(cells.length).toBe(TABLE_GRID_COLS * TABLE_GRID_ROWS);
    expect(cell(3, 2).getAttribute('aria-label')).toBe('3 × 2 table');
    expect(picker.panel.querySelector('.aster-table-picker__actions')).toBeNull();
  });

  it('le survol surligne le rectangle et met à jour le libellé de taille', () => {
    picker.open();
    cell(3, 2).dispatchEvent(new MouseEvent('mouseenter'));
    expect(cell(1, 1).classList.contains('aster-table-picker__cell--hover')).toBe(true);
    expect(cell(3, 2).classList.contains('aster-table-picker__cell--hover')).toBe(true);
    expect(cell(4, 2).classList.contains('aster-table-picker__cell--hover')).toBe(false);
    expect(cell(3, 3).classList.contains('aster-table-picker__cell--hover')).toBe(false);
    expect(picker.panel.querySelector('.aster-table-picker__size')?.textContent).toBe(
      '3 × 2 table',
    );
    picker.panel
      .querySelector('.aster-table-picker__grid')
      ?.dispatchEvent(new MouseEvent('mouseleave'));
    expect(cell(1, 1).classList.contains('aster-table-picker__cell--hover')).toBe(false);
  });

  it('le clic sur la cellule 3×2 insère { rows: 3, cols: 2, withHeaderRow: true }', () => {
    picker.open();
    cell(3, 2).click();
    expect(editor.calls).toEqual([
      { id: 'table.insert', args: { rows: 3, cols: 2, withHeaderRow: true } },
    ]);
    expect(picker.isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('dans un tableau, expose les actions table.* exécutables', () => {
    editor.activeNodes.add('table');
    editor.disabled.add('table.mergeCells');
    picker.update();
    expect(picker.trigger.getAttribute('aria-pressed')).toBe('true');
    picker.open();
    const actions = picker.panel.querySelectorAll<HTMLButtonElement>(
      '.aster-table-picker__actions [role="menuitem"]',
    );
    expect(actions.length).toBe(10);
    const labels = Array.from(actions).map((a) => a.textContent);
    expect(labels).toContain('Delete table');
    expect(labels).not.toContain('Merge cells');
    Array.from(actions)
      .find((a) => a.textContent === 'Delete row')
      ?.click();
    expect(editor.calls).toEqual([{ id: 'table.deleteRow', args: undefined }]);
  });

  it('sans table.insert exécutable mais dans un tableau, n’affiche que les actions', () => {
    editor.activeNodes.add('table');
    editor.disabled.add('table.insert');
    picker.update();
    expect(picker.trigger.disabled).toBe(false);
    picker.open();
    expect(picker.panel.querySelector('.aster-table-picker__grid')).toBeNull();
    expect(picker.panel.querySelector('.aster-table-picker__actions')).not.toBeNull();
  });
});
