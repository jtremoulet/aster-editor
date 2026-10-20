import { existsSync, readFileSync } from 'node:fs';
import { createEditor } from '@aster-editor/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx';
import { buildDocx, run as runXml } from '../preprocess/minimal-docx';
import { normalizeHtml, parseFragment } from '../testing/dom';
import { convertParagraph, paragraphAttributes } from './paragraphs';
import { createStyleResolver } from './styles';
import { createTestContext, fakePackage, paragraphOf, stylesXml } from './test-support';
import type { ConverterContext, StyleResolver } from './types';

const STYLES = stylesXml(
  '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>',
  '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>',
);

let styles: StyleResolver;
let ctx: ConverterContext;

beforeAll(async () => {
  const pkg = fakePackage({ 'word/styles.xml': STYLES });
  styles = await createStyleResolver(pkg);
  ctx = createTestContext(styles, pkg);
});

async function html(inline: string, pPr = '', context = ctx): Promise<string> {
  return (await convertParagraph(paragraphOf(inline, pPr ? `<w:pPr>${pPr}</w:pPr>` : ''), context))
    .html;
}

describe('convertParagraph', () => {
  it('un Normal sans rien donne <p data-docx-style="Normal">', async () => {
    expect(await html(runXml('x'))).toBe('<p data-docx-style="Normal">x</p>');
  });

  it('rend <hN> pour un titre, avec ses attributs de style hérités', async () => {
    expect(await html(runXml('T'), '<w:pStyle w:val="Heading2"/>')).toBe(
      '<h2 style="margin-top: 10pt; margin-bottom: 0pt" data-docx-style="Heading2" data-keep-next><strong>T</strong></h2>',
    );
  });

  it('écrit les déclarations dans l’ordre du contrat', async () => {
    const pPr =
      '<w:jc w:val="center"/><w:spacing w:before="120" w:after="60" w:line="276" w:lineRule="auto"/>' +
      '<w:ind w:left="720" w:right="360" w:hanging="360"/>' +
      '<w:pBdr><w:bottom w:val="single" w:sz="8" w:color="auto"/><w:left w:val="dashed" w:sz="4" w:color="FF0000"/></w:pBdr>' +
      '<w:shd w:val="clear" w:fill="EEEEEE"/><w:pageBreakBefore/><w:keepNext/>';
    expect(await html(runXml('x'), pPr)).toBe(
      '<p style="text-align: center; line-height: 1.15; margin-top: 6pt; margin-bottom: 3pt; margin-left: 36pt; margin-right: 18pt; text-indent: -18pt; ' +
        'border-bottom: 1pt solid #000000; border-left: 0.5pt dashed #ff0000; background-color: #eeeeee" ' +
        'data-docx-style="Normal" data-keep-next data-page-break-before>x</p>',
    );
  });

  it('interligne exact en pt, text-align left non écrit, valeurs égales aux docDefaults omises', async () => {
    expect(
      await html(runXml('x'), '<w:jc w:val="left"/><w:spacing w:line="360" w:lineRule="exact"/>'),
    ).toBe('<p style="line-height: 18pt" data-docx-style="Normal">x</p>');
    expect(
      await html(runXml('x'), '<w:spacing w:after="160" w:line="259" w:lineRule="auto"/>'),
    ).toBe('<p data-docx-style="Normal">x</p>');
  });

  it('w:space des bordures → padding-<côté> après les border-*, seulement s’il est présent', async () => {
    expect(
      await html(
        runXml('x'),
        '<w:pBdr><w:top w:val="single" w:sz="4" w:space="1"/><w:bottom w:val="single" w:sz="8" w:space="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4"/><w:between w:val="single" w:sz="4" w:space="2"/></w:pBdr>',
      ),
    ).toBe(
      '<p style="border-top: 0.5pt solid #000000; border-bottom: 1pt solid #bfbfbf; border-left: 0.5pt solid #000000; padding-top: 1pt; padding-bottom: 4pt" data-docx-style="Normal" data-border-between="0.5pt solid #000000">x</p>',
    );
    // `w:space="0"` explicite est écrit, une valeur négative ou illisible ignorée.
    expect(
      await html(
        runXml('x'),
        '<w:pBdr><w:top w:val="single" w:sz="4" w:space="0"/><w:bottom w:val="single" w:sz="4" w:space="-3"/><w:left w:val="single" w:sz="4" w:space="abc"/></w:pBdr>',
      ),
    ).toBe(
      '<p style="border-top: 0.5pt solid #000000; border-bottom: 0.5pt solid #000000; border-left: 0.5pt solid #000000; padding-top: 0pt" data-docx-style="Normal">x</p>',
    );
  });

  it('taquets : ceux du style puis les directs, w:clear retire, n-ième tabulation = n-ième taquet', async () => {
    const tabbed = fakePackage({
      'word/styles.xml': stylesXml(
        '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Tabbed"><w:name w:val="Tabbed"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="1134"/><w:tab w:val="right" w:pos="8504"/></w:tabs></w:pPr></w:style>',
      ),
    });
    const tabbedCtx = createTestContext(await createStyleResolver(tabbed), tabbed);
    const three =
      '<w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:tab/><w:t>c</w:t><w:tab/><w:t>d</w:t></w:r>';
    // Session 4 : l'alignement du taquet (`right`) suit en `data-align`, après `data-stop`.
    expect(await html(three, '<w:pStyle w:val="Tabbed"/>', tabbedCtx)).toBe(
      '<p data-docx-style="Tabbed">a<span data-tab="" data-stop="56.7pt"></span>b<span data-tab="" data-stop="425.2pt" data-align="right"></span>c<span data-tab=""></span>d</p>',
    );
    // Direct : `clear` du premier taquet du style, nouveau taquet à 2 cm trié par position.
    expect(
      await html(
        three,
        '<w:pStyle w:val="Tabbed"/><w:tabs><w:tab w:val="clear" w:pos="1134"/><w:tab w:val="center" w:pos="2268"/></w:tabs>',
        tabbedCtx,
      ),
    ).toBe(
      '<p data-docx-style="Tabbed">a<span data-tab="" data-stop="113.4pt" data-align="center"></span>b<span data-tab="" data-stop="425.2pt" data-align="right"></span>c<span data-tab=""></span>d</p>',
    );
    // Sans taquet : aucun `data-stop` ; une tabulation seule n'est pas un paragraphe vide.
    expect(await html('<w:r><w:t>a</w:t><w:tab/><w:t>b</w:t></w:r>')).toBe(
      '<p data-docx-style="Normal">a<span data-tab=""></span>b</p>',
    );
    const lone = await convertParagraph(paragraphOf('<w:r><w:tab/></w:r>'), ctx);
    expect(lone.html).toBe('<p data-docx-style="Normal"><span data-tab=""></span></p>');
    expect(lone.isEmpty).toBe(false);
  });

  it('taquets alignés (R43-05) : w:val et w:leader → data-align puis data-leader ; left, bar, start et leader none → rien', async () => {
    const tabs = (inner: string): string => `<w:tabs>${inner}</w:tabs>`;
    const one = '<w:r><w:tab/><w:t>x</w:t></w:r>';
    const stop = async (tab: string): Promise<string> =>
      (await html(one, tabs(tab))).replace(/^<p[^>]*>|x<\/p>$/g, '');
    expect(await stop('<w:tab w:val="decimal" w:pos="720" w:leader="dot"/>')).toBe(
      '<span data-tab="" data-stop="36pt" data-align="decimal" data-leader="dot"></span>',
    );
    expect(await stop('<w:tab w:val="end" w:pos="720" w:leader="hyphen"/>')).toBe(
      '<span data-tab="" data-stop="36pt" data-align="right" data-leader="hyphen"></span>',
    );
    expect(await stop('<w:tab w:val="left" w:pos="720" w:leader="underscore"/>')).toBe(
      '<span data-tab="" data-stop="36pt" data-leader="underscore"></span>',
    );
    // `heavy` → `underscore`, `middleDot` → `dot` (approximations vers le contrat).
    expect(await stop('<w:tab w:val="center" w:pos="720" w:leader="heavy"/>')).toBe(
      '<span data-tab="" data-stop="36pt" data-align="center" data-leader="underscore"></span>',
    );
    expect(await stop('<w:tab w:val="start" w:pos="720" w:leader="middleDot"/>')).toBe(
      '<span data-tab="" data-stop="36pt" data-leader="dot"></span>',
    );
    for (const tab of [
      '<w:tab w:val="bar" w:pos="720"/>',
      '<w:tab w:val="num" w:pos="720" w:leader="none"/>',
      '<w:tab w:pos="720" w:leader="zzz"/>',
    ]) {
      expect(await stop(tab), tab).toBe('<span data-tab="" data-stop="36pt"></span>');
    }
    // Un taquet direct à la même position remplace celui du style, alignement compris.
    expect(await stop('<w:tab w:val="right" w:pos="720"/><w:tab w:val="left" w:pos="720"/>')).toBe(
      '<span data-tab="" data-stop="36pt"></span>',
    );
  });

  it('R42-03 : un taquet à position négative est ignoré, jamais data-stop="-36pt"', async () => {
    const negative = await html(
      '<w:r><w:tab/><w:t>x</w:t></w:r>',
      '<w:tabs><w:tab w:val="left" w:pos="-720"/><w:tab w:val="clear" w:pos="-1"/></w:tabs>',
    );
    expect(negative).toBe('<p data-docx-style="Normal"><span data-tab=""></span>x</p>');
    expect(negative).not.toContain('-36pt');
    // `pos="0"` reste dans le domaine du core (≥ 0).
    expect(
      await html(
        '<w:r><w:tab/><w:t>x</w:t></w:r>',
        '<w:tabs><w:tab w:val="left" w:pos="0"/></w:tabs>',
      ),
    ).toBe('<p data-docx-style="Normal"><span data-tab="" data-stop="0pt"></span>x</p>');
  });

  it('R42-05 : w:sz="0" sur une bordure de paragraphe donne le filet fin, comme sur une cellule', async () => {
    expect(await html(runXml('p'), '<w:pBdr><w:bottom w:val="single" w:sz="0"/></w:pBdr>')).toBe(
      '<p style="border-bottom: 0.5pt solid #000000" data-docx-style="Normal">p</p>',
    );
    // Même entrée dans un `.docx` : paragraphe et cellule reçoivent la même largeur.
    const docx = await importDocx(
      await buildDocx(
        `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="0"/></w:pBdr></w:pPr>${runXml('p')}</w:p>` +
          `<w:tbl><w:tr><w:tc><w:tcPr><w:tcBorders><w:bottom w:val="single" w:sz="0"/></w:tcBorders></w:tcPr><w:p>${runXml('c')}</w:p></w:tc></w:tr></w:tbl>`,
      ),
      { fidelity: 'styled' },
    );
    const widths = docx.html.match(/border-bottom: ([\d.]+pt)/g) ?? [];
    expect(widths).toEqual(['border-bottom: 0.5pt', 'border-bottom: 0.5pt']);
  });

  it('bordure between → data-border-between', async () => {
    expect(await html(runXml('x'), '<w:pBdr><w:between w:val="single" w:sz="4"/></w:pBdr>')).toBe(
      '<p data-docx-style="Normal" data-border-between="0.5pt solid #000000">x</p>',
    );
  });

  it('numbering recopié, isEmpty selon le contenu', async () => {
    const numbered = await convertParagraph(
      paragraphOf(
        runXml('x'),
        '<w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="2"/></w:numPr></w:pPr>',
      ),
      ctx,
    );
    expect(numbered.numbering).toEqual({ numId: '2', level: 1 });
    expect(numbered.isEmpty).toBe(false);
    const empty = await convertParagraph(paragraphOf(runXml('  ', '<w:rPr><w:b/></w:rPr>')), ctx);
    expect(empty.isEmpty).toBe(true);
    expect(empty.numbering).toBeUndefined();
    expect((await convertParagraph(paragraphOf('<w:r><w:br/></w:r>'), ctx)).isEmpty).toBe(false);
    expect((await convertParagraph(paragraphOf('<w:r><w:drawing/></w:r>'), ctx)).isEmpty).toBe(
      false,
    );
  });

  describe('saut de page', () => {
    it('coupe le paragraphe en deux blocs frères', async () => {
      expect(await html('<w:r><w:t>a</w:t><w:br w:type="page"/><w:t>b</w:t></w:r>')).toBe(
        '<p data-docx-style="Normal">a</p><hr data-page-break><p data-docx-style="Normal">b</p>',
      );
    });

    it('en début ou en fin, ne laisse pas de bloc vide ; seul, ne rend que le saut', async () => {
      expect(await html('<w:r><w:t>a</w:t><w:br w:type="page"/></w:r>')).toBe(
        '<p data-docx-style="Normal">a</p><hr data-page-break>',
      );
      expect(await html('<w:r><w:br w:type="page"/><w:t>b</w:t></w:r>')).toBe(
        '<hr data-page-break><p data-docx-style="Normal">b</p>',
      );
      const lone = await convertParagraph(paragraphOf('<w:r><w:br w:type="page"/></w:r>'), ctx);
      expect(lone.html).toBe('<hr data-page-break>');
      expect(lone.isEmpty).toBe(false);
    });
  });

  describe('retrait de liste', () => {
    const withNumbering = (): ConverterContext => ({
      ...ctx,
      numbering: {
        definition: (numId) =>
          numId === '2'
            ? {
                numId,
                levels: [
                  {
                    level: 0,
                    format: 'bullet',
                    text: '•',
                    start: 1,
                    indentLeftPt: 36,
                    hangingPt: 18,
                  },
                ],
              }
            : null,
      },
    });

    it('prend le retrait du niveau et pose data-docx-num-indent', async () => {
      expect(
        await html(
          runXml('x'),
          '<w:pStyle w:val="ListParagraph"/><w:numPr><w:numId w:val="2"/></w:numPr>',
          withNumbering(),
        ),
      ).toBe(
        '<p style="margin-left: 36pt; text-indent: -18pt" data-docx-style="ListParagraph" data-docx-num-indent>x</p>',
      );
    });

    it('un w:ind direct l’emporte ; niveau inconnu → retrait du style', async () => {
      expect(
        await html(
          runXml('x'),
          '<w:numPr><w:numId w:val="2"/></w:numPr><w:ind w:left="1440"/>',
          withNumbering(),
        ),
      ).toBe('<p style="margin-left: 72pt" data-docx-style="Normal">x</p>');
      expect(
        await html(
          runXml('x'),
          '<w:pStyle w:val="ListParagraph"/><w:numPr><w:numId w:val="9"/></w:numPr>',
          withNumbering(),
        ),
      ).toBe('<p style="margin-left: 36pt" data-docx-style="ListParagraph">x</p>');
    });
  });

  describe('style de tableau', () => {
    it('applique ses défauts de paragraphe et de run là où le paragraphe suit les docDefaults', async () => {
      const inTable: ConverterContext = {
        ...ctx,
        tableStyle: {
          runDefaults: { fontSizePt: 9, bold: true },
          paragraphDefaults: { spacingAfterPt: 0, lineHeight: 1 },
        } as ConverterContext['tableStyle'],
      };
      expect(await html(runXml('x'), '', inTable)).toBe(
        '<p style="line-height: 1; margin-bottom: 0pt" data-docx-style="Normal"><span style="font-size: 9pt"><strong>x</strong></span></p>',
      );
      expect(
        await html(
          runXml('x', '<w:rPr><w:sz w:val="24"/></w:rPr>'),
          '<w:spacing w:after="120" w:line="300" w:lineRule="exact"/>',
          inTable,
        ),
      ).toBe(
        '<p style="line-height: 15pt; margin-bottom: 6pt" data-docx-style="Normal"><span style="font-size: 12pt"><strong>x</strong></span></p>',
      );
    });

    it('un style de tableau sans défauts de paragraphe ne change rien', async () => {
      const inTable: ConverterContext = { ...ctx, tableStyle: { borders: [] } };
      expect(await html(runXml('x'), '', inTable)).toBe('<p data-docx-style="Normal">x</p>');
    });

    it('R42-07 : les taquets du w:pPr du style de tableau valent pour les cellules, sauf si le paragraphe en pose', async () => {
      const pkg = fakePackage({
        'word/styles.xml': stylesXml(
          '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>' +
            '<w:style w:type="table" w:styleId="G"><w:name w:val="G"/><w:pPr><w:tabs><w:tab w:val="right" w:pos="1440"/></w:tabs></w:pPr></w:style>',
        ),
      });
      const resolver = await createStyleResolver(pkg);
      const inTable = createTestContext(resolver, pkg, { tableStyle: resolver.tableStyle('G') });
      const one = '<w:r><w:tab/><w:t>x</w:t></w:r>';
      expect(await html(one, '', inTable)).toBe(
        '<p data-docx-style="Normal"><span data-tab="" data-stop="72pt" data-align="right"></span>x</p>',
      );
      // Le paragraphe pose ses propres taquets : ceux du style de tableau ne s'ajoutent pas.
      expect(await html(one, '<w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs>', inTable)).toBe(
        '<p data-docx-style="Normal"><span data-tab="" data-stop="36pt"></span>x</p>',
      );
      // Hors tableau : aucun taquet.
      expect(await html(one, '', createTestContext(resolver, pkg))).toBe(
        '<p data-docx-style="Normal"><span data-tab=""></span>x</p>',
      );
    });
  });

  it('paragraphAttributes : identifiant de style échappé, bordures identiques à la base omises', () => {
    const border = { side: 'top', style: 'solid', widthPt: 1, color: '#000000' } as const;
    expect(
      paragraphAttributes(
        { styleId: 'A"B', borders: [border], runDefaults: {} },
        { borders: [border] },
      ),
    ).toBe(' data-docx-style="A&quot;B"');
    expect(paragraphAttributes({ lineHeight: 1.5, runDefaults: {} }, { lineHeightPt: 12 })).toBe(
      ' style="line-height: 1.5"',
    );
  });
});

