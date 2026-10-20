import { beforeAll, describe, expect, it } from 'vitest';
import {
  createNumberingResolver,
  listFormatOf,
  marginLeftPt,
  normalizeBullet,
  renderBlocks,
  topLevelElementCount,
} from './lists';
import {
  buildPackage,
  createTestContext,
  numberedXml,
  paragraphXml,
  partXml,
  renderBody,
} from './testing-blocks';
import type { Block, ConverterContext, DocxPackage, ListDefinition, ParagraphBlock } from './types';

function lvl(level: number, format: string, text: string, start?: number, left?: number): string {
  return (
    `<w:lvl w:ilvl="${String(level)}">${start === undefined ? '' : `<w:start w:val="${String(start)}"/>`}` +
    `<w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/>` +
    (left === undefined ? '' : `<w:pPr><w:ind w:left="${String(left)}" w:hanging="360"/></w:pPr>`) +
    '</w:lvl>'
  );
}

const NUMBERING = partXml(
  'numbering',
  `<w:abstractNum w:abstractNumId="1">${lvl(0, 'decimal', '%1.', 1, 720)}${lvl(1, 'lowerLetter', '%2)', 1, 1440)}${lvl(2, 'lowerRoman', '%3.', 1, 2160)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2">${lvl(0, 'bullet', '', undefined, 720)}${lvl(1, 'bullet', '–', undefined, 1440)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="3">${lvl(0, 'upperRoman', '%1.', 4)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="4">${lvl(0, 'upperLetter', '%1.', 1)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="5">${lvl(0, 'decimalZero', '%1.', 1)}${lvl(1, 'none', '', 1)}</w:abstractNum>` +
    '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>' +
    '<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>' +
    '<w:num w:numId="3"><w:abstractNumId w:val="3"/></w:num>' +
    '<w:num w:numId="4"><w:abstractNumId w:val="4"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/></w:lvlOverride></w:num>' +
    '<w:num w:numId="5"><w:abstractNumId w:val="5"/></w:num>' +
    '<w:num w:numId="6"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>' +
    '<w:num w:numId="9"><w:abstractNumId w:val="404"/></w:num>',
);

async function packageWithNumbering(): Promise<DocxPackage> {
  return buildPackage('', {
    rels: [{ id: 'rId1', type: 'numbering', target: 'numbering.xml' }],
    parts: { 'word/numbering.xml': NUMBERING },
  });
}

describe('createNumberingResolver', () => {
  it('rend null sans numbering.xml', async () => {
    const resolver = await createNumberingResolver(await buildPackage(''));
    expect(resolver.definition('1')).toBeNull();
  });

  it('lit formats, texte, start, retraits et niveaux', async () => {
    const resolver = await createNumberingResolver(await packageWithNumbering());
    const definition = resolver.definition('1') as ListDefinition;
    expect(definition.numId).toBe('1');
    expect(definition.levels).toEqual([
      { level: 0, format: '1', text: '%1.', start: 1, indentLeftPt: 36, hangingPt: 18 },
      { level: 1, format: 'a', text: '%2)', start: 1, indentLeftPt: 72, hangingPt: 18 },
      { level: 2, format: 'i', text: '%3.', start: 1, indentLeftPt: 108, hangingPt: 18 },
    ]);
    expect(resolver.definition('3')?.levels[0]).toMatchObject({ format: 'I', start: 4 });
    expect(resolver.definition('1')).toBe(definition);
  });

  it('applique startOverride, normalise les puces Symbol, mappe les formats inconnus', async () => {
    const resolver = await createNumberingResolver(await packageWithNumbering());
    expect(resolver.definition('4')?.levels[0]).toMatchObject({ format: 'A', start: 7 });
    expect(resolver.definition('2')?.levels[0]?.text).toBe('•');
    expect(resolver.definition('5')?.levels).toEqual([
      { level: 0, format: '1', text: '%1.', start: 1 },
      { level: 1, format: 'none', text: '', start: 1 },
    ]);
    expect(resolver.definition('9')).toBeNull();
    expect(resolver.definition('42')).toBeNull();
    expect(listFormatOf('ordinal')).toBe('1');
    expect(normalizeBullet(' ')).toBe('➢ •');
  });
});

