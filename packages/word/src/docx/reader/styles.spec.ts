import { describe, expect, it } from 'vitest';
import {
  conditionalFormatsOf,
  createStyleResolver,
  docDefaultsOf,
  tableParagraphDefaultsOf,
} from './styles.js';
import { fakePackage, pPrOf, rPrOf, stylesXml, themeXml } from './test-support.js';
import type { StyleResolver } from './types.js';

const DOC_DEFAULTS =
  '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>';

function style(
  type: string,
  id: string,
  inner: string,
  attrs: { name?: string; basedOn?: string; link?: string; isDefault?: boolean } = {},
): string {
  return (
    `<w:style w:type="${type}" w:styleId="${id}"${attrs.isDefault ? ' w:default="1"' : ''}>` +
    `<w:name w:val="${attrs.name ?? id}"/>` +
    (attrs.basedOn ? `<w:basedOn w:val="${attrs.basedOn}"/>` : '') +
    (attrs.link ? `<w:link w:val="${attrs.link}"/>` : '') +
    `${inner}</w:style>`
  );
}

async function resolver(
  styles: string,
  docDefaults = DOC_DEFAULTS,
  extra: Record<string, string> = {},
): Promise<StyleResolver> {
  return createStyleResolver(
    fakePackage({ 'word/styles.xml': stylesXml(styles, docDefaults), ...extra }),
  );
}

const NORMAL = style('paragraph', 'Normal', '', { isDefault: true });

