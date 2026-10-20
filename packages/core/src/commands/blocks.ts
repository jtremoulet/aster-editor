import { setBlockType } from '@tiptap/pm/commands';
import type { Attrs } from '@tiptap/pm/model';
import type { Command, EditorState } from '@tiptap/pm/state';
import type { AsterCommand, AsterEditor } from '../api';
import { defineStandardCommand } from './define';

/**
 * Commande ProseMirror `setBlockType` pour un type du schéma, `null` si le schéma ne
 * le connaît pas (extension retirée par l'intégrateur). On passe par ProseMirror et
 * non par `setNode` de Tiptap : celui-ci se replie sur `clearNodes` quand le type ne
 * peut pas être posé, ce qui sort un item de sa liste ou déballe une citation alors
 * que la commande échoue ensuite, et `can()` ne reflète pas ce repli. Ici, pas de
 * repli : dans un item de liste, `heading` et `paragraph` répondent `false` sans
 * toucher au document (pas de titre dans les listes en V1, schéma inchangé).
 */
function blockTypeCommand(
  state: EditorState,
  typeName: string,
  attrs: Attrs | null,
): Command | null {
  const type = state.schema.nodes[typeName];
  if (!type) {
    return null;
  }
  // `hasMarkup` compare tous les attributs : on complète ceux demandés par les défauts
  // du schéma (`textAlign: null`…), sinon un `<h2>` ne serait jamais « déjà en place ».
  return setBlockType(type, type.create(attrs).attrs);
}

function runBlockType(editor: AsterEditor, typeName: string, attrs: Attrs | null): boolean {
  return editor.tiptap
    .chain()
    .focus()
    .command(({ state, dispatch }) => {
      const command = blockTypeCommand(state, typeName, attrs);
      return command ? command(state, dispatch) : false;
    })
    .run();
}

function canBlockType(editor: AsterEditor, typeName: string, attrs: Attrs | null): boolean {
  const { state } = editor.tiptap;
  const command = blockTypeCommand(state, typeName, attrs);
  return command ? command(state) : false;
}

/**
 * Blocs de texte. `heading` prend un niveau : pas de `shortcut` sur la commande
 * elle-même, les six liaisons `Mod-Alt-1..6` vivent dans `EXTRA_SHORTCUT_BINDINGS`
 * puisqu'un seul champ ne peut pas en décrire six. `paragraph` et `heading` posent
 * le type sans bascule ni repli : `canRun` et `run` répondent la même chose, et un
 * bloc déjà du type demandé ne donne rien à faire (`false`, document inchangé).
 */
export const BLOCK_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('paragraph', {
    run: (editor) => runBlockType(editor, 'paragraph', null),
    canRun: (editor) => canBlockType(editor, 'paragraph', null),
    isActive: (editor) => editor.tiptap.isActive('paragraph'),
  }),
  defineStandardCommand('heading', {
    run: (editor, args) => runBlockType(editor, 'heading', { level: args.level }),
    canRun: (editor, args) => canBlockType(editor, 'heading', { level: args.level }),
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
