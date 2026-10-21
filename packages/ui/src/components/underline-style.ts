import type { AsterEditor, DecorationStyle } from '@aster-editor/core';
import type { ToolbarWidget } from '../types.js';
import { isRecord } from '../utils/guards.js';
import { createDropdown, createMenuItem } from './dropdown.js';

/** Styles de soulignement proposés, dans l'ordre du menu. */
export const UNDERLINE_STYLES: readonly DecorationStyle[] = [
  'solid',
  'double',
  'dotted',
  'dashed',
  'wavy',
];

function isDecorationStyle(value: unknown): value is DecorationStyle {
  return typeof value === 'string' && (UNDERLINE_STYLES as readonly string[]).includes(value);
}

/**
 * Style du soulignement courant : `null` hors soulignement, `solid` si la marque est
 * active sans `decorationStyle` (valeur implicite).
 */
export function currentUnderlineStyle(editor: AsterEditor): DecorationStyle | null {
  if (!editor.commands.isActive('underline')) return null;
  try {
    const attrs: unknown = editor.tiptap.getAttributes('underline');
    const value = isRecord(attrs) ? attrs['decorationStyle'] : null;
    return isDecorationStyle(value) ? value : 'solid';
  } catch {
    return 'solid';
  }
}

/**
 * Pose la marque `underline` avec un style de trait. Hors contrat : aucune commande
 * standard ne prend `decorationStyle`, on passe par la chaîne Tiptap
 * (`setMark('underline', { decorationStyle })`), attribut ajouté par L23 à l'extension.
 */
export function applyUnderlineStyle(editor: AsterEditor, style: DecorationStyle): boolean {
  return editor.tiptap.chain().focus().setMark('underline', { decorationStyle: style }).run();
}

/**
 * Widget `underlineStyle` : menu Simple / Double / Pointillé / Tirets / Ondulé, séparé du
 * bouton « souligné » standard (qui bascule la marque). Une entrée pose la marque avec le
 * style choisi ; l'entrée cochée reflète le soulignement courant.
 */
export function createUnderlineStyleMenu(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'ui.underlineStyle.label',
    icon: 'underline-style',
    panelClass: 'aster-menu aster-underline-style',
    isEnabled: () => editor.commands.canRun('underline'),
    isActive: () => currentUnderlineStyle(editor) !== null,
    renderPanel: (panel, dropdown) => {
      const current = currentUnderlineStyle(editor);
      for (const style of UNDERLINE_STYLES) {
        const item = createMenuItem({
          className: `aster-underline-style__item aster-underline-style__item--${style}`,
          text: editor.i18n.t(`ui.underlineStyle.${style}`),
          checked: current === style,
          onSelect: () => {
            applyUnderlineStyle(editor, style);
            dropdown.close(false);
            editor.focus();
          },
        });
        // Aperçu du trait sur le libellé lui-même.
        const text = item.querySelector<HTMLElement>('.aster-toolbar__text');
        if (text) {
          text.style.textDecorationLine = 'underline';
          text.style.textDecorationStyle = style;
        }
        panel.append(item);
      }
    },
  });
}
