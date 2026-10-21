import type { AsterEditor } from '@aster-editor/core';
import { escapeHtml } from '@aster-editor/core';
import type { ToolbarWidget } from '../types.js';
import { el, enabledElements } from '../utils/dom.js';
import { setDisabled } from './button.js';
import { createDropdown, type Dropdown } from './dropdown.js';

/** Un caractère insérable : la chaîne insérée, un glyphe d'affichage et un libellé optionnels. */
export interface SpecialChar {
  readonly char: string;
  /** Glyphe visible quand le caractère lui-même ne se voit pas (espace insécable). */
  readonly glyph?: string;
  /** Clé i18n du libellé accessible ; le caractère lui-même sinon. */
  readonly labelKey?: string;
}

/** Un onglet du panneau : identifiant, clé i18n et caractères. */
export interface SpecialCharGroup {
  readonly id: string;
  readonly labelKey: string;
  readonly chars: readonly SpecialChar[];
}

const NBSP = String.fromCharCode(160);

/** Symboles typographiques et mathématiques courants. */
const SYMBOLS: readonly SpecialChar[] = [
  ...'→←↑↓…–—«»€£¥©®™°±×÷≠≤≥∞§¶†'.split('').map((char) => ({ char })),
  { char: NBSP, glyph: '⍽', labelKey: 'ui.specialChars.nbsp' },
];

/** Vingt emojis courants. */
const EMOJIS: readonly SpecialChar[] = [
  '😀',
  '😂',
  '😍',
  '🤔',
  '😢',
  '👍',
  '👎',
  '👏',
  '🙏',
  '💪',
  '🎉',
  '❤️',
  '🔥',
  '✅',
  '❌',
  '⚠️',
  '⭐',
  '💡',
  '📌',
  '🚀',
].map((char) => ({ char }));

/** Onglets du widget, dans l'ordre d'affichage. */
export const SPECIAL_CHAR_GROUPS: readonly SpecialCharGroup[] = [
  { id: 'symbols', labelKey: 'ui.specialChars.symbols', chars: SYMBOLS },
  { id: 'emojis', labelKey: 'ui.specialChars.emojis', chars: EMOJIS },
];

/** Colonnes de la grille, pour la navigation haut/bas. Doit suivre `print.css`. */
export const SPECIAL_CHARS_COLUMNS = 7;

/** Sélecteur des cellules de la grille. */
const CELL_SELECTOR = '.aster-special-chars__char';

/**
 * Widget `specialChars` : dropdown à onglets (symboles, emojis) dont chaque cellule
 * insère son caractère à la position courante via `insertHTML` (échappé : le schéma
 * reçoit du texte, jamais de balise). Le panneau est un `dialog` : les onglets se
 * parcourent aux flèches gauche/droite, la grille aux quatre flèches, Home et End.
 * Le dernier onglet choisi est mémorisé pour la durée du widget.
 */
