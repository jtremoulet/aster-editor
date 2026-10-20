import type { AsterEditor } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { isRecord, readString } from '../utils/guards';
import { createDropdown, createMenuItem } from './dropdown';

/** Polices proposées par défaut : familles système sûres, sans chargement distant. */
export const FONT_FAMILIES: readonly string[] = [
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
];

/** Tailles proposées par défaut, en pixels. */
export const FONT_SIZES: readonly string[] = [
  '10px',
  '12px',
  '14px',
  '16px',
  '18px',
  '24px',
  '32px',
  '48px',
];

/** Attributs du mark `textStyle` tels qu'exposés par Tiptap. */
interface TextStyleAttributes {
  fontFamily: string | null;
  fontSize: string | null;
}

const NO_TEXT_STYLE: TextStyleAttributes = { fontFamily: null, fontSize: null };

/** Lit l'attribut courant du mark `textStyle`, tolérant si l'extension est absente. */
function currentTextStyle(editor: AsterEditor): TextStyleAttributes {
  try {
    const attrs: unknown = editor.tiptap.getAttributes('textStyle');
    if (!isRecord(attrs)) return NO_TEXT_STYLE;
    return { fontFamily: readString(attrs, 'fontFamily'), fontSize: readString(attrs, 'fontSize') };
  } catch {
    return NO_TEXT_STYLE;
  }
}

/**
 * Widget `fontFamily` : liste courte de polices + « police par défaut » qui passe
 * `{ family: null }`. Le texte du déclencheur reflète la police courante.
 */
export function createFontFamilyMenu(editor: AsterEditor): ToolbarWidget {
  const label = (family: string | null | undefined): string =>
    family ? family : editor.i18n.t('ui.font.default');
  return createDropdown({
    editor,
    labelKey: 'ui.font.family',
    icon: 'font-family',
    getText: () => label(currentTextStyle(editor).fontFamily),
    panelClass: 'aster-menu aster-menu--font',
    isEnabled: () => editor.commands.canRun('fontFamily', { family: null }),
    renderPanel: (panel, dropdown) => {
      const current = currentTextStyle(editor).fontFamily ?? null;
      const choices: readonly (string | null)[] = [null, ...FONT_FAMILIES];
      for (const family of choices) {
        const item = createMenuItem({
          text: label(family),
          checked: current === family,
          onSelect: () => {
            editor.commands.run('fontFamily', { family });
            dropdown.close(false);
            editor.focus();
          },
        });
        if (family) item.style.fontFamily = family;
        panel.append(item);
      }
    },
  });
}

/**
 * Widget `fontSize` : liste courte de tailles + « taille par défaut » qui passe
 * `{ size: null }`.
 */
export function createFontSizeMenu(editor: AsterEditor): ToolbarWidget {
  const label = (size: string | null | undefined): string =>
    size ? size : editor.i18n.t('ui.font.sizeDefault');
  return createDropdown({
    editor,
    labelKey: 'ui.font.size',
    icon: 'font-size',
    getText: () => label(currentTextStyle(editor).fontSize),
    panelClass: 'aster-menu aster-menu--font-size',
    isEnabled: () => editor.commands.canRun('fontSize', { size: null }),
    renderPanel: (panel, dropdown) => {
      const current = currentTextStyle(editor).fontSize ?? null;
      const choices: readonly (string | null)[] = [null, ...FONT_SIZES];
      for (const size of choices) {
        panel.append(
          createMenuItem({
            text: label(size),
            checked: current === size,
            onSelect: () => {
              editor.commands.run('fontSize', { size });
              dropdown.close(false);
              editor.focus();
            },
          }),
        );
      }
    },
  });
}
