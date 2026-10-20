import { existsSync, readFileSync } from 'node:fs';
import { createEditor } from '@aster-editor/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx';
import { run as runXml } from '../preprocess/minimal-docx';
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
        '<p style="line-height: 1; margin-bottom: 0pt" data-docx-style="Normal"><strong><span style="font-size: 9pt">x</span></strong></p>',
      );
      expect(
        await html(
          runXml('x', '<w:rPr><w:sz w:val="24"/></w:rPr>'),
          '<w:spacing w:after="120" w:line="300" w:lineRule="exact"/>',
          inTable,
        ),
      ).toBe(
        '<p style="line-height: 15pt; margin-bottom: 6pt" data-docx-style="Normal"><strong><span style="font-size: 12pt">x</span></strong></p>',
      );
    });

    it('un style de tableau sans défauts de paragraphe ne change rien', async () => {
      const inTable: ConverterContext = { ...ctx, tableStyle: { borders: [] } };
      expect(await html(runXml('x'), '', inTable)).toBe('<p data-docx-style="Normal">x</p>');
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
      /<strong><em><u style="text-decoration-style: double"><s><sup><span style="[^"]+">Tout cumulé/,
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
    expect(out).toContain('<p style="border-bottom: 1pt solid #000000" data-docx-style="Normal">');
    expect(out).toContain('<p style="background-color: #eeeeee" data-docx-style="Normal">');
    expect(out).toContain('data-keep-next=""');
    expect(out).toContain('data-page-break-before=""');
    expect(out).toContain(
      `Tabulation dans un paragraphe${String.fromCharCode(0x2003)}texte après la tabulation`,
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
      /<h1 style="line-height: 1.15; margin-top: 12pt; margin-bottom: 4pt" data-docx-style="Heading1" data-keep-next=""><strong><span style="font-size: 16pt; color: #2f5496">Titre 1/,
    );
    expect(out).toContain(
      '<p style="line-height: 1.15; margin-bottom: 8pt; margin-left: 28.35pt; border-left: 1.5pt solid #808080" data-docx-style="Citation"><em>Paragraphe Citation',
    );
    expect(out).toContain(
      'data-docx-style="Important"><strong><em><span style="color: #c00000">Paragraphe Important',
    );
    expect(out).toContain(
      'data-docx-style="Citation"><em><span style="color: #00b050">Citation avec couleur directe',
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
  it.skip.each(['11-styles-inline', '12-paragraphes', '13-styles-nommes'])(
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
