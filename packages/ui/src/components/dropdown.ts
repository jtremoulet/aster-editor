import type { AsterEditor, ToolbarDropdownItem } from '@aster-editor/core';
import { getIcon } from '../icons';
import type { ToolbarWidget } from '../types';
import { clear, el, enabledElements, rovingIndexFor, setIcon } from '../utils/dom';
import { createPlainButton, resolveIcon, setDisabled } from './button';
import { applyTooltip } from './tooltip';

/** Dropdown monté : un déclencheur et un panneau ouvrable au clic. */
export interface Dropdown extends ToolbarWidget {
  readonly trigger: HTMLButtonElement;
  readonly panel: HTMLElement;
  open(): void;
  /** Ferme le panneau ; `focusTrigger` redonne le focus au déclencheur (Échap). */
  close(focusTrigger?: boolean): void;
  isOpen(): boolean;
}

/** Options de création d'un dropdown générique. */
export interface DropdownOptions {
  editor: AsterEditor;
  /** Clé i18n du libellé du déclencheur, retraduite à chaque `update()`. */
  labelKey: string;
  icon?: string;
  /** Texte visible dans le déclencheur, recalculé à chaque `update()` (ex. style courant). */
  getText?: () => string;
  /** `menu` : navigation flèches entre `menuitem` ; `dialog` : formulaire avec Tab natif. */
  panelRole?: 'menu' | 'dialog';
  panelClass?: string;
  /** Construit le contenu du panneau à chaque ouverture, pour refléter l'état courant. */
  renderPanel: (panel: HTMLElement, dropdown: Dropdown) => void;
  /** Déclencheur actif ? Réévalué à chaque `update()`. Par défaut : pas en lecture seule. */
  isEnabled?: () => boolean;
  /** Le déclencheur est « enfoncé » ? Réévalué à chaque `update()`. */
  isActive?: () => boolean;
}

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/**
 * Dropdown accessible et sans dépendance : `aria-haspopup`/`aria-expanded` sur le
 * déclencheur, fermeture à Échap, au clic extérieur et après sélection, navigation
 * flèches haut/bas dans un panneau `menu`. Le contenu du panneau est reconstruit à chaque
 * ouverture par `renderPanel`, ce qui évite de synchroniser un état interne.
 */
export function createDropdown(options: DropdownOptions): Dropdown {
  const { editor } = options;
  const panelRole = options.panelRole ?? 'menu';
  const root = el('div', { className: 'aster-dropdown' });
  // Le déclencheur hérite du `mousedown` neutralisé de `createPlainButton` : cliquer dessus
  // ne retire pas le focus à l'éditeur, `open()` le déplace ensuite explicitement sur la
  // première entrée du panneau.
  const trigger = createPlainButton({
    className: 'aster-dropdown__trigger',
    icon: options.icon,
    text: options.getText ? options.getText() : undefined,
    toolbarItem: true,
  });
  trigger.setAttribute('aria-haspopup', panelRole === 'menu' ? 'menu' : 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const chevron = el('span', { className: 'aster-dropdown__chevron' });
  setIcon(chevron, getIcon('chevron-down'));
  trigger.append(chevron);

  const panel = el('div', {
    className: ['aster-dropdown__panel', options.panelClass].filter(Boolean).join(' '),
    attrs: { role: panelRole, hidden: '' },
  });
  root.append(trigger, panel);

  let opened = false;

  const onDocumentMouseDown = (event: MouseEvent): void => {
    if (!(event.target instanceof Node) || !root.contains(event.target)) close(false);
  };

  const close = (focusTrigger = false): void => {
    if (!opened) return;
    opened = false;
    panel.setAttribute('hidden', '');
    trigger.setAttribute('aria-expanded', 'false');
    root.classList.remove('aster-dropdown--open');
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    clear(panel);
    if (focusTrigger) trigger.focus();
  };

  const open = (): void => {
    if (opened || trigger.disabled) return;
    opened = true;
    clear(panel);
    options.renderPanel(panel, dropdown);
    panel.removeAttribute('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    root.classList.add('aster-dropdown--open');
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    const first =
      panel.querySelector<HTMLElement>('[autofocus]') ??
      enabledElements(panel, MENU_ITEM_SELECTOR)[0] ??
      panel.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
  };

  const onTriggerClick = (): void => {
    if (opened) close(false);
    else open();
  };

  const onTriggerKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' && !opened) {
      event.preventDefault();
      open();
    }
  };

  const onPanelKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (panelRole !== 'menu') return;
    const items = enabledElements(panel, MENU_ITEM_SELECTOR);
    const current = items.findIndex((item) => item === document.activeElement);
    const target = rovingIndexFor(event.key, current, items.length, 'vertical');
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    items[target]?.focus();
  };

  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeyDown);
  panel.addEventListener('keydown', onPanelKeyDown);

  const update = (): void => {
    const label = editor.i18n.t(options.labelKey);
    applyTooltip(trigger, label);
    const text = trigger.querySelector<HTMLElement>('.aster-toolbar__text');
    if (text && options.getText) text.textContent = options.getText();
    const enabled = options.isEnabled ? options.isEnabled() : !editor.isReadOnly();
    setDisabled(trigger, !enabled);
    if (!enabled) close(false);
    if (options.isActive) {
      const active = options.isActive();
      trigger.setAttribute('aria-pressed', active ? 'true' : 'false');
      trigger.classList.toggle('aster-toolbar__button--active', active);
    }
  };

  const dropdown: Dropdown = {
    element: root,
    trigger,
    panel,
    open,
    close,
    isOpen: () => opened,
    update,
    destroy: () => {
      close(false);
      trigger.removeEventListener('click', onTriggerClick);
      trigger.removeEventListener('keydown', onTriggerKeyDown);
      panel.removeEventListener('keydown', onPanelKeyDown);
    },
  };
  update();
  return dropdown;
}