const FIXTURES = `${import.meta.env.ASTER_FIXTURES}docx/`;

function loadFixture(path: string): Uint8Array {
  return new Uint8Array(readFileSync(`${FIXTURES}${path}`));
}

function loadExpected(name: string): string {
  return readFileSync(`${FIXTURES}expected/${name}.html`, 'utf8');
}

describe('fixtures 11-13 (chemin styled)', () => {
  it('11-styles-inline : chaque propriété de run est rendue', async () => {
    const { html: out, warnings } = await importDocx(loadFixture('11-styles-inline.docx'), {
      fidelity: 'styled',
    });
    expect(warnings).toEqual([]);
    expect(out).toContain(
      '<span style="font-family: Georgia; font-size: 14pt">Police Georgia 14 pt</span>',
    );
    expect(out).toContain('<span style="color: #c00000">Rouge #C00000</span>');
    expect(out).toContain('<span style="background-color: #ffff00">Surligné jaune</span>');
    expect(out).toContain('<u style="text-decoration-style: double">Souligné double</u>');
    expect(out).toContain('<u style="text-decoration-style: wavy">Souligné ondulé</u>');
    expect(out).toContain('<s>Barré</s>');
    expect(out).toContain('<sup>Exposant</sup>');
    expect(out).toContain('<sub>Indice</sub>');
    expect(out).toContain('<span style="font-variant: small-caps">Petites capitales</span>');
    expect(out).toContain('<span style="text-transform: uppercase">Majuscules</span>');
    expect(out).toContain('<span style="letter-spacing: 2pt">Espacement 2 pt</span>');
    expect(out).toContain('data-docx-run-style="Code"');
    expect(out).toContain(
      '<p data-docx-style="Normal">Police du thème (sans police explicite)</p>',
    );
    expect(out).toMatch(
      /<span style="[^"]+"><strong><em><s><u style="text-decoration-style: double"><sup>Tout cumulé/,
    );
  });

  it('12-paragraphes : alignements, interlignes, retraits, bordures, sauts', async () => {
    const { html: out, warnings } = await importDocx(loadFixture('12-paragraphes.docx'), {
      fidelity: 'styled',
    });
    expect(warnings).toEqual([]);
    expect(out).toContain('<p style="text-align: center" data-docx-style="Normal">Centré</p>');
    expect(out).toContain('<p style="text-align: justify" data-docx-style="Normal">Justifié');
    expect(out).toContain('<p style="line-height: 1.5" data-docx-style="Normal">');
    expect(out).toContain('<p style="line-height: 18pt" data-docx-style="Normal">');
    expect(out).toContain(
      '<p style="margin-top: 12pt; margin-bottom: 6pt" data-docx-style="Normal">',
    );
    expect(out).toContain(
      '<p style="margin-left: 28.35pt" data-docx-style="Normal">Retrait gauche 1 cm</p>',
    );
    expect(out).toContain('<p style="text-indent: 14.15pt" data-docx-style="Normal">');
    expect(out).toContain(
      '<p style="margin-left: 14.15pt; text-indent: -14.15pt" data-docx-style="Normal">',
    );
    expect(out).toContain(
      '<p style="border-bottom: 1pt solid #000000; padding-bottom: 1pt" data-docx-style="Normal">',
    );
    expect(out).toContain('<p style="background-color: #eeeeee" data-docx-style="Normal">');
    expect(out).toContain('data-keep-next=""');
    expect(out).toContain('data-page-break-before=""');
    // Tabulation avec le taquet par défaut de la fixture (4 cm = 113,4 pt).
    expect(out).toContain(
      'Tabulation dans un paragraphe<span data-tab="" data-stop="113.4pt"></span>texte après la tabulation',
    );
    expect(out).toContain('première ligne<br>seconde ligne');
    expect(out).toContain(
      '</p><hr data-page-break=""><p data-docx-style="Normal">Après le saut de page explicite</p>',
    );
  });

  it('13-styles-nommes : héritage basedOn, docDefaults, surcharge directe', async () => {
    const { html: out, layout } = await importDocx(loadFixture('13-styles-nommes.docx'), {
      fidelity: 'styled',
    });
    expect(layout.defaultFont).toEqual({ family: 'Calibri', sizePt: 11 });
    expect(out).toContain(
      '<p style="line-height: 1.15; margin-bottom: 8pt" data-docx-style="Normal">Paragraphe Normal',
    );
    expect(out).toMatch(
      /<h1 style="line-height: 1.15; margin-top: 12pt; margin-bottom: 4pt" data-docx-style="Heading1" data-keep-next=""><span style="color: #2f5496; font-size: 16pt"><strong>Titre 1/,
    );
    expect(out).toContain(
      '<p style="line-height: 1.15; margin-bottom: 8pt; margin-left: 28.35pt; border-left: 1.5pt solid #808080; padding-left: 4pt" data-docx-style="Citation"><em>Paragraphe Citation',
    );
    expect(out).toContain(
      'data-docx-style="Important"><span style="color: #c00000"><strong><em>Paragraphe Important',
    );
    expect(out).toContain(
      'data-docx-style="Citation"><span style="color: #00b050"><em>Citation avec couleur directe',
    );
    // Calibri 11 vient des docDefaults : jamais répété sur les runs.
    expect(out).not.toContain('font-family: Calibri');
    expect(out).not.toContain('font-size: 11pt');
  });

  it.each(['11-styles-inline', '12-paragraphes', '13-styles-nommes'])(
    '%s correspond au HTML attendu',
    async (name) => {
      const { html: out } = await importDocx(loadFixture(`${name}.docx`), { fidelity: 'styled' });
      expect(normalizeHtml(out)).toBe(normalizeHtml(loadExpected(name)));
    },
  );

  /** Monte un éditeur du core, y charge le HTML stylé et rend ce que le core en ressort. */
  function roundTrip(html: string): string {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = createEditor({ element });
    try {
      editor.setHTML(html);
      return editor.getHTML();
    } finally {
      editor.destroy();
      element.remove();
    }
  }

  // TODO L23 : idempotence stricte. Aujourd'hui le core ressort `color: rgb(…)`, un `;`
  // final, les marques dans l'ordre de son schéma (`<span>` hors `<strong>`), les quatre
  // bordures fusionnées en `border-width/style/color`, `data-keep-next` avant
  // `data-docx-style` et `<hr data-page-break>` sans son attribut. À réactiver quand le
  // core sérialise le contrat à l'identique.
  it.each(['11-styles-inline', '12-paragraphes', '13-styles-nommes'])(
    '%s survit à setHTML puis getHTML dans le core (strict)',
    async (name) => {
      const { html: out } = await importDocx(loadFixture(`${name}.docx`), { fidelity: 'styled' });
      expect(normalizeHtml(roundTrip(out))).toBe(normalizeHtml(out));
    },
  );

  it.each(['11-styles-inline', '12-paragraphes', '13-styles-nommes'])(
    '%s garde texte, styles Word et marques après setHTML puis getHTML',
    async (name) => {
      const { html: out } = await importDocx(loadFixture(`${name}.docx`), { fidelity: 'styled' });
      const back = roundTrip(out);
      const text = (html: string): string => parseFragment(html).body.textContent ?? '';
      expect(text(back)).toBe(text(out));
      const count = (html: string, selector: string): number =>
        parseFragment(html).querySelectorAll(selector).length;
      for (const selector of [
        '[data-docx-style]',
        '[data-docx-run-style]',
        'strong',
        'em',
        'u',
        's',
        'sup',
        'sub',
        'h1',
        'h2',
      ]) {
        expect(count(back, selector), selector).toBe(count(out, selector));
      }
    },
  );
});

