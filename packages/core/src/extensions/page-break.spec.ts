import { afterEach, describe, expect, it } from 'vitest';
import { mountEditor, type MountedEditor } from '../testing/mount.js';

describe('AsterHorizontalRule : saut de page', () => {
  let mounted: MountedEditor;
  afterEach(() => mounted?.cleanup());

  it('conserve `<hr data-page-break>` à l’aller-retour', () => {
    mounted = mountEditor({ content: '<p>a</p><hr data-page-break=""><p>b</p>' });
    expect(mounted.editor.getHTML()).toBe('<p>a</p><hr data-page-break=""><p>b</p>');
    mounted.editor.setHTML(mounted.editor.getHTML());
    expect(mounted.editor.getHTML()).toBe('<p>a</p><hr data-page-break=""><p>b</p>');
  });

  it('un séparateur ordinaire reste un `<hr>` nu', () => {
    mounted = mountEditor({ content: '<p>a</p><hr><p>b</p>' });
    expect(mounted.editor.getHTML()).toBe('<p>a</p><hr><p>b</p>');
  });

  it('la forme nue du contrat et la forme sérialisée sont équivalentes', () => {
    mounted = mountEditor({ content: '<p>a</p><hr data-page-break><p>b</p>' });
    expect(mounted.editor.getJSON().content?.[1]).toMatchObject({
      type: 'horizontalRule',
      attrs: { pageBreak: true },
    });
  });
});
