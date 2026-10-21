import type { AsterEditor, SearchOpenEventDetail } from '@aster-editor/core';
import { SEARCH_OPEN_EVENT } from '@aster-editor/core';
import { getIcon } from '../icons/index.js';
import type { ToolbarWidget } from '../types.js';
import { el, setIcon } from '../utils/dom.js';
import { createPlainButton, setDisabled } from './button.js';
import { createDropdown } from './dropdown.js';

/** État de recherche tel que l'UI en a besoin. */
export interface SearchPanelState {
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly total: number;
  /** Numéro 1-based de la correspondance courante, `0` s'il n'y en a pas. */
  readonly current: number;
}

const EMPTY_STATE: SearchPanelState = { query: '', caseSensitive: false, total: 0, current: 0 };

/**
 * Lit `editor.tiptap.storage.search` sans supposer que l'extension est présente : un
 * éditeur de test ou un core sans recherche donne l'état vide plutôt qu'une exception.
 */
export function readSearchState(editor: AsterEditor): SearchPanelState {
  try {
    const tiptap: unknown = editor.tiptap;
    if (typeof tiptap !== 'object' || tiptap === null || !('storage' in tiptap)) {
      return EMPTY_STATE;
    }
    const storage: unknown = (tiptap as { storage?: { search?: unknown } }).storage?.search;
    if (typeof storage !== 'object' || storage === null) return EMPTY_STATE;
    const { query, caseSensitive, matches, currentIndex } = storage as {
      query?: unknown;
      caseSensitive?: unknown;
      matches?: unknown;
      currentIndex?: unknown;
    };
    const total = Array.isArray(matches) ? matches.length : 0;
    const index = typeof currentIndex === 'number' ? currentIndex : -1;
    return {
      query: typeof query === 'string' ? query : '',
      caseSensitive: caseSensitive === true,
      total,
      current: index >= 0 && index < total ? index + 1 : 0,
    };
  } catch {
    return EMPTY_STATE;
  }
}

/** Bouton d'icône pour le panneau (hors navigation toolbar). */
function iconButton(className: string, svg: string, label: string): HTMLButtonElement {
  const button = createPlainButton({ className });
  const icon = el('span', { className: 'aster-toolbar__icon' });
  setIcon(icon, svg);
  button.append(icon);
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}

/**
 * Widget `search` : panneau « rechercher / remplacer » dans un dropdown `dialog`.
 *
 * Tout passe par le registre : la saisie lance `search.open` avec la requête (ou
 * `search.clear` si vide), les boutons appellent `search.next`, `search.previous`,
 * `search.replace`, `search.replaceAll`, « Fermer » et Échap effacent puis referment. Le panneau
 * s'ouvre aussi sur l'événement `aster:search-open` émis par `search.open` (`Mod-f`).
 * Le compteur `n / total` est lu dans le storage du core après chaque action et à
 * chaque `update()` de la toolbar.
 */
