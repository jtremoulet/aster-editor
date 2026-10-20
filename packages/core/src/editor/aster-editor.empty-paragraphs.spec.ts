import { afterEach, describe, expect, it } from 'vitest';
import { mountEditor, type MountedEditor } from '../testing/mount';

describe('AsterEditor : paragraphes vides', () => {
  let mounted: MountedEditor;
  afterEach(() => mounted?.cleanup());

  it('setHTML(getHTML()) conserve les paragraphes vides', () => {
    mounted = mountEditor({ content: '<p>a</p><p></p><p>b</p>' });
    const once = mounted.editor.getHTML();
    expect(once).toBe('<p>a</p><p></p><p>b</p>');
    mounted.editor.setHTML(once);
    expect(mounted.editor.getHTML()).toBe(once);
  });

  it('Entrée deux fois puis un texte produit un paragraphe vide sérialisé', () => {
    mounted = mountEditor({ content: '<p>a</p>' });
    const { tiptap } = mounted.editor;
    tiptap.commands.focus('end');
    tiptap.commands.splitBlock();
    tiptap.commands.splitBlock();
    tiptap.commands.insertContent('b');
    expect(mounted.editor.getHTML()).toBe('<p>a</p><p></p><p>b</p>');
  });
});
