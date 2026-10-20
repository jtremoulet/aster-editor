import type { AsterCommand, AsterEditor } from '../api';
import { defineStandardCommand } from './define';

/** Types de nœud d'item que `indent`/`outdent` savent manipuler. */
const LIST_ITEM_TYPES = ['listItem', 'taskItem'] as const;

/** Premier type d'item que la commande `sinkListItem` accepte dans l'état courant. */
function sinkableItemType(editor: AsterEditor): string | undefined {
  return LIST_ITEM_TYPES.find((type) => editor.tiptap.can().sinkListItem(type));
}

/** Premier type d'item que la commande `liftListItem` accepte dans l'état courant. */
function liftableItemType(editor: AsterEditor): string | undefined {
  return LIST_ITEM_TYPES.find((type) => editor.tiptap.can().liftListItem(type));
}

/**
 * Listes. `indent`/`outdent` essaient `listItem` puis `taskItem` : Tiptap
 * distingue les deux nœuds, l'utilisateur ne voit qu'un retrait de liste.
 */
export const LIST_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('bulletList', {
    shortcut: 'Mod-Shift-8',
    run: (editor) => editor.tiptap.chain().focus().toggleBulletList().run(),
    canRun: (editor) => editor.tiptap.can().toggleBulletList(),
    isActive: (editor) => editor.tiptap.isActive('bulletList'),
  }),
  defineStandardCommand('orderedList', {
    shortcut: 'Mod-Shift-7',
    run: (editor) => editor.tiptap.chain().focus().toggleOrderedList().run(),
    canRun: (editor) => editor.tiptap.can().toggleOrderedList(),
    isActive: (editor) => editor.tiptap.isActive('orderedList'),
  }),
  defineStandardCommand('taskList', {
    run: (editor) => editor.tiptap.chain().focus().toggleTaskList().run(),
    canRun: (editor) => editor.tiptap.can().toggleTaskList(),
    isActive: (editor) => editor.tiptap.isActive('taskList'),
  }),
  defineStandardCommand('indent', {
    run: (editor) => {
      const type = sinkableItemType(editor);
      return type ? editor.tiptap.chain().focus().sinkListItem(type).run() : false;
    },
    canRun: (editor) => sinkableItemType(editor) !== undefined,
  }),
  defineStandardCommand('outdent', {
    run: (editor) => {
      const type = liftableItemType(editor);
      return type ? editor.tiptap.chain().focus().liftListItem(type).run() : false;
    },
    canRun: (editor) => liftableItemType(editor) !== undefined,
  }),
];