describe('createStyleResolver', () => {
  describe('docDefaults et style par défaut', () => {
    it('résout un paragraphe sans pStyle sur le style par défaut et les docDefaults', async () => {
      const styles = await resolver(NORMAL);
      const paragraph = styles.paragraph(null);
      expect(paragraph.styleId).toBe('Normal');
      expect(paragraph.spacingAfterPt).toBe(8);
      expect(paragraph.lineHeight).toBe(1.08);
      expect(paragraph.runDefaults).toEqual({ fontFamily: 'Arial', fontSizePt: 10 });
      expect(styles.run(null, paragraph)).toEqual({ fontFamily: 'Arial', fontSizePt: 10 });
    });

    it('expose docDefaults() et defaultFont()', async () => {
      const styles = await resolver(
        NORMAL + style('paragraph', 'Body', '<w:rPr><w:rFonts w:ascii="Georgia"/></w:rPr>'),
      );
      const defaults = docDefaultsOf(styles);
      expect(defaults.run).toEqual({ fontFamily: 'Arial', fontSizePt: 10 });
      expect(defaults.paragraph.spacingAfterPt).toBe(8);
      expect(styles.defaultFont()).toEqual({ family: 'Arial', sizePt: 10 });
    });

    it('replie docDefaultsOf sur defaultFont() pour un résolveur tiers', () => {
      const stub: StyleResolver = {
        paragraph: () => ({ runDefaults: {} }),
        run: () => ({}),
        tableStyle: () => null,
        defaultFont: () => ({ family: 'Times', sizePt: 12 }),
      };
      expect(docDefaultsOf(stub)).toEqual({
        paragraph: { runDefaults: { fontFamily: 'Times', fontSizePt: 12 } },
        run: { fontFamily: 'Times', fontSizePt: 12 },
      });
    });

    it('fonctionne sans styles.xml', async () => {
      const styles = await createStyleResolver(fakePackage({}));
      expect(styles.paragraph(null)).toEqual({ runDefaults: {} });
      expect(styles.run(rPrOf('<w:b/>'), styles.paragraph(null))).toEqual({ bold: true });
      expect(styles.defaultFont()).toEqual({});
      expect(styles.tableStyle('TableGrid')).toBeNull();
    });

    it('un pStyle inconnu retombe sur le style par défaut', async () => {
      const styles = await resolver(NORMAL);
      expect(styles.paragraph(pPrOf('<w:pStyle w:val="Nope"/>')).styleId).toBe('Normal');
    });
  });

  describe('chaîne basedOn', () => {
    const CHAIN =
      NORMAL +
      style(
        'paragraph',
        'A',
        '<w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr>',
        {
          basedOn: 'Normal',
        },
      ) +
      style('paragraph', 'B', '<w:rPr><w:b/><w:color w:val="FF0000"/></w:rPr>', { basedOn: 'A' }) +
      style(
        'paragraph',
        'C',
        '<w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:i/><w:b w:val="0"/></w:rPr>',
        {
          basedOn: 'B',
        },
      );

    it('résout trois niveaux, la feuille annulant un gras hérité', async () => {
      const styles = await resolver(CHAIN);
      const paragraph = styles.paragraph(pPrOf('<w:pStyle w:val="C"/>'));
      expect(paragraph).toMatchObject({
        styleId: 'C',
        align: 'center',
        spacingAfterPt: 0,
        lineHeight: 1.08,
      });
      expect(paragraph.runDefaults).toEqual({
        fontFamily: 'Arial',
        fontSizePt: 12,
        italic: true,
        color: '#ff0000',
      });
    });

    it('le niveau intermédiaire garde le gras', async () => {
      const styles = await resolver(CHAIN);
      expect(styles.paragraph(pPrOf('<w:pStyle w:val="B"/>')).runDefaults.bold).toBe(true);
    });

    it('ne boucle pas sur un cycle basedOn', async () => {
      const styles = await resolver(
        NORMAL +
          style('paragraph', 'X', '<w:rPr><w:b/></w:rPr>', { basedOn: 'Y' }) +
          style('paragraph', 'Y', '<w:rPr><w:i/></w:rPr>', { basedOn: 'X' }),
      );
      const paragraph = styles.paragraph(pPrOf('<w:pStyle w:val="X"/>'));
      expect(paragraph.runDefaults).toMatchObject({ bold: true, italic: true });
    });

    it('ignore un basedOn vers un style d’un autre type', async () => {
      const styles = await resolver(
        NORMAL +
          style('character', 'Char', '<w:rPr><w:b/></w:rPr>') +
          style('paragraph', 'P', '<w:rPr><w:i/></w:rPr>', { basedOn: 'Char' }),
      );
      expect(styles.paragraph(pPrOf('<w:pStyle w:val="P"/>')).runDefaults.bold).toBeUndefined();
    });
  });

  describe('niveau de titre', () => {
    it('lit Heading N, Titre N, le nom « heading N » et w:outlineLvl', async () => {
      const styles = await resolver(
        NORMAL +
          style('paragraph', 'Heading1', '') +
          style('paragraph', 'Titre2', '', { name: 'heading 2' }) +
          style('paragraph', 'Custom', '<w:pPr><w:outlineLvl w:val="2"/></w:pPr>') +
          style('paragraph', 'Sub', '', { basedOn: 'Heading1' }) +
          style('paragraph', 'Body', '<w:pPr><w:outlineLvl w:val="9"/></w:pPr>'),
      );
      const level = (id: string): number | undefined =>
        styles.paragraph(pPrOf(`<w:pStyle w:val="${id}"/>`)).headingLevel;
      expect(level('Heading1')).toBe(1);
      expect(level('Titre2')).toBe(2);
      expect(level('Custom')).toBe(3);
      expect(level('Sub')).toBe(1);
      expect(level('Body')).toBeUndefined();
      expect(level('Normal')).toBeUndefined();
    });

    it('un outlineLvl direct l’emporte sur le style', async () => {
      const styles = await resolver(NORMAL + style('paragraph', 'Heading1', ''));
      expect(
        styles.paragraph(pPrOf('<w:pStyle w:val="Heading1"/><w:outlineLvl w:val="3"/>'))
          .headingLevel,
      ).toBe(4);
      expect(styles.paragraph(pPrOf('<w:outlineLvl w:val="9"/>')).headingLevel).toBeUndefined();
    });
  });

  describe('propriétés de paragraphe directes', () => {
    it('alignement, interligne auto, exact et atLeast', async () => {
      const styles = await resolver(NORMAL);
      expect(styles.paragraph(pPrOf('<w:jc w:val="both"/>')).align).toBe('justify');
      expect(styles.paragraph(pPrOf('<w:jc w:val="end"/>')).align).toBe('right');
      expect(styles.paragraph(pPrOf('<w:jc w:val="start"/>')).align).toBe('left');
      const auto = styles.paragraph(pPrOf('<w:spacing w:line="360" w:lineRule="auto"/>'));
      expect(auto.lineHeight).toBe(1.5);
      expect(auto.lineHeightPt).toBeUndefined();
      const exact = styles.paragraph(pPrOf('<w:spacing w:line="360" w:lineRule="exact"/>'));
      expect(exact.lineHeightPt).toBe(18);
      expect(exact.lineHeight).toBeUndefined();
      expect(
        styles.paragraph(pPrOf('<w:spacing w:line="280" w:lineRule="atLeast"/>')).lineHeightPt,
      ).toBe(14);
      expect(styles.paragraph(pPrOf('<w:spacing w:before="240" w:after="120"/>'))).toMatchObject({
        spacingBeforePt: 12,
        spacingAfterPt: 6,
      });
    });

    it('retraits : left/start, right/end, firstLine, hanging négatif', async () => {
      const styles = await resolver(NORMAL);
      expect(
        styles.paragraph(pPrOf('<w:ind w:left="720" w:right="360" w:firstLine="283"/>')),
      ).toMatchObject({
        indentLeftPt: 36,
        indentRightPt: 18,
        indentFirstLinePt: 14.15,
      });
      expect(
        styles.paragraph(pPrOf('<w:ind w:start="283" w:end="100" w:hanging="283"/>')),
      ).toMatchObject({
        indentLeftPt: 14.15,
        indentRightPt: 5,
        indentFirstLinePt: -14.15,
      });
    });

    it('bordures : style, taille en huitièmes, couleur auto, annulation par nil', async () => {
      const styles = await resolver(
        NORMAL +
          style(
            'paragraph',
            'Boxed',
            '<w:pPr><w:pBdr><w:top w:val="single" w:sz="8" w:color="auto"/><w:bottom w:val="dashed" w:sz="12" w:color="FF0000"/></w:pBdr></w:pPr>',
          ),
      );
      const boxed = styles.paragraph(pPrOf('<w:pStyle w:val="Boxed"/>'));
      expect(boxed.borders).toEqual([
        { side: 'top', style: 'solid', widthPt: 1, color: '#000000' },
        { side: 'bottom', style: 'dashed', widthPt: 1.5, color: '#ff0000' },
      ]);
      const cancelled = styles.paragraph(
        pPrOf(
          '<w:pStyle w:val="Boxed"/><w:pBdr><w:top w:val="nil"/><w:between w:val="double" w:sz="4"/></w:pBdr>',
        ),
      );
      expect(cancelled.borders).toEqual([
        { side: 'bottom', style: 'dashed', widthPt: 1.5, color: '#ff0000' },
        { side: 'between', style: 'double', widthPt: 0.5, color: '#000000' },
      ]);
      expect(
        styles.paragraph(pPrOf('<w:pBdr><w:left w:val="dotted"/></w:pBdr>')).borders?.[0],
      ).toMatchObject({
        style: 'dotted',
        widthPt: 0.5,
      });
    });

    it('fond, keepNext, pageBreakBefore, numPr et leurs annulations', async () => {
      const styles = await resolver(
        NORMAL +
          style(
            'paragraph',
            'ListStyle',
            '<w:pPr><w:keepNext/><w:shd w:val="clear" w:fill="EEEEEE"/><w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr></w:pPr>',
          ),
      );
      const inherited = styles.paragraph(pPrOf('<w:pStyle w:val="ListStyle"/>'));
      expect(inherited).toMatchObject({
        keepWithNext: true,
        shading: '#eeeeee',
        numbering: { numId: '3', level: 1 },
      });
      const cancelled = styles.paragraph(
        pPrOf(
          '<w:pStyle w:val="ListStyle"/><w:keepNext w:val="0"/><w:pageBreakBefore/><w:shd w:val="clear" w:fill="auto"/><w:numPr><w:numId w:val="0"/></w:numPr>',
        ),
      );
      expect(cancelled.keepWithNext).toBeUndefined();
      expect(cancelled.pageBreakBefore).toBe(true);
      expect(cancelled.shading).toBeUndefined();
      expect(cancelled.numbering).toBeUndefined();
      expect(styles.paragraph(pPrOf('<w:numPr><w:numId w:val="5"/></w:numPr>')).numbering).toEqual({
        numId: '5',
        level: 0,
      });
    });
  });

  describe('propriétés de run', () => {
    it('polices du thème : minorHAnsi et majorHAnsi, repli sur ascii puis hAnsi', async () => {
      const styles = await resolver(
        NORMAL,
        '<w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>',
        { 'word/theme/theme1.xml': themeXml('Calibri Light', 'Calibri') },
      );
      const paragraph = styles.paragraph(null);
      expect(paragraph.runDefaults).toEqual({ fontFamily: 'Calibri', fontSizePt: 11 });
      expect(styles.run(rPrOf('<w:rFonts w:asciiTheme="majorHAnsi"/>'), paragraph).fontFamily).toBe(
        'Calibri Light',
      );
      expect(
        styles.run(rPrOf('<w:rFonts w:ascii="Georgia" w:hAnsi="Verdana"/>'), paragraph).fontFamily,
      ).toBe('Georgia');
      expect(styles.run(rPrOf('<w:rFonts w:hAnsi="Verdana"/>'), paragraph).fontFamily).toBe(
        'Verdana',
      );
    });

    it('un thème absent laisse la police explicite', async () => {
      const styles = await resolver(NORMAL);
      expect(
        styles.run(
          rPrOf('<w:rFonts w:asciiTheme="minorHAnsi" w:ascii="Georgia"/>'),
          styles.paragraph(null),
        ).fontFamily,
      ).toBe('Georgia');
    });

    it('taille, gras, italique, souligné, barré, exposant, casse, espacement, langue', async () => {
      const styles = await resolver(NORMAL);
      const paragraph = styles.paragraph(null);
      const run = styles.run(
        rPrOf(
          '<w:b/><w:i/><w:u w:val="double"/><w:strike/><w:sz w:val="28"/><w:vertAlign w:val="superscript"/>' +
            '<w:smallCaps/><w:spacing w:val="40"/><w:lang w:val="fr-FR"/><w:color w:val="C00000"/>',
        ),
        paragraph,
      );
      expect(run).toEqual({
        fontFamily: 'Arial',
        fontSizePt: 14,
        bold: true,
        italic: true,
        underline: 'double',
        strike: 'solid',
        color: '#c00000',
        superscript: true,
        letterSpacingPt: 2,
        caps: 'small',
        lang: 'fr-FR',
      });
      expect(
        styles.run(rPrOf('<w:dstrike/><w:caps/><w:vertAlign w:val="subscript"/>'), paragraph),
      ).toMatchObject({ strike: 'double', caps: 'all', subscript: true });
    });

    it('styles de souligné : single, dash, dotted, wave, none', async () => {
      const styles = await resolver(NORMAL);
      const paragraph = styles.paragraph(null);
      const underline = (val: string): unknown =>
        styles.run(rPrOf(`<w:u w:val="${val}"/>`), paragraph).underline;
      expect(underline('single')).toBe('solid');
      expect(underline('dash')).toBe('dashed');
      expect(underline('dotted')).toBe('dotted');
      expect(underline('wave')).toBe('wavy');
      expect(underline('none')).toBeUndefined();
      expect(styles.run(rPrOf('<w:u/>'), paragraph).underline).toBe('solid');
    });

    it('surlignage nommé, fond de run en repli, couleur auto omise', async () => {
      const styles = await resolver(NORMAL);
      const paragraph = styles.paragraph(null);
      expect(styles.run(rPrOf('<w:highlight w:val="yellow"/>'), paragraph).highlight).toBe(
        '#ffff00',
      );
      expect(styles.run(rPrOf('<w:highlight w:val="darkBlue"/>'), paragraph).highlight).toBe(
        '#000080',
      );
      expect(styles.run(rPrOf('<w:shd w:val="clear" w:fill="F2F2F2"/>'), paragraph).highlight).toBe(
        '#f2f2f2',
      );
      expect(
        styles.run(
          rPrOf('<w:shd w:val="clear" w:fill="F2F2F2"/><w:highlight w:val="green"/>'),
          paragraph,
        ).highlight,
      ).toBe('#00ff00');
      expect(styles.run(rPrOf('<w:color w:val="auto"/>'), paragraph).color).toBeUndefined();
    });

    it('une propriété à w:val="0" ou none annule l’héritée', async () => {
      const styles = await resolver(
        NORMAL +
          style(
            'paragraph',
            'Strong',
            '<w:rPr><w:b/><w:i/><w:u w:val="single"/><w:caps/><w:vertAlign w:val="superscript"/><w:highlight w:val="yellow"/></w:rPr>',
          ),
      );
      const paragraph = styles.paragraph(pPrOf('<w:pStyle w:val="Strong"/>'));
      expect(paragraph.runDefaults).toMatchObject({
        bold: true,
        italic: true,
        underline: 'solid',
        caps: 'all',
      });
      const run = styles.run(
        rPrOf(
          '<w:b w:val="0"/><w:i w:val="false"/><w:u w:val="none"/><w:caps w:val="0"/><w:vertAlign w:val="baseline"/><w:highlight w:val="none"/>',
        ),
        paragraph,
      );
      expect(run).toEqual({ fontFamily: 'Arial', fontSizePt: 10 });
    });

    it('style de caractère (rStyle) puis propriétés directes, avec runStyle', async () => {
      const styles = await resolver(
        NORMAL +
          style('character', 'Base', '<w:rPr><w:color w:val="1F4E79"/></w:rPr>') +
          style(
            'character',
            'Code',
            '<w:rPr><w:rFonts w:ascii="Consolas"/><w:sz w:val="20"/></w:rPr>',
            {
              basedOn: 'Base',
            },
          ),
      );
      const paragraph = styles.paragraph(null);
      const run = styles.run(rPrOf('<w:rStyle w:val="Code"/><w:sz w:val="18"/>'), paragraph);
      expect(run).toEqual({
        fontFamily: 'Consolas',
        fontSizePt: 9,
        color: '#1f4e79',
        runStyle: 'Code',
      });
      expect(styles.run(rPrOf('<w:rStyle w:val="Missing"/>'), paragraph).runStyle).toBeUndefined();
    });

    it('un rStyle vers un style de paragraphe lié prend le style de caractère lié', async () => {
      const styles = await resolver(
        NORMAL +
          style('paragraph', 'Heading1', '<w:rPr><w:sz w:val="32"/></w:rPr>', {
            link: 'Heading1Char',
          }) +
          style('character', 'Heading1Char', '<w:rPr><w:b/></w:rPr>') +
          style('paragraph', 'Quote', '<w:rPr><w:i/></w:rPr>'),
      );
      const paragraph = styles.paragraph(null);
      expect(styles.run(rPrOf('<w:rStyle w:val="Heading1"/>'), paragraph)).toMatchObject({
        bold: true,
      });
      expect(styles.run(rPrOf('<w:rStyle w:val="Quote"/>'), paragraph)).toMatchObject({
        italic: true,
      });
    });
  });

  describe('tableStyle', () => {
    const TABLE =
      NORMAL +
      style(
        'table',
        'TableNormal',
        '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>',
        { isDefault: true },
      ) +
      style(
        'table',
        'TableGrid',
        '<w:rPr><w:sz w:val="18"/></w:rPr><w:tblPr><w:tblBorders>' +
          '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/>' +
          '<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>' +
          '<w:tblCellMar><w:top w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
          '<w:tcPr><w:shd w:val="clear" w:fill="F2F2F2"/></w:tcPr>',
        { basedOn: 'TableNormal' },
      );

    it('résout bordures, traits intérieurs, marges héritées, fond et défauts', async () => {
      const styles = await resolver(TABLE);
      const grid = styles.tableStyle('TableGrid');
      const border = { style: 'solid', widthPt: 0.5, color: '#000000' };
      expect(grid?.borders).toEqual([
        { side: 'top', ...border },
        { side: 'right', ...border },
        { side: 'bottom', ...border },
        { side: 'left', ...border },
      ]);
      expect(grid?.cellBorders?.map((b) => b.side)).toEqual(['top', 'right', 'bottom', 'left']);
      expect(grid?.cellPaddingPt).toEqual([2, 5.4, 0, 5.4]);
      expect(grid?.cellShading).toBe('#f2f2f2');
      expect(grid?.runDefaults).toEqual({ fontFamily: 'Arial', fontSizePt: 9 });
      expect(tableParagraphDefaultsOf(grid)).toEqual({ spacingAfterPt: 0, lineHeight: 1 });
      expect(styles.tableStyle('TableGrid')).toBe(grid);
    });

    it('w:tblStylePr → conditional (firstRow, band1Horz…), hérité le long de basedOn', async () => {
      const styles = await resolver(
        TABLE +
          style(
            'table',
            'Cond',
            '<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr></w:tblStylePr>' +
              '<w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr></w:tblStylePr>',
            { basedOn: 'TableGrid' },
          ) +
          style(
            'table',
            'CondChild',
            '<w:tblStylePr w:type="firstRow"><w:tcPr><w:tcBorders><w:bottom w:val="single" w:sz="12" w:color="2F5496"/></w:tcBorders></w:tcPr></w:tblStylePr>',
            { basedOn: 'Cond' },
          ),
      );
      expect(conditionalFormatsOf(styles.tableStyle('Cond'))).toEqual({
        firstRow: { cellShading: '#d9e2f3', run: { bold: true } },
        band1Horz: { cellShading: '#f2f2f2' },
      });
      expect(conditionalFormatsOf(styles.tableStyle('CondChild'))).toEqual({
        firstRow: {
          cellBorders: {
            bottom: { side: 'bottom', style: 'solid', widthPt: 1.5, color: '#2f5496' },
          },
          cellShading: '#d9e2f3',
          run: { bold: true },
        },
        band1Horz: { cellShading: '#f2f2f2' },
      });
      // Le reste du style est inchangé par les formats conditionnels.
      expect(styles.tableStyle('Cond')?.cellShading).toBe('#f2f2f2');
      expect(styles.tableStyle('Cond')?.runDefaults).toEqual({
        fontFamily: 'Arial',
        fontSizePt: 9,
      });
      expect(conditionalFormatsOf(styles.tableStyle('TableGrid'))).toBeUndefined();
      expect(conditionalFormatsOf(null)).toBeUndefined();
      expect(conditionalFormatsOf({ borders: [] })).toBeUndefined();
    });

    it('tcBorders explicites priment sur les traits intérieurs ; inconnu et null → null', async () => {
      const styles = await resolver(
        NORMAL +
          style(
            'table',
            'Cells',
            '<w:tblPr><w:tblBorders><w:insideH w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>' +
              '<w:tcPr><w:tcBorders><w:bottom w:val="double" w:sz="6" w:color="0000FF"/></w:tcBorders></w:tcPr>',
          ),
      );
      expect(styles.tableStyle('Cells')?.cellBorders).toEqual([
        { side: 'bottom', style: 'double', widthPt: 0.75, color: '#0000ff' },
      ]);
      expect(styles.tableStyle('Nope')).toBeNull();
      expect(styles.tableStyle(null)).toBeNull();
      expect(tableParagraphDefaultsOf(null)).toBeUndefined();
      expect(tableParagraphDefaultsOf({ borders: [] })).toBeUndefined();
    });
  });

  describe('revue R24', () => {
    it('R24-02 : une police de thème irrecevable est ignorée', async () => {
      const styles = await resolver(NORMAL, DOC_DEFAULTS, {
        'word/theme/theme1.xml': themeXml('Cambria; color: red', 'Calibri Light'),
      });
      const paragraph = styles.paragraph(null);
      expect(
        styles.run(rPrOf('<w:rFonts w:asciiTheme="majorHAnsi" w:ascii="Georgia"/>'), paragraph)
          .fontFamily,
      ).toBe('Georgia');
      expect(styles.run(rPrOf('<w:rFonts w:asciiTheme="minorHAnsi"/>'), paragraph).fontFamily).toBe(
        'Calibri Light',
      );
    });

    it('R24-06 : taille de police hors 1-1638 pt, négative, nulle ou hexadécimale ignorée', async () => {
      const styles = await resolver(NORMAL);
      const paragraph = styles.paragraph(null);
      const size = (val: string): number | undefined =>
        styles.run(rPrOf(`<w:sz w:val="${val}"/>`), paragraph).fontSizePt;
      expect(size('99999999999999999999999')).toBe(10);
      expect(size('-22')).toBe(10);
      expect(size('0')).toBe(10);
      expect(size('1')).toBe(10);
      expect(size('0x20')).toBe(10);
      expect(size('1e3')).toBe(10);
      expect(size('Infinity')).toBe(10);
      expect(size('3278')).toBe(10);
      expect(size('2')).toBe(1);
      expect(size('3276')).toBe(1638);
      expect(size('23')).toBe(11.5);
    });

    it('R24-06 : interligne, espacements, retraits et bordures bornés comme dans Word', async () => {
      const styles = await resolver(NORMAL);
      const paragraph = (inner: string): ReturnType<StyleResolver['paragraph']> =>
        styles.paragraph(pPrOf(inner));
      // Interligne multiple ≤ 132, exact/atLeast ≤ 1584 pt, jamais négatif.
      expect(paragraph('<w:spacing w:line="2000000"/>').lineHeight).toBe(1.08);
      expect(paragraph('<w:spacing w:line="31680"/>').lineHeight).toBe(132);
      expect(paragraph('<w:spacing w:line="-240"/>').lineHeight).toBe(1.08);
      expect(paragraph('<w:spacing w:line="31700" w:lineRule="exact"/>')).not.toHaveProperty(
        'lineHeightPt',
      );
      expect(paragraph('<w:spacing w:line="31680" w:lineRule="exact"/>').lineHeightPt).toBe(1584);
      // Espacements dans [0, 1584] pt (`ST_TwipsMeasure` non signé, R53-03), retraits dans ±1584 pt.
      expect(paragraph('<w:spacing w:before="-100"/>').spacingBeforePt).toBeUndefined();
      expect(paragraph('<w:spacing w:before="0"/>').spacingBeforePt).toBe(0);
      expect(paragraph('<w:spacing w:before="31700"/>').spacingBeforePt).toBeUndefined();
      expect(paragraph('<w:spacing w:after="99999999999"/>').spacingAfterPt).toBe(8);
      expect(paragraph('<w:ind w:left="31700" w:right="-31700"/>')).not.toHaveProperty(
        'indentLeftPt',
      );
      expect(paragraph('<w:ind w:left="31700" w:right="-31700"/>')).not.toHaveProperty(
        'indentRightPt',
      );
      expect(paragraph('<w:ind w:hanging="31700"/>')).not.toHaveProperty('indentFirstLinePt');
      expect(paragraph('<w:ind w:left="31680" w:hanging="31680"/>')).toMatchObject({
        indentLeftPt: 1584,
        indentFirstLinePt: -1584,
      });
      // Bordure > 12 pt : largeur par défaut (½ pt), style et couleur conservés.
      expect(
        paragraph('<w:pBdr><w:top w:val="single" w:sz="99999999" w:color="FF0000"/></w:pBdr>')
          .borders,
      ).toEqual([{ side: 'top', style: 'solid', widthPt: 0.5, color: '#ff0000' }]);
      expect(
        paragraph('<w:pBdr><w:top w:val="single" w:sz="96"/></w:pBdr>').borders?.[0]?.widthPt,
      ).toBe(12);
      // Espacement de caractères ±1584 pt.
      const run = (inner: string): number | undefined =>
        styles.run(rPrOf(inner), styles.paragraph(null)).letterSpacingPt;
      expect(run('<w:spacing w:val="31700"/>')).toBeUndefined();
      expect(run('<w:spacing w:val="-31680"/>')).toBe(-1584);
      expect(run('<w:spacing w:val="0x14"/>')).toBeUndefined();
    });

    it('R24-07 : chaîne basedOn de 1 500 styles, 1 500 paragraphes et 1 500 runs en moins de 500 ms', async () => {
      const COUNT = 1500;
      let xml = NORMAL;
      for (let index = 1; index <= COUNT; index += 1) {
        xml += style('paragraph', `P${index}`, `<w:pPr><w:ind w:left="${index}"/></w:pPr>`, {
          basedOn: index === 1 ? 'Normal' : `P${index - 1}`,
        });
        xml += style('character', `C${index}`, `<w:rPr><w:spacing w:val="${index}"/></w:rPr>`, {
          basedOn: index === 1 ? undefined : `C${index - 1}`,
        });
      }
      const styles = await resolver(xml);
      // Les fragments sont parsés hors chronomètre : seule la résolution est mesurée.
      // Ordre décroissant : le premier paragraphe résout toute la chaîne, les suivants
      // doivent réutiliser les nœuds mémoïsés.
      const inputs = Array.from({ length: COUNT }, (_, offset) => {
        const index = COUNT - offset;
        return {
          index,
          pPr: pPrOf(`<w:pStyle w:val="P${index}"/>`),
          rPr: rPrOf(`<w:rStyle w:val="C${index}"/>`),
        };
      });
      const started = performance.now();
      const results = inputs.map(({ pPr, rPr }) => {
        const paragraph = styles.paragraph(pPr);
        return { paragraph, run: styles.run(rPr, paragraph) };
      });
      const elapsed = performance.now() - started;
      results.forEach(({ paragraph, run }, offset) => {
        const { index } = inputs[offset] ?? { index: 0 };
        expect(paragraph.indentLeftPt).toBe(index / 20);
        expect(run.letterSpacingPt).toBe(index / 20);
        expect(run.runStyle).toBe(`C${index}`);
      });
      expect(elapsed).toBeLessThan(500);
    });

    it('R24-08 : un pStyle d’un autre type (tableau, caractère) retombe sur le style par défaut', async () => {
      const styles = await resolver(
        NORMAL +
          style('table', 'TableGrid', '<w:pPr><w:jc w:val="center"/></w:pPr>') +
          style('character', 'Code', '<w:rPr><w:b/></w:rPr>'),
      );
      const expected = styles.paragraph(pPrOf('<w:pStyle w:val="Nope"/>'));
      expect(expected.styleId).toBe('Normal');
      for (const requested of ['TableGrid', 'Code']) {
        const paragraph = styles.paragraph(pPrOf(`<w:pStyle w:val="${requested}"/>`));
        expect(paragraph).toEqual(expected);
        expect(paragraph.align).toBeUndefined();
        expect(paragraph.runDefaults.bold).toBeUndefined();
      }
    });

    it('R24-09 : les bascules d’un style de caractère sont en XOR avec celles du paragraphe', async () => {
      const styles = await resolver(
        NORMAL +
          style('paragraph', 'Heading1', '<w:rPr><w:b/><w:i/><w:caps/><w:strike/></w:rPr>') +
          style(
            'character',
            'Strong',
            '<w:rPr><w:b/><w:i w:val="0"/><w:caps/><w:strike/><w:color w:val="C00000"/></w:rPr>',
          ) +
          style('character', 'Stronger', '<w:rPr><w:b/></w:rPr>', { basedOn: 'Strong' }) +
          style('character', 'Small', '<w:rPr><w:smallCaps/></w:rPr>'),
      );
      const heading = styles.paragraph(pPrOf('<w:pStyle w:val="Heading1"/>'));
      const normal = styles.paragraph(null);
      const strongRPr = rPrOf('<w:rStyle w:val="Strong"/>');
      // Sur un titre gras : Strong (gras) rend non gras ; `w:i w:val="0"` ne bascule pas.
      expect(styles.run(strongRPr, heading)).toEqual({
        fontFamily: 'Arial',
        fontSizePt: 10,
        italic: true,
        color: '#c00000',
        runStyle: 'Strong',
      });
      // Sur un paragraphe normal : Strong rend gras, capitales et barré.
      expect(styles.run(strongRPr, normal)).toMatchObject({
        bold: true,
        caps: 'all',
        strike: 'solid',
        color: '#c00000',
      });
      expect(styles.run(strongRPr, normal).italic).toBeUndefined();
      // Deux styles de caractère gras dans la hiérarchie : XOR entre eux (§17.7.3), puis
      // avec le paragraphe.
      expect(styles.run(rPrOf('<w:rStyle w:val="Stronger"/>'), normal).bold).toBeUndefined();
      expect(styles.run(rPrOf('<w:rStyle w:val="Stronger"/>'), heading).bold).toBe(true);
      // Petites capitales sur un titre en capitales : la casse du style de caractère l'emporte.
      expect(styles.run(rPrOf('<w:rStyle w:val="Small"/>'), heading).caps).toBe('small');
      // Le formatage direct reste absolu : `w:b` direct sur un titre gras + Strong → gras.
      expect(styles.run(rPrOf('<w:rStyle w:val="Strong"/><w:b/>'), heading).bold).toBe(true);
      expect(
        styles.run(rPrOf('<w:rStyle w:val="Strong"/><w:b w:val="0"/>'), normal).bold,
      ).toBeUndefined();
    });

    it('R24-10 : surlignage DarkBlue (et toute casse) reconnu', async () => {
      const styles = await resolver(NORMAL);
      const paragraph = styles.paragraph(null);
      for (const name of ['DarkBlue', 'darkBlue', 'darkblue', 'DARKBLUE']) {
        expect(styles.run(rPrOf(`<w:highlight w:val="${name}"/>`), paragraph).highlight).toBe(
          '#000080',
        );
      }
      expect(styles.run(rPrOf('<w:highlight w:val="LightGray"/>'), paragraph).highlight).toBe(
        '#c0c0c0',
      );
      expect(
        styles.run(rPrOf('<w:highlight w:val="chartreuse"/>'), paragraph).highlight,
      ).toBeUndefined();
    });
  });
});
