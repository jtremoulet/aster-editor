import { beforeAll, describe, expect, it } from 'vitest';
import { run as runXml } from '../preprocess/minimal-docx';
import { childNamed } from '../preprocess/xml-utils';
import { convertRuns, hyperlinkTarget, PAGE_BREAK, renderRunTags } from './runs';
import { createStyleResolver } from './styles';
import { createTestContext, fakePackage, paragraphOf, relsXml, stylesXml } from './test-support';
import type { ConverterContext, StyleResolver } from './types';

const TAB = String.fromCharCode(0x2003);

const STYLES = stylesXml(
  '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Code"><w:name w:val="Code"/><w:rPr><w:rFonts w:ascii="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>',
  '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>',
);

const RELS = relsXml({
  // Cible échappée comme dans un vrai `.rels` (`&amp;`), ré-échappée dans l'attribut `href`.
  rId1: [
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    'https://example.com/a?b=1&amp;c=2',
    true,
  ],
  rId2: [
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
    'media/image1.png',
  ],
});

let styles: StyleResolver;
let ctx: ConverterContext;

beforeAll(async () => {
  const pkg = fakePackage({ 'word/styles.xml': STYLES, 'word/_rels/document.xml.rels': RELS });
  styles = await createStyleResolver(pkg);
  ctx = createTestContext(styles, pkg);
});

async function convert(inline: string, pPr = ''): Promise<string> {
  const paragraph = paragraphOf(inline, pPr);
  return convertRuns(paragraph, ctx, styles.paragraph(childNamed(paragraph, 'pPr')));
}

