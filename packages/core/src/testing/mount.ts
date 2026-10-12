import type { AsterEditor, AsterOptions } from '../api';
import { createEditor } from '../editor/create-editor';

/** Éditeur monté dans un hôte jeté après le test. */
export interface MountedEditor {
  readonly editor: AsterEditor;
  readonly element: HTMLElement;
  /** Détruit l'éditeur et retire l'hôte du document. Idempotent. */
  cleanup(): void;
}

/**
 * Monte un éditeur dans un `<div>` attaché au `document` de jsdom. Attacher
 * l'hôte compte : ProseMirror calcule le focus et certaines commandes contre
 * `document.activeElement`, un élément détaché se comporte différemment.
 */
export function mountEditor(options: Partial<AsterOptions> = {}): MountedEditor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = createEditor({ element, ...options });
  return {
    editor,
    element,
    cleanup() {
      if (!editor.isDestroyed()) {
        editor.destroy();
      }
      element.remove();
    },
  };
}

/** Place la sélection sur une plage de positions ProseMirror. */
export function selectRange(editor: AsterEditor, from: number, to: number): void {
  editor.tiptap.commands.setTextSelection({ from, to });
}

/**
 * Sélectionne tout le texte du premier bloc : de la position 1 (après l'ouverture
 * du bloc) à la fin de son contenu. Suffit pour tester les marques sur un
 * document d'un seul paragraphe.
 */
export function selectFirstBlock(editor: AsterEditor): void {
  const first = editor.tiptap.state.doc.firstChild;
  const size = first ? first.content.size : 0;
  selectRange(editor, 1, 1 + size);
}
