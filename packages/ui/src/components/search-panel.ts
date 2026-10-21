import type { AsterEditor, SearchOpenEventDetail } from '@aster-editor/core';
import { SEARCH_OPEN_EVENT } from '@aster-editor/core';
import { getIcon } from '../icons/index.js';
import type { ToolbarWidget } from '../types.js';
import { el, setIcon } from '../utils/dom.js';
import { createPlainButton, setDisabled } from './button.js';
import { applyTooltip } from './tooltip.js';

/** Classe du bandeau de recherche, posé dans le flux juste avant l'hôte de l'éditeur. */
export const SEARCH_PANEL_CLASS = 'aster-search-panel';
/** Classe du déclencheur dans la toolbar. */
export const SEARCH_TRIGGER_CLASS = 'aster-search-panel__trigger';

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

/** Bouton d'icône pour le bandeau (hors navigation toolbar). */
function iconButton(className: string, svg: string, label: string): HTMLButtonElement {
  const button = createPlainButton({ className });
  const icon = el('span', { className: 'aster-toolbar__icon' });
  setIcon(icon, svg);
  button.append(icon);
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}

/** Ce que le contenu du bandeau expose à son hôte : resynchroniser le compteur et la saisie. */
interface PanelContent {
  readonly query: HTMLInputElement;
  sync(): void;
}

/**
 * Widget `search` : bandeau « rechercher / remplacer » dans le flux, entre la toolbar et
 * le contenu (session 5, L52, retour POC n° 5a). Il **pousse** le document au lieu de le
 * recouvrir et reste ouvert quand on clique dans le texte : seuls « Fermer », Échap, le
 * déclencheur et la lecture seule le referment. Le bandeau est inséré juste avant l'hôte
 * de l'éditeur (`editor.element`), hors de la feuille de la vue page ; sans parent, il
 * suit le déclencheur.
 *
 * Tout passe par le registre : la saisie lance `search.open` avec la requête (ou
 * `search.clear` si vide), les boutons appellent `search.next`, `search.previous`,
 * `search.replace`, `search.replaceAll`, « Fermer » et Échap effacent puis referment. Le
 * bandeau s'ouvre aussi sur l'événement `aster:search-open` émis par `search.open`
 * (`Mod-f`). Le compteur `n / total` est lu dans le storage du core après chaque action
 * et à chaque `update()` de la toolbar.
 */
