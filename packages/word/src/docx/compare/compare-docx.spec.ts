import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocx, run, W_NS } from '../preprocess/minimal-docx';
import { relsXml, stylesXml } from '../reader/test-support';
import { compareDocx } from './compare-docx';
import { compareTable } from './compare-tables';
import type { TableModel } from './model';
import { Tally } from './tally';
import type { FidelityProperty, FidelityReport } from './types';
import { ABSENT } from './values';

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Run Word dont `rPr` est le contenu de `w:rPr` (`<w:b/>`), vide pour aucune propriété. */
function r(text: string, rPr = ''): string {
  return run(text, rPr ? `<w:rPr>${rPr}</w:rPr>` : '');
}

function p(text: string, pPr = '', rPr = ''): string {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${r(text, rPr)}</w:p>`;
}

function property(report: FidelityReport, name: string): FidelityProperty {
  const found = report.properties.find((item) => item.name === name);
  if (!found) throw new Error(`propriété ${name} absente du rapport`);
  return found;
}

function names(report: FidelityReport): string[] {
  return report.properties.map((item) => item.name);
}

const STYLES = stylesXml(
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Citation"><w:name w:val="Citation"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:ind w:left="567"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>',
  '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>',
);

describe('compareDocx — parties du paquet', () => {
  it('un document comparé à lui-même : score 1, parties identiques, corps exclu', async () => {
    const a = await buildDocx(p('Bonjour'), { 'word/styles.xml': STYLES });
    const report = await compareDocx(a, a.slice(0));
    expect(report.score).toBe(1);
    expect(report.identicalParts).toContain('word/styles.xml');
    expect(report.identicalParts).toContain('[Content_Types].xml');
    expect(report.identicalParts).not.toContain('word/document.xml');
    expect(report.changedParts).toEqual([]);
    expect(property(report, 'part:word/styles.xml')).toMatchObject({
      group: 'package-part',
      total: 1,
      kept: 1,
    });
    expect(report.lost).toEqual([]);
    expect(report.notes.length).toBeGreaterThan(0);
  });

  it('partie différente : résumé avec tailles et première ligne, ajoutée et supprimée listées', async () => {
    const a = await buildDocx(p('Bonjour'), {
      'word/styles.xml': STYLES,
      'word/media/image1.png': 'abc',
    });
    const b = await buildDocx(p('Bonjour'), {
      'word/styles.xml': STYLES.replace('Citation', 'Quote'),
      'word/numbering.xml': '<w:numbering xmlns:w="x"/>',
    });
    const report = await compareDocx(a, b);
    const styles = report.changedParts.find((part) => part.path === 'word/styles.xml');
    expect(styles?.summary).toMatch(/^taille \d+ → \d+ octets ; ligne \d+ : « .*Citation/);
    expect(report.changedParts).toContainEqual({
      path: 'word/media/image1.png',
      summary: 'supprimée',
    });
    expect(report.changedParts).toContainEqual({ path: 'word/numbering.xml', summary: 'ajoutée' });
    expect(property(report, 'part:word/styles.xml').kept).toBe(0);
    expect(property(report, 'part:word/media/image1.png').kept).toBe(0);
    expect(names(report)).not.toContain('part:word/numbering.xml');
    expect(report.identicalParts).toContain('_rels/.rels');
  });

  it('partie binaire différente : résumé par tailles seulement', async () => {
    const a = await buildDocx(p('x'), { 'word/media/image1.png': 'abc' });
    const b = await buildDocx(p('x'), { 'word/media/image1.png': 'abcd' });
    const report = await compareDocx(a, b);
    expect(report.changedParts).toContainEqual({
      path: 'word/media/image1.png',
      summary: 'taille 3 → 4 octets',
    });
  });

  it('binaryParts restreint les parties comparées à des préfixes', async () => {
    const a = await buildDocx(p('x'), { 'word/styles.xml': STYLES, 'word/media/i.png': 'a' });
    const b = await buildDocx(p('x'), { 'word/styles.xml': STYLES, 'word/media/i.png': 'b' });
    const report = await compareDocx(a, b, { binaryParts: ['word/styles'] });
    expect(report.identicalParts).toEqual(['word/styles.xml']);
    expect(report.changedParts).toEqual([]);
  });

  it('ignoreRevisionIds : une partie égale hors w:rsid* est conservée (par défaut), perdue sinon', async () => {
    const withRsid = STYLES.replace(
      '<w:style w:type="paragraph" w:styleId="Citation">',
      '<w:style w:type="paragraph" w:styleId="Citation" w:rsidR="00AB12CD">',
    );
    const a = await buildDocx(p('x'), { 'word/styles.xml': STYLES });
    const b = await buildDocx(p('x'), { 'word/styles.xml': withRsid });
    const lenient = await compareDocx(a, b);
    expect(lenient.identicalParts).not.toContain('word/styles.xml');
    expect(lenient.changedParts).toContainEqual({
      path: 'word/styles.xml',
      summary: 'identique hors identifiants de révision',
    });
    expect(property(lenient, 'part:word/styles.xml').kept).toBe(1);
    expect(names(lenient)).not.toContain('paragraph.revisionIds');

    const strict = await compareDocx(a, b, { ignoreRevisionIds: false });
    expect(property(strict, 'part:word/styles.xml').kept).toBe(0);
    expect(property(strict, 'paragraph.revisionIds').total).toBe(1);
  });

  it('ignoreRevisionIds: false compare les w:rsid* des paragraphes du corps', async () => {
    const a = await buildDocx(`<w:p w:rsidR="00000001">${r('x')}</w:p>`);
    const b = await buildDocx(`<w:p w:rsidR="00000002">${r('x')}</w:p>`);
    const report = await compareDocx(a, b, { ignoreRevisionIds: false });
    expect(property(report, 'paragraph.revisionIds')).toMatchObject({ total: 1, kept: 0 });
    expect(property(report, 'paragraph.revisionIds').examples[0]).toEqual({
      where: 'paragraphe 1',
      expected: 'rsidR=00000001',
      actual: 'rsidR=00000002',
    });
    expect((await compareDocx(a, b)).score).toBe(1);
  });
});

describe('compareDocx — alignement des blocs', () => {
  it('même nombre de blocs : alignement par position, un seul texte perdu', async () => {
    const a = await buildDocx(p('Un') + p('Deux') + p('Trois'));
    const b = await buildDocx(p('Un') + p('Deux bis') + p('Trois'));
    const report = await compareDocx(a, b);
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 3, kept: 2, lost: 1 });
    expect(property(report, 'paragraph.text').examples).toEqual([
      { where: 'paragraphe 2', expected: 'Deux', actual: 'Deux bis' },
    ]);
    expect(property(report, 'paragraph.style')).toMatchObject({ total: 3, kept: 3 });
  });

  it('bloc inséré dans le résultat : LCS, les autres restent appariés', async () => {
    const a = await buildDocx(p('Un') + p('Deux') + p('Trois'));
    const b = await buildDocx(p('Un') + p('Ajout') + p('Deux') + p('Trois'));
    const report = await compareDocx(a, b);
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 4, kept: 3, lost: 1 });
    expect(property(report, 'paragraph.text').examples[0]).toEqual({
      where: 'paragraphe 2 (résultat)',
      expected: '(absent)',
      actual: 'Ajout',
    });
    expect(property(report, 'paragraph.style')).toMatchObject({ total: 3, kept: 3 });
  });

  it('bloc supprimé du résultat : perdu pour toutes ses propriétés', async () => {
    const a = await buildDocx(p('Un') + p('Deux', '<w:jc w:val="center"/>', '<w:b/>') + p('Trois'));
    const b = await buildDocx(p('Un') + p('Trois'));
    const report = await compareDocx(a, b);
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 3, kept: 2 });
    expect(property(report, 'paragraph.align')).toMatchObject({ total: 1, kept: 0 });
    expect(property(report, 'run.bold')).toMatchObject({ total: 1, kept: 0 });
    expect(property(report, 'run.bold').examples[0]).toEqual({
      where: 'paragraphe 2 run « Deux »',
      expected: 'true',
      actual: '(bloc absent)',
    });
    expect(property(report, 'paragraph.style').examples[0]).toEqual({
      where: 'paragraphe 2',
      expected: '(absent)',
      actual: '(bloc absent)',
    });
  });

  it('aligne un paragraphe dont seuls les espaces changent, mais compte le texte perdu', async () => {
    const a = await buildDocx(p('Un ') + p('Deux'));
    const b = await buildDocx(p('Un') + p('Ajout') + p('Deux'));
    const report = await compareDocx(a, b);
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 3, kept: 1 });
    expect(property(report, 'paragraph.style')).toMatchObject({ total: 2, kept: 2 });
  });
});

describe('compareDocx — groupes de propriétés', () => {
  it('paragraph-style : pStyle résolu, style absent du résultat', async () => {
    const a = await buildDocx(p('Citation', '<w:pStyle w:val="Citation"/>'), {
      'word/styles.xml': STYLES,
    });
    const b = await buildDocx(p('Citation'), { 'word/styles.xml': STYLES });
    const report = await compareDocx(a, b);
    expect(property(report, 'paragraph.style').examples[0]).toEqual({
      where: 'paragraphe 1',
      expected: 'Citation',
      actual: 'Normal',
    });
    // Le retrait et l'italique hérités du style comptent aussi comme perdus.
    expect(property(report, 'paragraph.indentLeftPt')).toMatchObject({ total: 1, kept: 0 });
    expect(property(report, 'run.italic')).toMatchObject({ total: 1, kept: 0 });
    // Les propriétés des docDefaults, identiques des deux côtés, sont conservées.
    expect(property(report, 'run.fontFamily')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'run.fontSizePt').examples).toEqual([]);
  });

  it('paragraph-format : chaque champ perdu est nommé, les défauts Word valent absent', async () => {
    const pPr =
      '<w:jc w:val="center"/><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/>' +
      '<w:ind w:left="567" w:right="283" w:firstLine="283"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:color="FF0000"/></w:pBdr>' +
      '<w:shd w:val="clear" w:fill="EEEEEE"/><w:keepNext/><w:pageBreakBefore/>';
    const a = await buildDocx(p('x', pPr));
    const b = await buildDocx(p('x', '<w:jc w:val="left"/><w:spacing w:before="0" w:line="240"/>'));
    const report = await compareDocx(a, b);
    for (const key of [
      'align',
      'lineHeight',
      'spacingBeforePt',
      'spacingAfterPt',
      'indentLeftPt',
      'indentRightPt',
      'indentFirstLinePt',
      'borders',
      'shading',
      'keepWithNext',
      'pageBreakBefore',
    ]) {
      expect(property(report, `paragraph.${key}`), key).toMatchObject({ total: 1, kept: 0 });
    }
    expect(property(report, 'paragraph.spacingBeforePt').examples[0]).toEqual({
      where: 'paragraphe 1',
      expected: '12',
      actual: '(absent)',
    });
    expect(property(report, 'paragraph.borders').examples[0]?.expected).toBe(
      '[{"color":"#ff0000","side":"bottom","style":"solid","widthPt":1}]',
    );
    // `jc=left`, `before=0` et `line=240` du résultat ne créent aucune occurrence propre.
    expect(names(report)).not.toContain('paragraph.lineHeightPt');
    const identical = await compareDocx(b, await buildDocx(p('x')));
    expect(identical.score).toBe(1);
  });

  it('paragraph.tabs (session 4) : position et alignement des taquets d’un paragraphe tabulé, points de suite et taquets sans tabulation ignorés', async () => {
    const tabbed = (tabs: string, text = 'a'): string =>
      `<w:p><w:pPr><w:tabs>${tabs}</w:tabs></w:pPr><w:r><w:t>${text}</w:t><w:tab/><w:t>b</w:t></w:r></w:p>`;
    const center = '<w:tab w:val="center" w:pos="4536" w:leader="dot"/>';
    const a = await buildDocx(tabbed(center));
    // Même position, alignement perdu (`left`) : une occurrence perdue, exemple lisible.
    const left = await compareDocx(
      a,
      await buildDocx(tabbed('<w:tab w:val="left" w:pos="4536"/>')),
    );
    expect(property(left, 'paragraph.tabs')).toMatchObject({
      group: 'paragraph-format',
      total: 1,
      kept: 0,
    });
    expect(property(left, 'paragraph.tabs').examples[0]).toEqual({
      where: 'paragraphe 1',
      expected: '[{"align":"center","positionPt":226.8}]',
      actual: '[{"align":"left","positionPt":226.8}]',
    });
    // Points de suite différents, même position et alignement : conservé.
    const noLeader = await compareDocx(
      a,
      await buildDocx(tabbed('<w:tab w:val="center" w:pos="4536"/>')),
    );
    expect(property(noLeader, 'paragraph.tabs')).toMatchObject({ total: 1, kept: 1 });
    expect(noLeader.score).toBe(1);
    // Taquets absents du résultat : perdus ; paragraphe sans tabulation : aucune occurrence.
    const none = await compareDocx(a, await buildDocx(p('a\tb')));
    expect(property(none, 'paragraph.tabs')).toMatchObject({ total: 1, kept: 0 });
    const unused = await compareDocx(
      await buildDocx(`<w:p><w:pPr><w:tabs>${center}</w:tabs></w:pPr>${r('a')}</w:p>`),
      await buildDocx(p('a')),
    );
    expect(names(unused)).not.toContain('paragraph.tabs');
  });

  it('run-format : runs fusionnés puis alignés par texte, chaque champ compté', async () => {
    const a = await buildDocx(
      `<w:p>${r('Bon', '<w:b/>')}${r('jour', '<w:b/>')}${r(' le ')}${r('monde', '<w:color w:val="C00000"/><w:sz w:val="28"/><w:u w:val="double"/>')}</w:p>`,
    );
    const b = await buildDocx(
      `<w:p>${r('Bonjour', '<w:b/>')}${r(' le ')}${r('monde', '<w:color w:val="c00000"/><w:sz w:val="28"/><w:u w:val="single"/>')}</w:p>`,
    );
    const report = await compareDocx(a, b);
    expect(property(report, 'run.bold')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'run.color')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'run.fontSizePt')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'run.underline')).toMatchObject({ total: 1, kept: 0 });
    expect(property(report, 'run.underline').examples[0]).toEqual({
      where: 'paragraphe 1 run « monde »',
      expected: 'double',
      actual: 'solid',
    });
    expect(property(report, 'paragraph.text').kept).toBe(1);
  });

  it('run-format : une propriété ajoutée par le résultat compte comme perdue', async () => {
    const a = await buildDocx(p('x'));
    const b = await buildDocx(p('x', '', '<w:i/>'));
    const report = await compareDocx(a, b);
    expect(property(report, 'run.italic')).toMatchObject({ total: 1, kept: 0 });
    expect(property(report, 'run.italic').examples[0]?.expected).toBe('(absent)');
  });

  it('list : numId, niveau et format résolu', async () => {
    const numbering =
      `<w:numbering xmlns:w="${W_NS}">` +
      '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>' +
      '<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl></w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>' +
      '</w:numbering>';
    const parts = {
      'word/numbering.xml': numbering,
      'word/_rels/document.xml.rels': relsXml({ rId1: [`${REL}/numbering`, 'numbering.xml'] }),
    };
    const a = await buildDocx(
      p('item', '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>'),
      parts,
    );
    const b = await buildDocx(
      p('item', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
      parts,
    );
    const report = await compareDocx(a, b);
    expect(property(report, 'list.numId')).toMatchObject({ group: 'list', total: 1, kept: 0 });
    expect(property(report, 'list.level').examples[0]).toEqual({
      where: 'paragraphe 1',
      expected: '1',
      actual: '0',
    });
    expect(property(report, 'list.format').examples[0]).toEqual({
      where: 'paragraphe 1',
      expected: 'a|%2)|1',
      actual: '1|%1.|1',
    });
    const same = await compareDocx(a, a.slice(0));
    expect(property(same, 'list.format')).toMatchObject({ total: 1, kept: 1 });
  });

  it('table : dimensions, fusions, largeurs, bordures, fonds et cellules récursives', async () => {
    const table = (span: string, fill: string, width: string): string =>
      '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>' +
      `<w:tblGrid><w:gridCol w:w="${width}"/><w:gridCol w:w="2400"/></w:tblGrid>` +
      `<w:tr><w:tc><w:tcPr>${span}<w:shd w:val="clear" w:fill="${fill}"/><w:vAlign w:val="center"/></w:tcPr>${p('A')}</w:tc></w:tr>` +
      `<w:tr><w:tc>${p('B')}</w:tc><w:tc>${p('C', '<w:jc w:val="right"/>')}</w:tc></w:tr></w:tbl>`;
    const a = await buildDocx(table('<w:gridSpan w:val="2"/>', 'D9E2F3', '2400'));
    const b = await buildDocx(table('', 'FFFFFF', '2000').replace('<w:jc w:val="right"/>', ''));
    const report = await compareDocx(a, b);
    expect(property(report, 'table.rows')).toMatchObject({ group: 'table', total: 1, kept: 1 });
    expect(property(report, 'table.columns')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'table.width')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'table.borders')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'table.merges').examples[0]).toEqual({
      where: 'tableau 1',
      expected: '["(1,1):2/-"]',
      actual: '[]',
    });
    expect(property(report, 'table.columnWidths').examples[0]).toEqual({
      where: 'tableau 1',
      expected: '[120,120]',
      actual: '[100,120]',
    });
    expect(property(report, 'table.cellShading').examples[0]).toEqual({
      where: 'tableau 1 cellule (1,1)',
      expected: '#d9e2f3',
      actual: '#ffffff',
    });
    expect(property(report, 'table.cellVerticalAlign')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'paragraph.align').examples[0]?.where).toBe(
      'tableau 1 cellule (2,2) paragraphe 1',
    );
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 3, kept: 3 });
  });

  it('table absente du résultat : tout perdu, cellules comprises', async () => {
    const a = await buildDocx(`<w:tbl><w:tr><w:tc>${p('A')}</w:tc></w:tr></w:tbl>`);
    const b = await buildDocx(p('A'));
    const report = await compareDocx(a, b);
    expect(property(report, 'table.rows').examples[0]).toEqual({
      where: 'tableau 1',
      expected: '1',
      actual: '(bloc absent)',
    });
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 2, kept: 0 });
    expect(property(report, 'paragraph.text').examples.map((e) => e.where)).toEqual([
      'tableau 1 cellule (1,1) paragraphe 1',
      'paragraphe 1 (résultat)',
    ]);
  });

  it('image : nombre et dimensions à ±1 px', async () => {
    const drawing = (cx: number): string =>
      '<w:r><w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' +
      R_NS +
      `"><wp:inline><wp:extent cx="${String(cx)}" cy="952500"/><a:graphic><a:graphicData><pic:pic xmlns:pic="p"><pic:blipFill><a:blip r:embed="rId9"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const a = await buildDocx(`<w:p>${drawing(952500)}</w:p>`);
    const near = await buildDocx(`<w:p>${drawing(961000)}</w:p>`);
    const far = await buildDocx(`<w:p>${drawing(1905000)}</w:p>`);
    const none = await buildDocx('<w:p></w:p>');
    expect(property(await compareDocx(a, near), 'image.width')).toMatchObject({
      total: 1,
      kept: 1,
    });
    expect(property(await compareDocx(a, far), 'image.width').examples[0]).toEqual({
      where: 'paragraphe 1 image 1',
      expected: '100',
      actual: '200',
    });
    const lost = await compareDocx(a, none);
    expect(property(lost, 'image.count').examples[0]).toEqual({
      where: 'paragraphe 1',
      expected: '1',
      actual: '0',
    });
    expect(property(lost, 'image.height')).toMatchObject({ group: 'image', total: 1, kept: 0 });
  });

  it('note : nombre et texte des notes de bas de page', async () => {
    const footnotes = (text: string): string =>
      `<w:footnotes xmlns:w="${W_NS}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>` +
      `<w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r>${r(` ${text}`)}</w:p></w:footnote></w:footnotes>`;
    const parts = (text: string): Record<string, string> => ({
      'word/footnotes.xml': footnotes(text),
      'word/_rels/document.xml.rels': relsXml({ rId1: [`${REL}/footnotes`, 'footnotes.xml'] }),
    });
    const body = `<w:p>${r('Texte')}<w:r><w:footnoteReference w:id="1"/></w:r></w:p>`;
    const a = await buildDocx(body, parts('Note A'));
    const b = await buildDocx(body, parts('Note B'));
    const report = await compareDocx(a, b);
    expect(property(report, 'note.count')).toMatchObject({ group: 'note', total: 1, kept: 1 });
    expect(property(report, 'note.text').examples[0]).toEqual({
      where: 'paragraphe 1 note 1',
      expected: 'Note A',
      actual: 'Note B',
    });
    const dropped = await compareDocx(a, await buildDocx(`<w:p>${r('Texte')}</w:p>`));
    expect(property(dropped, 'note.count')).toMatchObject({ total: 1, kept: 0 });
  });

  it('header-footer et section : texte et format des en-têtes, pgSz, pgMar, cols, titlePg', async () => {
    const header = (text: string, rPr = ''): string =>
      `<w:hdr xmlns:w="${W_NS}"><w:p>${r(text, rPr)}</w:p></w:hdr>`;
    const sectPr = (extra: string): string =>
      `<w:sectPr><w:headerReference w:type="default" r:id="rId1" xmlns:r="${R_NS}"/>` +
      `<w:footerReference w:type="first" r:id="rId2" xmlns:r="${R_NS}"/>` +
      `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/>${extra}</w:sectPr>`;
    const rels = relsXml({
      rId1: [`${REL}/header`, 'header1.xml'],
      rId2: [`${REL}/footer`, 'footer1.xml'],
    });
    const a = await buildDocx(p('x') + sectPr('<w:cols w:num="2" w:space="708"/><w:titlePg/>'), {
      'word/header1.xml': header('En-tête', '<w:b/>'),
      'word/footer1.xml': header('Pied'),
      'word/_rels/document.xml.rels': rels,
    });
    const b = await buildDocx(p('x') + sectPr('<w:cols w:num="1"/>'), {
      'word/header1.xml': header('En-tête'),
      'word/_rels/document.xml.rels': rels,
    });
    const report = await compareDocx(a, b);
    expect(property(report, 'header.default.text')).toMatchObject({
      group: 'header-footer',
      total: 1,
      kept: 1,
    });
    expect(property(report, 'header.default.format')).toMatchObject({ total: 1, kept: 0 });
    expect(property(report, 'header.default.format').examples[0]?.where).toBe(
      'section 1 en-tête default',
    );
    expect(property(report, 'footer.first.text').examples[0]).toEqual({
      where: 'section 1 pied first',
      expected: 'Pied',
      actual: '(absent)',
    });
    expect(property(report, 'section.pgSz')).toMatchObject({ group: 'section', total: 1, kept: 1 });
    expect(property(report, 'section.pgMar')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'section.cols').examples[0]).toEqual({
      where: 'section 1',
      expected: '{"equalWidth":true,"num":2,"space":35.4}',
      actual: '(absent)',
    });
    expect(property(report, 'section.titlePg').examples[0]).toMatchObject({
      expected: 'true',
      actual: 'false',
    });
    expect(property(report, 'section.count')).toMatchObject({ total: 1, kept: 1 });
    expect(report.changedParts.map((part) => part.path)).toEqual([
      'word/footer1.xml',
      'word/header1.xml',
    ]);
  });

  it('section : une section de moins dans le résultat, lang comparée', async () => {
    const section =
      '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr></w:p>';
    const final = '<w:sectPr><w:pgSz w:w="12240" w:h="15840" w:orient="landscape"/></w:sectPr>';
    const lang = (value: string): Record<string, string> => ({
      'word/styles.xml': stylesXml(
        '',
        `<w:rPrDefault><w:rPr><w:lang w:val="${value}"/></w:rPr></w:rPrDefault>`,
      ),
      'word/_rels/document.xml.rels': relsXml({ rId1: [`${REL}/styles`, 'styles.xml'] }),
    });
    const a = await buildDocx(p('x') + section + p('y') + final, lang('fr-FR'));
    const b = await buildDocx(p('x') + p('y') + final, lang('en-US'));
    const report = await compareDocx(a, b);
    expect(property(report, 'section.count').examples[0]).toMatchObject({
      expected: '2',
      actual: '1',
    });
    expect(property(report, 'section.pgSz')).toMatchObject({ total: 2, kept: 0 });
    expect(property(report, 'section.lang').examples[0]).toEqual({
      where: 'document',
      expected: 'fr-FR',
      actual: 'en-US',
    });
    expect(report.notes.some((note) => note.includes('Nombre de sections différent'))).toBe(true);
  });
});

