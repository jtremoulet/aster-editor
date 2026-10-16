import type { AsterEditor, AsterVariable } from '@aster-editor/core';
import type { Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, exitSuggestion } from '@tiptap/suggestion';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { clear, el } from '../utils/dom';
import { createPlainButton } from './button';
import { clampToViewport } from './table-context-menu';
import {
  allowsUnknownVariables,
  isAcceptableVariableName,
  placeholderText,
  renderVariableEntry,
} from './variable-menu';

/** Entrée du panneau de suggestion : une variable connue, ou la création de `{{query}}`. */
export type VariableSuggestionItem =
  | { readonly kind: 'variable'; readonly variable: AsterVariable }
  | { readonly kind: 'create'; readonly name: string };

/** Clé du plugin ProseMirror, pour `unregisterPlugin` et `exitSuggestion`. */
export const VARIABLE_SUGGESTION_PLUGIN_KEY = new PluginKey('asterVariableSuggestion');

/** Caractères déclencheurs de la suggestion. */
export const VARIABLE_SUGGESTION_CHAR = '{{';

/** Espace entre le curseur et le panneau, en pixels. */
const PANEL_OFFSET = 4;

/** Rang d'une variable pour une requête : préfixe du nom, puis du libellé, puis inclusion. */
function rank(variable: AsterVariable, query: string): number {
  const name = variable.name.toLowerCase();
  const label = (variable.label ?? '').toLowerCase();
  if (name.startsWith(query)) return 0;
  if (label.startsWith(query)) return 1;
  return 2;
}

/**
 * Filtre les variables par nom ou libellé (insensible à la casse), les préfixes d'abord.
 * Requête vide : toute la liste dans l'ordre du magasin. Fonction pure, testée à part.
 */
