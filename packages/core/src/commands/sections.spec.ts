import { AllSelection, NodeSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSectionBreaks, getSections, sectionBreakAttrs } from '../extensions/section-break.js';
import { findNodePos, mountEditor, selectRange, type MountedEditor } from '../testing/mount.js';

const TWO_BREAKS = '<p>a</p><hr data-section-break="1"><p>b</p><hr data-section-break="2"><p>c</p>';

/** Numéros `section` des sauts de premier niveau, dans l'ordre. */
function numbers(mounted: MountedEditor): number[] {
  return findSectionBreaks(mounted.editor.tiptap.state.doc).map(
    ({ node }) => sectionBreakAttrs(node).section,
  );
}

/** Frappe une touche par le vrai chemin de ProseMirror (voir `tab.spec.ts`). */
function pressKey(mounted: MountedEditor, key: string): boolean {
  const { view } = mounted.editor.tiptap;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  return view.someProp('handleKeyDown', (handler) => handler(view, event)) === true;
}

/** Place le curseur au début du premier bloc de texte dont le contenu est `text`. */
function cursorIn(mounted: MountedEditor, text: string): void {
  let target = -1;
  mounted.editor.tiptap.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isTextblock && node.textContent === text) {
      target = pos + 1;
    }
    return target < 0;
  });
  if (target < 0) {
    throw new Error(`bloc ${text} introuvable`);
  }
  selectRange(mounted.editor, target, target);
}

/**
 * Commandes `section.*` face aux sélections et arguments relevés par la revue R41 :
 * jamais de section vide (R41-03), arguments de `removeBreak` validés (R41-07).
 */
describe('commandes section.* (R41)', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>a</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('jamais de section vide (R41-03)', () => {
    it('insertBreak sur une AllSelection insère après le dernier bloc, jamais en tête', () => {
      mounted.editor.setHTML('<p>a</p><p>b</p>');
      mounted.editor.tiptap.commands.selectAll();
      expect(mounted.editor.tiptap.state.selection).toBeInstanceOf(AllSelection);
      expect(mounted.editor.commands.canRun('section.insertBreak')).toBe(true);
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p>b</p><hr data-section-break="1"><p></p>');
      expect(getSections(mounted.editor)).toEqual([
        { from: 0, to: 6, section: 1 },
        { from: 7, to: 9, section: 2 },
      ]);
      // Curseur dans le paragraphe neuf qui ouvre la section 2.
      expect(mounted.editor.tiptap.state.selection.from).toBe(8);
    });

    it('insertBreak sur un nœud de premier niveau sélectionné (hr, table) insère après lui', () => {
      mounted.editor.setHTML('<p>a</p><hr><p>c</p>');
      mounted.editor.tiptap.commands.setNodeSelection(
        findNodePos(mounted.editor, 'horizontalRule'),
      );
      const { selection } = mounted.editor.tiptap.state;
      expect(selection).toBeInstanceOf(NodeSelection);
      expect(selection.$from.depth).toBe(0);
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><hr><hr data-section-break="1"><p>c</p>');
      // Une table sélectionnée devient une CellSelection (prosemirror-tables) : même résultat.
      const table = '<table><tbody><tr><td><p>x</p></td></tr></tbody></table>';
      mounted.editor.setHTML(`<p>a</p>${table}<p>c</p>`);
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'table'));
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(`<p>a</p>${table}<hr data-section-break="1"><p>c</p>`);
    });

    it('un chargement avec un saut en tête ou deux sauts adjacents reçoit un paragraphe, idempotent', () => {
      mounted.editor.setHTML('<hr data-section-break="1"><p>a</p>');
      expect(mounted.editor.getHTML()).toBe('<p></p><hr data-section-break="1"><p>a</p>');
      mounted.editor.setHTML(mounted.editor.getHTML());
      expect(mounted.editor.getHTML()).toBe('<p></p><hr data-section-break="1"><p>a</p>');
      mounted.editor.setHTML(
        '<p>a</p><hr data-section-break="1"><hr data-section-break="2"><p>c</p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p>a</p><hr data-section-break="1"><p></p><hr data-section-break="2"><p>c</p>',
      );
      // Chargement : la numérotation reçue est gardée.
      expect(numbers(mounted)).toEqual([1, 2]);
    });

    it('Backspace dans le paragraphe vide entre deux sauts sélectionne le saut sans vider la section', () => {
      mounted.editor.setHTML(
        '<p>a</p><hr data-section-break="1"><p></p><hr data-section-break="2"><p>c</p>',
      );
      cursorIn(mounted, '');
      expect(pressKey(mounted, 'Backspace')).toBe(true);
      // `joinBackward` a retiré le paragraphe et sélectionné le saut : le paragraphe revient.
      expect(mounted.editor.getHTML()).toBe(
        '<p>a</p><hr data-section-break="1"><p></p><hr data-section-break="2"><p>c</p>',
      );
      const { selection } = mounted.editor.tiptap.state;
      expect(selection).toBeInstanceOf(NodeSelection);
      expect(selection instanceof NodeSelection && selection.node.type.name).toBe('sectionBreak');
      // Second Backspace : le saut sélectionné disparaît, la suite est renumérotée.
      expect(pressKey(mounted, 'Backspace')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p></p><hr data-section-break="1"><p>c</p>');
    });

    it('une suppression de plage qui vide une section lui rend un paragraphe', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      // `<p>b</p>` entier : positions 4 à 7.
      mounted.editor.tiptap.commands.deleteRange({ from: 4, to: 7 });
      expect(mounted.editor.getHTML()).toBe(
        '<p>a</p><hr data-section-break="1"><p></p><hr data-section-break="2"><p>c</p>',
      );
      expect(getSections(mounted.editor).map((range) => range.to - range.from)).toEqual([3, 2, 3]);
    });
  });

  describe('arguments de removeBreak (R41-07)', () => {
    it('refuse un argument section qui n’est pas un entier ≥ 1 au lieu de le ramener à 1', () => {
      const html = '<p>a</p><hr data-section-break="7"><p>b</p><hr data-section-break="7"><p>c</p>';
      mounted.editor.setHTML(html);
      expect(mounted.editor.commands.canRun('section.removeBreak', { section: 9 })).toBe(false);
      expect(mounted.editor.commands.run('section.removeBreak', { section: 9 })).toBe(false);
      expect(mounted.editor.commands.run('section.removeBreak', { section: 7 })).toBe(true);
      const after = '<p>a</p><p>b</p><hr data-section-break="1"><p>c</p>';
      expect(mounted.editor.getHTML()).toBe(after);
      const hostile: unknown[] = [
        Number.NaN,
        'abc',
        '1',
        0,
        1.5,
        -1,
        null,
        Number.POSITIVE_INFINITY,
      ];
      for (const section of hostile) {
        expect(mounted.editor.commands.canRun('section.removeBreak', { section })).toBe(false);
        expect(mounted.editor.commands.run('section.removeBreak', { section })).toBe(false);
        expect(mounted.editor.getHTML()).toBe(after);
      }
      // Sans argument, le comportement par sélection reste disponible.
      expect(mounted.editor.commands.canRun('section.removeBreak', {})).toBe(true);
      expect(mounted.editor.commands.run('section.removeBreak', { section: 1 })).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p>b</p><p>c</p>');
    });
  });
});
