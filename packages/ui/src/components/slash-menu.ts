import type { AsterEditor, HeadingLevel, StandardCommandId } from '@aster-editor/core';
import type { Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, exitSuggestion } from '@tiptap/suggestion';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { getIcon } from '../icons/index.js';
import { clear, el, setIcon } from '../utils/dom.js';
import { isRecord } from '../utils/guards.js';
import { formatShortcut } from '../utils/shortcut.js';
import { createPlainButton, resolveIcon } from './button.js';
import { clampToViewport } from './table-context-menu.js';

/** Clé du plugin ProseMirror, pour `unregisterPlugin` et `exitSuggestion`. */
export const SLASH_MENU_PLUGIN_KEY = new PluginKey('asterSlashMenu');

/** Caractère déclencheur du menu, en début de bloc. */
export const SLASH_MENU_CHAR = '/';

/** Widgets de la toolbar que le menu peut ouvrir, via `SlashMenuOptions.openWidget`. */
export type SlashWidgetName = 'image' | 'link';

/** Entrée du menu `/` : libellé traduit, icône, raccourci affiché, et l'action. */
export interface SlashMenuItem {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  /** Raccourci au format Tiptap, affiché via `formatShortcut`. */
  readonly shortcut?: string;
  /** Alias de recherche (anglais, abréviations), en plus du libellé. */
  readonly keywords: readonly string[];
  /** Exécute l'action après suppression du texte `/xxx`. */
  run(): boolean;
}

/** Options du menu `/`. */
export interface SlashMenuOptions {
  /**
   * Ouvre un widget de la toolbar (dialogue image ou lien) ; `createAster` le fournit
   * quand la toolbar existe. Absent : les entrées Image et Lien ne sont pas proposées.
   */
  readonly openWidget?: (widget: SlashWidgetName) => boolean;
}

/** Espace entre le curseur et le panneau, en pixels. */
const PANEL_OFFSET = 4;

/** Niveaux de titre proposés par le menu. */
const SLASH_HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3];

/** Commandes standard sans argument proposées telles quelles, avec leurs alias. */
const SIMPLE_COMMANDS: readonly (readonly [StandardCommandId, readonly string[]])[] = [
  ['bulletList', ['ul', 'bullet', 'list', 'liste', 'puces']],
  ['orderedList', ['ol', 'ordered', 'numbered', 'list', 'liste', 'numéros']],
  ['taskList', ['todo', 'task', 'checkbox', 'tâches', 'liste']],
  ['blockquote', ['quote', 'citation']],
  ['codeBlock', ['code', 'pre']],
  ['horizontalRule', ['hr', 'rule', 'separator', 'séparateur', 'ligne']],
];

