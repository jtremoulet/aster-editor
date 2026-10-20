import { describe, expect, it } from 'vitest';
import { buildDocx, run, W_NS } from '../preprocess/minimal-docx';
import { relsXml, stylesXml } from '../reader/test-support';
import { compareDocx } from './compare-docx';
import type { FidelityProperty, FidelityReport } from './types';

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