export function filterVariables(
  query: string,
  list: readonly AsterVariable[],
): readonly AsterVariable[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...list];
  return list
    .filter(
      (variable) =>
        variable.name.toLowerCase().includes(needle) ||
        (variable.label ?? '').toLowerCase().includes(needle),
    )
    .map((variable, index) => ({ variable, index, rank: rank(variable, needle) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.variable);
}

/**
 * Entrées du panneau pour une requête : variables filtrées, puis « Créer {{query}} » si
 * la création est autorisée, le nom valide et inconnu du magasin.
 */
export function buildSuggestionItems(
  query: string,
  list: readonly AsterVariable[],
  allowCreate: boolean,
): readonly VariableSuggestionItem[] {
  const items: VariableSuggestionItem[] = filterVariables(query, list).map((variable) => ({
    kind: 'variable',
    variable,
  }));
  const name = query.trim();
  if (
    allowCreate &&
    name.length > 0 &&
    isAcceptableVariableName(name) &&
    !list.some((variable) => variable.name === name)
  ) {
    items.push({ kind: 'create', name });
  }
  return items;
}

/** Props du panneau : sous-ensemble de `SuggestionProps`, simulable dans les tests. */
export interface VariableSuggestionPanelProps {
  readonly items: readonly VariableSuggestionItem[];
  readonly command: (item: VariableSuggestionItem) => void;
  /** Rectangle viewport du texte `{{…` saisi ; absent → panneau non repositionné. */
  readonly clientRect?: (() => DOMRect | null) | null;
}

/** Panneau de suggestion monté : affichage, navigation clavier, fermeture. */
export interface VariableSuggestionPanel {
  readonly element: HTMLElement;
  /** Ouvre (`onStart`) ou met à jour (`onUpdate`) le panneau avec les props courantes. */
  update(props: VariableSuggestionPanelProps): void;
  /** Ferme le panneau (`onExit`). */
  hide(): void;
  isOpen(): boolean;
  /** Index de l'entrée surlignée, `-1` sans entrée. */
  selectedIndex(): number;
  /** Gère ↑/↓/Entrée/Échap ; vrai si la touche est consommée. */
  onKeyDown(event: KeyboardEvent): boolean;
  destroy(): void;
}

/** Options du panneau. */
export interface VariableSuggestionPanelOptions {
  /** Appelé quand l'utilisateur clique hors du panneau et de l'éditeur : à relier à `exitSuggestion`. */
  readonly onDismiss?: () => void;
}

/**
 * Panneau flottant `listbox` listant les suggestions sous le curseur. Monté dans
 * `editor.element` en `position: fixed` (héritage des variables de thème), positionné
 * depuis `clientRect` et ramené dans le viewport ; repositionné au défilement. Les
 * entrées sont des boutons au `mousedown` neutralisé pour ne pas voler le focus à
 * l'éditeur. Fermetures : Échap (par le plugin, via `onExit`), clic extérieur
 * (`onDismiss`), `hide()`.
 */
export function createVariableSuggestionPanel(
  editor: AsterEditor,
  options: VariableSuggestionPanelOptions = {},
): VariableSuggestionPanel {
  const element = el('div', {
    className: 'aster-variable-suggestion',
    attrs: { role: 'listbox', hidden: '' },
  });
  let opened = false;
  let items: readonly VariableSuggestionItem[] = [];
  let command: ((item: VariableSuggestionItem) => void) | null = null;
  let clientRect: (() => DOMRect | null) | null = null;
  let selected = -1;

  const optionElements = (): HTMLElement[] =>
    Array.from(element.querySelectorAll<HTMLElement>('[role="option"]'));

  const highlight = (index: number): void => {
    selected = items.length === 0 ? -1 : Math.max(0, Math.min(index, items.length - 1));
    optionElements().forEach((option, i) => {
      const active = i === selected;
      option.setAttribute('aria-selected', active ? 'true' : 'false');
      option.classList.toggle('aster-variable-suggestion__option--selected', active);
      if (active && typeof option.scrollIntoView === 'function') {
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const position = (): void => {
    const rect = clientRect?.();
    if (!rect) return;
    const size = element.getBoundingClientRect();
    element.style.left = `${clampToViewport(rect.left, size.width, window.innerWidth)}px`;
    element.style.top = `${clampToViewport(rect.bottom + PANEL_OFFSET, size.height, window.innerHeight)}px`;
  };

  const choose = (index: number): void => {
    const item = items[index];
    if (item && command) command(item);
  };

  const render = (): void => {
    clear(element);
    element.setAttribute('aria-label', editor.i18n.t('ui.variable.suggestions'));
    items.forEach((item, index) => {
      const option = createPlainButton({
        className: `aster-variable-suggestion__option aster-variable-suggestion__option--${item.kind}`,
      });
      option.setAttribute('role', 'option');
      option.tabIndex = -1;
      if (item.kind === 'variable') {
        renderVariableEntry(editor, item.variable, option);
        option.dataset['name'] = item.variable.name;
      } else {
        option.append(
          el('span', {
            className: 'aster-variable-entry__label',
            text: editor.i18n.t('ui.variable.create', { name: placeholderText(item.name) }),
          }),
        );
        option.dataset['name'] = item.name;
      }
      option.addEventListener('click', () => choose(index));
      option.addEventListener('pointerenter', () => highlight(index));
      element.append(option);
    });
    if (items.length === 0) element.setAttribute('hidden', '');
    else element.removeAttribute('hidden');
    highlight(0);
    position();
  };

  const onDocumentMouseDown = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (element.contains(target) || editor.contentElement.contains(target)) return;
    options.onDismiss?.();
  };
  const onScroll = (): void => {
    if (opened) position();
  };

  const hide = (): void => {
    if (!opened) return;
    opened = false;
    items = [];
    command = null;
    clientRect = null;
    selected = -1;
    element.setAttribute('hidden', '');
    clear(element);
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    window.removeEventListener('scroll', onScroll, true);
  };

  const update = (props: VariableSuggestionPanelProps): void => {
    items = props.items;
    command = props.command;
    clientRect = props.clientRect ?? null;
    if (!opened) {
      opened = true;
      if (!element.isConnected) editor.element.append(element);
      document.addEventListener('mousedown', onDocumentMouseDown, true);
      window.addEventListener('scroll', onScroll, true);
    }
    render();
  };

  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (!opened) return false;
    if (event.key === 'Escape') {
      // Le plugin ferme la suggestion après nous (`onExit` → `hide`).
      return true;
    }
    if (items.length === 0) return false;
    if (event.key === 'ArrowDown') {
      highlight((selected + 1) % items.length);
      return true;
    }
    if (event.key === 'ArrowUp') {
      highlight((selected - 1 + items.length) % items.length);
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      choose(selected);
      return true;
    }
    return false;
  };

  return {
    element,
    update,
    hide,
    isOpen: () => opened,
    selectedIndex: () => selected,
    onKeyDown,
    destroy: () => {
      hide();
      element.remove();
    },
  };
}

/** Suggestion `{{` montée sur un éditeur. */
export interface VariableSuggestion {
  readonly panel: VariableSuggestionPanel;
  /** Retire le plugin de l'éditeur (s'il n'est pas détruit) et le panneau. */
  destroy(): void;
}

/**
 * Applique une entrée choisie : supprime le texte `{{xxx` saisi (`range` fourni par la
 * suggestion) puis lance `variable.insert`. Ne touche à rien si le core refuse
 * l'insertion (lecture seule, nom inconnu non autorisé).
 */
export function insertSuggestedVariable(
  editor: AsterEditor,
  range: Range,
  item: VariableSuggestionItem,
): boolean {
  const name = item.kind === 'variable' ? item.variable.name : item.name;
  const label = item.kind === 'variable' ? item.variable.label : undefined;
  if (!editor.commands.canRun('variable.insert', { name })) return false;
  editor.tiptap.commands.deleteRange(range);
  const inserted = editor.commands.run('variable.insert', label ? { name, label } : { name });
  editor.focus();
  return inserted;
}

/**
 * Enregistre sur un éditeur **déjà monté** un plugin `@tiptap/suggestion` déclenché par
 * `{{` : les variables du magasin filtrées par la saisie, plus « Créer {{xxx}} » si le
 * core accepte les noms inconnus. La sélection remplace le texte `{{xxx` saisi
 * (`insertSuggestedVariable`). Utilisable seule ou via `createAster` (option
 * `variableSuggestion`).
 */
export function createVariableSuggestion(editor: AsterEditor): VariableSuggestion {
  const panel = createVariableSuggestionPanel(editor, {
    onDismiss: () => {
      if (!editor.isDestroyed()) exitSuggestion(editor.tiptap.view, VARIABLE_SUGGESTION_PLUGIN_KEY);
    },
  });

  const plugin = Suggestion<VariableSuggestionItem, VariableSuggestionItem>({
    pluginKey: VARIABLE_SUGGESTION_PLUGIN_KEY,
    editor: editor.tiptap,
    char: VARIABLE_SUGGESTION_CHAR,
    allowSpaces: false,
    startOfLine: false,
    // `{{` peut suivre n'importe quel caractère (« Bonjour{{nom »), pas seulement une espace.
    allowedPrefixes: null,
    decorationClass: 'aster-variable-suggestion__decoration',
    allow: () => !editor.isReadOnly() && editor.commands.has('variable.insert'),
    items: ({ query }) => [
      ...buildSuggestionItems(query, editor.variables.list(), allowsUnknownVariables(editor)),
    ],
    command: ({ range, props }) => {
      insertSuggestedVariable(editor, range, props);
    },
    render: () => ({
      onStart: (props: SuggestionProps<VariableSuggestionItem, VariableSuggestionItem>) =>
        panel.update(props),
      onUpdate: (props: SuggestionProps<VariableSuggestionItem, VariableSuggestionItem>) =>
        panel.update(props),
      onExit: () => panel.hide(),
      onKeyDown: ({ event }: SuggestionKeyDownProps) => panel.onKeyDown(event),
    }),
  });
  editor.tiptap.registerPlugin(plugin);

  return {
    panel,
    destroy: () => {
      if (!editor.isDestroyed()) editor.tiptap.unregisterPlugin(VARIABLE_SUGGESTION_PLUGIN_KEY);
      panel.destroy();
    },
  };
}