describe('revue R24 (importDocx styled sur .docx minimaux)', () => {
  async function styled(body: string): Promise<string> {
    return (await importDocx(await buildDocx(body), { fidelity: 'styled' })).html;
  }

  /** Monte un éditeur du core, y charge le HTML stylé et rend ce que le core en ressort. */
  function roundTrip(html: string): string {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = createEditor({ element });
    try {
      editor.setHTML(html);
      return editor.getHTML();
    } finally {
      editor.destroy();
      element.remove();
    }
  }

  it('R24-02 : une police citée survit telle quelle à setHTML puis getHTML (strict)', async () => {
    const out = await styled(
      `<w:p>${runXml('narrow', '<w:rPr><w:rFonts w:ascii="Arial Narrow"/></w:rPr>')}${runXml(' plain')}</w:p>` +
        `<w:p>${runXml('sym', '<w:rPr><w:rFonts w:ascii="Wingdings 2"/><w:b/></w:rPr>')}</w:p>`,
    );
    expect(out).toBe(
      '<p><span style="font-family: &quot;Arial Narrow&quot;">narrow</span> plain</p>' +
        '<p><span style="font-family: &quot;Wingdings 2&quot;"><strong>sym</strong></span></p>',
    );
    expect(roundTrip(out)).toBe(out);
    expect(roundTrip(roundTrip(out))).toBe(out);
  });

  it('R24-02 : un nom de police hostile ne produit aucun style', async () => {
    const out = await styled(
      `<w:p>${runXml('x', '<w:rPr><w:rFonts w:ascii="Arial; position: fixed; background: url(https://evil.example/px)"/></w:rPr>')}</w:p>`,
    );
    expect(out).toBe('<p>x</p>');
  });

  it('R24-03 : un champ HYPERLINK fermé trois paragraphes plus loin ne donne qu’un lien', async () => {
    const out = await styled(
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
        '<w:r><w:instrText xml:space="preserve"> HYPERLINK "https://x.io" </w:instrText></w:r>' +
        `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${runXml('lien')}</w:p>` +
        `<w:p>${runXml('suite')}</w:p>` +
        `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r>${runXml('fin')}</w:p>` +
        `<w:p>${runXml('encore')}</w:p>`,
    );
    expect(out).toBe('<p><a href="https://x.io">lien</a></p><p>suite</p><p>fin</p><p>encore</p>');
  });

  it('R24-04 : un w:sym hors plage n’annule pas l’import', async () => {
    const out = await styled(
      `<w:p>${runXml('ok')}<w:r><w:sym w:font="Wingdings" w:char="110000"/></w:r><w:r><w:sym w:font="Wingdings" w:char="-1"/></w:r></w:p>`,
    );
    expect(out).toBe('<p>ok</p>');
  });

  it('R24-12 : javascript: retiré du HTML brut, texte conservé', async () => {
    const out = await styled(
      `<w:p><w:fldSimple w:instr=' HYPERLINK "javascript:alert(2)" '>${runXml('a')}</w:fldSimple></w:p>`,
    );
    expect(out).toBe('<p>a</p>');
  });
});

