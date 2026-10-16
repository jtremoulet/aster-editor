import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { findVariableAtSelection } from './variables';
import { findNodePos, mountEditor, selectRange, type MountedEditor } from '../testing/mount';

const CLIENT = '<span data-aster-variable="client" data-label="Client">{{client}}</span>';

describe('commandes variable.*', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour monde</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('variable.insert', () => {
    it('insère une puce au curseur, avec ou sans libellé', () => {
      // Position 9 : après « Bonjour » et son espace.
      selectRange(mounted.editor, 9, 9);
      expect(mounted.editor.commands.canRun('variable.insert', { name: 'client' })).toBe(true);
      expect(
        mounted.editor.commands.run('variable.insert', { name: 'client', label: 'Client' }),
      ).toBe(true);
      expect(mounted.editor.getHTML()).toBe(`<p>Bonjour ${CLIENT}monde</p>`);
      expect(mounted.editor.commands.run('variable.insert', { name: 'date', label: '' })).toBe(
        true,
      );
      expect(mounted.editor.getHTML()).toBe(
        `<p>Bonjour ${CLIENT}<span data-aster-variable="date">{{date}}</span>monde</p>`,
      );
    });

    it('remplace la sélection', () => {
      selectRange(mounted.editor, 9, 14);
      expect(mounted.editor.commands.run('variable.insert', { name: 'client' })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p>Bonjour <span data-aster-variable="client">{{client}}</span></p>',
      );
    });

    it('refuse un nom invalide ou des arguments absents', () => {
      expect(mounted.editor.commands.canRun('variable.insert', { name: 'a b' })).toBe(false);
      expect(mounted.editor.commands.run('variable.insert', { name: 'a b' })).toBe(false);
      expect(mounted.editor.commands.run('variable.insert', { name: '' })).toBe(false);
      expect(mounted.editor.commands.run('variable.insert' as string)).toBe(false);
      expect(mounted.editor.commands.canRun('variable.insert' as string)).toBe(false);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour monde</p>');
    });

    it('allowUnknown à false refuse une variable non déclarée et accepte une déclarée', () => {
      const strict = mountEditor({
        content: '<p></p>',
        variables: { allowUnknown: false, variables: [{ name: 'client', label: 'Client' }] },
      });
      expect(strict.editor.commands.canRun('variable.insert', { name: 'inconnue' })).toBe(false);
      expect(strict.editor.commands.run('variable.insert', { name: 'inconnue' })).toBe(false);
      // Sonde de l'UI (L14) : un nom syntaxiquement valide mais non déclaré.
      expect(strict.editor.commands.canRun('variable.insert', { name: '_aster_probe' })).toBe(
        false,
      );
      expect(mounted.editor.commands.canRun('variable.insert', { name: '_aster_probe' })).toBe(
        true,
      );
      expect(strict.editor.commands.canRun('variable.insert', { name: 'client' })).toBe(true);
      expect(strict.editor.commands.run('variable.insert', { name: 'client' })).toBe(true);
      expect(strict.editor.getHTML()).toBe(
        '<p><span data-aster-variable="client">{{client}}</span></p>',
      );
      strict.cleanup();
    });

    it('canRun est faux en lecture seule et dans un bloc de code', () => {
      mounted.editor.setReadOnly(true);
      expect(mounted.editor.commands.canRun('variable.insert', { name: 'client' })).toBe(false);
      expect(mounted.editor.commands.run('variable.insert', { name: 'client' })).toBe(false);
      mounted.editor.setReadOnly(false);
      mounted.editor.setHTML('<pre><code>x</code></pre>');
      selectRange(mounted.editor, 2, 2);
      expect(mounted.editor.commands.canRun('variable.insert', { name: 'client' })).toBe(false);
      expect(mounted.editor.commands.run('variable.insert', { name: 'client' })).toBe(false);
      expect(mounted.editor.getHTML()).toBe('<pre><code>x</code></pre><p></p>');
    });
  });

  describe('variable.remove', () => {
    beforeEach(() => {
      mounted.editor.setHTML(`<p>Bonjour ${CLIENT} !</p>`);
    });

    it('supprime la puce sélectionnée (NodeSelection)', () => {
      const pos = findNodePos(mounted.editor, 'variable');
      mounted.editor.tiptap.commands.setNodeSelection(pos);
      expect(mounted.editor.commands.canRun('variable.remove')).toBe(true);
      expect(mounted.editor.commands.isActive('variable.remove')).toBe(true);
      expect(mounted.editor.commands.run('variable.remove')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour  !</p>');
    });

    it('supprime la puce juste après le curseur, puis celle juste avant', () => {
      const pos = findNodePos(mounted.editor, 'variable');
      selectRange(mounted.editor, pos, pos);
      expect(mounted.editor.commands.isActive('variable.remove')).toBe(true);
      expect(mounted.editor.commands.run('variable.remove')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour  !</p>');

      mounted.editor.setHTML(`<p>Bonjour ${CLIENT} !</p>`);
      selectRange(mounted.editor, pos + 1, pos + 1);
      expect(mounted.editor.commands.canRun('variable.remove')).toBe(true);
      expect(mounted.editor.commands.run('variable.remove')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour  !</p>');
    });

    it('ne fait rien sans puce au curseur ni dans une sélection de texte', () => {
      selectRange(mounted.editor, 1, 1);
      expect(mounted.editor.commands.canRun('variable.remove')).toBe(false);
      expect(mounted.editor.commands.isActive('variable.remove')).toBe(false);
      expect(mounted.editor.commands.run('variable.remove')).toBe(false);
      // Sélection de texte qui englobe la puce : pas « une puce sélectionnée ».
      selectRange(mounted.editor, 1, 12);
      expect(mounted.editor.commands.canRun('variable.remove')).toBe(false);
      expect(mounted.editor.getHTML()).toBe(`<p>Bonjour ${CLIENT} !</p>`);
    });

    it('findVariableAtSelection renvoie la plage et le nom, ou null', () => {
      const pos = findNodePos(mounted.editor, 'variable');
      const { state } = mounted.editor.tiptap;
      const at = (from: number, to = from): ReturnType<typeof findVariableAtSelection> =>
        findVariableAtSelection(
          state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to))),
        );
      expect(at(pos)).toEqual({ from: pos, to: pos + 1, name: 'client' });
      expect(at(pos + 1)).toEqual({ from: pos, to: pos + 1, name: 'client' });
      expect(at(1)).toBeNull();
      expect(at(pos, pos + 1)).toBeNull();
    });
  });
});
