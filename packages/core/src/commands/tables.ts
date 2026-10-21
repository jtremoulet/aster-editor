import type { AsterCommand } from '../api/index.js';
import { defineStandardCommand } from './define.js';

/**
 * Tables. Toutes les commandes d'édition de table s'appuient sur `can()` : hors
 * d'une table, Tiptap répond `false` et la toolbar les grise naturellement.
 * `table.insert` est la seule exécutable depuis un paragraphe, et seulement hors
 * d'une table : pas de tables imbriquées en V1, même si le schéma les tolère.
 */
export const TABLE_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('table.insert', {
    run: (editor, args) =>
      !editor.tiptap.isActive('table') &&
      editor.tiptap
        .chain()
        .focus()
        .insertTable({
          rows: args.rows,
          cols: args.cols,
          withHeaderRow: args.withHeaderRow ?? true,
        })
        .run(),
    canRun: (editor, args) =>
      args !== undefined &&
      args.rows > 0 &&
      args.cols > 0 &&
      !editor.tiptap.isActive('table') &&
      editor.tiptap.can().insertTable({ rows: args.rows, cols: args.cols }),
    isActive: (editor) => editor.tiptap.isActive('table'),
  }),
  defineStandardCommand('table.delete', {
    run: (editor) => editor.tiptap.chain().focus().deleteTable().run(),
    canRun: (editor) => editor.tiptap.can().deleteTable(),
  }),
  defineStandardCommand('table.addRowBefore', {
    run: (editor) => editor.tiptap.chain().focus().addRowBefore().run(),
    canRun: (editor) => editor.tiptap.can().addRowBefore(),
  }),
  defineStandardCommand('table.addRowAfter', {
    run: (editor) => editor.tiptap.chain().focus().addRowAfter().run(),
    canRun: (editor) => editor.tiptap.can().addRowAfter(),
  }),
  defineStandardCommand('table.deleteRow', {
    run: (editor) => editor.tiptap.chain().focus().deleteRow().run(),
    canRun: (editor) => editor.tiptap.can().deleteRow(),
  }),
  defineStandardCommand('table.addColumnBefore', {
    run: (editor) => editor.tiptap.chain().focus().addColumnBefore().run(),
    canRun: (editor) => editor.tiptap.can().addColumnBefore(),
  }),
  defineStandardCommand('table.addColumnAfter', {
    run: (editor) => editor.tiptap.chain().focus().addColumnAfter().run(),
    canRun: (editor) => editor.tiptap.can().addColumnAfter(),
  }),
  defineStandardCommand('table.deleteColumn', {
    run: (editor) => editor.tiptap.chain().focus().deleteColumn().run(),
    canRun: (editor) => editor.tiptap.can().deleteColumn(),
  }),
  defineStandardCommand('table.mergeCells', {
    run: (editor) => editor.tiptap.chain().focus().mergeCells().run(),
    canRun: (editor) => editor.tiptap.can().mergeCells(),
  }),
  defineStandardCommand('table.splitCell', {
    run: (editor) => editor.tiptap.chain().focus().splitCell().run(),
    canRun: (editor) => editor.tiptap.can().splitCell(),
  }),
  defineStandardCommand('table.toggleHeaderRow', {
    run: (editor) => editor.tiptap.chain().focus().toggleHeaderRow().run(),
    canRun: (editor) => editor.tiptap.can().toggleHeaderRow(),
  }),
  defineStandardCommand('table.toggleHeaderColumn', {
    run: (editor) => editor.tiptap.chain().focus().toggleHeaderColumn().run(),
    canRun: (editor) => editor.tiptap.can().toggleHeaderColumn(),
  }),
];
