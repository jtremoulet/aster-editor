import type { AsterEditor, ToolbarButtonItem } from '@aster-editor/core';
import { getIcon, hasIcon, iconNameForCommand } from '../icons';
import type { ToolbarWidget } from '../types';
import { el, setIcon } from '../utils/dom';
import { applyTooltip } from './tooltip';

/** Classe de base des boutons de toolbar, partagée par les dropdowns pour le style. */
export const BUTTON_CLASS = 'aster-toolbar__button';

/** Attribut marquant un élément navigable au clavier au niveau de la toolbar. */
export const TOOLBAR_ITEM_ATTR = 'data-toolbar-item';

/** Options de rendu d'un bouton nu (sans commande liée). */
export interface PlainButtonOptions {
  /** Classe additionnelle. */
  className?: string;
  /** Nom d'icône du jeu interne, ou SVG inline complet si `iconSvg` est fourni. */
  icon?: string;
  /** Texte visible dans le bouton, en plus ou à la place de l'icône. */
  text?: string;
  /** Le bouton participe à la navigation flèches de la toolbar. */
  toolbarItem?: boolean;
}

/**
 * Crée un `<button type="button">` stylé toolbar avec icône optionnelle. Brique de base
 * des boutons de commande, des déclencheurs de dropdown et des entrées de menu.
 */
export function createPlainButton(options: PlainButtonOptions = {}): HTMLButtonElement {
  const className = [BUTTON_CLASS, options.className].filter(Boolean).join(' ');
  const button = el('button', { className, attrs: { type: 'button' } });
  if (options.toolbarItem) {
    button.setAttribute(TOOLBAR_ITEM_ATTR, '');
    button.tabIndex = -1;
  }
  if (options.icon) {
    const icon = el('span', { className: 'aster-toolbar__icon' });
    setIcon(icon, getIcon(options.icon));
    button.append(icon);
  }
  if (options.text !== undefined) {
    button.append(el('span', { className: 'aster-toolbar__text', text: options.text }));
  }
  return button;
}

/** Applique l'état désactivé de façon cohérente (`disabled` + `aria-disabled`). */
export function setDisabled(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
  if (disabled) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

/**
 * Résout l'icône d'un item de commande : surcharge explicite, puis `icon` déclaré par la
 * commande, puis convention `id` → kebab-case. Un nom absent du jeu tombe sur le repli.
 */
export function resolveIcon(commandId: string, override?: string, declared?: string): string {
  if (override) return override;
  if (declared && hasIcon(declared)) return declared;
  const conventional = iconNameForCommand(commandId);
  if (hasIcon(conventional)) return conventional;
  if (declared && hasIcon(iconNameForCommand(declared))) return iconNameForCommand(declared);
  return conventional;
}

/**
 * Bouton de commande : exécute `editor.commands.run(id, args)` au clic puis redonne le
 * focus à l'éditeur. `update()` reflète `isActive` (`aria-pressed`) et `canRun`
 * (`disabled`), et retraduit le libellé. Retourne `null` si la commande est inconnue :
 * c'est à l'appelant de décider (la toolbar avertit et ignore).
 */
export function createCommandButton(
  editor: AsterEditor,
  item: ToolbarButtonItem,
): ToolbarWidget | null {
  const command = editor.commands.get(item.command);
  if (!command) return null;

  const button = createPlainButton({
    icon: resolveIcon(item.command, item.icon, command.icon),
    toolbarItem: true,
  });
  button.dataset['command'] = item.command;

  const onClick = (): void => {
    if (button.disabled) return;
    editor.commands.run(item.command, item.args);
    editor.focus();
  };
  button.addEventListener('click', onClick);

  const update = (): void => {
    const label = editor.i18n.t(item.labelKey ?? command.labelKey);
    applyTooltip(button, label, command.shortcut);
    const active = editor.commands.isActive(item.command, item.args);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle(`${BUTTON_CLASS}--active`, active);
    setDisabled(button, !editor.commands.canRun(item.command, item.args));
  };
  update();

  return {
    element: button,
    update,
    destroy: () => button.removeEventListener('click', onClick),
  };
}