describe('compareDocx — rendu Word plutôt que forme XML (L28c)', () => {
  const PAGE_BREAK = '<w:r><w:br w:type="page"/></w:r>';

  it('saut de page : « a<br page>b » vaut « a », paragraphe-saut, « b » ; le saut compte comme propriété', async () => {
    const a = await buildDocx(`<w:p>${r('a')}${PAGE_BREAK}${r('b')}</w:p>`);
    const b = await buildDocx(`${p('a')}<w:p>${PAGE_BREAK}</w:p>${p('b')}`);
    const report = await compareDocx(a, b);
    expect(report.score).toBe(1);
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 2, kept: 2 });
    expect(property(report, 'paragraph.pageBreakAfter')).toMatchObject({
      group: 'paragraph-format',
      total: 1,
      kept: 1,
    });

    const dropped = await compareDocx(a, await buildDocx(p('a') + p('b')));
    expect(property(dropped, 'paragraph.text')).toMatchObject({ total: 2, kept: 2 });
    expect(property(dropped, 'paragraph.pageBreakAfter').examples).toEqual([
      { where: 'paragraphe 1', expected: 'true', actual: '(absent)' },
    ]);
  });

  it('champ de fusion : un {{nom}} en clair vaut un MERGEFIELD de même nom, texte et runs conservés', async () => {
    const field = `<w:p>${r('Bonjour ', '<w:b/>')}<w:fldSimple w:instr=" MERGEFIELD Nom ">${r('«Nom»', '<w:b/>')}</w:fldSimple>${r(' !')}</w:p>`;
    const plain = `<w:p>${r('Bonjour ', '<w:b/>')}${r('{{Nom}}', '<w:b/>')}${r(' !')}</w:p>`;
    const a = await buildDocx(field);
    const report = await compareDocx(a, await buildDocx(plain));
    expect(report.score).toBe(1);
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'field.mergeField')).toMatchObject({
      group: 'text',
      total: 1,
      kept: 1,
    });
    expect(property(report, 'run.bold')).toMatchObject({ total: 1, kept: 1 });
    expect(names(report)).not.toContain('run.italic');

    const renamed = await compareDocx(a, await buildDocx(plain.replace('{{Nom}}', '{{Prenom}}')));
    expect(property(renamed, 'field.mergeField').examples).toEqual([
      { where: 'paragraphe 1', expected: '["Nom"]', actual: '["Prenom"]' },
    ]);
    expect(property(renamed, 'paragraph.text').examples[0]).toEqual({
      where: 'paragraphe 1',
      expected: 'Bonjour «Nom» !',
      actual: 'Bonjour {{Prenom}} !',
    });
  });

  it('champ complexe : résultat affiché, instruction ignorée, alignement des blocs sur la forme canonique', async () => {
    const complex =
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> MERGEFIELD Date \\* MERGEFORMAT </w:instrText></w:r>' +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${r('«Date»')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const a = await buildDocx(p('Avant') + complex + p('Après'));
    const b = await buildDocx(p('Avant') + p('Inséré') + p('{{Date}}') + p('Après'));
    const report = await compareDocx(a, b);
    expect(property(report, 'paragraph.text')).toMatchObject({ total: 4, kept: 3 });
    expect(property(report, 'paragraph.text').examples).toEqual([
      { where: 'paragraphe 2 (résultat)', expected: '(absent)', actual: 'Inséré' },
    ]);
    expect(property(report, 'field.mergeField')).toMatchObject({ total: 1, kept: 1 });
  });

  it('bordures effectives : traits intérieurs distribués sur les cellules = même rendu, nil perdu = perte', async () => {
    const cell = (text: string, tcBorders = ''): string =>
      `<w:tc>${tcBorders ? `<w:tcPr><w:tcBorders>${tcBorders}</w:tcBorders></w:tcPr>` : ''}${p(text)}</w:tc>`;
    const single = '<w:%s w:val="single" w:sz="4" w:color="000000"/>';
    const side = (name: string): string => single.replace('%s', name);
    const original =
      '<w:tbl><w:tblPr><w:tblBorders>' +
      `${side('top')}${side('left')}${side('bottom')}${side('right')}${side('insideH')}${side('insideV')}` +
      `</w:tblBorders></w:tblPr><w:tr>${cell('A')}${cell('B', '<w:bottom w:val="nil"/>')}</w:tr>` +
      `<w:tr>${cell('C')}${cell('D')}</w:tr></w:tbl>`;
    const distributed =
      '<w:tbl><w:tblPr><w:tblBorders>' +
      `${side('top')}${side('left')}${side('bottom')}${side('right')}<w:insideH w:val="nil"/><w:insideV w:val="nil"/>` +
      `</w:tblBorders></w:tblPr><w:tr>${cell('A', side('bottom') + side('right'))}${cell('B', '<w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="nil"/>')}</w:tr>` +
      `<w:tr>${cell('C', side('top') + side('right'))}${cell('D', side('top') + side('left'))}</w:tr></w:tbl>`;
    const a = await buildDocx(original);
    const report = await compareDocx(a, await buildDocx(distributed));
    expect(report.score).toBe(1);
    expect(property(report, 'table.borders')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'table.cellBorders')).toMatchObject({ total: 4, kept: 4 });
    // Le `nil` de la cellule B remplacé par un trait : un côté de plus est rendu.
    const forgotten = await compareDocx(
      a,
      await buildDocx(distributed.replace('<w:bottom w:val="nil"/>', side('bottom'))),
    );
    expect(property(forgotten, 'table.cellBorders')).toMatchObject({ total: 4, kept: 3 });
    expect(property(forgotten, 'table.cellBorders').examples[0]?.where).toBe(
      'tableau 1 cellule (1,2)',
    );
  });

  it('largeurs : colonnes et cellules à ±0,5 pt, largeur de cellule déduite de la grille', async () => {
    const table = (grid: number, tcW: string): string =>
      `<w:tbl><w:tblGrid><w:gridCol w:w="${String(grid)}"/><w:gridCol w:w="2400"/></w:tblGrid>` +
      `<w:tr><w:tc>${tcW ? `<w:tcPr>${tcW}</w:tcPr>` : ''}${p('A')}</w:tc><w:tc>${p('B')}</w:tc></w:tr></w:tbl>`;
    const a = await buildDocx(table(4513, ''));
    const near = await compareDocx(
      a,
      await buildDocx(table(4515, '<w:tcW w:w="4515" w:type="dxa"/>')),
    );
    expect(near.score).toBe(1);
    expect(property(near, 'table.columnWidths')).toMatchObject({ total: 1, kept: 1 });
    expect(property(near, 'table.cellWidth')).toMatchObject({ total: 2, kept: 2 });

    const far = await compareDocx(
      a,
      await buildDocx(table(4000, '<w:tcW w:w="4000" w:type="dxa"/>')),
    );
    expect(property(far, 'table.columnWidths').examples[0]).toEqual({
      where: 'tableau 1',
      expected: '[225.65,120]',
      actual: '[200,120]',
    });
    expect(property(far, 'table.cellWidth').examples[0]).toEqual({
      where: 'tableau 1 cellule (1,1)',
      expected: '225.65',
      actual: '200',
    });
  });

  describe('styles conditionnels et alignement de tableau (session 4, L46)', () => {
    /** Style de tableau `Cond` : première ligne grasse sur fond bleu, bandes impaires grises. */
    const CONDITIONAL_STYLES = stylesXml(
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
        '<w:style w:type="table" w:styleId="Cond"><w:name w:val="Cond"/>' +
        '<w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr></w:tblStylePr>' +
        '<w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr></w:tblStylePr>' +
        '</w:style>',
    );
    const LOOK =
      '<w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
    const cell = (text: string, fill = '', rPr = ''): string =>
      `<w:tc>${fill ? `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>` : ''}${p(text, '', rPr)}</w:tc>`;
    const table = (tblPr: string, rows: readonly string[]): string =>
      `<w:tbl><w:tblPr><w:tblStyle w:val="Cond"/>${tblPr}</w:tblPr>${rows.map((row) => `<w:tr>${row}</w:tr>`).join('')}</w:tbl>`;
    const original = table('<w:jc w:val="center"/>' + LOOK, [cell('A'), cell('B'), cell('C')]);
    const styles = { 'word/styles.xml': CONDITIONAL_STYLES };

    it('comparé à lui-même : fond, gras et drapeaux conditionnels conservés', async () => {
      const a = await buildDocx(original, styles);
      const report = await compareDocx(a, a.slice(0));
      expect(report.score).toBe(1);
      expect(property(report, 'table.conditional')).toMatchObject({ total: 1, kept: 1 });
      expect(property(report, 'table.align')).toMatchObject({ total: 1, kept: 1 });
      // Le format conditionnel est résolu dans les cellules : fond ×2 (A, B), gras ×1 (A).
      expect(property(report, 'table.cellShading')).toMatchObject({ total: 2, kept: 2 });
      expect(property(report, 'run.bold')).toMatchObject({ total: 1, kept: 1 });
    });

    it('tolérance : la mise en forme conditionnelle posée directement sur les cellules vaut le style', async () => {
      // Ce qu'Aster produit aujourd'hui : fond et gras directs, style conservé, `w:tblLook`
      // et `w:jc` non réécrits (writer hors contrat).
      const baked = table('', [cell('A', 'D9E2F3', '<w:b/>'), cell('B', 'F2F2F2'), cell('C')]);
      const report = await compareDocx(
        await buildDocx(original, styles),
        await buildDocx(baked, styles),
      );
      expect(property(report, 'table.cellShading')).toMatchObject({ total: 2, kept: 2 });
      expect(property(report, 'run.bold')).toMatchObject({ total: 1, kept: 1 });
      expect(property(report, 'paragraph.text')).toMatchObject({ total: 3, kept: 3 });
      // Sans `w:tblLook`, Word applique 0x04A0 : `firstColumn` s'active en plus. Mesuré, pas corrigé.
      expect(property(report, 'table.conditional')).toMatchObject({ total: 1, kept: 0 });
      expect(property(report, 'table.conditional').examples[0]).toEqual({
        where: 'tableau 1',
        expected: 'firstRow,noVBand',
        actual: 'firstRow,firstColumn,noVBand',
      });
      expect(property(report, 'table.align').examples[0]).toEqual({
        where: 'tableau 1',
        expected: 'center',
        actual: ABSENT,
      });
      expect(
        names(report)
          .filter((name) => name.startsWith('table.'))
          .sort(),
      ).toEqual(
        [
          'table.rows',
          'table.columns',
          'table.style',
          'table.align',
          'table.conditional',
          'table.columnWidths',
          'table.cellShading',
        ].sort(),
      );
    });

    it('une bande oubliée est une perte de fond, un gras perdu une perte de run', async () => {
      const forgotten = table('<w:jc w:val="center"/>' + LOOK, [
        cell('A', '', '<w:b w:val="0"/>'),
        cell('B', 'FFFFFF'),
        cell('C'),
      ]);
      const report = await compareDocx(
        await buildDocx(original, styles),
        await buildDocx(forgotten, styles),
      );
      expect(property(report, 'table.conditional')).toMatchObject({ total: 1, kept: 1 });
      expect(property(report, 'table.cellShading')).toMatchObject({ total: 2, kept: 1 });
      expect(property(report, 'table.cellShading').examples[0]).toEqual({
        where: 'tableau 1 cellule (2,1)',
        expected: '#f2f2f2',
        actual: '#ffffff',
      });
      expect(property(report, 'run.bold')).toMatchObject({ total: 1, kept: 0 });
    });

    it('sans format conditionnel dans le style, w:tblLook n’est pas comparé', async () => {
      const plain = (tblPr: string): string =>
        `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tr>${cell('A')}</w:tr></w:tbl>`;
      const report = await compareDocx(await buildDocx(plain(LOOK)), await buildDocx(plain('')));
      expect(names(report)).not.toContain('table.conditional');
      expect(report.score).toBe(1);
    });
  });
});

