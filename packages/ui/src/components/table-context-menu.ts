import type { AsterEditor } from '@aster-editor/core';
import type { ToolbarWidget } from '../types.js';
import { clear, el, enabledElements, rovingIndexFor } from '../utils/dom.js';
import { resolveIcon } from './button.js';
import { createMenuItem } from './dropdown.js';
import { TABLE_ACTIONS } from './table-grid-picker.js';

/** Menu contextuel de table monté sur un éditeur. */
export interface TableContextMenu extends ToolbarWidget {
  /** Ouvre le menu aux coordonnées viewport données (clic droit). */
  open(clientX: number, clientY: number): void;
  close(): void;
  isOpen(): boolean;
}

const MENU_ITEM_SELECTOR = '[role="menuitem"]';

/** Marge gardée entre le menu et le bord du viewport, en pixels. */
const VIEWPORT_MARGIN = 8;

/**
 * Ramène une coordonnée dans le viewport : le menu est posé au curseur mais ne doit
 * pas dépasser le bord (`size` = sa largeur ou hauteur mesurée, `limit` = celle du
 * viewport). Jamais négatif, pour un menu plus grand que l'écran.
 */
export function clampToViewport(position: number, size: number, limit: number): number {
  return Math.max(0, Math.min(position, limit - size - VIEWPORT_MARGIN));
}

/** Vrai si le curseur est dans un tableau, tolérant si l'extension manque. */
function isInTable(editor: AsterEditor): boolean {
  try {
    return editor.tiptap.isActive('table');
  } catch {
    return false;
  }
}

/**
 * Menu contextuel des tables : clic droit dans un tableau → menu flottant au curseur
 * avec les mêmes actions `table.*` que le widget de toolbar (`TABLE_ACTIONS`), les
 * non exécutables grisées. Fermé à Échap, au clic extérieur, après une action et au
 * `destroy`. Flèches haut/bas pour naviguer, focus rendu à l'éditeur à la fermeture.
 *
 * L'écouteur `contextmenu` est posé sur `editor.contentElement` et retiré dans
 * `destroy`. Le menu est ajouté à `editor.element` en `position: fixed` pour hériter
 * des variables de thème `--aster-*` ; un ancêtre transformé décalerait le menu, cas
 * jugé marginal. `createAster` le monte dès que des commandes `table.*` existent, même
 * sans toolbar.
 */
export function createTableContextMenu(editor: AsterEditor): TableContextMenu {
  const menu = el('div', {
    className: 'aster-menu aster-context-menu aster-table-context-menu',
    attrs: { role: 'menu', hidden: '' },
  });
  let opened = false;

  const onDocumentMouseDown = (event: MouseEvent): void => {
    if (!(event.target instanceof Node) || !menu.contains(event.target)) close();
  };

  const close = (): void => {
    if (!opened) return;
    opened = false;
    menu.setAttribute('hidden', '');
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    clear(menu);
  };

  const render = (): boolean => {
    clear(menu);
    menu.setAttribute('aria-label', editor.i18n.t('ui.table.contextMenu'));
    let count = 0;
    for (const id of TABLE_ACTIONS) {
      const command = editor.commands.get(id);
      if (!command) continue;
      count += 1;
      menu.append(
        createMenuItem({
          text: editor.i18n.t(command.labelKey),
          icon: resolveIcon(id, undefined, command.icon),
          disabled: !editor.commands.canRun(id),
          onSelect: () => {
            close();
            editor.commands.run(id);
            editor.focus();
          },
        }),
      );
    }
    return count > 0;
  };

  const open = (clientX: number, clientY: number): void => {
    close();
    if (editor.isReadOnly() || !render()) return;
    opened = true;
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    menu.removeAttribute('hidden');
    if (!menu.isConnected) editor.element.append(menu);
    // Mesuré une fois rendu : le menu est en `position: fixed` au curseur, on le ramène
    // dans le viewport pour que ses dernières entrées restent cliquables en bas d'écran.
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${clampToViewport(clientX, rect.width, window.innerWidth)}px`;
    menu.style.top = `${clampToViewport(clientY, rect.height, window.innerHeight)}px`;
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    enabledElements(menu, MENU_ITEM_SELECTOR)[0]?.focus();
  };

  const onContextMenu = (event: MouseEvent): void => {
    if (editor.isReadOnly() || !isInTable(editor)) return;
    event.preventDefault();
    open(event.clientX, event.clientY);
  };

  const onMenuKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      editor.focus();
      return;
    }
    const items = enabledElements(menu, MENU_ITEM_SELECTOR);
    const current = items.findIndex((item) => item === document.activeElement);
    const target = rovingIndexFor(event.key, current, items.length, 'vertical');
    if (target === null) return;
    event.preventDefault();
    items[target]?.focus();
  };

  editor.contentElement.addEventListener('contextmenu', onContextMenu);
  menu.addEventListener('keydown', onMenuKeyDown);

  return {
    element: menu,
    open,
    close,
    isOpen: () => opened,
    update: () => {
      if (opened && (editor.isReadOnly() || !isInTable(editor))) close();
    },
    destroy: () => {
      close();
      editor.contentElement.removeEventListener('contextmenu', onContextMenu);
      menu.removeEventListener('keydown', onMenuKeyDown);
      menu.remove();
    },
  };
}
