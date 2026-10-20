import type { AsterEditor } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { createPlainButton, setDisabled } from './button';
import {
  INDENT_STEP_PT,
  canEditBlockLayout,
  currentBlockLayout,
  readNumber,
  setBlockLayout,
} from './paragraph-layout';
import { applyTooltip } from './tooltip';

/** Sens d'un bouton de retrait. */
export type IndentDirection = 'increase' | 'decrease';

/** Nœuds de liste : dans l'un d'eux, le retrait délègue aux commandes de liste du core. */
const LIST_NODES = ['bulletList', 'orderedList', 'taskList'] as const;

/** Commande de liste standard correspondant à chaque sens (`indent` / `outdent`). */
const LIST_COMMANDS: Readonly<Record<IndentDirection, 'indent' | 'outdent'>> = {
  increase: 'indent',
  decrease: 'outdent',
};

/** Vrai si le curseur est dans une liste (puces, numéros, tâches). */
export function isInList(editor: AsterEditor): boolean {
  try {
    return LIST_NODES.some((name) => editor.tiptap.isActive(name));
  } catch {
    return false;
  }
}

/** Retrait gauche courant du bloc, 0 s'il n'est pas posé. */
export function currentIndentLeft(editor: AsterEditor): number {
  return readNumber(currentBlockLayout(editor), 'indentLeftPt') ?? 0;
}

/** Retrait gauche résultant d'un clic, borné à 0 et arrondi au centième. */
export function nextIndentLeft(current: number, direction: IndentDirection): number {
  const next = direction === 'increase' ? current + INDENT_STEP_PT : current - INDENT_STEP_PT;
  return Math.max(0, Math.round(next * 100) / 100);
}

/**
 * Widgets `indentIncrease` / `indentDecrease` : ±18 pt sur `indentLeftPt` du bloc courant
 * via `paragraph.setLayout`, borné à 0. Dans une liste, le bouton délègue aux commandes
 * `indent` / `outdent` du core (niveau d'item) quand elles existent, sinon applique le
 * retrait au paragraphe. « Diminuer » est désactivé quand le retrait est déjà nul.
 */
export function createIndentButton(editor: AsterEditor, direction: IndentDirection): ToolbarWidget {
  const listCommand = LIST_COMMANDS[direction];
  const labelKey = `ui.paragraphSpacing.${direction}`;
  const button = createPlainButton({
    icon: `indent-${direction}`,
    toolbarItem: true,
    className: `aster-indent aster-indent--${direction}`,
  });
  button.dataset['widget'] = direction === 'increase' ? 'indentIncrease' : 'indentDecrease';

  /** Délégation à la liste : seulement si la commande existe et s'exécute. */
  const delegatesToList = (): boolean =>
    isInList(editor) && editor.commands.has(listCommand) && editor.commands.canRun(listCommand);

  const canRun = (): boolean => {
    if (delegatesToList()) return true;
    if (!canEditBlockLayout(editor)) return false;
    return direction === 'increase' || currentIndentLeft(editor) > 0;
  };

  const onClick = (): void => {
    if (button.disabled) return;
    if (delegatesToList()) {
      editor.commands.run(listCommand);
    } else {
      setBlockLayout(editor, {
        indentLeftPt: nextIndentLeft(currentIndentLeft(editor), direction),
      });
    }
    editor.focus();
  };
  button.addEventListener('click', onClick);

  const update = (): void => {
    applyTooltip(button, editor.i18n.t(labelKey));
    setDisabled(button, !canRun());
  };
  update();

  return {
    element: button,
    update,
    destroy: () => button.removeEventListener('click', onClick),
  };
}