describe('compareDocx — score pondéré', () => {
  it('cas calculé à la main : texte 1/2, style 2/2, section 1/1, parties 2/2', async () => {
    const a = await buildDocx(p('Un') + p('Deux'));
    const b = await buildDocx(p('Un') + p('Trois'));
    const report = await compareDocx(a, b);
    const groups = new Set(report.properties.map((item) => item.group));
    expect([...groups].sort()).toEqual(['package-part', 'paragraph-style', 'section', 'text']);
    // (3 × 0,5 + 2 × 1 + 2 × 1 + 2 × 1) / 9
    expect(report.score).toBe(0.833);
  });

  it('cas calculé à la main : un paragraphe perdu avec son gras', async () => {
    const a = await buildDocx(p('Un') + p('Deux', '', '<w:b/>'));
    const b = await buildDocx(p('Un'));
    const report = await compareDocx(a, b);
    // text 1/2 (3), style 1/2 (2), run 0/1 (2), section 1/1 (2), parties 2/2 (2)
    expect(report.score).toBe(Math.round(((1.5 + 1 + 0 + 2 + 2) / 11) * 1000) / 1000);
  });

  it('accepte des vues typées et des File', async () => {
    const buffer = await buildDocx(p('x'));
    const report = await compareDocx(new Uint8Array(buffer), new File([buffer], 'r.docx'));
    expect(report.score).toBe(1);
  });

  it('rejette une entrée qui n’est ni tampon ni fichier', async () => {
    const buffer = await buildDocx(p('x'));
    await expect(compareDocx(buffer, 'nope' as unknown as ArrayBuffer)).rejects.toThrow(/résultat/);
  });
});

