import { describe, expect, it } from 'vitest';
import {
  buildPackage,
  createTestContext,
  paragraphXml,
  partXml,
  renderBody,
} from './testing-blocks';
import type { DocxPackage } from './types';

const FOOTNOTES = partXml(
  'footnotes',
  '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>' +
    '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>' +
    '<w:footnote w:id="1"><w:p><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Première note.</w:t></w:r></w:p></w:footnote>' +
    `<w:footnote w:id="2">${paragraphXml('Deuxième note, ligne 1')}${paragraphXml('Deuxième note, ligne 2')}</w:footnote>` +
    '<w:footnote w:id="3"><w:p/></w:footnote>' +
    '<w:footnote w:id="4"><w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/><w:t>texte dans le run du ref</w:t></w:r><w:r><w:t xml:space="preserve"> suite</w:t></w:r></w:p></w:footnote>',
);

const ENDNOTES = partXml(
  'endnotes',
  '<w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote>' +
    '<w:endnote w:id="1"><w:p><w:r><w:endnoteRef/></w:r><w:r><w:t xml:space="preserve"> Note de fin.</w:t></w:r></w:p></w:endnote>',
);

function ref(id: string, kind: 'footnote' | 'endnote' = 'footnote'): string {
  return `<w:r><w:${kind}Reference w:id="${id}"/></w:r>`;
}

async function notesPackage(): Promise<DocxPackage> {
  return buildPackage('', {
    rels: [
      { id: 'rId3', type: 'footnotes', target: 'footnotes.xml' },
      { id: 'rId4', type: 'endnotes', target: 'endnotes.xml' },
    ],
    parts: { 'word/footnotes.xml': FOOTNOTES, 'word/endnotes.xml': ENDNOTES },
  });
}

describe('createNoteRegistry', () => {
  it('numérote les appels dans l’ordre d’apparition et rend la liste finale', async () => {
    const ctx = await createTestContext(await notesPackage());
    const bodyHtml = await renderBody(
      `<w:p><w:r><w:t>A</w:t></w:r>${ref('2')}<w:r><w:t>B</w:t></w:r>${ref('1', 'endnote')}${ref('1')}${ref('2')}</w:p>`,
      ctx,
    );
    expect(bodyHtml).toBe(
      '<p>A<sup data-footnote-ref="1">1</sup>B<sup data-footnote-ref="2">2</sup><sup data-footnote-ref="3">3</sup><sup data-footnote-ref="1">1</sup></p>',
    );
    expect(await ctx.notes.render(ctx)).toBe(
      '<ol data-footnotes="">' +
        '<li data-footnote="1"><p>Deuxième note, ligne 1</p><p>Deuxième note, ligne 2</p></li>' +
        '<li data-footnote="2"><p>Note de fin.</p></li>' +
        '<li data-footnote="3"><p>Première note.</p></li>' +
        '</ol>',
    );
    expect(ctx.warnings).toEqual([]);
  });

  it('rend une chaîne vide sans appel de note', async () => {
    const ctx = await createTestContext(await notesPackage());
    expect(await ctx.notes.render(ctx)).toBe('');
    const none = await createTestContext(await buildPackage(''));
    expect(await none.notes.render(none)).toBe('');
  });

  it('note vide → <p></p>, note introuvable → avertissement reader', async () => {
    const ctx = await createTestContext(await notesPackage());
    await renderBody(`<w:p>${ref('3')}${ref('99')}</w:p>`, ctx);
    expect(await ctx.notes.render(ctx)).toBe(
      '<ol data-footnotes=""><li data-footnote="1"><p></p></li><li data-footnote="2"><p></p></li></ol>',
    );
    expect(ctx.warnings).toEqual([{ code: 'reader', message: expect.stringContaining('99') }]);
  });

  it('R25-13 : seul l’appel w:footnoteRef est retiré, pas le run qui le porte', async () => {
    const ctx = await createTestContext(await notesPackage());
    await renderBody(`<w:p>${ref('4')}${ref('1')}</w:p>`, ctx);
    expect(await ctx.notes.render(ctx)).toBe(
      '<ol data-footnotes=""><li data-footnote="1"><p>texte dans le run du ref suite</p></li>' +
        '<li data-footnote="2"><p>Première note.</p></li></ol>',
    );
    expect(ctx.warnings).toEqual([]);
  });

  it('footnotes: false supprime appels et liste avec un seul avertissement', async () => {
    const ctx = await createTestContext(await notesPackage(), { footnotes: false });
    expect(await renderBody(`<w:p><w:r><w:t>A</w:t></w:r>${ref('1')}${ref('2')}</w:p>`, ctx)).toBe(
      '<p>A</p>',
    );
    expect(await ctx.notes.render(ctx)).toBe('');
    expect(ctx.warnings).toEqual([{ code: 'footnotes-dropped', message: expect.any(String) }]);
  });

  it('convertit le contenu des notes dans un contexte dérivé (partie, where)', async () => {
    const pkg = await notesPackage();
    const seen: { part: string; where: string }[] = [];
    const ctx = await createTestContext(pkg);
    const spying = {
      ...ctx,
      convert: {
        ...ctx.convert,
        blocks: async (container: Element, inner: typeof ctx) => {
          seen.push({ part: inner.part, where: inner.where });
          return ctx.convert.blocks(container, inner);
        },
      },
    };
    spying.notes.reference('1', 'footnote', spying);
    spying.notes.reference('1', 'endnote', spying);
    await spying.notes.render(spying);
    expect(seen).toEqual([
      { part: 'word/footnotes.xml', where: 'footnote' },
      { part: 'word/endnotes.xml', where: 'endnote' },
    ]);
  });
});
