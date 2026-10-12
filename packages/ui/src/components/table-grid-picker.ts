import type { AsterEditor, StandardCommandId } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el } from '../utils/dom';
import { resolveIcon } from './button';
import { createDropdown, createMenuItem } from './dropdown';

/** Dimensions de la grille de sélection. */
export const TABLE_GRID_COLS = 10;
export const TABLE_GRID_ROWS = 8;

/** Commandes `table.*` sans argument, hors insertion. */
export type TableAction = Exclude<Extract<StandardCommandId, `table.${string}`>, 'table.insert'>;

/** Commandes de table exposées une fois le curseur dans un tableau, dans l'ordre d'affichage. */
export const TABLE_ACTIONS: readonly TableAction[] = [
  'table.addRowBefore',
  'table.addRowAfter',
  'table.deleteRow',
  'table.addColumnBefore',
  'table.addColumnAfter',
  'table.deleteColumn',
  'table.mergeCells',
  'table.splitCell',
  'table.toggleHeaderRow',
  'table.toggleHeaderColumn',
  'table.delete',
];

/** Vrai si le curseur est dans un tableau, tolérant si l'extension manque. */
function isInTable(editor: AsterEditor): boolean {
  try {
    return editor.tiptap.isActive('table');
  } catch {
    return false;
  }
}

/**
 * Widget `table` : grille 10×8 survolable dont le clic insère `{ rows, cols,
 * withHeaderRow: true }`. Quand le curseur est déjà dans un tableau, le même menu
 * ajoute les actions `table.*` exécutables (`canRun`) sous la grille.
 */
export function createTableGridPicker(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'command.table.insert',
    icon: 'table-insert',
    panelClass: 'aster-menu aster-table-picker',
    isEnabled: () =>
      editor.commands.canRun('table.insert', { rows: 1, cols: 1 }) ||
      TABLE_ACTIONS.some((id) => editor.commands.has(id) && editor.commands.canRun(id)),
    isActive: () => isInTable(editor),
    renderPanel: (panel, dropdown) => {
      const canInsert = editor.commands.canRun('table.insert', { rows: 1, cols: 1 });
      if (canInsert) renderGrid(editor, panel, dropdown.close);
      if (isInTable(editor)) renderActions(editor, panel, dropdown.close);
    },
  });
}

function renderGrid(editor: AsterEditor, panel: HTMLElement, close: () => void): void {
  const sizeLabel = el('div', {
    className: 'aster-table-picker__size',
    attrs: { 'aria-live': 'polite' },
    text: editor.i18n.t('ui.table.grid'),
  });
  const grid = el('div', {
    className: 'aster-table-picker__grid',
    attrs: { role: 'group', 'aria-label': editor.i18n.t('ui.table.grid') },
  });
  grid.style.setProperty('--aster-table-grid-cols', String(TABLE_GRID_COLS));

  const cells: HTMLButtonElement[] = [];
  const highlight = (rows: number, cols: number): void => {
    for (const cell of cells) {
      const r = Number(cell.dataset['row']);
      const c = Number(cell.dataset['col']);
      cell.classList.toggle('aster-table-picker__cell--hover', r <= rows && c <= cols);
    }
    sizeLabel.textContent =
      rows > 0 ? editor.i18n.t('ui.table.size', { rows, cols }) : editor.i18n.t('ui.table.grid');
  };

  for (let row = 1; row <= TABLE_GRID_ROWS; row++) {
    for (let col = 1; col <= TABLE_GRID_COLS; col++) {
      const cell = el('button', {
        className: 'aster-table-picker__cell',
        attrs: {
          type: 'button',
          role: 'menuitem',
          'aria-label': editor.i18n.t('ui.table.size', { rows: row, cols: col }),
          'data-row': String(row),
          'data-col': String(col),
        },
      });
      cell.tabIndex = -1;
      cell.addEventListener('mouseenter', () => highlight(row, col));
      cell.addEventListener('focus', () => highlight(row, col));
      cell.addEventListener('click', () => {
        editor.commands.run('table.insert', { rows: row, cols: col, withHeaderRow: true });
        close();
        editor.focus();
      });
      cells.push(cell);
      grid.append(cell);
    }
  }
  grid.addEventListener('mouseleave', () => highlight(0, 0));
  panel.append(sizeLabel, grid);
}

function renderActions(editor: AsterEditor, panel: HTMLElement, close: () => void): void {
  const available = TABLE_ACTIONS.filter(
    (id) => editor.commands.has(id) && editor.commands.canRun(id),
  );
  if (available.length === 0) return;
  const section = el('div', {
    className: 'aster-table-picker__actions',
    attrs: { role: 'group', 'aria-label': editor.i18n.t('ui.table.actions') },
  });
  for (const id of available) {
    const command = editor.commands.get(id);
    if (!command) continue;
    section.append(
      createMenuItem({
        text: editor.i18n.t(command.labelKey),
        icon: resolveIcon(id, undefined, command.icon),
        onSelect: () => {
          editor.commands.run(id);
          close();
          editor.focus();
        },
      }),
    );
  }
  panel.append(section);
}