describe('compareDocx — findings R30 (F30)', () => {
  const field = (name: string, result: string): string =>
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    `<w:r><w:instrText xml:space="preserve"> MERGEFIELD ${name} </w:instrText></w:r>` +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    `<w:r><w:t>${result}</w:t></w:r>` +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

  it('R30-04 : « Nom Client », nom_client et « NOM CLIENT » sont trois champs distincts', async () => {
    const a = await buildDocx(
      `<w:p>${run('Bonjour ')}${field('"Nom Client"', '«Nom Client»')}</w:p>`,
    );
    const b = await buildDocx(
      `<w:p>${run('Bonjour ')}${field('nom_client', '«nom_client»')}</w:p>`,
    );
    const c = await buildDocx(
      `<w:p>${run('Bonjour ')}${field('"NOM CLIENT"', '«NOM CLIENT»')}</w:p>`,
    );
    for (const [other, actual] of [
      [b, 'nom_client'],
      [c, 'NOM CLIENT'],
    ] as const) {
      const report = await compareDocx(a, other);
      expect(report.score).toBeLessThan(1);
      expect(property(report, 'field.mergeField')).toMatchObject({ total: 1, kept: 0 });
      expect(property(report, 'field.mergeField').examples).toEqual([
        { where: 'paragraphe 1', expected: '["Nom Client"]', actual: `["${actual}"]` },
      ]);
      expect(property(report, 'paragraph.text')).toMatchObject({ total: 1, kept: 0 });
      expect(property(report, 'paragraph.text').examples[0]).toEqual({
        where: 'paragraphe 1',
        expected: 'Bonjour «Nom Client»',
        actual: `Bonjour «${actual}»`,
      });
    }
    // Le même champ, même nom brut : rien de perdu. Un `{{nom_client}}` en clair (ce
    // qu'Aster écrit à l'import) vaut toujours le champ : nom normalisé face au littéral.
    expect((await compareDocx(a, a.slice(0))).score).toBe(1);
    const literal = await compareDocx(a, await buildDocx(p('Bonjour {{nom_client}}')));
    expect(literal.score).toBe(1);
    expect(property(literal, 'field.mergeField')).toMatchObject({ total: 1, kept: 1 });
    expect(property(literal, 'paragraph.text')).toMatchObject({ total: 1, kept: 1 });
    // Deux littéraux aux noms bruts différents : perte, comme deux vrais champs.
    const literals = await compareDocx(
      await buildDocx(p('Bonjour {{Nom Client}}')),
      await buildDocx(p('Bonjour {{nom_client}}')),
    );
    expect(property(literals, 'field.mergeField')).toMatchObject({ total: 1, kept: 0 });
    expect(property(literals, 'paragraph.text')).toMatchObject({ total: 1, kept: 0 });
  });

  it('R30-04 : en-tête, un champ renommé est une perte, un {{nom}} en clair de même nom non', async () => {
    const header = (body: string): Record<string, string> => ({
      'word/header1.xml': `<w:hdr xmlns:w="${W_NS}"><w:p>${body}</w:p></w:hdr>`,
      'word/_rels/document.xml.rels': relsXml({ rId1: [`${REL}/header`, 'header1.xml'] }),
    });
    const section = `${p('corps')}<w:sectPr><w:headerReference w:type="default" r:id="rId1" xmlns:r="${R_NS}"/></w:sectPr>`;
    const a = await buildDocx(
      section,
      header(run('Client ') + field('"Nom Client"', '«Nom Client»')),
    );
    const renamed = await compareDocx(
      a,
      await buildDocx(section, header(run('Client ') + field('nom_client', '«nom_client»'))),
    );
    expect(property(renamed, 'header.default.text')).toMatchObject({ total: 1, kept: 0 });
    const literal = await compareDocx(
      a,
      await buildDocx(section, header(run('Client {{nom_client}}'))),
    );
    expect(property(literal, 'header.default.text')).toMatchObject({ total: 1, kept: 1 });
  });

  it('R30-08 : ligne et cellule sous w:sdt comparées comme les autres, gras compris', async () => {
    const cell = (text: string, rPr = ''): string =>
      `<w:tc><w:p><w:r>${rPr}<w:t>${text}</w:t></w:r></w:p></w:tc>`;
    const grid = '<w:tblGrid><w:gridCol w:w="100"/></w:tblGrid>';
    const sdtRow = await buildDocx(
      `<w:tbl>${grid}<w:tr>${cell('un')}</w:tr><w:sdt><w:sdtContent><w:tr>${cell('deux', '<w:rPr><w:b/></w:rPr>')}</w:tr></w:sdtContent></w:sdt></w:tbl>`,
    );
    const plain = await buildDocx(
      `<w:tbl>${grid}<w:tr>${cell('un')}</w:tr><w:tr>${cell('deux')}</w:tr></w:tbl>`,
    );
    const report = await compareDocx(sdtRow, plain);
    expect(property(report, 'table.rows')).toMatchObject({ total: 1, kept: 1 });
    expect(property(report, 'run.bold')).toMatchObject({ total: 1, kept: 0 });
    expect(property(report, 'run.bold').examples[0]?.where).toBe(
      'tableau 1 cellule (2,1) paragraphe 1 run « deux »',
    );

    const sdtCell = await buildDocx(
      `<w:tbl>${grid}<w:tr>${cell('un')}<w:sdt><w:sdtContent>${cell('deux')}</w:sdtContent></w:sdt></w:tr></w:tbl>`,
    );
    const twoCells = await buildDocx(
      `<w:tbl>${grid}<w:tr>${cell('un')}${cell('deux')}</w:tr></w:tbl>`,
    );
    const cells = await compareDocx(sdtCell, twoCells);
    expect(cells.score).toBe(1);
    expect(property(cells, 'table.columns')).toMatchObject({ total: 1, kept: 1 });
  });

  it('R30-09 : comptes égaux mais un bloc retiré et un ajouté, les trois communs restent appariés', async () => {
    const a = await buildDocx(p('A') + p('B') + p('C') + p('D'));
    const shifted = await compareDocx(a, await buildDocx(p('B') + p('C') + p('D') + p('E')));
    expect(property(shifted, 'paragraph.text')).toMatchObject({ total: 5, kept: 3 });
    expect(property(shifted, 'paragraph.style')).toMatchObject({ total: 4, kept: 3 });
    // (3 × 3/5 + 2 × 3/4 + 2 + 2) / 9 — contre 0,667 avec l'alignement par position.
    expect(shifted.score).toBe(0.811);
    const removed = await compareDocx(a, await buildDocx(p('B') + p('C') + p('D')));
    expect(removed.score).toBe(0.861);
    expect(shifted.score).toBeLessThan(removed.score);
    // Un paragraphe modifié à compte égal reste apparié par position (trou de même taille).
    const modified = await compareDocx(a, await buildDocx(p('A') + p('B2') + p('C') + p('D')));
    expect(property(modified, 'paragraph.text')).toMatchObject({ total: 4, kept: 3 });
    expect(property(modified, 'paragraph.style')).toMatchObject({ total: 4, kept: 4 });
  });

  it('R30-07 : compareTable sur 130 000 lignes ne fait pas déborder la pile', () => {
    const rows = Array.from({ length: 130_000 }, () => [{ colspan: 1, blocks: [] }]);
    const table: TableModel = {
      kind: 'table',
      text: '',
      placeholderText: '',
      columnWidthsPt: [],
      rows,
    };
    const tally = new Tally();
    compareTable(table, table, 't', { tally, ignoreRevisionIds: true }, () => {});
    const columns = tally.properties().find((item) => item.name === 'table.columns');
    expect(columns).toMatchObject({ total: 1, kept: 1 });
    expect(columns?.examples).toEqual([]);
  });

  it('R30-12 : zip sans document.xml et octets aléatoires rejettent en DocxImportError invalid-docx', async () => {
    const good = await buildDocx(p('x'));
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('_rels/.rels', '<Relationships/>');
    const noMain = await zip.generateAsync({ type: 'uint8array' });
    const rejection = expect(compareDocx(good, noMain)).rejects;
    await rejection.toHaveProperty('name', 'DocxImportError');
    await rejection.toThrow(/^invalid-docx: le résultat : /);

    const random = new Uint8Array(2000).fill(7);
    const original = expect(compareDocx(random, good)).rejects;
    await original.toHaveProperty('name', 'DocxImportError');
    await original.toThrow(/^invalid-docx: l'original : /);
  });
});