/** Options d'une entrée de menu. */
export interface MenuItemOptions {
  text: string;
  icon?: string;
  /** Entrée cochable (`menuitemradio` + `aria-checked`). */
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  className?: string;
}

/**
 * Entrée de menu cliquable, cochée via `aria-checked` quand elle reflète un état
 * (niveau de titre courant, police active…).
 */
export function createMenuItem(options: MenuItemOptions): HTMLButtonElement {
  const item = createPlainButton({
    className: ['aster-menu__item', options.className].filter(Boolean).join(' '),
    icon: options.icon,
    text: options.text,
  });
  item.tabIndex = -1;
  if (options.checked === undefined) {
    item.setAttribute('role', 'menuitem');
  } else {
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', options.checked ? 'true' : 'false');
    item.classList.toggle('aster-menu__item--checked', options.checked);
  }
  setDisabled(item, options.disabled === true);
  item.addEventListener('click', () => {
    if (!item.disabled) options.onSelect();
  });
  return item;
}

/**
 * Dropdown générique décrit par un `ToolbarDropdownItem` : chaque entrée exécute une
 * commande puis referme le menu. Les entrées dont la commande est inconnue sont ignorées
 * avec un avertissement, comme pour les boutons.
 */
export function createCommandDropdown(editor: AsterEditor, item: ToolbarDropdownItem): Dropdown {
  const entries = item.items.filter((entry) => {
    const known = editor.commands.has(entry.command);
    if (!known)
      console.warn(`[aster-ui] dropdown "${item.id}": unknown command "${entry.command}"`);
    return known;
  });
  return createDropdown({
    editor,
    labelKey: item.labelKey,
    icon: item.icon ?? 'chevron-down',
    isEnabled: () => entries.some((entry) => editor.commands.canRun(entry.command, entry.args)),
    isActive: () => entries.some((entry) => editor.commands.isActive(entry.command, entry.args)),
    renderPanel: (panel, dropdown) => {
      for (const entry of entries) {
        const command = editor.commands.get(entry.command);
        if (!command) continue;
        panel.append(
          createMenuItem({
            text: editor.i18n.t(entry.labelKey ?? command.labelKey),
            icon: resolveIcon(entry.command, entry.icon, command.icon),
            checked: editor.commands.isActive(entry.command, entry.args),
            disabled: !editor.commands.canRun(entry.command, entry.args),
            onSelect: () => {
              editor.commands.run(entry.command, entry.args);
              dropdown.close(false);
              editor.focus();
            },
          }),
        );
      }
    },
  });
}
