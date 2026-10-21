import type { AsterCommand } from '../api/index.js';
import { defineStandardCommand } from './define.js';

/**
 * Historique et sélection. `redo` déclare `Mod-Shift-z` ; le second raccourci
 * `Mod-y` est ajouté par `EXTRA_SHORTCUT_BINDINGS`, un champ ne pouvant en porter deux.
 */
export const HISTORY_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('undo', {
    shortcut: 'Mod-z',
    run: (editor) => editor.tiptap.chain().focus().undo().run(),
    canRun: (editor) => editor.tiptap.can().undo(),
  }),
  defineStandardCommand('redo', {
    shortcut: 'Mod-Shift-z',
    run: (editor) => editor.tiptap.chain().focus().redo().run(),
    canRun: (editor) => editor.tiptap.can().redo(),
  }),
  defineStandardCommand('selectAll', {
    shortcut: 'Mod-a',
    run: (editor) => editor.tiptap.chain().focus().selectAll().run(),
    canRun: (editor) => editor.tiptap.can().selectAll(),
  }),
];
