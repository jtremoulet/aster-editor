import type { AsterEditor, HeadingLevel } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { createDropdown, createMenuItem } from './dropdown';

const LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/** Niveau de titre actif, `null` pour un paragraphe ou hors titre. */
function activeLevel(editor: AsterEditor): HeadingLevel | null {
  for (const level of LEVELS) {
    if (editor.commands.isActive('heading', { level })) return level;
  }
  return null;
}

/**
 * Widget `heading` : dropdown Paragraphe + Titre 1..6 dont le texte du déclencheur
 * reflète le niveau actif. Les commandes `paragraph` et `heading` doivent exister.
 */
export function createHeadingMenu(editor: AsterEditor): ToolbarWidget {
  const currentText = (): string => {
    const level = activeLevel(editor);
    return level === null
      ? editor.i18n.t('ui.heading.paragraph')
      : editor.i18n.t('command.heading.level', { level });
  };

  return createDropdown({
    editor,
    labelKey: 'ui.heading.label',
    getText: currentText,
    panelClass: 'aster-menu aster-menu--heading',
    isEnabled: () =>
      editor.commands.canRun('paragraph') || editor.commands.canRun('heading', { level: 1 }),
    renderPanel: (panel, dropdown) => {
      const current = activeLevel(editor);
      panel.append(
        createMenuItem({
          text: editor.i18n.t('ui.heading.paragraph'),
          icon: 'paragraph',
          checked: current === null,
          disabled: !editor.commands.canRun('paragraph'),
          className: 'aster-menu__item--paragraph',
          onSelect: () => {
            editor.commands.run('paragraph');
            dropdown.close(false);
            editor.focus();
          },
        }),
      );
      for (const level of LEVELS) {
        panel.append(
          createMenuItem({
            text: editor.i18n.t('command.heading.level', { level }),
            icon: `heading-${level}`,
            checked: current === level,
            disabled: !editor.commands.canRun('heading', { level }),
            className: `aster-menu__item--h${level}`,
            onSelect: () => {
              editor.commands.run('heading', { level });
              dropdown.close(false);
              editor.focus();
            },
          }),
        );
      }
    },
  });
}
