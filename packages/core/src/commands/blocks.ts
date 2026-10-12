import type { AsterCommand } from '../api';
import { defineStandardCommand } from './define';

/**
 * Blocs de texte. `heading` prend un niveau : pas de `shortcut` sur la commande
 * elle-même, les six liaisons `Mod-Alt-1..6` vivent dans `EXTRA_SHORTCUT_BINDINGS`
 * puisqu'un seul champ ne peut pas en décrire six.
 */
export const BLOCK_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('paragraph', {
    run: (editor) => editor.tiptap.chain().focus().setParagraph().run(),
    canRun: (editor) => editor.tiptap.can().setParagraph(),
    isActive: (editor) => editor.tiptap.isActive('paragraph'),
  }),
  defineStandardCommand('heading', {
    run: (editor, args) => editor.tiptap.chain().focus().toggleHeading({ level: args.level }).run(),
    canRun: (editor, args) => editor.tiptap.can().toggleHeading({ level: args.level }),
    isActive: (editor, args) => editor.tiptap.isActive('heading', { level: args.level }),
  }),
  defineStandardCommand('blockquote', {
    run: (editor) => editor.tiptap.chain().focus().toggleBlockquote().run(),
    canRun: (editor) => editor.tiptap.can().toggleBlockquote(),
    isActive: (editor) => editor.tiptap.isActive('blockquote'),
  }),
  defineStandardCommand('codeBlock', {
    run: (editor) => editor.tiptap.chain().focus().toggleCodeBlock().run(),
    canRun: (editor) => editor.tiptap.can().toggleCodeBlock(),
    isActive: (editor) => editor.tiptap.isActive('codeBlock'),
  }),
  defineStandardCommand('horizontalRule', {
    run: (editor) => editor.tiptap.chain().focus().setHorizontalRule().run(),
    canRun: (editor) => editor.tiptap.can().setHorizontalRule(),
  }),
  defineStandardCommand('hardBreak', {
    run: (editor) => editor.tiptap.chain().focus().setHardBreak().run(),
    canRun: (editor) => editor.tiptap.can().setHardBreak(),
  }),
];
