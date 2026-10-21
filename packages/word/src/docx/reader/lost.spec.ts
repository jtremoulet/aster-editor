import { beforeEach, describe, expect, it } from 'vitest';
import { alternateContentChoice, detectLost, detectLostInline, textboxLost } from './lost.js';
import { buildPackage, createTestContext, fragment, renderBody } from './testing-blocks.js';
import type { ConverterContext } from './types.js';

const TEXTBOX =
  '<w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="101" name="Zone de texte 1"/><a:graphic><a:graphicData uri="x">' +
  '<wps:wsp><wps:cNvSpPr txBox="1"/><wps:txbx><w:txbxContent><w:p><w:r><w:t>Ligne 1</w:t></w:r></w:p><w:p><w:r><w:t>Ligne 2</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp>' +
  '</a:graphicData></a:graphic></wp:inline></w:drawing>';

const SHAPE =
  '<w:drawing><wp:inline><wp:docPr id="102" name="Ellipse 2"/><a:graphic><a:graphicData uri="x"><wps:wsp><wps:cNvSpPr/><wps:spPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing>';

describe('detectLost / detectLostInline', () => {
  let ctx: ConverterContext;

  beforeEach(async () => {
    ctx = await createTestContext(await buildPackage(''));
  });

  it('zone de texte : texte des paragraphes et nom', () => {
    expect(detectLostInline(fragment(TEXTBOX), ctx)).toEqual({
      kind: 'textbox',
      where: 'body',
      text: 'Ligne 1\nLigne 2',
      detail: 'Zone de texte 1',
    });
    expect(
      detectLost(
        fragment('<w:txbxContent><w:p><w:r><w:t>Seul</w:t></w:r></w:p></w:txbxContent>'),
        ctx,
      ),
    ).toEqual({
      kind: 'textbox',
      where: 'body',
      text: 'Seul',
      detail: 'zone de texte',
    });
  });

  it('forme DrawingML et VML, SmartArt, graphique', () => {
    expect(detectLostInline(fragment(SHAPE), ctx)).toEqual({
      kind: 'shape',
      where: 'body',
      detail: 'Ellipse 2',
    });
    expect(
      detectLostInline(
        fragment('<w:pict><v:rect id="_x0000_s1026" style="width:10pt"/></w:pict>'),
        ctx,
      ),
    ).toEqual({ kind: 'shape', where: 'body', detail: '_x0000_s1026' });
    expect(
      detectLostInline(
        fragment(
          '<w:drawing><wp:inline><wp:docPr id="1" name="Diagramme 1"/><a:graphic><a:graphicData uri="d"><dgm:relIds/></a:graphicData></a:graphic></wp:inline></w:drawing>',
        ),
        ctx,
      ),
    ).toEqual({ kind: 'smartart', where: 'body', detail: 'Diagramme 1' });
    expect(
      detectLostInline(
        fragment(
          '<w:drawing><wp:inline><wp:docPr id="1" name="Graphique 1"/><a:graphic><a:graphicData uri="c"><c:chart r:id="rId9"/></a:graphicData></a:graphic></wp:inline></w:drawing>',
        ),
        ctx,
      ),
    ).toEqual({ kind: 'chart', where: 'body', detail: 'Graphique 1' });
  });

  it('un dessin avec image n’est pas une perte', () => {
    expect(
      detectLostInline(
        fragment(
          '<w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>',
        ),
        ctx,
      ),
    ).toBeNull();
    expect(
      detectLostInline(
        fragment('<w:pict><v:shape><v:imagedata r:id="rId1"/></v:shape></w:pict>'),
        ctx,
      ),
    ).toBeNull();
    // R25-02 : un `a:blip` hors `pic:pic` (fond de forme) ne fait pas une image.
    expect(
      detectLostInline(
        fragment(
          '<w:drawing><wp:anchor><wp:docPr id="2" name="Zone de texte 9"/><a:graphic><a:graphicData><wps:wsp><wps:spPr><a:blipFill><a:blip r:embed="rId5"/></a:blipFill></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t>T</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing>',
        ),
        ctx,
      ),
    ).toEqual({ kind: 'textbox', where: 'body', text: 'T', detail: 'Zone de texte 9' });
    expect(textboxLost(fragment(SHAPE), ctx)).toBeNull();
    expect(textboxLost(fragment(TEXTBOX), ctx)?.text).toBe('Ligne 1\nLigne 2');
  });

  it('R25-04 : mc:AlternateContent classé par son mc:Choice, repli sur mc:Fallback', () => {
    const wrapped = `<mc:AlternateContent><mc:Choice Requires="wps">${TEXTBOX}</mc:Choice><mc:Fallback><w:pict><v:rect id="r1"/></w:pict></mc:Fallback></mc:AlternateContent>`;
    expect(detectLostInline(fragment(wrapped), ctx)).toEqual({
      kind: 'textbox',
      where: 'body',
      text: 'Ligne 1\nLigne 2',
      detail: 'Zone de texte 1',
    });
    expect(
      detectLost(
        fragment(
          '<mc:AlternateContent><mc:Choice Requires="x"/><mc:Fallback><w:pict><v:rect id="r1"/></w:pict></mc:Fallback></mc:AlternateContent>',
        ),
        ctx,
      ),
    ).toEqual({ kind: 'shape', where: 'body', detail: 'r1' });
    expect(detectLost(fragment('<mc:AlternateContent/>'), ctx)).toEqual({
      kind: 'unknown',
      where: 'body',
      detail: 'AlternateContent',
    });
    expect(alternateContentChoice(fragment(TEXTBOX))).toBeNull();
  });

  it('R25-05 : w:customXml de bloc traversé, ses paragraphes et tableaux rendus', async () => {
    const html = await renderBody(
      '<w:customXml w:uri="urn:x" w:element="section"><w:customXmlPr><w:placeholder w:val="x"/></w:customXmlPr>' +
        '<w:p><w:r><w:t>Para 1</w:t></w:r></w:p><w:p><w:r><w:t>Para 2</w:t></w:r></w:p>' +
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cellule</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:customXml>',
      ctx,
    );
    expect(html).toBe(
      '<p>Para 1</p><p>Para 2</p><table><tbody><tr><td><p>cellule</p></td></tr></tbody></table>',
    );
    expect(ctx.lost).toEqual([]);
    expect(ctx.warnings).toEqual([]);
  });

  it('équation avec son texte', () => {
    expect(
      detectLostInline(
        fragment(
          '<m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t>+1=0</m:t></m:r></m:oMath>',
        ),
        ctx,
      ),
    ).toEqual({ kind: 'equation', where: 'body', text: 'x2+1=0', detail: 'équation' });
    expect(detectLost(fragment('<m:oMathPara/>'), ctx)).toEqual({
      kind: 'equation',
      where: 'body',
      detail: 'équation',
    });
  });

  it('commentaire signalé une fois par identifiant, fin de plage ignorée', () => {
    const start = detectLostInline(fragment('<w:commentRangeStart w:id="0"/>'), ctx);
    expect(start).toEqual({ kind: 'comment', where: 'body', detail: 'commentaire 0' });
    if (start) ctx.lost.push(start);
    expect(detectLostInline(fragment('<w:commentRangeEnd w:id="0"/>'), ctx)).toBeNull();
    expect(detectLostInline(fragment('<w:commentReference w:id="0"/>'), ctx)).toBeNull();
    expect(detectLostInline(fragment('<w:commentReference w:id="1"/>'), ctx)).toEqual({
      kind: 'comment',
      where: 'body',
      detail: 'commentaire 1',
    });
  });

  it('révisions signalées une seule fois par document', () => {
    const ins = detectLostInline(
      fragment('<w:ins w:id="1" w:author="A"><w:r><w:t>x</w:t></w:r></w:ins>'),
      ctx,
    );
    expect(ins).toEqual({
      kind: 'revision',
      where: 'body',
      detail: 'révisions (w:ins / w:del) non suivies',
    });
    if (ins) ctx.lost.push(ins);
    expect(
      detectLostInline(
        fragment('<w:del w:id="2"><w:r><w:delText>y</w:delText></w:r></w:del>'),
        ctx,
      ),
    ).toBeNull();
    expect(detectLostInline(fragment('<w:ins w:id="3"/>'), ctx)).toBeNull();
  });

  it('champs : connus ignorés, inconnus signalés avec leur résultat', () => {
    expect(
      detectLostInline(
        fragment(
          '<w:fldSimple w:instr=" MERGEFIELD Nom \\* MERGEFORMAT "><w:r><w:t>x</w:t></w:r></w:fldSimple>',
        ),
        ctx,
      ),
    ).toBeNull();
    expect(detectLostInline(fragment('<w:fldSimple w:instr="PAGE"/>'), ctx)).toBeNull();
    expect(
      detectLostInline(fragment('<w:instrText> HYPERLINK "http://a" </w:instrText>'), ctx),
    ).toBeNull();
    expect(
      detectLostInline(
        fragment(
          '<w:fldSimple w:instr="DATE \\@ &quot;dd/MM/yyyy&quot;"><w:r><w:t>20/10/2026</w:t></w:r></w:fldSimple>',
        ),
        ctx,
      ),
    ).toEqual({ kind: 'field', where: 'body', text: '20/10/2026', detail: 'champ DATE' });
    expect(detectLostInline(fragment('<w:instrText>IF a = b</w:instrText>'), ctx)).toEqual({
      kind: 'field',
      where: 'body',
      detail: 'champ IF',
    });
  });

  it('objet incorporé avec son ProgID, altChunk et inconnu', () => {
    expect(
      detectLostInline(
        fragment(
          '<w:object><v:shape id="_x0000_i1025"/><o:OLEObject Type="Embed" ProgID="Excel.Sheet.12"/></w:object>',
        ),
        ctx,
      ),
    ).toEqual({ kind: 'embedded-object', where: 'body', detail: 'objet Excel.Sheet.12' });
    expect(detectLostInline(fragment('<w:object/>'), ctx)).toEqual({
      kind: 'embedded-object',
      where: 'body',
      detail: 'objet incorporé',
    });
    expect(detectLost(fragment('<w:altChunk r:id="rId9"/>'), ctx)).toEqual({
      kind: 'unknown',
      where: 'body',
      detail: 'contenu externe (altChunk)',
    });
    expect(
      detectLost(
        fragment('<w:customXml><w:p><w:r><w:t>caché</w:t></w:r></w:p></w:customXml>'),
        ctx,
      ),
    ).toEqual({
      kind: 'unknown',
      where: 'body',
      text: 'caché',
      detail: 'customXml',
    });
  });

  it('where suit le contexte et rien n’est retiré du DOM', () => {
    const inHeader: ConverterContext = { ...ctx, where: 'header' };
    const element = fragment(SHAPE);
    expect(detectLostInline(element, inHeader)?.where).toBe('header');
    expect(element.getElementsByTagNameNS('*', 'wsp').length).toBe(1);
  });

  it('au niveau bloc, le corps remplace l’objet par son texte et le signale', async () => {
    const html = await renderBody(
      '<w:p><w:r><w:t>Avant</w:t></w:r></w:p><m:oMathPara><m:oMath><m:r><m:t>E=mc2</m:t></m:r></m:oMath></m:oMathPara><w:p><w:r><w:t>Après</w:t></w:r></w:p>',
      ctx,
    );
    expect(html).toBe('<p>Avant</p><p>E=mc2</p><p>Après</p>');
    expect(ctx.lost).toEqual([
      { kind: 'equation', where: 'body', text: 'E=mc2', detail: 'équation' },
    ]);
    expect(ctx.warnings.map((w) => w.code)).toEqual(['object-lost']);
  });
});