/** Minuscules sans diacritiques : `Séparateur` et `separateur` se valent. */
export function normalizeQuery(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** Rang d'une entrée pour une requête : préfixe du libellé, puis d'un alias, puis inclusion. */
function rank(item: SlashMenuItem, needle: string): number {
  if (normalizeQuery(item.label).startsWith(needle)) return 0;
  if (item.keywords.some((keyword) => normalizeQuery(keyword).startsWith(needle))) return 1;
  return 2;
}

/**
 * Filtre les entrées par libellé ou alias (insensible à la casse et aux accents), les
 * préfixes d'abord. Requête vide : toute la liste. Fonction pure, testée à part.
 */
export function filterSlashItems(
  query: string,
  items: readonly SlashMenuItem[],
): readonly SlashMenuItem[] {
  const needle = normalizeQuery(query);
  if (needle.length === 0) return [...items];
  return items
    .filter(
      (item) =>
        normalizeQuery(item.label).includes(needle) ||
        item.keywords.some((keyword) => normalizeQuery(keyword).includes(needle)),
    )
    .map((item, index) => ({ item, index, rank: rank(item, needle) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

/** Vrai si le schéma de l'éditeur connaît un nœud `pageBreak` (extension de l'intégrateur). */
function hasPageBreakNode(editor: AsterEditor): boolean {
  try {
    const tiptap: unknown = editor.tiptap;
    if (!isRecord(tiptap) || !isRecord(tiptap['schema'])) return false;
    return editor.tiptap.schema.nodes['pageBreak'] !== undefined;
  } catch {
    return false;
  }
}

/** Insère du contenu par la commande Tiptap `insertContent`, faux si elle manque (mock). */
function insertContent(editor: AsterEditor, content: string | { type: string }): boolean {
  const commands: unknown = editor.tiptap.commands;
  if (!isRecord(commands) || typeof commands['insertContent'] !== 'function') return false;
  return editor.tiptap.commands.insertContent(content);
}

/**
 * Entrées du menu pour l'état courant : seules les commandes exécutables ici sont
 * proposées (un titre dans un item de liste, un paragraphe déjà en place… sont omis).
 * Recalculées à chaque frappe pour suivre la locale et la sélection.
 */
export function buildSlashItems(
  editor: AsterEditor,
  options: SlashMenuOptions = {},
): readonly SlashMenuItem[] {
  const t = (key: string): string => editor.i18n.t(key);
  const items: SlashMenuItem[] = [];
  const commandItem = (
    id: StandardCommandId,
    keywords: readonly string[],
    extra: Partial<Pick<SlashMenuItem, 'icon' | 'label' | 'shortcut'>> = {},
    args?: unknown,
  ): void => {
    const command = editor.commands.get(id);
    if (!command || !editor.commands.canRun(id, args)) return;
    const shortcut = extra.shortcut ?? command.shortcut;
    items.push({
      id: args === undefined ? id : `${id}:${JSON.stringify(args)}`,
      icon: extra.icon ?? resolveIcon(id, undefined, command.icon),
      label: extra.label ?? t(command.labelKey),
      ...(shortcut ? { shortcut } : {}),
      keywords: [id, ...keywords],
      run: () => editor.commands.run(id, args),
    });
  };

  commandItem('paragraph', ['p', 'text', 'texte', 'paragraphe']);
  for (const level of SLASH_HEADING_LEVELS) {
    commandItem(
      'heading',
      [`h${level}`, 'heading', 'title', 'titre'],
      {
        icon: `heading-${level}`,
        label: editor.i18n.t('command.heading.level', { level }),
        shortcut: `Mod-Alt-${level}`,
      },
      { level },
    );
  }
  for (const [id, keywords] of SIMPLE_COMMANDS) commandItem(id, keywords);
  commandItem(
    'table.insert',
    ['table', 'tableau', 'grid'],
    { icon: 'table-insert', label: t('ui.slash.table') },
    { rows: 3, cols: 3, withHeaderRow: true },
  );

  if (options.openWidget) {
    const { openWidget } = options;
    if (editor.commands.canRun('image.insert', { src: 'https://aster.invalid/a.png' })) {
      items.push({
        id: 'image',
        icon: 'image-insert',
        label: t('ui.slash.image'),
        keywords: ['image', 'img', 'picture', 'photo'],
        run: () => openWidget('image'),
      });
    }
    if (editor.commands.canRun('link.set', { href: 'https://aster.invalid/' })) {
      items.push({
        id: 'link',
        icon: 'link-set',
        label: t('ui.slash.link'),
        keywords: ['link', 'lien', 'url', 'href'],
        run: () => openWidget('link'),
      });
    }
  }
  if (editor.commands.has('variable.insert') && !editor.isReadOnly()) {
    // Insère `{{` : la suggestion de variable (plugin `{{`) s'ouvre sur ce texte.
    items.push({
      id: 'variable',
      icon: 'variable-insert',
      label: t('ui.slash.variable'),
      keywords: ['variable', 'field', 'champ', 'merge', 'fusion'],
      run: () => insertContent(editor, '{{'),
    });
  }
  if (hasPageBreakNode(editor) && !editor.isReadOnly()) {
    items.push({
      id: 'pageBreak',
      icon: 'page-break',
      label: t('ui.slash.pageBreak'),
      keywords: ['page', 'break', 'saut'],
      run: () => insertContent(editor, { type: 'pageBreak' }),
    });
  }
  return items;
}

/** Props du panneau : sous-ensemble de `SuggestionProps`, simulable dans les tests. */
export interface SlashMenuPanelProps {
  readonly items: readonly SlashMenuItem[];
  readonly command: (item: SlashMenuItem) => void;
  /** Rectangle viewport du texte `/…` saisi ; absent → panneau non repositionné. */
  readonly clientRect?: (() => DOMRect | null) | null;
}

/** Panneau du menu `/` monté : affichage, navigation clavier, fermeture. */
export interface SlashMenuPanel {
  readonly element: HTMLElement;
  /** Ouvre (`onStart`) ou met à jour (`onUpdate`) le panneau avec les props courantes. */
  update(props: SlashMenuPanelProps): void;
  /** Ferme le panneau (`onExit`). */
  hide(): void;
  isOpen(): boolean;
  /** Index de l'entrée surlignée, `-1` sans entrée. */
  selectedIndex(): number;
  /** Gère ↑/↓/Entrée/Tab/Échap ; vrai si la touche est consommée. */
  onKeyDown(event: KeyboardEvent): boolean;
  destroy(): void;
}

/** Options du panneau. */
export interface SlashMenuPanelOptions {
  /** Appelé quand l'utilisateur clique hors du panneau et de l'éditeur : à relier à `exitSuggestion`. */
  readonly onDismiss?: () => void;
}

/**
 * Panneau flottant `listbox` du menu `/`, sous le curseur : même mécanique que le
 * panneau de suggestion de variables (monté dans `editor.element` en `position: fixed`,
 * ramené dans le viewport, repositionné au défilement, boutons au `mousedown`
 * neutralisé). Chaque entrée montre icône, libellé et raccourci ; sans résultat, un
 * message « aucun bloc » reste visible et Entrée n'est pas consommée.
 */
export function createSlashMenuPanel(
  editor: AsterEditor,
  options: SlashMenuPanelOptions = {},
): SlashMenuPanel {
  const element = el('div', {
    className: 'aster-slash-menu',
    attrs: { role: 'listbox', hidden: '' },
  });
  let opened = false;
  let items: readonly SlashMenuItem[] = [];
  let command: ((item: SlashMenuItem) => void) | null = null;
  let clientRect: (() => DOMRect | null) | null = null;
  let selected = -1;

  const optionElements = (): HTMLElement[] =>
    Array.from(element.querySelectorAll<HTMLElement>('[role="option"]'));

  const highlight = (index: number): void => {
    selected = items.length === 0 ? -1 : Math.max(0, Math.min(index, items.length - 1));
    optionElements().forEach((option, i) => {
      const active = i === selected;
      option.setAttribute('aria-selected', active ? 'true' : 'false');
      option.classList.toggle('aster-slash-menu__option--selected', active);
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
    element.setAttribute('aria-label', editor.i18n.t('ui.slash.label'));
    items.forEach((item, index) => {
      const option = createPlainButton({ className: 'aster-slash-menu__option' });
      option.setAttribute('role', 'option');
      option.tabIndex = -1;
      option.dataset['item'] = item.id;
      const icon = el('span', { className: 'aster-toolbar__icon' });
      setIcon(icon, getIcon(item.icon));
      option.append(icon, el('span', { className: 'aster-slash-menu__label', text: item.label }));
      if (item.shortcut) {
        option.append(
          el('kbd', {
            className: 'aster-slash-menu__shortcut',
            text: formatShortcut(item.shortcut),
          }),
        );
      }
      option.addEventListener('click', () => choose(index));
      option.addEventListener('pointerenter', () => highlight(index));
      element.append(option);
    });
    if (items.length === 0) {
      element.append(
        el('div', { className: 'aster-slash-menu__empty', text: editor.i18n.t('ui.slash.empty') }),
      );
    }
    element.removeAttribute('hidden');
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

  const update = (props: SlashMenuPanelProps): void => {
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

/** Menu `/` monté sur un éditeur. */
export interface SlashMenu {
  readonly panel: SlashMenuPanel;
  /** Retire le plugin de l'éditeur (s'il n'est pas détruit) et le panneau. */
  destroy(): void;
}

/**
 * Applique une entrée choisie : supprime le texte `/xxx` saisi (`range` fourni par la
 * suggestion) puis exécute l'action de l'entrée et rend le focus à l'éditeur.
 */
export function runSlashItem(editor: AsterEditor, range: Range, item: SlashMenuItem): boolean {
  if (editor.isReadOnly()) return false;
  editor.tiptap.commands.deleteRange(range);
  const done = item.run();
  editor.focus();
  return done;
}

/**
 * Enregistre sur un éditeur **déjà monté** un plugin `@tiptap/suggestion` déclenché par
 * `/` en début de bloc : blocs (paragraphe, titres 1-3, listes, citation, code, règle),
 * tableau 3×3, image et lien (dialogues de la toolbar via `openWidget`), variable
 * (ouvre la suggestion `{{`) et saut de page si le schéma a un nœud `pageBreak`. Le
 * choix remplace le texte `/xxx` saisi (`runSlashItem`). Utilisable seul ou via
 * `createAster` (option `slashMenu`).
 */
export function createSlashMenu(editor: AsterEditor, options: SlashMenuOptions = {}): SlashMenu {
  const panel = createSlashMenuPanel(editor, {
    onDismiss: () => {
      if (!editor.isDestroyed()) exitSuggestion(editor.tiptap.view, SLASH_MENU_PLUGIN_KEY);
    },
  });

  const plugin = Suggestion<SlashMenuItem, SlashMenuItem>({
    pluginKey: SLASH_MENU_PLUGIN_KEY,
    editor: editor.tiptap,
    char: SLASH_MENU_CHAR,
    allowSpaces: false,
    startOfLine: true,
    decorationClass: 'aster-slash-menu__decoration',
    allow: () => !editor.isReadOnly(),
    items: ({ query }) => [...filterSlashItems(query, buildSlashItems(editor, options))],
    command: ({ range, props }) => {
      runSlashItem(editor, range, props);
    },
    render: () => ({
      onStart: (props: SuggestionProps<SlashMenuItem, SlashMenuItem>) => panel.update(props),
      onUpdate: (props: SuggestionProps<SlashMenuItem, SlashMenuItem>) => panel.update(props),
      onExit: () => panel.hide(),
      onKeyDown: ({ event }: SuggestionKeyDownProps) => panel.onKeyDown(event),
    }),
  });
  // Avant les keymaps Tiptap, sinon Entrée coupe le paragraphe au lieu de valider (même cause que le menu {{).
  editor.tiptap.registerPlugin(plugin, (added, plugins) => [added, ...plugins]);

  return {
    panel,
    destroy: () => {
      if (!editor.isDestroyed()) editor.tiptap.unregisterPlugin(SLASH_MENU_PLUGIN_KEY);
      panel.destroy();
    },
  };
}
