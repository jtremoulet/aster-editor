import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bodyHtml, mountEditor, type MountedEditor } from '../testing/mount';

/** `setHTML(getHTML())` doit redonner exactement le même HTML (sans le paragraphe final). */
function expectIdempotent(mounted: MountedEditor): string {
  const html = bodyHtml(mounted.editor);
  mounted.editor.setHTML(html);
  expect(bodyHtml(mounted.editor)).toBe(html);
  return html;
}

/** Attributs du premier nœud du type donné (le parcours s'arrête au premier trouvé). */
function attrsOf(mounted: MountedEditor, typeName: string): Record<string, unknown> {
  let found: Record<string, unknown> | null = null;
  mounted.editor.tiptap.state.doc.descendants((node) => {
    if (found) {
      return false;
    }
    if (node.type.name === typeName) {
      found = node.attrs;
      return false;
    }
    return true;
  });
  return found ?? {};
}

describe('ListLayout', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor();
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('ol : type, start et docxNumId sont relus et réécrits, idempotent', () => {
    mounted.editor.setHTML('<ol type="a" start="3" data-docx-num-id="5"><li><p>c</p></li></ol>');
    expect(attrsOf(mounted, 'orderedList')).toMatchObject({
      type: 'a',
      start: 3,
      docxNumId: '5',
    });
    const html = expectIdempotent(mounted);
    // Tiptap pose `start` et `type` après les autres attributs ; l'ordre importe peu.
    expect(html).toBe('<ol data-docx-num-id="5" start="3" type="a"><li><p>c</p></li></ol>');
  });

  it.each(['1', 'a', 'A', 'i', 'I'])('ol type="%s" survit à l’aller-retour', (type) => {
    mounted.editor.setHTML(`<ol type="${type}"><li><p>x</p></li></ol>`);
    expect(attrsOf(mounted, 'orderedList')['type']).toBe(type);
    const html = expectIdempotent(mounted);
    if (type === '1') {
      expect(html).toBe('<ol><li><p>x</p></li></ol>');
    } else {
      expect(html).toBe(`<ol type="${type}"><li><p>x</p></li></ol>`);
    }
  });

  it('ul : bullet et docxNumId, idempotent', () => {
    mounted.editor.setHTML('<ul data-bullet="–" data-docx-num-id="7"><li><p>x</p></li></ul>');
    expect(attrsOf(mounted, 'bulletList')).toMatchObject({ bullet: '–', docxNumId: '7' });
    expect(expectIdempotent(mounted)).toBe(
      '<ul data-bullet="–" data-docx-num-id="7"><li><p>x</p></li></ul>',
    );
  });

  it('une liste sans attribut de mise en page reste nue', () => {
    mounted.editor.setHTML('<ul><li><p>x</p></li></ul><ol><li><p>y</p></li></ol>');
    expect(bodyHtml(mounted.editor)).toBe('<ul><li><p>x</p></li></ul><ol><li><p>y</p></li></ol>');
    expect(attrsOf(mounted, 'bulletList')).toEqual({ bullet: null, docxNumId: null });
    expect(attrsOf(mounted, 'orderedList')).toMatchObject({
      docxNumId: null,
      type: null,
      start: 1,
    });
  });

  it('les listes imbriquées gardent leurs attributs à chaque niveau', () => {
    const html =
      '<ol data-docx-num-id="1"><li><p>a</p><ul data-bullet="•" data-docx-num-id="1"><li><p>b</p></li></ul></li></ol>';
    mounted.editor.setHTML(html);
    expect(expectIdempotent(mounted)).toBe(html);
  });

  it('R25 (relais) : data-docx-num-indent sur un paragraphe d’item est conservé et resérialisé', () => {
    // Forme produite par le lecteur Word (fixture 15) : `style`, `data-docx-style`, puis le drapeau.
    const html =
      '<ol data-docx-num-id="1"><li><p style="margin-left: 36pt; text-indent: -18pt" data-docx-style="ListParagraph" data-docx-num-indent="">x</p></li></ol>';
    mounted.editor.setHTML(html);
    expect(attrsOf(mounted, 'paragraph')).toMatchObject({ docxNumIndent: true });
    expect(bodyHtml(mounted.editor)).toBe(html);
    expectIdempotent(mounted);
    // Attribut nu (sans `=""`) et sur un titre : même lecture.
    mounted.editor.setHTML('<h2 data-docx-num-indent>T</h2>');
    expect(attrsOf(mounted, 'heading')).toMatchObject({ docxNumIndent: true });
    expect(bodyHtml(mounted.editor)).toBe('<h2 data-docx-num-indent="">T</h2>');
    // Absent : `null`, rien d'émis.
    mounted.editor.setHTML('<p>x</p>');
    expect(attrsOf(mounted, 'paragraph')['docxNumIndent']).toBeNull();
    expect(bodyHtml(mounted.editor)).toBe('<p>x</p>');
  });

  it('les commandes de liste fonctionnent toujours et ne posent aucun attribut', () => {
    mounted.editor.setHTML('<p>x</p>');
    mounted.editor.tiptap.commands.setTextSelection(1);
    expect(mounted.editor.commands.run('orderedList')).toBe(true);
    expect(bodyHtml(mounted.editor)).toBe('<ol><li><p>x</p></li></ol>');
    expect(mounted.editor.commands.run('bulletList')).toBe(true);
    expect(bodyHtml(mounted.editor)).toBe('<ul><li><p>x</p></li></ul>');
  });
});
