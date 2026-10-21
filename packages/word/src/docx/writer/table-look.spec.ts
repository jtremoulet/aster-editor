import { describe, expect, it } from 'vitest';
import { normalizeHtml } from '../testing/dom';
import {
  checkIntegrity,
  exportInTemplate,
  fixture,
  importStyled,
  textOf,
  topLevelBlocks,
} from './testing';

/**
 * L49 : `w:tblLook` de bout en bout dans le gabarit. La fixture 19 porte un tableau au
 * style conditionnel `AsterConditional` (`firstRow` gras sur fond `#D9E2F3`, `band1Horz`
 * fond `#F2F2F2`, bordures grises du style) avec `w:tblLook firstRow noVBand`. Le lecteur
 * résout ces formats en propriétés directes ; la greffe ne doit pas les réécrire quand
 * elles sont exactement celles du style, et doit réécrire `w:tblLook` tel quel.
 */

const CONDITIONAL_STYLE = '<w:tblStyle w:val="AsterConditional"/>';

/** Le `w:tbl` greffé qui porte le style conditionnel. */
function conditionalTable(documentXml: string): string {
  const table = topLevelBlocks(documentXml).find(
    (block) => block.startsWith('<w:tbl>') && block.includes(CONDITIONAL_STYLE),
  );
  expect(table).toBeDefined();
  return table ?? '';
}

describe('tableau à style conditionnel dans le gabarit (L49)', () => {
  it('19 : w:tblLook réécrit, fond, gras et bordures du style conditionnel non écrits en direct', async () => {
    const template = await fixture('19-tabulations-bordures.docx');
    const imported = await importStyled(template);
    expect(imported.html).toContain(
      'data-docx-style="AsterConditional" data-docx-look="firstRow noVBand">',
    );
    const result = await exportInTemplate(imported.html, template, { layout: imported.layout });
    expect(result.warnings).toEqual([]);
    expect(checkIntegrity(result.parts)).toEqual([]);
    const table = conditionalTable(textOf(result.parts, 'word/document.xml'));
    expect(table).toContain(
      '<w:tblLook w:firstRow="true" w:lastRow="false" w:firstColumn="false" w:lastColumn="false" w:noHBand="false" w:noVBand="true"/>',
    );
    // Ce que le style conditionnel produit n'est plus écrit en direct.
    expect(table).not.toContain('<w:shd');
    expect(table).not.toContain('<w:b/>');
    expect(table).not.toContain('<w:bCs/>');
    expect(table).not.toContain('<w:tcBorders>');
    expect(table).not.toContain('<w:tblBorders>');
    // Les autres tableaux de la fixture (sans w:tblLook) gardent leurs bordures directes.
    const document = textOf(result.parts, 'word/document.xml');
    expect(document).toContain('<w:tcBorders>');
    expect(document).toContain('<w:tblBorders>');
  });

  it('19 : import → export gabarit → import idempotent, HTML et layout égaux', async () => {
    const template = await fixture('19-tabulations-bordures.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template, { layout: imported.layout });
    const again = await importStyled(result.buffer);
    expect(normalizeHtml(again.html)).toBe(normalizeHtml(imported.html));
    expect(again.layout).toEqual(imported.layout);
    // Et une seconde greffe redonne le même corps.
    const twice = await exportInTemplate(again.html, result.buffer, { layout: again.layout });
    expect(conditionalTable(textOf(twice.parts, 'word/document.xml'))).toBe(
      conditionalTable(textOf(result.parts, 'word/document.xml')),
    );
  });

  it('19 : une propriété différente du style reste écrite en direct', async () => {
    const template = await fixture('19-tabulations-bordures.docx');
    const imported = await importStyled(template);
    // Fond de la première cellule d'en-tête changé, gras retiré sur la seconde : écarts réels.
    const html = imported.html
      .replace('background-color: #d9e2f3', 'background-color: #ff0000')
      .replace('<strong>firstRow B</strong>', 'firstRow B');
    expect(html).not.toBe(imported.html);
    const result = await exportInTemplate(html, template, { layout: imported.layout });
    const table = conditionalTable(textOf(result.parts, 'word/document.xml'));
    expect(table).toContain('<w:shd w:fill="FF0000" w:color="auto" w:val="clear"/>');
    expect(table.split('<w:shd').length - 1).toBe(1);
    // Le gras retiré sur « firstRow B » est réécrit à faux par la réconciliation du run ?
    // Non : le style conditionnel n'est pas un style de paragraphe, la cellule relue n'est
    // simplement plus en gras dans l'éditeur (limite documentée, comme pour le lecteur).
    expect(table).toContain('firstRow B');
    expect(table).not.toContain('<w:b/>');
    const again = await importStyled(result.buffer);
    expect(again.html).toContain('background-color: #ff0000');
  });

  it('19 : sans data-docx-look, le tableau stylé garde ses propriétés directes (pas de w:tblLook)', async () => {
    const template = await fixture('19-tabulations-bordures.docx');
    const imported = await importStyled(template);
    const html = imported.html.replace(' data-docx-look="firstRow noVBand"', '');
    const result = await exportInTemplate(html, template, { layout: imported.layout });
    const table = conditionalTable(textOf(result.parts, 'word/document.xml'));
    expect(table).not.toContain('<w:tblLook');
    expect(table).toContain('<w:shd w:fill="D9E2F3"');
    expect(table).toContain('<w:b/>');
    expect(table).toContain('<w:tcBorders>');
  });
});
