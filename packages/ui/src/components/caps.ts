import type { AsterEditor } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { isRecord } from '../utils/guards';
import { createDropdown, createMenuItem } from './dropdown';

/** Casses proposées : `null` = normal (marque retirée), sinon valeur de `RunLayoutAttrs.caps`. */
export type CapsValue = 'all' | 'small';

/** Identifiants des commandes additives du core (L23, hors `STANDARD_COMMAND_IDS`). */
export const CAPS_SET_COMMAND = 'text.setCaps';
export const CAPS_UNSET_COMMAND = 'text.unsetCaps';

/** Entrées du menu, dans l'ordre : casse et clé i18n. */
export const CAPS_OPTIONS: readonly {
  readonly value: CapsValue | null;
  readonly labelKey: string;
}[] = [
  { value: null, labelKey: 'ui.caps.normal' },
  { value: 'all', labelKey: 'ui.caps.all' },
  { value: 'small', labelKey: 'ui.caps.small' },
];

/** Casse courante sous la sélection (attribut `caps` de la marque `textStyle`), `null` sinon. */
export function currentCaps(editor: AsterEditor): CapsValue | null {
  try {
    const attrs: unknown = editor.tiptap.getAttributes('textStyle');
    if (!isRecord(attrs)) return null;
    const value = attrs['caps'];
    return value === 'all' || value === 'small' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Widget `caps` : menu Normal / MAJUSCULES / Petites capitales. Une casse envoie
 * `text.setCaps({ caps })`, « Normal » envoie `text.unsetCaps`. Les deux commandes sont
 * additives (hors contrat figé, annoncées par L23) : le widget n'est rendu que si
 * `text.setCaps` est enregistrée.
 */
export function createCapsMenu(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'ui.caps.label',
    icon: 'caps',
    panelClass: 'aster-menu aster-caps',
    isEnabled: () => editor.commands.canRun(CAPS_SET_COMMAND, { caps: 'all' }),
    isActive: () => currentCaps(editor) !== null,
    renderPanel: (panel, dropdown) => {
      const current = currentCaps(editor);
      for (const option of CAPS_OPTIONS) {
        const item = createMenuItem({
          className: `aster-caps__item aster-caps__item--${option.value ?? 'normal'}`,
          text: editor.i18n.t(option.labelKey),
          checked: current === option.value,
          disabled:
            option.value === null
              ? !editor.commands.canRun(CAPS_UNSET_COMMAND)
              : !editor.commands.canRun(CAPS_SET_COMMAND, { caps: option.value }),
          onSelect: () => {
            if (option.value === null) editor.commands.run(CAPS_UNSET_COMMAND);
            else editor.commands.run(CAPS_SET_COMMAND, { caps: option.value });
            dropdown.close(false);
            editor.focus();
          },
        });
        panel.append(item);
      }
    },
  });
}