describe('renderBlocks', () => {
  let ctx: ConverterContext;

  beforeAll(async () => {
    ctx = await createTestContext(await packageWithNumbering());
  });

  function paragraph(
    text: string,
    numbering?: { numId: string; level: number },
    style?: string,
  ): ParagraphBlock {
    const html = `<p${style ? ` style="${style}"` : ''}>${text}</p>`;
    return numbering
      ? { kind: 'paragraph', html, numbering, isEmpty: text === '' }
      : { kind: 'paragraph', html, isEmpty: text === '' };
  }

  it('regroupe les paragraphes numérotés consécutifs, type et data-docx-num-id', () => {
    const blocks: Block[] = [
      paragraph('Intro'),
      paragraph('a', { numId: '1', level: 0 }),
      paragraph('b', { numId: '1', level: 0 }),
      paragraph('Fin'),
    ];
    expect(renderBlocks(blocks, ctx)).toBe(
      '<p>Intro</p><ol data-docx-num-id="1"><li><p>a</p></li><li><p>b</p></li></ol><p>Fin</p>',
    );
    expect(renderBlocks([paragraph('x', { numId: '3', level: 0 })], ctx)).toBe(
      '<ol type="I" start="4" data-docx-num-id="3"><li><p>x</p></li></ol>',
    );
    expect(renderBlocks([paragraph('x', { numId: '2', level: 0 })], ctx)).toBe(
      '<ul data-bullet="•" data-docx-num-id="2"><li><p>x</p></li></ul>',
    );
  });

  it('imbrique sur trois niveaux et redémarre les niveaux profonds', () => {
    const blocks: Block[] = [
      paragraph('1', { numId: '1', level: 0 }),
      paragraph('1.a', { numId: '1', level: 1 }),
      paragraph('1.a.i', { numId: '1', level: 2 }),
      paragraph('1.b', { numId: '1', level: 1 }),
      paragraph('2', { numId: '1', level: 0 }),
      paragraph('2.a', { numId: '1', level: 1 }),
    ];
    expect(renderBlocks(blocks, ctx)).toBe(
      '<ol data-docx-num-id="1"><li><p>1</p>' +
        '<ol type="a" data-docx-num-id="1"><li><p>1.a</p>' +
        '<ol type="i" data-docx-num-id="1"><li><p>1.a.i</p></li></ol></li>' +
        '<li><p>1.b</p></li></ol></li>' +
        '<li><p>2</p><ol type="a" data-docx-num-id="1"><li><p>2.a</p></li></ol></li></ol>',
    );
  });

  it('reprend la numérotation après interruption avec `start`, pas après un redémarrage Word', () => {
    const blocks: Block[] = [
      paragraph('a', { numId: '1', level: 0 }),
      paragraph('b', { numId: '1', level: 0 }),
      paragraph('Interruption'),
      paragraph('c', { numId: '1', level: 0 }),
      paragraph('Nouvelle instance'),
      paragraph('d', { numId: '6', level: 0 }),
    ];
    expect(renderBlocks(blocks, ctx)).toBe(
      '<ol data-docx-num-id="1"><li><p>a</p></li><li><p>b</p></li></ol>' +
        '<p>Interruption</p>' +
        '<ol start="3" data-docx-num-id="1"><li><p>c</p></li></ol>' +
        '<p>Nouvelle instance</p>' +
        '<ol data-docx-num-id="6"><li><p>d</p></li></ol>',
    );
  });

  it('ferme la liste quand le numId change à même niveau', () => {
    const blocks: Block[] = [
      paragraph('a', { numId: '1', level: 0 }),
      paragraph('b', { numId: '2', level: 0 }),
    ];
    expect(renderBlocks(blocks, ctx)).toBe(
      '<ol data-docx-num-id="1"><li><p>a</p></li></ol><ul data-bullet="•" data-docx-num-id="2"><li><p>b</p></li></ul>',
    );
  });

  it('rattache un paragraphe de continuation au même item selon son retrait', () => {
    const blocks: Block[] = [
      paragraph('item', { numId: '1', level: 0 }, 'margin-left: 36pt'),
      paragraph('suite', undefined, 'margin-left: 36pt'),
      paragraph('encore', undefined, 'margin-left: 40pt'),
      paragraph('item 2', { numId: '1', level: 0 }, 'margin-left: 36pt'),
      paragraph('pas assez', undefined, 'margin-left: 20pt'),
    ];
    expect(renderBlocks(blocks, ctx)).toBe(
      '<ol data-docx-num-id="1"><li><p style="margin-left: 36pt">item</p><p style="margin-left: 36pt">suite</p><p style="margin-left: 40pt">encore</p></li>' +
        '<li><p style="margin-left: 36pt">item 2</p></li></ol><p style="margin-left: 20pt">pas assez</p>',
    );
    // Sans retrait explicite sur l'item, le retrait du niveau sert de référence.
    expect(
      renderBlocks(
        [
          paragraph('item', { numId: '1', level: 0 }),
          paragraph('suite', undefined, 'margin-left: 36pt'),
          paragraph('loin'),
        ],
        ctx,
      ),
    ).toBe(
      '<ol data-docx-num-id="1"><li><p>item</p><p style="margin-left: 36pt">suite</p></li></ol><p>loin</p>',
    );
  });

  it('laisse hors liste : numId 0, format none, niveau inconnu, bloc à plusieurs frères', () => {
    const blocks: Block[] = [
      paragraph('zéro', { numId: '0', level: 0 }),
      paragraph('none', { numId: '5', level: 1 }),
      paragraph('niveau 9', { numId: '1', level: 9 }),
      paragraph('inconnu', { numId: '77', level: 0 }),
      {
        kind: 'paragraph',
        html: '<hr data-page-break><p>page</p>',
        numbering: { numId: '1', level: 0 },
        isEmpty: false,
      },
      { kind: 'raw', html: '<hr data-page-break>' },
      { kind: 'table', html: '<table></table>' },
    ];
    expect(renderBlocks(blocks, ctx)).toBe(
      '<p>zéro</p><p>none</p><p>niveau 9</p><p>inconnu</p><hr data-page-break><p>page</p><hr data-page-break><table></table>',
    );
  });

  it('applique emptyParagraphs', async () => {
    const blocks: Block[] = [
      paragraph(''),
      paragraph('a'),
      paragraph('', { numId: '1', level: 0 }),
    ];
    expect(renderBlocks(blocks, ctx)).toBe(
      '<p></p><p>a</p><ol data-docx-num-id="1"><li><p></p></li></ol>',
    );
    const drop = await createTestContext(ctx.pkg, { emptyParagraphs: 'drop' });
    expect(renderBlocks(blocks, drop)).toBe('<p>a</p>');
  });

  it('helpers : comptage de frères et lecture du retrait', () => {
    expect(topLevelElementCount('<p>a</p>')).toBe(1);
    expect(topLevelElementCount('<p>a<br>b<img src="x"></p>')).toBe(1);
    expect(topLevelElementCount('<hr data-page-break><p>a</p>')).toBe(2);
    expect(topLevelElementCount('<p><span>a</span></p><p>b</p>')).toBe(2);
    expect(marginLeftPt('<p style="line-height: 1.15; margin-left: 36pt">x</p>')).toBe(36);
    expect(marginLeftPt('<p style="margin-top: 6pt">x</p>')).toBeUndefined();
    expect(marginLeftPt('<p>x</p>')).toBeUndefined();
  });

  it('depuis le XML : numPr → listes, liste dans une cellule', async () => {
    const html = await renderBody(
      numberedXml('un', '1') +
        numberedXml('deux', '1') +
        numberedXml('a', '1', 1) +
        paragraphXml('suite', '<w:pPr><w:ind w:left="1440"/></w:pPr>') +
        `<w:tbl><w:tr><w:tc>${numberedXml('puce', '2')}${numberedXml('puce 2', '2', 1)}</w:tc></w:tr></w:tbl>`,
      ctx,
    );
    expect(html).toBe(
      '<ol data-docx-num-id="1"><li><p>un</p></li><li><p>deux</p>' +
        '<ol type="a" data-docx-num-id="1"><li><p>a</p><p style="margin-left: 72pt">suite</p></li></ol></li></ol>' +
        '<table><tbody><tr><td><ul data-bullet="•" data-docx-num-id="2"><li><p>puce</p>' +
        '<ul data-bullet="–" data-docx-num-id="2"><li><p>puce 2</p></li></ul></li></ul></td></tr></tbody></table>',
    );
  });
});
