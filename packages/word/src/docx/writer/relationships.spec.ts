import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { REL_TYPE, RelationshipTable, relativeTarget } from './relationships';
import { PartStore, defaultXmlCodec } from './xml-io';
import { ensureContentTypes, imageContentType } from './content-types';

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId3" Type="${REL_TYPE.styles}" Target="styles.xml"/>` +
  `<Relationship Id="rId7" Type="${REL_TYPE.image}" Target="media/image1.png"/>` +
  `<Relationship Id="rId9" Type="${REL_TYPE.hyperlink}" Target="https://example.com" TargetMode="External"/>` +
  '</Relationships>';

async function storeWith(files: Readonly<Record<string, string>>): Promise<PartStore> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return PartStore.open(await zip.generateAsync({ type: 'arraybuffer' }), defaultXmlCodec());
}

async function textOf(store: PartStore, path: string): Promise<string> {
  const buffer = await store.generate();
  const zip = await JSZip.loadAsync(buffer);
  return (await zip.file(path)?.async('string')) ?? '';
}

describe('RelationshipTable', () => {
  it('lit les relations avec leur cible résolue et retrouve une relation par type et cible', async () => {
    const store = await storeWith({ 'word/_rels/document.xml.rels': RELS });
    const table = await RelationshipTable.open(store, 'word/document.xml');
    expect(table.get('rId7')?.resolved).toBe('word/media/image1.png');
    expect(table.find(REL_TYPE.image, 'word/media/image1.png', false)?.id).toBe('rId7');
    expect(table.find(REL_TYPE.hyperlink, 'https://example.com', true)?.id).toBe('rId9');
    expect(table.find(REL_TYPE.hyperlink, 'https://autre.example', true)).toBeUndefined();
  });

  it('ajoute sous un identifiant libre (après le plus grand rId), cible relative, et réécrit le fichier', async () => {
    const store = await storeWith({ 'word/_rels/document.xml.rels': RELS });
    const table = await RelationshipTable.open(store, 'word/document.xml');
    const image = await table.add(REL_TYPE.image, 'word/media/image2.gif', false);
    const link = await table.ensure(REL_TYPE.hyperlink, 'https://autre.example', true);
    const existing = await table.ensure(REL_TYPE.hyperlink, 'https://example.com', true);
    expect(image).toBe('rId10');
    expect(link).toBe('rId11');
    expect(existing).toBe('rId9');
    const xml = await textOf(store, 'word/_rels/document.xml.rels');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    expect(xml).toContain(
      '<Relationship Id="rId10" Type="' + REL_TYPE.image + '" Target="media/image2.gif"/>',
    );
    expect(xml).toContain('Id="rId11"');
    expect(xml).toContain('TargetMode="External"');
  });

  it('ne crée le .rels d’une partie qui n’en a pas qu’au premier ajout (R27-05)', async () => {
    const store = await storeWith({ 'word/header9.xml': '<w:hdr/>' });
    const table = await RelationshipTable.open(store, 'word/header9.xml');
    expect(table.path).toBe('word/_rels/header9.xml.rels');
    const untouched = await JSZip.loadAsync(await store.generate());
    expect(untouched.file('word/_rels/header9.xml.rels')).toBeNull();
    await table.add(REL_TYPE.hyperlink, 'https://example.com', true);
    const xml = await textOf(store, 'word/_rels/header9.xml.rels');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    expect(xml).toContain('Id="rId1"');
  });

  it('écrit une cible absolue hors du dossier de la partie', () => {
    expect(relativeTarget('word/document.xml', 'word/media/a.png')).toBe('media/a.png');
    expect(relativeTarget('word/document.xml', 'customXml/item1.xml')).toBe('/customXml/item1.xml');
  });
});

describe('ensureContentTypes', () => {
  const TYPES =
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  it('ajoute les extensions et parties manquantes, sans doublon ni réécriture inutile', async () => {
    const store = await storeWith({ '[Content_Types].xml': TYPES });
    const unchanged = await ensureContentTypes(store, {
      defaults: new Map([['png', 'image/png']]),
      overrides: new Map([['/word/document.xml', 'x']]),
    });
    expect(unchanged).toBe(false);
    expect(await textOf(store, '[Content_Types].xml')).toBe(TYPES);
    const changed = await ensureContentTypes(store, {
      defaults: new Map([
        ['gif', imageContentType('gif')],
        ['PNG', 'image/png'],
      ]),
      overrides: new Map([['word/numbering.xml', 'application/numbering']]),
    });
    expect(changed).toBe(true);
    const xml = await textOf(store, '[Content_Types].xml');
    expect(xml).toContain('<Default Extension="gif" ContentType="image/gif"/>');
    expect(xml.split('Extension="png"').length).toBe(2);
    expect(xml).toContain(
      '<Override PartName="/word/numbering.xml" ContentType="application/numbering"/>',
    );
    expect(xml.indexOf('Extension="gif"')).toBeLessThan(xml.indexOf('<Override'));
  });

  it('type MIME par extension', () => {
    expect(imageContentType('jpeg')).toBe('image/jpeg');
    expect(imageContentType('BMP')).toBe('image/bmp');
    expect(imageContentType('xyz')).toBe('application/octet-stream');
  });
});
