import { describe, expect, it } from 'vitest';
import { readHeadersFooters } from './headers';
import { buildPackage, createTestContext, fragment, paragraphXml, partXml } from './testing-blocks';
import type { DocxPackage } from './types';

async function sectionPackage(): Promise<DocxPackage> {
  return buildPackage('', {
    rels: [
      { id: 'rId6', type: 'header', target: 'header1.xml' },
      { id: 'rId7', type: 'header', target: 'header2.xml' },
      { id: 'rId8', type: 'header', target: 'header3.xml' },
      { id: 'rId9', type: 'footer', target: 'footer1.xml' },
      { id: 'rId10', type: 'footer', target: 'missing.xml' },
    ],
    parts: {
      'word/header1.xml': partXml('hdr', paragraphXml('En-tête par défaut')),
      'word/header2.xml': partXml('hdr', paragraphXml('En-tête première page')),
      'word/header3.xml': partXml('hdr', paragraphXml('En-tête page paire')),
      'word/footer1.xml': partXml(
        'ftr',
        '<w:p><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PAGE</w:instrText><w:fldChar w:fldCharType="separate"/><w:t>1</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p>',
      ),
    },
  });
}

describe('readHeadersFooters', () => {
  it('rend {} sans sectPr ni référence', async () => {
    const ctx = await createTestContext(await sectionPackage());
    expect(await readHeadersFooters(null, ctx)).toEqual({});
    expect(
      await readHeadersFooters(fragment('<w:sectPr><w:pgSz w:w="1" w:h="1"/></w:sectPr>'), ctx),
    ).toEqual({});
  });

  it('lit default, first et even, titlePage depuis w:titlePg', async () => {
    const ctx = await createTestContext(await sectionPackage());
    const sectPr = fragment(
      '<w:sectPr><w:headerReference w:type="default" r:id="rId6"/><w:headerReference w:type="first" r:id="rId7"/>' +
        '<w:headerReference w:type="even" r:id="rId8"/><w:footerReference w:type="default" r:id="rId9"/><w:titlePg/></w:sectPr>',
    );
    expect(await readHeadersFooters(sectPr, ctx)).toEqual({
      headers: {
        default: { html: '<p>En-tête par défaut</p>' },
        first: { html: '<p>En-tête première page</p>' },
        even: { html: '<p>En-tête page paire</p>' },
      },
      footers: { default: { html: '<p>Page 1</p>' } },
      titlePage: true,
    });
    expect(ctx.warnings).toEqual([]);
  });

  it('titlePg w:val="0" ne pose pas titlePage, relation ou partie absente → avertissement', async () => {
    const ctx = await createTestContext(await sectionPackage());
    const sectPr = fragment(
      '<w:sectPr><w:footerReference w:type="default" r:id="rId10"/><w:footerReference w:type="first" r:id="rId404"/>' +
        '<w:headerReference w:type="default" r:id="rId6"/><w:titlePg w:val="0"/></w:sectPr>',
    );
    expect(await readHeadersFooters(sectPr, ctx)).toEqual({
      headers: { default: { html: '<p>En-tête par défaut</p>' } },
    });
    expect(ctx.warnings).toEqual([
      { code: 'reader', message: expect.stringContaining('missing.xml') },
      { code: 'reader', message: expect.stringContaining('rId404') },
    ]);
  });

  it('convertit chaque partie dans un contexte dérivé (part, where, hors tableau)', async () => {
    const pkg = await sectionPackage();
    const base = await createTestContext(pkg, {}, { tableStyle: { cellShading: '#000000' } });
    const seen: { part: string; where: string; style: unknown }[] = [];
    const ctx = {
      ...base,
      convert: {
        ...base.convert,
        blocks: async (container: Element, inner: typeof base) => {
          seen.push({ part: inner.part, where: inner.where, style: inner.tableStyle });
          return base.convert.blocks(container, inner);
        },
      },
    };
    await readHeadersFooters(
      fragment(
        '<w:sectPr><w:headerReference w:type="default" r:id="rId6"/><w:footerReference w:type="default" r:id="rId9"/></w:sectPr>',
      ),
      ctx,
    );
    expect(seen).toEqual([
      { part: 'word/header1.xml', where: 'header', style: null },
      { part: 'word/footer1.xml', where: 'footer', style: null },
    ]);
  });
});
