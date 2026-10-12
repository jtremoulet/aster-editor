import type {
  AsterEditor,
  ToolbarButtonItem,
  ToolbarConfig,
  ToolbarItem,
  Unsubscribe,
} from '@aster-editor/core';
import { TOOLBAR_ITEM_ATTR, createCommandButton } from '../components/button';
import { createCommandDropdown } from '../components/dropdown';
import { uiEn } from '../i18n/ui-en';
import { uiFr } from '../i18n/ui-fr';
import type { Toolbar, ToolbarWidget } from '../types';
import { clear, el, enabledElements, rovingIndexFor } from '../utils/dom';
import { resolveToolbarConfig } from './presets';
import { createWidget } from './widgets';

const ITEM_SELECTOR = `[${TOOLBAR_ITEM_ATTR}]`;

/** Enregistre les chaînes UI sur l'éditeur. Idempotent : la fusion est superficielle. */
export function registerUiTranslations(editor: AsterEditor): void {
  editor.i18n.addTranslations('en', uiEn);
  editor.i18n.addTranslations('fr', uiFr);
}

/** Normalise un item chaîne ou objet bouton en `ToolbarButtonItem`. */
function asButtonItem(item: ToolbarItem): ToolbarButtonItem | null {
  if (typeof item === 'string') return { command: item };
  if (!('type' in item) || item.type === 'button' || item.type === undefined) {
    return item as ToolbarButtonItem;
  }
  return null;
}

/** Construit le widget correspondant à un item, ou `null` avec avertissement. */
function buildItem(editor: AsterEditor, item: ToolbarItem): ToolbarWidget | null {
  const button = asButtonItem(item);
  if (button) {
    const widget = createCommandButton(editor, button);
    if (!widget) console.warn(`[aster-ui] unknown command "${button.command}" ignored`);
    return widget;
  }
  if (typeof item === 'string') return null;
  if (item.type === 'dropdown') return createCommandDropdown(editor, item);
  if (item.type === 'widget') return createWidget(editor, item.widget);
  return null;
}

/**
 * Rend une toolbar dans `container` à partir du registre de commandes de `editor`.
 *
 * - `config` : preset (`'full' | 'standard' | 'minimal'`), liste de groupes, ou `false`
 *   pour ne rien rendre.
 * - Les items dont la commande n'existe pas sont ignorés avec un `console.warn`.
 * - La toolbar se resynchronise sur `selectionChange`, `readOnlyChange` et
 *   `localeChange`, et se désabonne dans `destroy()`.
 * - Navigation clavier : flèches gauche/droite, Home/End, roving tabindex.
 */
export function createToolbar(
  editor: AsterEditor,
  container: HTMLElement,
  config: ToolbarConfig = 'standard',
): Toolbar {
  registerUiTranslations(editor);
  const groups = resolveToolbarConfig(config);
  const root = el('div', { className: 'aster-toolbar', attrs: { role: 'toolbar' } });
  const widgets: ToolbarWidget[] = [];

  for (const group of groups) {
    const groupElement = el('div', { className: 'aster-toolbar__group', attrs: { role: 'group' } });
    for (const item of group) {
      const widget = buildItem(editor, item);
      if (!widget) continue;
      widgets.push(widget);
      groupElement.append(widget.element);
    }
    if (groupElement.childElementCount > 0) root.append(groupElement);
  }

  /** Un seul item tabbable à la fois ; le premier actif par défaut. */
  const syncTabIndex = (preferred?: HTMLElement): void => {
    const all = Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    const enabled = enabledElements(root, ITEM_SELECTOR);
    const current =
      preferred && enabled.includes(preferred)
        ? preferred
        : (enabled.find((node) => node.tabIndex === 0) ?? enabled[0]);
    for (const node of all) node.tabIndex = node === current ? 0 : -1;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.aster-dropdown__panel')) return;
    const item = target.closest<HTMLElement>(ITEM_SELECTOR);
    if (!item) return;
    const items = enabledElements(root, ITEM_SELECTOR);
    const index = rovingIndexFor(event.key, items.indexOf(item), items.length, 'horizontal');
    if (index === null) return;
    event.preventDefault();
    const next = items[index];
    if (!next) return;
    syncTabIndex(next);
    next.focus();
  };
  root.addEventListener('keydown', onKeyDown);

  const update = (): void => {
    root.setAttribute('aria-label', editor.i18n.t('ui.toolbar.label'));
    for (const widget of widgets) widget.update();
    syncTabIndex();
  };

  const subscriptions: Unsubscribe[] = [
    editor.on('selectionChange', update),
    editor.on('readOnlyChange', update),
    editor.on('localeChange', update),
  ];

  if (groups.length > 0) {
    container.append(root);
    update();
  }

  return {
    element: root,
    update,
    destroy: () => {
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.length = 0;
      root.removeEventListener('keydown', onKeyDown);
      for (const widget of widgets) widget.destroy();
      widgets.length = 0;
      clear(root);
      root.remove();
    },
  };
}
