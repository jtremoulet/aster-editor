import type { AsterCommand } from '../api/index.js';
import { defineStandardCommand } from './define.js';

/** Marques que `clearFormatting` conserve : un lien est une donnée, pas une mise en forme. */
const PRESERVED_MARKS: ReadonlySet<string> = new Set(['link']);

/**
 * Marques inline. Chaque commande est un toggle Tiptap : `canRun` interroge
 * `can()` pour refléter l'impossibilité de marquer un bloc de code, par exemple.
 */
export const MARK_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('bold', {
    shortcut: 'Mod-b',
    run: (editor) => editor.tiptap.chain().focus().toggleBold().run(),
    canRun: (editor) => editor.tiptap.can().toggleBold(),
    isActive: (editor) => editor.tiptap.isActive('bold'),
  }),
  defineStandardCommand('italic', {
    shortcut: 'Mod-i',
    run: (editor) => editor.tiptap.chain().focus().toggleItalic().run(),
    canRun: (editor) => editor.tiptap.can().toggleItalic(),
    isActive: (editor) => editor.tiptap.isActive('italic'),
  }),
  defineStandardCommand('underline', {
    shortcut: 'Mod-u',
    run: (editor) => editor.tiptap.chain().focus().toggleUnderline().run(),
    canRun: (editor) => editor.tiptap.can().toggleUnderline(),
    isActive: (editor) => editor.tiptap.isActive('underline'),
  }),
  defineStandardCommand('strike', {
    shortcut: 'Mod-Shift-s',
    run: (editor) => editor.tiptap.chain().focus().toggleStrike().run(),
    canRun: (editor) => editor.tiptap.can().toggleStrike(),
    isActive: (editor) => editor.tiptap.isActive('strike'),
  }),
  defineStandardCommand('subscript', {
    run: (editor) => editor.tiptap.chain().focus().toggleSubscript().run(),
    canRun: (editor) => editor.tiptap.can().toggleSubscript(),
    isActive: (editor) => editor.tiptap.isActive('subscript'),
  }),
  defineStandardCommand('superscript', {
    run: (editor) => editor.tiptap.chain().focus().toggleSuperscript().run(),
    canRun: (editor) => editor.tiptap.can().toggleSuperscript(),
    isActive: (editor) => editor.tiptap.isActive('superscript'),
  }),
  defineStandardCommand('code', {
    shortcut: 'Mod-e',
    run: (editor) => editor.tiptap.chain().focus().toggleCode().run(),
    canRun: (editor) => editor.tiptap.can().toggleCode(),
    isActive: (editor) => editor.tiptap.isActive('code'),
  }),
  defineStandardCommand('highlight', {
    shortcut: 'Mod-Shift-h',
    run: (editor) => editor.tiptap.chain().focus().toggleHighlight().run(),
    canRun: (editor) => editor.tiptap.can().toggleHighlight(),
    isActive: (editor) => editor.tiptap.isActive('highlight'),
  }),
  defineStandardCommand('clearFormatting', {
    // Retire les marques (sauf le lien) puis ramène les blocs de texte au paragraphe,
    // alignement compris : un seul geste pour revenir au texte nu, comme le « Effacer
    // la mise en forme » de Word. Les conteneurs (liste, citation, cellule) restent :
    // `clearNodes` de Tiptap sortirait l'item de sa liste, ce n'est pas de la mise en forme.
    run: (editor) =>
      editor.tiptap
        .chain()
        .focus()
        .command(({ tr, state }) => {
          const paragraph = state.schema.nodes['paragraph'];
          const marks = Object.values(state.schema.marks).filter(
            (mark) => !PRESERVED_MARKS.has(mark.name),
          );
          for (const range of tr.selection.ranges) {
            const from = range.$from.pos;
            const to = range.$to.pos;
            for (const mark of marks) {
              tr.removeMark(from, to, mark);
            }
            if (paragraph) {
              tr.setBlockType(from, to, paragraph);
            }
          }
          return true;
        })
        .run(),
    canRun: (editor) => !editor.isEmpty(),
  }),
];
