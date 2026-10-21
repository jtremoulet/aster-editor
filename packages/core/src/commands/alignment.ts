import type { AsterCommand, AsterEditor, StandardCommandId } from '../api/index.js';
import { defineStandardCommand } from './define.js';

type Alignment = 'center' | 'right' | 'justify';

/** Types de bloc portant l'attribut `textAlign`, alignés sur `TextAlign.configure`. */
const ALIGNED_TYPES = ['paragraph', 'heading'] as const;

/**
 * Alignement du bloc courant, `null` s'il n'en a pas d'explicite. `getAttributes`
 * rend `{}` pour un type non actif, d'où le repli sur le type suivant.
 */
function currentAlignment(editor: AsterEditor): string | null {
  for (const type of ALIGNED_TYPES) {
    const value: unknown = editor.tiptap.getAttributes(type).textAlign;
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

/**
 * Vrai si la sélection porte sur un bloc alignable. Une image sélectionnée ou un
 * bloc de code n'ont pas d'alignement : aucun bouton `align*` ne doit y être enfoncé.
 */
function hasAlignedBlock(editor: AsterEditor): boolean {
  return ALIGNED_TYPES.some((type) => editor.tiptap.isActive(type));
}

const EXPLICIT_ALIGNMENTS: readonly [Extract<StandardCommandId, `align${string}`>, Alignment][] = [
  ['alignCenter', 'center'],
  ['alignRight', 'right'],
  ['alignJustify', 'justify'],
];

/**
 * Alignement de texte sur paragraphes et titres.
 *
 * Gauche est l'absence d'alignement : `alignLeft` retire l'attribut plutôt que
 * d'écrire `left`, pour ne jamais émettre de `style` sur un document non aligné,
 * et il est actif dès qu'aucun alignement explicite n'est posé. C'est ce qui fait
 * qu'un document vierge a bien un bouton enfoncé, comme dans tout traitement de
 * texte, sans polluer le HTML.
 */
export const ALIGNMENT_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('alignLeft', {
    run: (editor) => editor.tiptap.chain().focus().unsetTextAlign().run(),
    canRun: (editor) => editor.tiptap.can().setTextAlign('left'),
    isActive: (editor) => {
      if (!hasAlignedBlock(editor)) {
        return false;
      }
      const current = currentAlignment(editor);
      return current === null || current === 'left';
    },
  }),
  ...EXPLICIT_ALIGNMENTS.map(([id, alignment]) =>
    defineStandardCommand(id, {
      run: (editor) => editor.tiptap.chain().focus().setTextAlign(alignment).run(),
      canRun: (editor) => editor.tiptap.can().setTextAlign(alignment),
      isActive: (editor) =>
        hasAlignedBlock(editor) && editor.tiptap.isActive({ textAlign: alignment }),
    }),
  ),
];
