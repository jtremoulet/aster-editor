import type { AsterEditor, OutlineEntry } from '@aster-editor/core';
import { getOutline, scrollToHeading } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { clear, el } from '../utils/dom';
import { createDropdown, createMenuItem } from './dropdown';

/** Sommaire de l'éditeur, tolérant si la vue manque (éditeur de test sans Tiptap). */
function readOutline(editor: AsterEditor): readonly OutlineEntry[] {
  try {
    return getOutline(editor);
  } catch {
    return [];
  }
}

/**
 * Widget `outline` : dropdown listant les titres du document (`getOutline`), indentés
 * par niveau ; un clic place le curseur dans le titre et le fait défiler dans la vue
 * (`scrollToHeading`). Le menu est reconstruit à chaque ouverture et à chaque
 * `selectionChange` pendant qu'il est ouvert, il suit donc les titres ajoutés.
 * Disponible en lecture seule : naviguer n'est pas modifier.
 */
export function createOutlinePanel(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'ui.outline.label',
    icon: 'outline',
    panelClass: 'aster-menu aster-outline',
    isEnabled: () => !editor.isDestroyed(),
    renderPanel: (panel, dropdown) => {
      const entries = readOutline(editor);
      // readOutline peut dispatcher une transaction (ids de titres) qui déclenche un
      // re-rendu imbriqué via selectionChange : on repart d'un panneau vide.
      clear(panel);
      panel.setAttribute('aria-label', editor.i18n.t('ui.outline.label'));
      if (entries.length === 0) {
        panel.append(
          el('div', { className: 'aster-outline__empty', text: editor.i18n.t('ui.outline.empty') }),
        );
        return;
      }
      for (const entry of entries) {
        const item = createMenuItem({
          text: entry.text || '—',
          className: `aster-outline__item aster-outline__item--h${entry.level}`,
          onSelect: () => {
            dropdown.close(false);
            scrollToHeading(editor, entry.pos);
          },
        });
        item.dataset['pos'] = String(entry.pos);
        item.dataset['headingId'] = entry.id;
        item.title = entry.text;
        panel.append(item);
      }
    },
  });
}
