import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEditor, type SectionLayout } from '@aster-editor/core';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx';
import { buildDocx, run as runXml } from '../preprocess/minimal-docx';
import { normalizeHtml } from '../testing/dom';

/**
 * Session 4 (L42) : sections dans le corps et `layout.sections`, tabulations, bordures,
 * `data-align` et styles conditionnels sur les fixtures 16, 18, 19, le document client et
 * des `.docx` minimaux ; idempotence stricte avec le core sur 16, 18 et 19.
 */

const FIXTURES = join(import.meta.env.ASTER_FIXTURES, 'docx');
const CLIENT = join(FIXTURES, 'client', 'Modele_Demo_DER.docx');

function fixture(name: string): ArrayBuffer {
  const buffer = readFileSync(name.startsWith('client') ? CLIENT : join(FIXTURES, `${name}.docx`));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function expected(name: string): string {
  return readFileSync(join(FIXTURES, 'expected', `${name}.html`), 'utf8');
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

/** Sauts de section du corps, dans l'ordre (`<hr data-section-break="n">`). */
function breaks(html: string): string[] {
  return html.match(/<hr data-section-break="\d+">/g) ?? [];
}

const A4_20 = {
  size: 'A4',
  orientation: 'portrait',
  margins: { topMm: 20, rightMm: 20, bottomMm: 20, leftMm: 20, headerMm: 12.49, footerMm: 12.49 },
} as const;

const LETTER_LANDSCAPE = {
  size: 'Letter',
  orientation: 'landscape',
  margins: {
    topMm: 12.7,
    rightMm: 12.7,
    bottomMm: 12.7,
    leftMm: 12.7,
    headerMm: 12.49,
    footerMm: 12.49,
  },
} as const;

describe('layout.sections et sauts de section', () => {
  it('16-sections : deux sections, en-têtes et pieds effectifs, saut après le dernier bloc de la section 1', async () => {
    const result = await importDocx(fixture('16-sections'), { fidelity: 'styled' });
    expect(result.warnings).toEqual([]);
    const sections = result.layout.sections ?? [];
    expect(sections).toHaveLength(2);
    expect(sections[0]?.page).toEqual(A4_20);
    expect(sections[0]?.columns).toBeUndefined();
    expect(sections[0]?.start).toBeUndefined();
    expect(sections[0]?.titlePage).toBe(true);
    expect(Object.keys(sections[0]?.headers ?? {}).sort()).toEqual(['default', 'first']);
    expect(Object.keys(sections[0]?.footers ?? {}).sort()).toEqual(['default', 'first']);
    expect(sections[0]?.headers?.default?.html).toContain('Rapport — {{client}}');
    expect(sections[1]?.page).toEqual(LETTER_LANDSCAPE);
    expect(sections[1]?.columns).toBe(2);
    expect(sections[1]?.start).toBe('nextPage');
    // `w:titlePg` n'hérite pas (Word) ; les en-têtes `first` et le pied `first`, si.
    expect(sections[1]?.titlePage).toBeUndefined();
    expect(Object.keys(sections[1]?.headers ?? {}).sort()).toEqual(['default', 'even', 'first']);
    expect(sections[1]?.headers?.first).toBe(sections[0]?.headers?.first);
    expect(sections[1]?.headers?.default?.html).toContain('Section 2 — en-tête par défaut');
    expect(sections[1]?.footers?.default?.html).toContain('Section 2 — pied par défaut');
    expect(sections[1]?.footers?.first).toBe(sections[0]?.footers?.first);
    // Premier niveau = dernière section (compatibilité 0.5), `titlePage` dès qu'une section le déclare.
    expect(result.layout.page).toEqual(sections[1]?.page);
    expect(result.layout.columns).toBe(2);
    expect(result.layout.headers).toEqual(sections[1]?.headers);
    expect(result.layout.footers).toEqual(sections[1]?.footers);
    expect(result.layout.titlePage).toBe(true);
    expect(breaks(result.html)).toEqual(['<hr data-section-break="1">']);
    expect(result.html).toContain(
      'Section 1, paragraphe 6 : texte de remplissage suffisamment long pour que la mise en page soit visible sur plusieurs lignes.</p><hr data-section-break="1"><p data-docx-style="Normal">Section 2 : Letter paysage',
    );
    expect(normalizeHtml(result.html)).toBe(normalizeHtml(expected('16-sections')));
  });

  it('18-sections-triple : trois sections, saut continu, en-têtes hérités de la section 2, porteur vide sans <p></p>', async () => {
    const result = await importDocx(fixture('18-sections-triple'), { fidelity: 'styled' });
    expect(result.warnings).toEqual([]);
    const sections = result.layout.sections ?? [];
    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.start)).toEqual([undefined, 'nextPage', 'continuous']);
    expect(sections.map((section) => section.columns)).toEqual([undefined, 2, undefined]);
    expect(sections[0]?.page).toEqual(A4_20);
    expect(sections[1]?.page).toEqual(LETTER_LANDSCAPE);
    expect(sections[2]?.page).toEqual({
      size: 'A4',
      orientation: 'portrait',
      margins: {
        topMm: 25.4,
        rightMm: 25.4,
        bottomMm: 25.4,
        leftMm: 25.4,
        headerMm: 12.49,
        footerMm: 12.49,
      },
    });
    expect(sections.map((section) => section.titlePage)).toEqual([true, undefined, undefined]);
    expect(sections[0]?.headers?.default?.html).toMatch(/^<p[^>]*>Section 1<\/p>$/);
    expect(sections[0]?.headers?.first?.html).toMatch(/^<p[^>]*>Première page<\/p>$/);
    expect(sections[0]?.footers?.default?.html).toContain('Page ');
    expect(sections[1]?.headers?.default?.html).toMatch(/^<p[^>]*>Section 2<\/p>$/);
    expect(sections[1]?.headers?.even?.html).toMatch(/^<p[^>]*>Section 2 paire<\/p>$/);
    expect(sections[1]?.headers?.first).toBe(sections[0]?.headers?.first);
    expect(sections[1]?.footers).toEqual(sections[0]?.footers);
    // Section 3 : aucun `headerReference` propre, elle hérite tout de la section 2 ; pied propre.
    expect(sections[2]?.headers).toEqual(sections[1]?.headers);
    expect(sections[2]?.footers?.default?.html).toMatch(/^<p[^>]*>Pied 3<\/p>$/);
    expect(result.layout.page).toEqual(sections[2]?.page);
    expect(result.layout.headers).toEqual(sections[2]?.headers);
    expect(result.layout.footers).toEqual(sections[2]?.footers);
    expect(breaks(result.html)).toEqual([
      '<hr data-section-break="1">',
      '<hr data-section-break="2">',
    ]);
    // Le `w:sectPr` de la section 2 est dans un paragraphe vide : seul le saut est émis, après le tableau.
    expect(result.html).toContain('</tbody></table><hr data-section-break="2"><h2');
    expect(result.html).not.toContain('<p data-docx-style="Normal"></p><hr data-section-break');
    expect(count(result.html, /<p[^>]*><\/p>/g)).toBe(0);
    expect(normalizeHtml(result.html)).toBe(normalizeHtml(expected('18-sections-triple')));
  });

  it.skipIf(!existsSync(CLIENT))(
    'document client : trois sections, pied présent sur chacune, deux sauts',
    async () => {
      const result = await importDocx(fixture('client'), { fidelity: 'styled' });
      const sections = result.layout.sections ?? [];
      expect(sections).toHaveLength(3);
      expect(sections.map((section) => section.start)).toEqual([
        undefined,
        'continuous',
        'continuous',
      ]);
      expect(sections.map((section) => section.columns)).toEqual([undefined, 2, undefined]);
      for (const section of sections) {
        expect(section.page?.size).toBe('A4');
        expect(section.footers?.default?.html).toBeTruthy();
        expect(section.headers).toBeUndefined();
      }
      // Seule la première section référence le pied ; les deux autres l'héritent.
      expect(sections[1]?.footers?.default).toBe(sections[0]?.footers?.default);
      expect(sections[2]?.footers?.default).toBe(sections[0]?.footers?.default);
      expect(sections[0]?.page?.margins?.footerMm).toBe(8.06);
      expect(sections[2]?.page?.margins?.footerMm).toBe(0);
      expect(result.layout.footers).toEqual(sections[2]?.footers);
      expect(breaks(result.html)).toEqual([
        '<hr data-section-break="1">',
        '<hr data-section-break="2">',
      ]);
      // Bordures `nil` explicites des cellules et traits gris conservés (perte L28c).
      expect(count(result.html, /0pt solid transparent/g)).toBeGreaterThanOrEqual(5);
      expect(count(result.html, /#bfbfbf/g)).toBeGreaterThanOrEqual(10);
      expect(result.warnings.filter((w) => w.code === 'reader')).toEqual([]);
    },
  );

  describe('.docx minimaux', () => {
    async function styled(
      body: string,
    ): Promise<{ html: string; sections: readonly SectionLayout[] }> {
      const result = await importDocx(await buildDocx(body), { fidelity: 'styled' });
      return { html: result.html, sections: result.layout.sections ?? [] };
    }

    const A4 = '<w:pgSz w:w="11906" w:h="16838"/>';
    const LETTER = '<w:pgSz w:w="12240" w:h="15840"/>';

    it('sectPr dans un paragraphe vide : seul le saut ; dans un paragraphe plein : le paragraphe puis le saut', async () => {
      const { html, sections } = await styled(
        `<w:p>${runXml('un')}</w:p><w:p><w:pPr><w:sectPr>${A4}</w:sectPr></w:pPr></w:p>` +
          `<w:p>${runXml('deux')}</w:p><w:p><w:pPr><w:sectPr><w:type w:val="continuous"/>${A4}</w:sectPr></w:pPr>${runXml('trois')}</w:p>` +
          `<w:p>${runXml('quatre')}</w:p><w:sectPr><w:type w:val="oddPage"/>${LETTER}</w:sectPr>`,
      );
      expect(html).toBe(
        '<p>un</p><hr data-section-break="1"><p>deux</p><p>trois</p><hr data-section-break="2"><p>quatre</p>',
      );
      expect(sections).toEqual([
        { page: { size: 'A4', orientation: 'portrait' } },
        { page: { size: 'A4', orientation: 'portrait' }, start: 'continuous' },
        { page: { size: 'Letter', orientation: 'portrait' }, start: 'oddPage' },
      ]);
    });

    it('une seule section : sections à un élément, aucun saut ; sans sectPr : pas de sections', async () => {
      const single = await styled(
        `<w:p>${runXml('x')}</w:p><w:sectPr>${A4}<w:cols w:num="3"/></w:sectPr>`,
      );
      expect(single.html).toBe('<p>x</p>');
      expect(single.sections).toEqual([
        { page: { size: 'A4', orientation: 'portrait' }, columns: 3 },
      ]);
      const none = await importDocx(await buildDocx(`<w:p>${runXml('x')}</w:p>`), {
        fidelity: 'styled',
      });
      expect(none.layout.sections).toBeUndefined();
      expect(none.html).toBe('<p>x</p>');
    });

    it('sans sectPr final (paquet mal formé) : la dernière fin de section est la dernière section, sans saut', async () => {
      const { html, sections } = await styled(
        `<w:p><w:pPr><w:sectPr>${A4}</w:sectPr></w:pPr>${runXml('a')}</w:p><w:p><w:pPr><w:sectPr>${LETTER}</w:sectPr></w:pPr>${runXml('b')}</w:p>`,
      );
      expect(html).toBe('<p>a</p><hr data-section-break="1"><p>b</p>');
      expect(sections.map((section) => section.page?.size)).toEqual(['A4', 'Letter']);
    });

    it('sectPr sous w:sdt de bloc compté dans l’ordre ; dans une cellule de tableau, ignoré', async () => {
      const { html, sections } = await styled(
        `<w:sdt><w:sdtContent><w:p><w:pPr><w:sectPr>${A4}</w:sectPr></w:pPr>${runXml('a')}</w:p></w:sdtContent></w:sdt>` +
          `<w:tbl><w:tr><w:tc><w:p><w:pPr><w:sectPr>${LETTER}</w:sectPr></w:pPr>${runXml('cellule')}</w:p></w:tc></w:tr></w:tbl>` +
          `<w:p>${runXml('b')}</w:p><w:sectPr>${LETTER}</w:sectPr>`,
      );
      expect(html).toBe(
        '<p>a</p><hr data-section-break="1"><table><tbody><tr><td><p>cellule</p></td></tr></tbody></table><p>b</p>',
      );
      expect(sections.map((section) => section.page?.size)).toEqual(['A4', 'Letter']);
    });

    it('un sectPr dans un item de liste ferme la liste avant le saut', async () => {
      const { html } = await styled(
        `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:sectPr>${A4}</w:sectPr></w:pPr>${runXml('item')}</w:p>` +
          `<w:p>${runXml('après')}</w:p><w:sectPr>${A4}</w:sectPr>`,
      );
      // Sans numbering.xml la liste est rendue en paragraphes ; le saut suit le porteur.
      expect(html).toBe('<p>item</p><hr data-section-break="1"><p>après</p>');
    });
  });
});

describe('19-tabulations-bordures', () => {
  it('taquets, tabulation sans taquet, w:space, couleurs exactes, nil explicite, data-align, style conditionnel', async () => {
    const result = await importDocx(fixture('19-tabulations-bordures'), { fidelity: 'styled' });
    const html = result.html;
    expect(result.warnings).toEqual([]);
    expect(result.lost).toEqual([]);
    // Un seul taquet par paragraphe : la première tabulation le prend, la seconde reste sans position.
    expect(html).toContain(
      'Taquet left à 2 cm<span data-tab="" data-stop="56.7pt"></span>gauche<span data-tab=""></span>suite gauche</p>',
    );
    expect(html).toContain(
      'Taquet center à 8 cm<span data-tab="" data-stop="226.8pt"></span>centré',
    );
    expect(html).toContain(
      'Taquet right à 14 cm<span data-tab="" data-stop="396.9pt"></span>droite',
    );
    expect(html).toContain(
      'Taquet decimal à 10 cm<span data-tab="" data-stop="283.5pt"></span>12,50',
    );
    expect(html).toContain(
      'Tabulation sans taquet défini<span data-tab=""></span>texte après la tabulation par défaut',
    );
    expect(count(html, /<span data-tab=""/g)).toBe(9);
    expect(html).not.toContain(String.fromCharCode(0x2003));
    // `w:space` → `padding-<côté>` après les `border-*`.
    for (const space of [1, 4, 8]) {
      expect(html).toContain(
        `<p style="border-top: 0.5pt solid #000000; border-right: 0.5pt solid #000000; border-bottom: 0.5pt solid #000000; border-left: 0.5pt solid #000000; padding-top: ${String(space)}pt; padding-right: ${String(space)}pt; padding-bottom: ${String(space)}pt; padding-left: ${String(space)}pt" data-docx-style="Normal">Bordure w:space ${String(space)} pt</p>`,
      );
    }
    // Tableau centré, bordures grises exactes, cellule bleue, `nil` explicites.
    expect(html).toContain(
      '<table style="width: 300pt; border-top: 0.5pt solid #bfbfbf; border-right: 0.5pt solid #bfbfbf; border-bottom: 0.5pt solid #bfbfbf; border-left: 0.5pt solid #bfbfbf" data-align="center">',
    );
    expect(html).toContain(
      '<td colwidth="200" style="border-top: 1pt solid #2f5496; border-right: 1pt solid #2f5496; border-bottom: 1pt solid #2f5496; border-left: 1pt solid #2f5496"><p data-docx-style="Normal">Cellule bleue #2F5496</p></td>',
    );
    expect(html).toContain(
      '<td style="border-top: 0.5pt solid #bfbfbf; border-right: 0.5pt solid #bfbfbf; border-left: 0pt solid transparent"><p data-docx-style="Normal">nil gauche</p></td>',
    );
    expect(html).toContain(
      '<td style="border-top: 0.5pt solid #bfbfbf; border-bottom: 0pt solid transparent; border-left: 0.5pt solid #bfbfbf"><p data-docx-style="Normal">nil bas</p></td>',
    );
    expect(html).toContain('border-left: 1pt solid #2f5496" data-align="right">');
    expect(html).not.toContain('solid #000000"><p data-docx-style="Normal">nil');
    // Style conditionnel : première ligne fond #d9e2f3 et gras, bandes #f2f2f2 sur les lignes 1 et 3 du corps.
    expect(html).toMatch(
      /<th colwidth="301" style="[^"]*background-color: #d9e2f3; padding: 0pt 5.4pt 0pt 5.4pt"><p[^>]*><strong>Style conditionnel : firstRow A<\/strong><\/p><\/th>/,
    );
    expect(html).toMatch(/background-color: #f2f2f2[^>]*><p[^>]*>band1Horz ligne 1, A<\/p>/);
    expect(html).toMatch(/background-color: #f2f2f2[^>]*><p[^>]*>band1Horz ligne 3, B<\/p>/);
    expect(html).not.toMatch(/background-color: #f2f2f2[^>]*><p[^>]*>band2Horz/);
    expect(count(html, /#d9e2f3/g)).toBe(2);
    expect(count(html, /#f2f2f2/g)).toBe(4);
    expect(normalizeHtml(html)).toBe(normalizeHtml(expected('19-tabulations-bordures')));
  });
});

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

// L41 (core, en parallèle) apporte les nœuds `sectionBreak` et `tab`, `padding-*` et
// `data-align`. Les tests ci-dessous s'activent d'eux-mêmes dès que le core (source, via
// l'alias vitest) conserve ces quatre formes à l'aller-retour ; tant qu'il ne les a pas,
// ils sont ignorés (TODO L41 : retirer la garde une fois L41 intégré).
const CORE_PROBE =
  '<p>a<span data-tab="" data-stop="36pt"></span>b</p><hr data-section-break="1"><p style="border-top: 1pt solid #000000; padding-top: 4pt">c</p><table data-align="center"><tbody><tr><td><p>d</p></td></tr></tbody></table>';
const CORE_HAS_SESSION4_NODES = ((): boolean => {
  const back = roundTrip(CORE_PROBE);
  return (
    back.includes('data-section-break="1"') &&
    back.includes('data-tab=""') &&
    back.includes('padding-top: 4pt') &&
    back.includes('data-align="center"')
  );
})();

describe('idempotence stricte avec le core (session 4)', () => {
  it
    .skipIf(!CORE_HAS_SESSION4_NODES)
    .each(['16-sections', '18-sections-triple', '19-tabulations-bordures'])(
    '%s survit à setHTML puis getHTML dans le core (strict, hors colwidth)',
    async (name) => {
      const { html } = await importDocx(fixture(name), { fidelity: 'styled' });
      // Le core recopie `colwidth` sur toutes les lignes (comportement core connu, R25) : seul
      // cet attribut est neutralisé, sections, tabulations, bordures et `data-align` sont stricts.
      const stripColwidth = (value: string): string => value.replace(/ colwidth="[^"]*"/g, '');
      expect(stripColwidth(normalizeHtml(roundTrip(html)))).toBe(
        stripColwidth(normalizeHtml(html)),
      );
      expect(count(roundTrip(html), /data-section-break=/g)).toBe(
        count(html, /data-section-break=/g),
      );
    },
  );

  it('signale l’état du core (information, jamais en échec)', () => {
    // Visible dans le rapport de test : tant que L41 n'est pas intégré, les trois cas sont ignorés.
    expect(typeof CORE_HAS_SESSION4_NODES).toBe('boolean');
  });
});