export function createSearchPanel(editor: AsterEditor): ToolbarWidget {
  let refresh: (() => void) | null = null;
  let queryInput: HTMLInputElement | null = null;

  const dropdown = createDropdown({
    editor,
    labelKey: 'ui.search.title',
    panelRole: 'dialog',
    panelClass: 'aster-dialog aster-search-panel',
    isEnabled: () => editor.commands.canRun('search.open'),
    isActive: () => editor.commands.isActive('search.open'),
    renderPanel: (panel) => {
      const t = (key: string, params?: Record<string, string | number>): string =>
        editor.i18n.t(key, params);
      const initial = readSearchState(editor);
      panel.setAttribute('aria-label', t('ui.search.title'));
      const suffix = Math.random().toString(36).slice(2, 8);

      const query = el('input', {
        className: 'aster-dialog__input aster-search-panel__query',
        attrs: {
          type: 'text',
          id: `aster-search-query-${suffix}`,
          autocomplete: 'off',
          placeholder: t('ui.search.query'),
          'aria-label': t('ui.search.query'),
          autofocus: '',
        },
      });
      query.value = initial.query;
      queryInput = query;

      const count = el('span', {
        className: 'aster-search-panel__count',
        attrs: { 'aria-live': 'polite' },
      });
      const previous = iconButton(
        'aster-search-panel__nav',
        getIcon('search-previous'),
        t('ui.search.previous'),
      );
      const next = iconButton(
        'aster-search-panel__nav',
        getIcon('search-next'),
        t('ui.search.next'),
      );

      const caseBox = el('input', {
        className: 'aster-dialog__checkbox',
        attrs: { type: 'checkbox' },
      });
      caseBox.checked = initial.caseSensitive;
      const caseLabel = el('label', { className: 'aster-dialog__check' }, [
        caseBox,
        t('ui.search.caseSensitive'),
      ]);

      const replacement = el('input', {
        className: 'aster-dialog__input aster-search-panel__replacement',
        attrs: {
          type: 'text',
          id: `aster-search-replacement-${suffix}`,
          autocomplete: 'off',
          placeholder: t('ui.search.replacement'),
          'aria-label': t('ui.search.replacement'),
        },
      });

      const replace = createPlainButton({
        className: 'aster-dialog__button aster-search-panel__replace',
        text: t('ui.search.replace'),
      });
      const replaceAll = createPlainButton({
        className: 'aster-dialog__button aster-search-panel__replace-all',
        text: t('ui.search.replaceAll'),
      });
      const close = createPlainButton({
        className: 'aster-dialog__button aster-dialog__button--primary aster-search-panel__close',
        text: t('ui.search.close'),
      });

      const args = (): { query: string; caseSensitive: boolean; replacement: string } => ({
        query: query.value,
        caseSensitive: caseBox.checked,
        replacement: replacement.value,
      });

      const sync = (): void => {
        const state = readSearchState(editor);
        count.textContent = t('ui.search.count', { current: state.current, total: state.total });
        const hasMatches = state.total > 0;
        setDisabled(previous, !hasMatches);
        setDisabled(next, !hasMatches);
        setDisabled(replace, !hasMatches || !editor.commands.canRun('search.replace', args()));
        setDisabled(
          replaceAll,
          !hasMatches || !editor.commands.canRun('search.replaceAll', args()),
        );
      };
      refresh = sync;

      const search = (): void => {
        const { query: value, caseSensitive } = args();
        if (value.length === 0) editor.commands.run('search.clear');
        else editor.commands.run('search.open', { query: value, caseSensitive });
        sync();
      };
      const run = (id: string): void => {
        editor.commands.run(id, args());
        sync();
      };

      query.addEventListener('input', search);
      caseBox.addEventListener('change', search);
      query.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        run(event.shiftKey ? 'search.previous' : 'search.next');
      });
      replacement.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        run('search.replace');
      });
      previous.addEventListener('click', () => run('search.previous'));
      next.addEventListener('click', () => run('search.next'));
      replace.addEventListener('click', () => run('search.replace'));
      replaceAll.addEventListener('click', () => run('search.replaceAll'));
      close.addEventListener('click', () => {
        editor.commands.run('search.clear');
        dropdown.close(true);
        editor.focus();
      });

      panel.append(
        el('div', { className: 'aster-search-panel__row' }, [query, count, previous, next]),
        el('div', { className: 'aster-dialog__field' }, [caseLabel]),
        el('div', { className: 'aster-search-panel__row' }, [replacement, replace, replaceAll]),
        el('div', { className: 'aster-dialog__actions' }, [close]),
      );
      sync();
    },
  });

  const triggerIcon = el('span', { className: 'aster-toolbar__icon' });
  setIcon(triggerIcon, getIcon('search'));
  dropdown.trigger.prepend(triggerIcon);

  // Échap dans le panneau : même effet que « Fermer », le surlignage est effacé avant
  // que le dropdown ne se referme (écouté en capture pour passer avant lui).
  const onPanelKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') editor.commands.run('search.clear');
  };
  dropdown.panel.addEventListener('keydown', onPanelKeyDown, true);

  const onSearchOpen = (event: Event): void => {
    // Signale au core que le panneau prend la main : Mod-f est alors consommé.
    event.preventDefault();
    const detail = (event as CustomEvent<SearchOpenEventDetail | undefined>).detail;
    if (!dropdown.isOpen()) dropdown.open();
    if (!dropdown.isOpen() || !queryInput) return;
    if (detail?.query !== undefined && queryInput.value !== detail.query) {
      queryInput.value = detail.query;
    }
    refresh?.();
    if (document.activeElement !== queryInput) queryInput.focus();
  };
  editor.element.addEventListener(SEARCH_OPEN_EVENT, onSearchOpen);

  return {
    element: dropdown.element,
    update: () => {
      dropdown.update();
      if (dropdown.isOpen()) refresh?.();
    },
    destroy: () => {
      editor.element.removeEventListener(SEARCH_OPEN_EVENT, onSearchOpen);
      dropdown.panel.removeEventListener('keydown', onPanelKeyDown, true);
      refresh = null;
      queryInput = null;
      dropdown.destroy();
    },
  };
}