export function createSpecialChars(editor: AsterEditor): ToolbarWidget {
  let activeGroup = SPECIAL_CHAR_GROUPS[0]?.id ?? 'symbols';

  const insert = (dropdown: Dropdown, char: string): void => {
    dropdown.close(false);
    editor.insertHTML(escapeHtml(char));
  };

  const renderGrid = (grid: HTMLElement, group: SpecialCharGroup, dropdown: Dropdown): void => {
    grid.replaceChildren();
    grid.setAttribute('aria-label', editor.i18n.t(group.labelKey));
    group.chars.forEach((entry, index) => {
      const name = entry.labelKey ? editor.i18n.t(entry.labelKey) : entry.char;
      const cell = el('button', {
        className: 'aster-toolbar__button aster-special-chars__char',
        attrs: {
          type: 'button',
          'data-char': entry.char,
          'aria-label': editor.i18n.t('ui.specialChars.insert', { char: name }),
          title: name,
        },
        text: entry.glyph ?? entry.char,
      });
      cell.tabIndex = index === 0 ? 0 : -1;
      setDisabled(cell, false);
      cell.addEventListener('click', () => insert(dropdown, entry.char));
      grid.append(cell);
    });
  };

  const dropdown = createDropdown({
    editor,
    labelKey: 'ui.specialChars.title',
    icon: 'special-chars',
    panelRole: 'dialog',
    panelClass: 'aster-dialog aster-special-chars',
    renderPanel: (panel, instance) => {
      panel.setAttribute('aria-label', editor.i18n.t('ui.specialChars.title'));
      const tabs = el('div', {
        className: 'aster-special-chars__tabs',
        attrs: { role: 'tablist' },
      });
      const grid = el('div', { className: 'aster-special-chars__grid', attrs: { role: 'group' } });
      const tabButtons: HTMLButtonElement[] = [];

      const select = (group: SpecialCharGroup, focusGrid: boolean): void => {
        activeGroup = group.id;
        for (const tab of tabButtons) {
          const selected = tab.dataset['group'] === group.id;
          tab.setAttribute('aria-selected', selected ? 'true' : 'false');
          tab.classList.toggle('aster-special-chars__tab--active', selected);
          tab.tabIndex = selected ? 0 : -1;
        }
        renderGrid(grid, group, instance);
        if (focusGrid) grid.querySelector<HTMLElement>(CELL_SELECTOR)?.focus();
      };

      for (const group of SPECIAL_CHAR_GROUPS) {
        const tab = el('button', {
          className: 'aster-toolbar__button aster-special-chars__tab',
          attrs: {
            type: 'button',
            role: 'tab',
            'data-group': group.id,
            'aria-selected': 'false',
          },
          text: editor.i18n.t(group.labelKey),
        });
        tab.addEventListener('click', () => select(group, false));
        tabButtons.push(tab);
        tabs.append(tab);
      }

      tabs.addEventListener('keydown', (event) => {
        const index = tabButtons.findIndex((tab) => tab === document.activeElement);
        if (index === -1) return;
        let target: number | null = null;
        if (event.key === 'ArrowRight') target = (index + 1) % tabButtons.length;
        if (event.key === 'ArrowLeft') target = (index - 1 + tabButtons.length) % tabButtons.length;
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = tabButtons.length - 1;
        const group = target === null ? undefined : SPECIAL_CHAR_GROUPS[target];
        if (!group) return;
        event.preventDefault();
        select(group, false);
        tabButtons[target ?? 0]?.focus();
      });

      grid.addEventListener('keydown', (event) => {
        const cells = enabledElements(grid, CELL_SELECTOR);
        const index = cells.findIndex((cell) => cell === document.activeElement);
        if (index === -1) return;
        const count = cells.length;
        let target: number | null = null;
        if (event.key === 'ArrowRight') target = (index + 1) % count;
        if (event.key === 'ArrowLeft') target = (index - 1 + count) % count;
        if (event.key === 'ArrowDown') target = Math.min(index + SPECIAL_CHARS_COLUMNS, count - 1);
        if (event.key === 'ArrowUp') target = Math.max(index - SPECIAL_CHARS_COLUMNS, 0);
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = count - 1;
        if (target === null) return;
        event.preventDefault();
        event.stopPropagation();
        for (const cell of cells) cell.tabIndex = -1;
        const next = cells[target];
        if (next) {
          next.tabIndex = 0;
          next.focus();
        }
      });

      panel.append(tabs, grid);
      const initial =
        SPECIAL_CHAR_GROUPS.find((group) => group.id === activeGroup) ?? SPECIAL_CHAR_GROUPS[0];
      if (initial) select(initial, false);
      // Le focus initial du dropdown prend le premier `[autofocus]` : on le pose sur la
      // première cellule de la grille, c'est elle que l'on veut au clavier.
      grid.querySelector<HTMLElement>(CELL_SELECTOR)?.setAttribute('autofocus', '');
    },
  });

  return dropdown;
}
