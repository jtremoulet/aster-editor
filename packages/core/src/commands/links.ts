import type { AsterCommand, AsterEditor } from '../api';
import { isAllowedHref, type ResolvedLinkPolicy } from '../extensions/link-safety';
import { defineStandardCommand } from './define';

/**
 * Commandes de lien, paramétrées par la politique de l'éditeur : `link.set` refuse
 * un `href` interdit avant même d'atteindre Tiptap, pour que `canRun` puisse
 * griser le bouton du dialogue sans effet de bord.
 */
export function createLinkCommands(policy: ResolvedLinkPolicy): readonly AsterCommand[] {
  const resolveAttributes = (args: {
    href: string;
    target?: '_blank' | '_self';
    title?: string;
  }): { href: string; target: string; title: string | null } => ({
    href: args.href,
    target: args.target ?? policy.defaultTarget,
    title: args.title ?? null,
  });

  const hasValidHref = (args: { href: string } | undefined): args is { href: string } =>
    args !== undefined &&
    typeof args.href === 'string' &&
    args.href.trim() !== '' &&
    isAllowedHref(args.href, policy);

  const selectionIsEmpty = (editor: AsterEditor): boolean => editor.tiptap.state.selection.empty;

  return [
    defineStandardCommand('link.set', {
      shortcut: 'Mod-k',
      run: (editor, args) => {
        if (!hasValidHref(args)) {
          return false;
        }
        const attrs = resolveAttributes(args);
        // Sélection vide hors d'un lien existant : insérer l'URL comme texte lié,
        // sinon `setLink` ne trouve rien à marquer et ne fait rien.
        if (selectionIsEmpty(editor) && !editor.tiptap.isActive('link')) {
          return editor.tiptap
            .chain()
            .focus()
            .insertContent({ type: 'text', text: attrs.href, marks: [{ type: 'link', attrs }] })
            .run();
        }
        return editor.tiptap.chain().focus().extendMarkRange('link').setLink(attrs).run();
      },
      canRun: (editor, args) =>
        hasValidHref(args) &&
        (selectionIsEmpty(editor) || editor.tiptap.can().setLink(resolveAttributes(args))),
      isActive: (editor) => editor.tiptap.isActive('link'),
    }),
    defineStandardCommand('link.unset', {
      run: (editor) => editor.tiptap.chain().focus().extendMarkRange('link').unsetLink().run(),
      canRun: (editor) => editor.tiptap.isActive('link'),
      isActive: () => false,
    }),
  ];
}
