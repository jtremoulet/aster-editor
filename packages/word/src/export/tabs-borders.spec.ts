import { describe, expect, it } from 'vitest';
import { MAX_TAB_STOP_TWIPS } from './inline.js';
import { MAX_BORDER_SPACE_PT } from './styles.js';
import { toDocumentXml } from './testing/sample.js';

/**
 * Correctifs R43 sur les tabulations, les bordures et l'alignement de tableau : position
 * de taquet plafonnée (R43-02), alignement et points de suite des taquets (R43-05),
 * espace texte-trait plafonné (R43-07), `margin` à une valeur (R43-08).
 */

/** Nombre d'occurrences d'une sous-chaîne. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('taquets : alignement et points de suite (R43-05)', () => {
  it('data-align et data-leader → w:val et w:leader, dédoublonnés par position + alignement, triés', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p>a<span data-tab="" data-stop="226.8pt" data-align="center"></span>b' +
        '<span data-tab="" data-stop="56.7pt"></span>c' +
        '<span data-tab="" data-stop="396.9pt" data-align="right" data-leader="dot"></span>d' +
        '<span data-tab="" data-stop="283.5pt" data-align="decimal"></span>e' +
        '<span data-tab="" data-stop="56.7pt" data-align="left" data-leader="hyphen"></span>f' +
        '<span data-tab="" data-stop="56.7pt" data-align="center" data-leader="underscore"></span>g' +
        '<span data-tab="" data-stop="226.8pt" data-align="center"></span>h</p>',
    );
    expect(warnings).toEqual([]);
    expect(xml).toContain(
      '<w:tabs>' +
        '<w:tab w:val="left" w:pos="1134"/>' +
        '<w:tab w:val="center" w:pos="1134" w:leader="underscore"/>' +
        '<w:tab w:val="center" w:pos="4536"/>' +
        '<w:tab w:val="decimal" w:pos="5670"/>' +
        '<w:tab w:val="right" w:pos="7938" w:leader="dot"/>' +
        '</w:tabs>',
    );
    expect(count(xml, '<w:r><w:tab/></w:r>')).toBe(7);
  });

  it('fixture 19 reconstituée à la main : left 1134, center 4536, right 7938, decimal 5670', async () => {
    const { xml } = await toDocumentXml(
      '<p>Taquet left<span data-tab="" data-stop="56.7pt"></span>gauche</p>' +
        '<p>Taquet center<span data-tab="" data-stop="226.8pt" data-align="center"></span>centré</p>' +
        '<p>Taquet right<span data-tab="" data-stop="396.9pt" data-align="right"></span>droite</p>' +
        '<p>Taquet decimal<span data-tab="" data-stop="283.5pt" data-align="decimal"></span>12,50</p>',
    );
    expect(xml.match(/<w:tabs>[\s\S]*?<\/w:tabs>/g)).toEqual([
      '<w:tabs><w:tab w:val="left" w:pos="1134"/></w:tabs>',
      '<w:tabs><w:tab w:val="center" w:pos="4536"/></w:tabs>',
      '<w:tabs><w:tab w:val="right" w:pos="7938"/></w:tabs>',
      '<w:tabs><w:tab w:val="decimal" w:pos="5670"/></w:tabs>',
    ]);
  });

  it('alignement ou points de suite inconnus : taquet left sans leader, jamais d’exception', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p>a<span data-tab="" data-stop="36pt" data-align="bogus" data-leader="stars"></span>b' +
        '<span data-tab="" data-stop="36pt" data-align=" RIGHT " data-leader=" DOT "></span>c</p>',
    );
    expect(warnings).toEqual([]);
    expect(xml).toContain(
      '<w:tabs><w:tab w:val="left" w:pos="720"/><w:tab w:val="right" w:pos="720" w:leader="dot"/></w:tabs>',
    );
  });
});

describe('taquet hors schéma (R43-02)', () => {
  it('une position au-delà de 22 pouces est ramenée à 31 680 twips, avec avertissement', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p>a<span data-tab="" data-stop="99999999999pt"></span>b<span data-tab="" data-stop="1584pt"></span>c</p>',
    );
    expect(xml).toContain(
      `<w:tabs><w:tab w:val="left" w:pos="${String(MAX_TAB_STOP_TWIPS)}"/></w:tabs>`,
    );
    expect(xml).not.toContain('1999999999980');
    expect(warnings).toEqual([
      { code: 'page-margins-clamped', message: expect.stringContaining('Taquet à 99999999999 pt') },
    ]);
  });

  it('une position exactement au plafond passe sans avertissement', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p>a<span data-tab="" data-stop="1584pt"></span>b</p>',
    );
    expect(xml).toContain('<w:tab w:val="left" w:pos="31680"/>');
    expect(warnings).toEqual([]);
  });
});

describe('espace texte-trait d’une bordure (R43-07)', () => {
  it('padding au-delà de 31 pt ramené à 31 avec avertissement, 31 et moins intacts', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p style="border-top: 1pt solid #000000; padding-top: 40pt">x</p>' +
        '<p style="border-top: 1pt solid #000000; padding-top: 99999999999pt">y</p>' +
        '<p style="border-top: 1pt solid #000000; padding-top: 31pt">z</p>',
    );
    expect(count(xml, `w:space="${String(MAX_BORDER_SPACE_PT)}"`)).toBe(3);
    expect(xml).not.toContain('w:space="40"');
    expect(xml).not.toContain('w:space="99999999999"');
    expect(warnings).toEqual([
      { code: 'page-margins-clamped', message: expect.stringContaining('padding-top: 40pt') },
      {
        code: 'page-margins-clamped',
        message: expect.stringContaining('padding-top: 99999999999pt'),
      },
    ]);
  });

  it('une cellule plafonne aussi son w:space, sans avertissement (Word l’ignore sur les cellules)', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<table><tr><td style="border-left: 0.5pt solid #00ff00; padding-left: 99999999999pt"><p>x</p></td></tr></table>',
    );
    expect(xml).toContain('<w:left w:val="single" w:color="00FF00" w:sz="4" w:space="31"/>');
    expect(warnings).toEqual([]);
  });
});

describe('alignement de tableau par margin (R43-08)', () => {
  it('margin: auto → center, margin: 0 0 0 auto → right, margin: 0 auto → center', async () => {
    const { xml } = await toDocumentXml(
      '<table style="margin: auto"><tr><td>a</td></tr></table>' +
        '<table style="margin: 0 0 0 auto"><tr><td>b</td></tr></table>' +
        '<table style="margin: 0 auto"><tr><td>c</td></tr></table>' +
        '<table style="margin: auto 0"><tr><td>d</td></tr></table>' +
        '<table style="margin: 0"><tr><td>e</td></tr></table>',
    );
    const jcs = (xml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/g) ?? []).map(
      (tblPr) => /<w:jc w:val="([a-z]+)"\/>/.exec(tblPr)?.[1] ?? 'none',
    );
    expect(jcs).toEqual(['center', 'right', 'center', 'none', 'none']);
  });
});
