import type { AsterEditor } from '@aster-editor/core';
import { getIcon } from '../icons';
import type { ToolbarWidget } from '../types';
import { el, setIcon } from '../utils/dom';
import { setDisabled } from './button';
import { createDropdown } from './dropdown';

/** Une couleur de la palette : valeur CSS et clé i18n de son nom. */
export interface PaletteColor {
  readonly value: string;
  readonly labelKey: string;
}

/** Palette de 20 couleurs : 5 neutres, 9 teintes franches, 6 teintes claires. */
export const COLOR_PALETTE: readonly PaletteColor[] = [
  { value: '#000000', labelKey: 'ui.color.black' },
  { value: '#4a4a4a', labelKey: 'ui.color.darkGray' },
  { value: '#8a8a8a', labelKey: 'ui.color.gray' },
  { value: '#d0d0d0', labelKey: 'ui.color.lightGray' },
  { value: '#ffffff', labelKey: 'ui.color.white' },
  { value: '#d32f2f', labelKey: 'ui.color.red' },
  { value: '#ef6c00', labelKey: 'ui.color.orange' },
  { value: '#f9a825', labelKey: 'ui.color.yellow' },
  { value: '#2e7d32', labelKey: 'ui.color.green' },
  { value: '#00897b', labelKey: 'ui.color.teal' },
  { value: '#1565c0', labelKey: 'ui.color.blue' },
  { value: '#3949ab', labelKey: 'ui.color.indigo' },
  { value: '#7b1fa2', labelKey: 'ui.color.purple' },
  { value: '#d81b60', labelKey: 'ui.color.pink' },
  { value: '#ffcdd2', labelKey: 'ui.color.lightRed' },
  { value: '#ffe0b2', labelKey: 'ui.color.lightOrange' },
  { value: '#fff9c4', labelKey: 'ui.color.lightYellow' },
  { value: '#c8e6c9', labelKey: 'ui.color.lightGreen' },
  { value: '#bbdefb', labelKey: 'ui.color.lightBlue' },
  { value: '#e1bee7', labelKey: 'ui.color.lightPurple' },
];

/** Commandes de couleur pilotables par ce widget. */
export type ColorCommand = 'textColor' | 'backgroundColor';

/** Attribut Tiptap portant la couleur courante pour chaque commande. */
const CURRENT_ATTRIBUTE: Readonly<Record<ColorCommand, { mark: string; attr: string }>> = {
  textColor: { mark: 'textStyle', attr: 'color' },
  backgroundColor: { mark: 'highlight', attr: 'color' },
};

/** Couleur courante sous la sélection, `null` si aucune ou si l'extension manque. */
function currentColor(editor: AsterEditor, command: ColorCommand): string | null {
  const source = CURRENT_ATTRIBUTE[command];
  try {
    const attrs: unknown = editor.tiptap.getAttributes(source.mark);
    if (typeof attrs !== 'object' || attrs === null) return null;
    const value = (attrs as Record<string, unknown>)[source.attr];
    return typeof value === 'string' ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Widget `textColor` / `backgroundColor` : palette de 20 pastilles + « aucune couleur »
 * qui envoie `{ color: null }`. Les pastilles sont des `menuitemradio` navigables aux
 * flèches, cochées quand elles correspondent à la couleur courante.
 */
export function createColorPicker(editor: AsterEditor, command: ColorCommand): ToolbarWidget {
  const icon = command === 'textColor' ? 'text-color' : 'background-color';
  const labelKey = `command.${command}`;

  const dropdown = createDropdown({
    editor,
    labelKey,
    icon,
    panelClass: 'aster-menu aster-color-picker',
    isEnabled: () => editor.commands.canRun(command, { color: null }),
    isActive: () => currentColor(editor, command) !== null,
    renderPanel: (panel, instance) => {
      const current = currentColor(editor, command);
      const apply = (color: string | null): void => {
        editor.commands.run(command, { color });
        instance.close(false);
        editor.focus();
      };

      const none = el('button', {
        className: 'aster-toolbar__button aster-color-picker__none',
        attrs: {
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': current === null ? 'true' : 'false',
        },
      });
      none.tabIndex = -1;
      const noneIcon = el('span', { className: 'aster-toolbar__icon' });
      setIcon(noneIcon, getIcon('none'));
      none.append(
        noneIcon,
        el('span', { className: 'aster-toolbar__text', text: editor.i18n.t('ui.color.none') }),
      );
      none.addEventListener('click', () => apply(null));
      panel.append(none);

      const grid = el('div', {
        className: 'aster-color-picker__grid',
        attrs: { role: 'group', 'aria-label': editor.i18n.t('ui.color.palette') },
      });
      for (const color of COLOR_PALETTE) {
        const checked = current === color.value;
        const swatch = el('button', {
          className: 'aster-color-picker__swatch',
          attrs: {
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': checked ? 'true' : 'false',
            'aria-label': editor.i18n.t(color.labelKey),
            title: editor.i18n.t(color.labelKey),
            'data-color': color.value,
          },
        });
        swatch.tabIndex = -1;
        swatch.style.setProperty('--aster-swatch', color.value);
        swatch.classList.toggle('aster-color-picker__swatch--checked', checked);
        setDisabled(swatch, false);
        swatch.addEventListener('click', () => apply(color.value));
        grid.append(swatch);
      }
      panel.append(grid);
    },
  });

  // La pastille d'aperçu dans le déclencheur reflète la couleur courante.
  const preview = el('span', { className: 'aster-color-picker__preview' });
  dropdown.trigger.insertBefore(
    preview,
    dropdown.trigger.querySelector('.aster-dropdown__chevron'),
  );
  const baseUpdate = dropdown.update;
  const update = (): void => {
    baseUpdate();
    const color = currentColor(editor, command);
    if (color) preview.style.setProperty('--aster-swatch', color);
    else preview.style.removeProperty('--aster-swatch');
    preview.classList.toggle('aster-color-picker__preview--empty', color === null);
  };
  update();
  return { element: dropdown.element, update, destroy: dropdown.destroy };
}
