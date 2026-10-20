import type { AsterDocument } from '@aster-editor/core';
import { describe, expect, it } from 'vitest';
import { jsonToHtml } from './json-to-html';

function text(value: string, marks: AsterDocument['marks'] = []): AsterDocument {
  return { type: 'text', text: value, marks };
}

describe('jsonToHtml', () => {
  it('sérialise paragraphes, titres, alignement et saut de ligne', () => {
    const html = jsonToHtml({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Titre')] },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [text('a'), { type: 'hardBreak' }, text('b')],
        },
        { type: 'paragraph', attrs: { textAlign: 'left' }, content: [text('c')] },
      ],
    });
    expect(html).toBe('<h2>Titre</h2><p style="text-align: center">a<br>b</p><p>c</p>');
  });

  it('enveloppe les marques dans l’ordre et échappe le texte', () => {
    const html = jsonToHtml({
      type: 'paragraph',
      content: [
        text('<g>', [{ type: 'bold' }, { type: 'italic' }]),
        text('u', [{ type: 'underline' }]),
        text('s', [{ type: 'strike' }]),
        text('c', [{ type: 'code' }]),
        text('sub', [{ type: 'subscript' }]),
        text('sup', [{ type: 'superscript' }]),
        text('m', [{ type: 'highlight', attrs: { color: '#ff0' } }]),
        text('m2', [{ type: 'highlight' }]),
        text('l', [{ type: 'link', attrs: { href: 'https://x.y/?a=1&b="2"' } }]),
        text('t', [
          {
            type: 'textStyle',
            attrs: { color: 'red', backgroundColor: '#eee', fontFamily: 'Arial', fontSize: '14px' },
          },
        ]),
        text('plain', [{ type: 'textStyle', attrs: {} }, { type: 'unknownMark' }]),
      ],
    });
    expect(html).toBe(
      '<p><em><strong>&lt;g&gt;</strong></em><u>u</u><s>s</s><code>c</code><sub>sub</sub><sup>sup</sup>' +
        '<mark style="background-color: #ff0">m</mark><mark>m2</mark>' +
        '<a href="https://x.y/?a=1&amp;b=&quot;2&quot;">l</a>' +
        '<span style="color: red; background-color: #eee; font-family: Arial; font-size: 14px">t</span>' +
        '<span>plain</span></p>',
    );
  });

  it('sérialise listes, tâches, citation, code, filet et image', () => {
    const html = jsonToHtml({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('a')] }] }],
        },
        {
          type: 'orderedList',
          attrs: { start: 3, type: 'a' },
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('b')] }] }],
        },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('c')] }] }],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [text('t')] }],
            },
          ],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [text('q')] }] },
        { type: 'codeBlock', content: [text('x < y')] },
        { type: 'horizontalRule' },
        {
          type: 'image',
          attrs: { src: 'data:image/png;base64,AA==', alt: null, width: 40, title: 'T' },
        },
      ],
    });
    expect(html).toBe(
      '<ul><li><p>a</p></li></ul><ol start="3" type="a"><li><p>b</p></li></ol><ol><li><p>c</p></li></ol>' +
        '<ul><li><p>t</p></li></ul><blockquote><p>q</p></blockquote><pre><code>x &lt; y</code></pre><hr>' +
        '<img src="data:image/png;base64,AA==" alt="" title="T" width="40">',
    );
  });

  it('sérialise une table avec en-têtes et fusions', () => {
    const cell = (type: string, attrs: Record<string, unknown>, value: string): AsterDocument => ({
      type,
      attrs,
      content: [{ type: 'paragraph', content: [text(value)] }],
    });
    const html = jsonToHtml({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', { colspan: 1, rowspan: 1 }, 'H')] },
        { type: 'tableRow', content: [cell('tableCell', { colspan: 2, rowspan: 3 }, 'C')] },
      ],
    });
    expect(html).toBe(
      '<table><tbody><tr><th><p>H</p></th></tr><tr><td colspan="2" rowspan="3"><p>C</p></td></tr></tbody></table>',
    );
  });

  it('traite un document sans type comme un doc et laisse passer les nœuds inconnus', () => {
    expect(jsonToHtml({ content: [{ type: 'paragraph', content: [text('a')] }] })).toBe('<p>a</p>');
    expect(jsonToHtml({ type: 'custom', content: [text('b')] })).toBe('b');
    expect(jsonToHtml({ type: 'custom', text: '<c>' })).toBe('&lt;c&gt;');
    expect(jsonToHtml({ type: 'heading', attrs: { level: 9 }, content: [text('h')] })).toBe(
      '<h1>h</h1>',
    );
  });
});
