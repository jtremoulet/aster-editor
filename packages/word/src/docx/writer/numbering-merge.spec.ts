import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { DocxExportWarning } from '../../export/types';
import { W_NS } from '../preprocess/minimal-docx';
import { createNumberingMerger } from './numbering-merge';
import { REL_TYPE, RelationshipTable } from './relationships';
import { PartStore, defaultXmlCodec } from './xml-io';

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function numbering(abstracts: string, nums: string): string {
  return `${DECLARATION}<w:numbering xmlns:w="${W_NS}">${abstracts}${nums}</w:numbering>`;
}

function abstractNum(id: string, format: string): string {
  return `<w:abstractNum w:abstractNumId="${id}"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>`;
}

function num(id: string, abstractId: string): string {
  return `<w:num w:numId="${id}"><w:abstractNumId w:val="${abstractId}"/></w:num>`;
}

const GENERATED = numbering(
  abstractNum('1', 'bullet') + abstractNum('2', 'decimal') + abstractNum('3', 'lowerLetter'),
  num('1', '1') + num('2', '2') + num('3', '3'),
);

const TEMPLATE = numbering(
  abstractNum('0', 'decimal') + abstractNum('5', 'upperRoman'),
  num('1', '0') + num('4', '5'),
);

async function storeWith(files: Readonly<Record<string, string>>): Promise<PartStore> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return PartStore.open(await zip.generateAsync({ type: 'arraybuffer' }), defaultXmlCodec());
}

async function partText(store: PartStore, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(await store.generate());
  return (await zip.file(path)?.async('string')) ?? '';
}

interface Setup {
  readonly template: PartStore;
  readonly generated: PartStore;
  readonly relationships: RelationshipTable;
  readonly warnings: DocxExportWarning[];
}

async function setup(templateNumbering: string | null): Promise<Setup> {
  const template = await storeWith({
    'word/document.xml': '<w:document/>',
    ...(templateNumbering === null ? {} : { 'word/numbering.xml': templateNumbering }),
  });
  const generated = await storeWith({ 'word/numbering.xml': GENERATED });
  return {
    template,
    generated,
    relationships: await RelationshipTable.open(template, 'word/document.xml'),
    warnings: [],
  };
}

describe('createNumberingMerger', () => {
  it('réutilise le numId du gabarit d’une liste qui le porte, copie les autres sous des ids libres', async () => {
    const { template, generated, relationships, warnings } = await setup(TEMPLATE);
    const merger = await createNumberingMerger({
      template,
      generated,
      mainPart: 'word/document.xml',
      templatePath: 'word/numbering.xml',
      relationships,
      lists: [
        { reference: 'aster-decimal-1', kind: 'decimal', level: 0, start: 1, templateNumId: '4' },
        { reference: 'aster-lowerLetter-2', kind: 'lowerLetter', level: 0, start: 1 },
      ],
      concrete: new Map([
        ['2', 'aster-decimal-1'],
        ['3', 'aster-lowerLetter-2'],
      ]),
      warnings,
    });
    expect(await merger.remap('2')).toBe('4');
    expect(await merger.remap('3')).toBe('5');
    expect(await merger.remap('3')).toBe('5');
    expect(warnings).toEqual([]);
    expect(merger.createdPart()).toBeNull();
    const xml = await partText(template, 'word/numbering.xml');
    expect(xml.startsWith(DECLARATION)).toBe(true);
    // Le gabarit est intact, l'abstractNum copié reçoit l'id 6 et précède les w:num.
    expect(xml).toContain(abstractNum('0', 'decimal') + abstractNum('5', 'upperRoman'));
    expect(xml).toContain(abstractNum('6', 'lowerLetter'));
    expect(xml).toContain(num('5', '6'));
    expect(xml.indexOf('<w:abstractNum w:abstractNumId="6"')).toBeLessThan(xml.indexOf('<w:num '));
    expect(xml.indexOf(num('4', '5'))).toBeLessThan(xml.indexOf(num('5', '6')));
  });

  it('replie avec avertissement quand le numId du gabarit n’existe pas', async () => {
    const { template, generated, relationships, warnings } = await setup(TEMPLATE);
    const merger = await createNumberingMerger({
      template,
      generated,
      mainPart: 'word/document.xml',
      templatePath: 'word/numbering.xml',
      relationships,
      lists: [
        { reference: 'aster-decimal-1', kind: 'decimal', level: 0, start: 1, templateNumId: '99' },
      ],
      concrete: new Map([['2', 'aster-decimal-1']]),
      warnings,
    });
    expect(await merger.remap('2')).toBe('5');
    expect(warnings).toEqual([
      { code: 'template-numbering-fallback', message: expect.stringContaining('99') },
    ]);
  });

  it('crée numbering.xml, sa relation et le déclare quand le gabarit n’en a pas', async () => {
    const { template, generated, relationships, warnings } = await setup(null);
    const merger = await createNumberingMerger({
      template,
      generated,
      mainPart: 'word/document.xml',
      templatePath: null,
      relationships,
      lists: [{ reference: 'aster-bullet-1', kind: 'bullet', level: 0, start: 1 }],
      concrete: new Map([['1', 'aster-bullet-1']]),
      warnings,
    });
    expect(await merger.remap('1')).toBe('1');
    expect(merger.createdPart()?.path).toBe('word/numbering.xml');
    expect(relationships.find(REL_TYPE.numbering, 'word/numbering.xml', false)).toBeDefined();
    const xml = await partText(template, 'word/numbering.xml');
    expect(xml).toContain(`<w:numbering xmlns:w="${W_NS}">`);
    expect(xml).toContain(abstractNum('1', 'bullet'));
    expect(xml).toContain(num('1', '1'));
    expect(xml).not.toContain('decimal');
  });

  it('laisse un numId inconnu du document généré tel quel', async () => {
    const { template, generated, relationships, warnings } = await setup(TEMPLATE);
    const merger = await createNumberingMerger({
      template,
      generated,
      mainPart: 'word/document.xml',
      templatePath: 'word/numbering.xml',
      relationships,
      lists: [],
      concrete: new Map(),
      warnings,
    });
    expect(await merger.remap('42')).toBe('42');
  });
});