describe('convertRuns', () => {
  describe('texte et balises', () => {
    it('échappe le texte et conserve les espaces de bord', async () => {
      expect(await convert(runXml(' a &lt; b &amp; "c" '))).toBe(' a &lt; b &amp; &quot;c&quot; ');
    });

    it('n’écrit pas les propriétés égales aux docDefaults', async () => {
      expect(
        await convert(
          runXml('x', '<w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr>'),
        ),
      ).toBe('x');
    });

    it('imbrique les marques dans l’ordre fixe du contrat', async () => {
      const rPr =
        '<w:rPr><w:rStyle w:val="Code"/><w:b/><w:i/><w:u w:val="double"/><w:strike/><w:vertAlign w:val="superscript"/>' +
        '<w:color w:val="C00000"/><w:highlight w:val="yellow"/><w:spacing w:val="20"/><w:caps/></w:rPr>';
      expect(await convert(runXml('x', rPr))).toBe(
        '<strong><em><u style="text-decoration-style: double"><s><sup>' +
          '<span style="font-family: Consolas; font-size: 10pt; color: #c00000; background-color: #ffff00; letter-spacing: 1pt; text-transform: uppercase" data-docx-run-style="Code">x</span>' +
          '</sup></s></u></em></strong>',
      );
    });

    it('rend indice, barré double et petites capitales', async () => {
      expect(
        await convert(
          runXml('x', '<w:rPr><w:dstrike/><w:vertAlign w:val="subscript"/><w:smallCaps/></w:rPr>'),
        ),
      ).toBe(
        '<s style="text-decoration-style: double"><sub><span style="font-variant: small-caps">x</span></sub></s>',
      );
    });

    it('pose les propriétés du style de paragraphe sur chaque run, jamais sur le bloc', async () => {
      const html = await convert(
        runXml('Titre') + runXml(' suite'),
        '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>',
      );
      expect(html).toBe('<strong><span style="font-size: 16pt">Titre suite</span></strong>');
    });

    it('fusionne les runs voisins aux mêmes propriétés et sépare les autres', async () => {
      const bold = '<w:rPr><w:b/></w:rPr>';
      expect(
        await convert(runXml('a', bold) + runXml('b', bold) + runXml('c') + runXml('d', bold)),
      ).toBe('<strong>ab</strong>c<strong>d</strong>');
    });

    it('ignore un run au texte vide sans laisser de balises vides', async () => {
      expect(await convert(runXml('', '<w:rPr><w:b/></w:rPr>') + runXml('x'))).toBe('x');
    });

    it('renderRunTags : rien pour un run égal à la base, décoration solide sans style', () => {
      expect(renderRunTags({ fontFamily: 'Calibri' }, { fontFamily: 'Calibri' })).toEqual({
        open: '',
        close: '',
      });
      expect(renderRunTags({ underline: 'solid', strike: 'dashed' }, {})).toEqual({
        open: '<u><s style="text-decoration-style: dashed">',
        close: '</s></u>',
      });
      expect(renderRunTags({ runStyle: 'A"B' }, {}).open).toBe(
        '<span data-docx-run-style="A&quot;B">',
      );
    });
  });

  describe('caractères spéciaux et sauts', () => {
    it('tabulation → espace cadratin, w:br et w:cr → <br>', async () => {
      expect(
        await convert(
          '<w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t><w:cr/><w:t>d</w:t></w:r>',
        ),
      ).toBe(`a${TAB}b<br>c<br>d`);
    });

    it('w:br type="page" → marqueur PAGE_BREAK hors des balises de run', async () => {
      const html = await convert(
        '<w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t><w:br w:type="page"/><w:t>b</w:t></w:r>',
      );
      expect(html).toBe(`<strong>a</strong>${PAGE_BREAK}<strong>b</strong>`);
      expect(PAGE_BREAK).toBe('<hr data-page-break>');
    });

    it('w:sym : police du symbole posée sur le run, sinon caractère seul', async () => {
      expect(await convert('<w:r><w:sym w:font="Wingdings" w:char="F0FC"/></w:r>')).toBe(
        `<span style="font-family: Wingdings">${String.fromCodePoint(0xf0fc)}</span>`,
      );
      expect(await convert('<w:r><w:sym w:char="2022"/></w:r>')).toBe(String.fromCodePoint(0x2022));
      expect(await convert('<w:r><w:sym w:font="Calibri" w:char="00E9"/></w:r>')).toBe('é');
    });

    it('trait insécable, trait conditionnel, saut de page rendu ignoré', async () => {
      expect(
        await convert(
          '<w:r><w:t>a</w:t><w:noBreakHyphen/><w:softHyphen/><w:lastRenderedPageBreak/><w:t>b</w:t></w:r>',
        ),
      ).toBe(`a${String.fromCharCode(0x2011)}${String.fromCharCode(0xad)}b`);
    });
  });

  describe('hyperliens', () => {
    it('r:id externe → <a href> échappé, avec le style Hyperlink sur les runs', async () => {
      const html = await convert(
        '<w:hyperlink r:id="rId1">' +
          runXml('lien', '<w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>') +
          '</w:hyperlink>',
      );
      expect(html).toBe(
        '<a href="https://example.com/a?b=1&amp;c=2"><u><span style="color: #0563c1" data-docx-run-style="Hyperlink">lien</span></u></a>',
      );
    });

    it('w:anchor → lien interne ; relation interne ou inconnue → texte sans lien', async () => {
      expect(await convert(`<w:hyperlink w:anchor="top">${runXml('haut')}</w:hyperlink>`)).toBe(
        '<a href="#top">haut</a>',
      );
      expect(await convert(`<w:hyperlink r:id="rId2">${runXml('x')}</w:hyperlink>`)).toBe('x');
      expect(await convert(`<w:hyperlink r:id="rId9">${runXml('x')}</w:hyperlink>`)).toBe('x');
    });

    it('un saut de page dans un lien dégénère en <br>', async () => {
      expect(
        await convert(
          '<w:hyperlink w:anchor="a"><w:r><w:t>x</w:t><w:br w:type="page"/><w:t>y</w:t></w:r></w:hyperlink>',
        ),
      ).toBe('<a href="#a">x<br>y</a>');
    });
  });

  describe('champs', () => {
    it('fldSimple PAGE rend le résultat, HYPERLINK rend un lien', async () => {
      expect(
        await convert(`<w:fldSimple w:instr=" PAGE \\* MERGEFORMAT ">${runXml('3')}</w:fldSimple>`),
      ).toBe('3');
      expect(
        await convert(
          `<w:fldSimple w:instr=' HYPERLINK "https://x.io" '>${runXml('x')}</w:fldSimple>`,
        ),
      ).toBe('<a href="https://x.io">x</a>');
      expect(
        await convert(`<w:fldSimple w:instr=' MERGEFIELD Nom '>${runXml('«Nom»')}</w:fldSimple>`),
      ).toBe('«Nom»');
    });

    it('champ complexe : seul le résultat entre separate et end est rendu', async () => {
      const field =
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
        '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
        runXml('7', '<w:rPr><w:b/></w:rPr>') +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      expect(await convert(runXml('page ') + field + runXml(' fin'))).toBe(
        'page <strong>7</strong> fin',
      );
    });

    it('champ complexe HYPERLINK avec instrText coupé sur plusieurs runs', async () => {
      const field =
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
        '<w:r><w:instrText xml:space="preserve"> HYPER</w:instrText></w:r>' +
        '<w:r><w:instrText xml:space="preserve">LINK "https://x.io/p" </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
        runXml('x') +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      expect(await convert(field)).toBe('<a href="https://x.io/p">x</a>');
    });

    it('un champ sans separate ne rend rien, un champ imbriqué non plus avant son résultat', async () => {
      const noResult =
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>DATE</w:instrText><w:t>jamais</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
      expect(await convert(noResult + runXml('ok'))).toBe('ok');
      const nested =
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>IF </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
        runXml('1') +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
        runXml('résultat') +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      expect(await convert(nested)).toBe('résultat');
    });

    it('hyperlinkTarget : url entre guillemets, signet \\l, autre champ → null', () => {
      expect(hyperlinkTarget(' HYPERLINK "https://a.b" \\o "tip" ')).toBe('https://a.b');
      expect(hyperlinkTarget('HYPERLINK \\l "Signet1"')).toBe('#Signet1');
      expect(hyperlinkTarget('HYPERLINK https://nu.ll')).toBe('https://nu.ll');
      expect(hyperlinkTarget(' PAGE ')).toBeNull();
      expect(hyperlinkTarget('HYPERLINK')).toBeNull();
    });
  });

  describe('conteneurs inline, révisions, objets', () => {
    it('traverse sdt, smartTag et ins ; ignore del, signets et commentaires', async () => {
      const xml =
        '<w:bookmarkStart w:id="0" w:name="_GoBack"/>' +
        `<w:sdt><w:sdtPr/><w:sdtContent>${runXml('a')}</w:sdtContent></w:sdt>` +
        `<w:smartTag>${runXml('b')}</w:smartTag>` +
        `<w:ins w:id="1">${runXml('c')}</w:ins>` +
        '<w:del w:id="2"><w:r><w:delText>supprimé</w:delText></w:r></w:del>' +
        '<w:commentRangeStart w:id="3"/><w:r><w:commentReference w:id="3"/></w:r>' +
        '<w:bookmarkEnd w:id="0"/><w:proofErr w:type="spellStart"/>';
      expect(await convert(xml)).toBe('abc');
    });

    it('dessins, VML et appels de note passent par le contexte, hors des balises', async () => {
      const xml =
        '<w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t><w:drawing><wp:inline xmlns:wp="x"/></w:drawing><w:t>b</w:t></w:r>' +
        '<w:r><w:pict/></w:r>' +
        '<w:r><w:footnoteReference w:id="4"/></w:r><w:r><w:endnoteReference w:id="5"/></w:r>';
      expect(await convert(xml)).toBe(
        '<strong>a</strong><img data-test="inline"><strong>b</strong><img data-test="pict">' +
          '<sup data-footnote-ref="4">4</sup><sup data-endnote-ref="5">5</sup>',
      );
    });
  });
});