export function createSearchPanel(editor: AsterEditor): ToolbarWidget {
  const root = el('div', { className: 'aster-search' });
  const suffix = Math.random().toString(36).slice(2, 8);
  const panelId = `aster-search-panel-${suffix}`;
  const trigger = createPlainButton({ className: SEARCH_TRIGGER_CLASS, toolbarItem: true });
  const triggerIcon = el('span', { className: 'aster-toolbar__icon' });
  setIcon(triggerIcon, getIcon('search'));
  trigger.append(triggerIcon);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panelId);
  root.append(trigger);

  const panel = el('div', {
    className: `aster-dialog ${SEARCH_PANEL_CLASS}`,
    attrs: { role: 'dialog', id: panelId, hidden: '' },
  });
  // Dans le flux, juste avant l'hôte : le bandeau pousse le contenu, sans position absolue.
  const parent = editor.element.parentNode;
  if (parent) parent.insertBefore(panel, editor.element);
  else root.append(panel);

  let content: PanelContent | null = null;
  let opened = false;

  const t = (key: string, params?: Record<string, string | number>): string =>
    editor.i18n.t(key, params);

  const close = (focusTrigger = false): void => {
    if (!opened) return;
    opened = false;
    panel.setAttribute('hidden', '');
    trigger.setAttribute('aria-expanded', 'false');
    root.classList.remove('aster-search--open');
    panel.replaceChildren();
    content = null;
    if (focusTrigger) trigger.focus();
  };

  /** Contenu du bandeau, reconstruit à chaque ouverture pour refléter l'état courant. */
  const render = (): PanelContent => {
    const initial = readSearchState(editor);
    panel.setAttribute('aria-label', t('ui.search.title'));

    const query = el('input', {
      className: 'aster-dialog__input aster-search-panel__query',
      attrs: {
        type: 'text',
        id: `aster-search-query-${suffix}`,
        autocomplete: 'off',
        placeholder: t('ui.search.query'),
        'aria-label': t('ui.search.query'),
      },
    });
    query.value = initial.query;

    const count = el('span', {
      className: 'aster-search-panel__count',
      attrs: { 'aria-live': 'polite' },
    });
    const previous = iconButton(
      'aster-search-panel__nav',
      getIcon('search-previous'),
      t('ui.search.previous'),
    );
    const next = iconButton('aster-search-panel__nav', getIcon('search-next'), t('ui.search.next'));

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
    const closeButton = createPlainButton({
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
      setDisabled(replaceAll, !hasMatches || !editor.commands.canRun('search.replaceAll', args()));
    };

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
    closeButton.addEventListener('click', () => {
      editor.commands.run('search.clear');
      close(false);
      editor.focus();
    });

    panel.append(
      el('div', { className: 'aster-search-panel__row' }, [query, count, previous, next]),
      el('div', { className: 'aster-dialog__field' }, [caseLabel]),
      el('div', { className: 'aster-search-panel__row' }, [replacement, replace, replaceAll]),
      el('div', { className: 'aster-dialog__actions' }, [closeButton]),
    );
    sync();
    return { query, sync };
  };

  const open = (): void => {
    if (opened || trigger.disabled) return;
    opened = true;
    panel.replaceChildren();
    content = render();
    panel.removeAttribute('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    root.classList.add('aster-search--open');
    content.query.focus();
  };

  const onTriggerClick = (): void => {
    // Second clic sur le déclencheur : si le focus était dans le bandeau, il doit revenir
    // sur le déclencheur, pas tomber sur `body`.
    if (opened) close(panel.contains(document.activeElement));
    else open();
  };

  // Échap dans le bandeau : même effet que « Fermer », le surlignage est effacé, le focus
  // revient au déclencheur.
  const onPanelKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    editor.commands.run('search.clear');
    close(true);
  };

  const onSearchOpen = (event: Event): void => {
    // Signale au core que le bandeau prend la main : Mod-f est alors consommé.
    event.preventDefault();
    const detail = (event as CustomEvent<SearchOpenEventDetail | undefined>).detail;
    if (!opened) open();
    if (!opened || !content) return;
    if (detail?.query !== undefined && content.query.value !== detail.query) {
      content.query.value = detail.query;
    }
    content.sync();
    if (document.activeElement !== content.query) content.query.focus();
  };

  trigger.addEventListener('click', onTriggerClick);
  panel.addEventListener('keydown', onPanelKeyDown);
  editor.element.addEventListener(SEARCH_OPEN_EVENT, onSearchOpen);

  const update = (): void => {
    applyTooltip(trigger, t('ui.search.title'));
    const enabled = editor.commands.canRun('search.open');
    setDisabled(trigger, !enabled);
    if (!enabled && opened) {
      // Le bandeau se ferme parce que la recherche se désactive (lecture seule, vue
      // source) : le focus ne doit pas tomber sur `body`.
      const hadFocus = panel.contains(document.activeElement) || document.activeElement === trigger;
      close(false);
      if (hadFocus) {
        if (trigger.disabled) editor.focus();
        else trigger.focus();
      }
    } else if (opened) {
      content?.sync();
    }
    const active = editor.commands.isActive('search.open');
    trigger.setAttribute('aria-pressed', active ? 'true' : 'false');
    trigger.classList.toggle('aster-toolbar__button--active', active);
  };
  update();

  return {
    element: root,
    update,
    destroy: () => {
      close(false);
      editor.element.removeEventListener(SEARCH_OPEN_EVENT, onSearchOpen);
      panel.removeEventListener('keydown', onPanelKeyDown);
      trigger.removeEventListener('click', onTriggerClick);
      panel.remove();
    },
  };
}
