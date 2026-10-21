import type { AsterCommand } from '../api/index.js';
import { defineStandardCommand } from './define.js';

/**
 * Styles de texte portés par la marque `textStyle` de Tiptap. Convention commune
 * aux quatre commandes : une valeur `null` retire le style, ce qui permet à un
 * sélecteur de couleur d'avoir une entrée « Automatique » sans commande dédiée.
 * `isActive` avec une valeur teste cette valeur précise, pour cocher l'entrée du menu.
 */
export const TEXT_STYLE_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('textColor', {
    run: (editor, args) =>
      args.color === null
        ? editor.tiptap.chain().focus().unsetColor().run()
        : editor.tiptap.chain().focus().setColor(args.color).run(),
    canRun: (editor, args) =>
      args.color === null
        ? editor.tiptap.can().unsetColor()
        : editor.tiptap.can().setColor(args.color),
    isActive: (editor, args) =>
      args.color === null ? false : editor.tiptap.isActive('textStyle', { color: args.color }),
  }),
  defineStandardCommand('backgroundColor', {
    run: (editor, args) =>
      args.color === null
        ? editor.tiptap.chain().focus().unsetBackgroundColor().run()
        : editor.tiptap.chain().focus().setBackgroundColor(args.color).run(),
    canRun: (editor, args) =>
      args.color === null
        ? editor.tiptap.can().unsetBackgroundColor()
        : editor.tiptap.can().setBackgroundColor(args.color),
    isActive: (editor, args) =>
      args.color === null
        ? false
        : editor.tiptap.isActive('textStyle', { backgroundColor: args.color }),
  }),
  defineStandardCommand('fontFamily', {
    run: (editor, args) =>
      args.family === null
        ? editor.tiptap.chain().focus().unsetFontFamily().run()
        : editor.tiptap.chain().focus().setFontFamily(args.family).run(),
    canRun: (editor, args) =>
      args.family === null
        ? editor.tiptap.can().unsetFontFamily()
        : editor.tiptap.can().setFontFamily(args.family),
    isActive: (editor, args) =>
      args.family === null
        ? false
        : editor.tiptap.isActive('textStyle', { fontFamily: args.family }),
  }),
  defineStandardCommand('fontSize', {
    run: (editor, args) =>
      args.size === null
        ? editor.tiptap.chain().focus().unsetFontSize().run()
        : editor.tiptap.chain().focus().setFontSize(args.size).run(),
    canRun: (editor, args) =>
      args.size === null
        ? editor.tiptap.can().unsetFontSize()
        : editor.tiptap.can().setFontSize(args.size),
    isActive: (editor, args) =>
      args.size === null ? false : editor.tiptap.isActive('textStyle', { fontSize: args.size }),
  }),
];
