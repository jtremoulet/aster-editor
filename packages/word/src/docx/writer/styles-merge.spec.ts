import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { DocxExportWarning } from '../../export/types';
import { W_NS } from '../preprocess/minimal-docx';
import { allNamed, childNamed } from '../preprocess/xml-utils';
import { openPackage } from '../reader/package';
import { createStyleResolver } from '../reader/styles';
import { createStyleMerger, type StyleMerger } from './styles-merge';
import { PartStore, defaultXmlCodec, wordAttr } from './xml-io';

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function stylesXml(styles: string): string {
  return (
    `${DECLARATION}<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${styles}</w:styles>`
  );
}

const TEMPLATE_STYLES = stylesXml(
  '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Citation"><w:name w:val="Citation"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:color="808080" w:sz="12" w:space="4"/></w:pBdr><w:ind w:left="567"/></w:pPr><w:rPr><w:i/><w:color w:val="C00000"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Lienhypertexte"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>',
);

const GENERATED_STYLES = stylesXml(
  '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:i/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:rFonts w:ascii="Consolas"/></w:rPr></w:style>',
);

async function storeWith(
  files: Readonly<Record<string, string>>,
): Promise<{ store: PartStore; buffer: ArrayBuffer }> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return { store: await PartStore.open(buffer, defaultXmlCodec()), buffer };
}

async function setup(): Promise<{
  merger: StyleMerger;
  template: PartStore;
  warnings: DocxExportWarning[];
}> {
  const codec = defaultXmlCodec();
  const { store: template, buffer } = await storeWith({
    'word/document.xml': `<w:document xmlns:w="${W_NS}"><w:body/></w:document>`,
    'word/styles.xml': TEMPLATE_STYLES,
  });
  const { store: generated } = await storeWith({ 'word/styles.xml': GENERATED_STYLES });
  const warnings: DocxExportWarning[] = [];
  const resolver = await createStyleResolver(await openPackage(buffer, codec.parse));
  const merger = await createStyleMerger({
    template,
    generated,
    templatePath: 'word/styles.xml',
    resolver,
    warnings,
  });
  return { merger, template, warnings };
}

function paragraph(xml: string): Element {
  const doc = new DOMParser().parseFromString(
    `<w:p xmlns:w="${W_NS}">${xml}</w:p>`,
    'application/xml',
  );
  return doc.documentElement;
}

function serialize(element: Element): string {
  return new XMLSerializer().serializeToString(element).replace(` xmlns:w="${W_NS}"`, '');
}

describe('createStyleMerger', () => {
  it('réutilise, renomme par nom, ajoute ou signale manquant', async () => {
    const { merger, template, warnings } = await setup();
    expect(await merger.ensure('Citation')).toEqual({ status: 'template', id: 'Citation' });
    expect(await merger.ensure('Hyperlink')).toEqual({ status: 'renamed', id: 'Lienhypertexte' });
    expect(await merger.ensure('Quote')).toEqual({ status: 'added', id: 'Quote' });
    expect(await merger.ensure('Quote')).toEqual({ status: 'template', id: 'Quote' });
    expect(await merger.ensure('Inconnu')).toEqual({ status: 'missing', id: 'Inconnu' });
    expect(await merger.ensure('Inconnu')).toEqual({ status: 'missing', id: 'Inconnu' });
    expect(warnings).toEqual([
      { code: 'template-style-missing', message: expect.stringContaining('Inconnu') },
    ]);
    const zip = await JSZip.loadAsync(await template.generate());
    const xml = (await zip.file('word/styles.xml')?.async('string')) ?? '';
    expect(xml.startsWith(DECLARATION)).toBe(true);
    expect(xml).toContain('w:styleId="Quote"');
    expect(xml).not.toContain('w:styleId="Hyperlink"');
    expect(xml.indexOf('w:styleId="Lienhypertexte"')).toBeLessThan(
      xml.indexOf('w:styleId="Quote"'),
    );
  });

  it('retire les propriétés directes égales au style résolu, garde les surcharges', async () => {
    const { merger } = await setup();
    const p = paragraph(
      '<w:pPr><w:pStyle w:val="Citation"/><w:pBdr><w:left w:val="single" w:color="808080" w:sz="12" w:space="4"/></w:pBdr>' +
        '<w:spacing w:after="160" w:before="120" w:line="276" w:lineRule="auto"/><w:ind w:left="567" w:right="200"/></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="C00000"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>x</w:t></w:r>' +
        '<w:r><w:rPr><w:i w:val="0"/><w:color w:val="00B050"/></w:rPr><w:t>y</w:t></w:r>',
    );
    merger.stripParagraph(p);
    expect(serialize(p)).toBe(
      '<w:p><w:pPr><w:pStyle w:val="Citation"/><w:spacing w:before="120"/><w:ind w:right="200"/></w:pPr>' +
        '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>x</w:t></w:r>' +
        '<w:r><w:rPr><w:i w:val="0"/><w:color w:val="00B050"/></w:rPr><w:t>y</w:t></w:r></w:p>',
    );
  });

  it('retire le pStyle du style par défaut et les propriétés égales aux docDefaults', async () => {
    const { merger } = await setup();
    const p = paragraph(
      '<w:pPr><w:pStyle w:val="Normal"/><w:spacing w:after="160" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' +
        '<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>x</w:t></w:r>',
    );
    merger.stripParagraph(p);
    expect(serialize(p)).toBe(
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>',
    );
    expect(childNamed(p, 'pPr')).not.toBeNull();
    expect(allNamed(p, 'rPr')).toHaveLength(0);
  });

  it('ne touche ni la numérotation, ni les tabulations, ni un rStyle', async () => {
    const { merger } = await setup();
    const p = paragraph(
      '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr><w:tabs><w:tab w:val="left" w:pos="708"/></w:tabs></w:pPr>' +
        '<w:r><w:rPr><w:rStyle w:val="Lienhypertexte"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>lien</w:t></w:r>',
    );
    merger.stripParagraph(p);
    expect(serialize(p)).toBe(
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr><w:tabs><w:tab w:val="left" w:pos="708"/></w:tabs></w:pPr>' +
        '<w:r><w:rPr><w:rStyle w:val="Lienhypertexte"/></w:rPr><w:t>lien</w:t></w:r></w:p>',
    );
    expect(wordAttr(allNamed(p, 'numId')[0] as Element, 'val')).toBe('3');
  });
});