const CLIENT = `${FIXTURES}client/Modele_Demo_DER.docx`;

describe('document client Modele_Demo_DER (non commité)', () => {
  it.skipIf(!existsSync(CLIENT))(
    's’importe en styled avec les mêmes variables qu’en semantic',
    async () => {
      const bytes = loadFixture('client/Modele_Demo_DER.docx');
      const styled = await importDocx(bytes, { fidelity: 'styled' });
      const semantic = await importDocx(bytes, { fidelity: 'semantic' });
      expect(styled.html).toContain('FICHE INFORMATION CONSEILLER');
      expect(styled.variables.map((v) => v.name)).toEqual(semantic.variables.map((v) => v.name));
      expect(styled.variables.map((v) => v.name)).toContain('EstablishmentName');
      expect(styled.variables.map((v) => v.name)).toContain('RCSNumber');
      // 20 champs dans le document, dont un dans le pied de page (hors `html`) : on compare au
      // chemin sémantique plutôt qu'à un compte absolu.
      const count = (html: string): number =>
        parseFragment(html).querySelectorAll('[data-aster-variable]').length;
      expect(count(styled.html)).toBe(count(semantic.html));
      expect(count(styled.html)).toBeGreaterThanOrEqual(19);
      expect(styled.layout.defaultFont).toEqual({ family: 'Times New Roman', sizePt: 12 });
      expect(styled.warnings.filter((w) => w.code === 'reader')).toEqual([]);
    },
  );
});
