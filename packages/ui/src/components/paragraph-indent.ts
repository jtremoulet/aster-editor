import type { AsterEditor } from '@aster-editor/core';
import type { ToolbarWidget } from '../types.js';
import { createPlainButton, setDisabled } from './button.js';
import {
  INDENT_STEP_PT,
  MAX_PARAGRAPH_PT,
  canEditBlockLayout,
  currentBlockLayout,
  readNumber,
  setBlockLayout,
} from './paragraph-layout.js';
import { applyTooltip } from './tooltip.js';

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

/**
 * Retrait gauche résultant d'un clic, borné à 0 et arrondi au centième, plafonné à
 * `MAX_PARAGRAPH_PT`. `null` quand le résultat est nul : l'attribut est effacé (hérité)
 * plutôt que posé à `0`, qui sérialiserait `margin-left: 0pt` et laisserait le bloc
 * « mis en forme » pour le dialogue Espacement.
 */
export function nextIndentLeft(current: number, direction: IndentDirection): number | null {
  const next = direction === 'increase' ? current + INDENT_STEP_PT : current - INDENT_STEP_PT;
  const bounded = Math.min(MAX_PARAGRAPH_PT, Math.max(0, Math.round(next * 100) / 100));
  return bounded === 0 ? null : bounded;
}

/**
 * Widgets `indentIncrease` / `indentDecrease` : ±18 pt sur `indentLeftPt` du bloc courant
 * via `paragraph.setLayout`, borné à 0. Dans une liste, le bouton délègue aux commandes
 * `indent` / `outdent` du core (niveau d'item) dès qu'elles sont **enregistrées** : si la
 * commande de liste refuse (premier item, dernier niveau), le bouton est désactivé, il
 * ne retombe pas sur le paragraphe du `<li>`. La retombée ne vaut que pour un core sans
 * commande de liste. « Diminuer » est désactivé quand le retrait est déjà nul.
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

  /** Délégation à la liste : dans une liste, dès que la commande de liste est enregistrée. */
  const delegatesToList = (): boolean => isInList(editor) && editor.commands.has(listCommand);

  const canRun = (): boolean => {
    if (delegatesToList()) return editor.commands.canRun(listCommand);
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
