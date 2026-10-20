import { Node, type AnyExtension } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SUSPICIOUS_SPEC_MESSAGE, renderRawSpec, serializeDocumentHtml } from './serialize-html';
import { mountEditor, type MountedEditor } from '../testing/mount';

/**
 * Nœud d'intégrateur naïf de la preuve R23-04 : son `renderHTML` renvoie un attribut
 * **tel quel** comme spec DOM. Un document JSON hostile y glisse alors n'importe quelle
 * balise ; ProseMirror refuse ce cas, le sérialiseur verbatim doit faire de même.
 */
const NaiveNode: AnyExtension = Node.create({
  name: 'naive',
  group: 'block',
  atom: true,
  addAttributes() {
    return { payload: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'div[data-naive]' }];
  },
  renderHTML({ node }) {
    const payload = node.attrs['payload'] as DOMOutputSpec | null;
    return payload ? ['div', { 'data-naive': '' }, payload] : ['div', { 'data-naive': '' }];
  },
});

describe('serialize-html', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ extensions: [NaiveNode] });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('R23-04 : refuse un spec tableau qui sort des attributs du nœud (garde de prosemirror-model)', () => {
    const doc = mounted.editor.tiptap.schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'naive',
          attrs: { payload: ['img', { src: 'x', onerror: 'alert(1)' }] },
        },
      ],
    });
    expect(() => serializeDocumentHtml(doc)).toThrow(RangeError);
    expect(() => serializeDocumentHtml(doc)).toThrow(SUSPICIOUS_SPEC_MESSAGE);
    // Même garde quand le tableau est enfoui plus profond dans les attributs (objet, tableau
    // de tableaux), et même s'il n'est qu'un enfant du spec rendu.
    const inner: DOMOutputSpec = ['img', { onerror: 'alert(1)' }];
    const attrs = { payload: { deep: [inner] } };
    expect(() => renderRawSpec(document, inner, null, attrs)).toThrow(SUSPICIOUS_SPEC_MESSAGE);
    expect(() => renderRawSpec(document, ['div', {}, inner], null, attrs)).toThrow(
      SUSPICIOUS_SPEC_MESSAGE,
    );
    // Sans attributs à surveiller, ou avec un tableau d'égal contenu mais neuf : rendu normal.
    expect(() => renderRawSpec(document, inner)).not.toThrow();
    expect(() =>
      renderRawSpec(document, ['img', { onerror: 'alert(1)' }], null, attrs),
    ).not.toThrow();
    // Un spec construit par l'extension (nouveau tableau) passe, même à contenu égal.
    const copy = mounted.editor.tiptap.schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'naive', attrs: { payload: 'texte' } }],
    });
    expect(serializeDocumentHtml(copy)).toBe('<div data-naive="">texte</div>');
  });

  it('R23-04 : refuse un trou de contenu accompagné et plusieurs trous, comme renderSpec', () => {
    expect(() => renderRawSpec(document, ['p', 0, 'x'])).toThrow(
      'Content hole must be the only child of its parent node',
    );
    expect(() => renderRawSpec(document, ['p', ['span', 0], ['span', 0]])).toThrow(
      'Multiple content holes',
    );
    expect(() => renderRawSpec(document, [42] as unknown as DOMOutputSpec)).toThrow(
      'Invalid array passed to renderRawSpec',
    );
    const rendered = renderRawSpec(document, ['p', { style: 'color: #FF0000' }, ['span', 0]]);
    expect((rendered.dom as HTMLElement).outerHTML).toBe(
      '<p style="color: #FF0000"><span></span></p>',
    );
    expect(rendered.contentDOM?.tagName).toBe('SPAN');
  });

  it('sérialise un document ordinaire comme getHTML, style verbatim', () => {
    mounted.editor.setHTML('<p style="margin-top: 6pt"><strong>a</strong> <em>b</em></p>');
    expect(serializeDocumentHtml(mounted.editor.tiptap.state.doc)).toBe(
      '<p style="margin-top: 6pt"><strong>a</strong> <em>b</em></p>',
    );
  });
});
