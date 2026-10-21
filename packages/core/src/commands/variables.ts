import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import type { AsterCommand, AsterEditor } from '../api/index.js';
import { VARIABLE_NODE_NAME, canInsertVariable, variableName } from '../editor/variable-store.js';
import { defineStandardCommand } from './define.js';

/** Puce visée par `variable.remove` : sa plage de positions et son nom. */
export interface VariableRange {
  readonly from: number;
  readonly to: number;
  readonly name: string;
}

/**
 * Puce « sélectionnée ou sous le curseur » : un `NodeSelection` sur une variable, ou
 * un curseur (sélection vide) collé à une puce, celle d'après d'abord puis celle d'avant.
 * Une sélection de texte qui englobe une puce ne compte pas : ce n'est pas une puce
 * sélectionnée, et la supprimer surprendrait.
 */
export function findVariableAtSelection(state: EditorState): VariableRange | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    const { node } = selection;
    return node.type.name === VARIABLE_NODE_NAME
      ? { from: selection.from, to: selection.to, name: variableName(node) }
      : null;
  }
  if (!selection.empty) {
    return null;
  }
  const { $from } = selection;
  const after = $from.nodeAfter;
  if (after && after.type.name === VARIABLE_NODE_NAME) {
    return { from: $from.pos, to: $from.pos + after.nodeSize, name: variableName(after) };
  }
  const before = $from.nodeBefore;
  if (before && before.type.name === VARIABLE_NODE_NAME) {
    return { from: $from.pos - before.nodeSize, to: $from.pos, name: variableName(before) };
  }
  return null;
}

/** Vrai si `variable.insert` peut s'exécuter avec ces arguments dans l'état courant. */
function canInsert(editor: AsterEditor, args: { name: string } | undefined): boolean {
  return (
    args !== undefined &&
    typeof args.name === 'string' &&
    canInsertVariable(editor, args.name) &&
    // Un bloc de code n'accepte que du texte : `insertContent` y collerait `{{nom}}`.
    !editor.tiptap.isActive('codeBlock')
  );
}

/**
 * Commandes des variables de document (champs de fusion). `variable.insert` remplace la
 * sélection par une puce ; refusé si le nom est invalide, si `allowUnknown` est faux et
 * la variable non déclarée, ou dans un bloc de code (la lecture seule est filtrée par le
 * registre). `variable.remove` supprime la puce sélectionnée ou collée au curseur ;
 * `canRun` et `isActive` disent s'il y en a une.
 */
export const VARIABLE_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('variable.insert', {
    run: (editor, args) => {
      if (!canInsert(editor, args)) {
        return false;
      }
      const label = typeof args.label === 'string' && args.label !== '' ? args.label : null;
      return editor.tiptap
        .chain()
        .focus()
        .insertContent({ type: VARIABLE_NODE_NAME, attrs: { name: args.name, label } })
        .run();
    },
    canRun: (editor, args) => canInsert(editor, args),
  }),
  defineStandardCommand('variable.remove', {
    run: (editor) => {
      const range = findVariableAtSelection(editor.tiptap.state);
      if (!range) {
        return false;
      }
      return editor.tiptap.chain().focus().deleteRange({ from: range.from, to: range.to }).run();
    },
    canRun: (editor) => findVariableAtSelection(editor.tiptap.state) !== null,
    isActive: (editor) => findVariableAtSelection(editor.tiptap.state) !== null,
  }),
];
