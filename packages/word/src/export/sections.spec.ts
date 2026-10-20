import type { DocumentLayout } from '@aster-editor/core';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../docx/import-docx';
import { exportDocx } from './export-docx';
import { toDocumentXml, toZipEntries } from './testing/sample';
import type { DocxExportWarning } from './types';

/** Nombre d'occurrences d'une sous-chaîne. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Tous les `w:sectPr` d'un `document.xml`, dans l'ordre. */
function sectPrsOf(xml: string): string[] {
  return xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g) ?? [];
}

const THREE_SECTIONS: DocumentLayout = {
  page: { size: 'A4', orientation: 'portrait', margins: { topMm: 25.4, leftMm: 25.4 } },
  headers: { default: { html: '<p>En-tête trois</p>' } },
  footers: { default: { html: '<p>Pied hérité</p>' } },
  sections: [
    {
      page: { size: 'A4', orientation: 'portrait', margins: { topMm: 20, leftMm: 20 } },
      titlePage: true,
      headers: { default: { html: '<p>En-tête un</p>' }, first: { html: '<p>Première</p>' } },
      footers: { default: { html: '<p>Pied hérité</p>' } },
    },
    {
      page: { size: 'Letter', orientation: 'landscape', margins: { topMm: 12.7, leftMm: 12.7 } },
      columns: 2,
      start: 'nextPage',
      headers: { default: { html: '<p>En-tête deux</p>' }, even: { html: '<p>Pair</p>' } },
      footers: { default: { html: '<p>Pied hérité</p>' } },
    },
    {
      page: { size: 'A4', orientation: 'portrait', margins: { topMm: 25.4, leftMm: 25.4 } },
      start: 'continuous',
      headers: { default: { html: '<p>En-tête trois</p>' } },
      footers: { default: { html: '<p>Pied hérité</p>' } },
    },
  ],
};

const THREE_SECTIONS_HTML =
  '<p>Un</p><hr data-section-break="1"><p>Deux</p><hr data-section-break="2"><p>Trois</p>';

describe('export neuf — sections', () => {
  it('un HTML à deux sauts donne trois sections avec leurs pages, types, en-têtes propres et hérités', async () => {
    const warnings: DocxExportWarning[] = [];
    const blob = await exportDocx(THREE_SECTIONS_HTML, {
      layout: THREE_SECTIONS,
      onWarning: (warning) => warnings.push(warning),
    });
    expect(warnings).toEqual([]);
    const entries = await toZipEntries(blob);
    const document = entries.get('word/document.xml') ?? '';
    const sectPrs = sectPrsOf(document);
    expect(sectPrs).toHaveLength(3);
    // Section 1 : A4 portrait 20 mm, première page différente, en-tête default + first.
    expect(sectPrs[0]).toContain('<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>');
    expect(sectPrs[0]).toContain('w:top="1134"');
    expect(sectPrs[0]).toContain('<w:titlePg/>');
    expect(sectPrs[0]).toContain('<w:headerReference w:type="first"');
    expect(sectPrs[0]).not.toContain('<w:type ');
    // Section 2 : Letter paysage, 2 colonnes, saut nextPage, en-tête even.
    expect(sectPrs[1]).toContain('<w:type w:val="nextPage"/>');
    expect(sectPrs[1]).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
    expect(sectPrs[1]).toContain('<w:cols w:num="2" w:equalWidth="true"/>');
    expect(sectPrs[1]).toContain('<w:headerReference w:type="even"');
    // Section 3 : continue, A4, pied hérité (chaque section référence le sien).
    expect(sectPrs[2]).toContain('<w:type w:val="continuous"/>');
    expect(sectPrs[2]).toContain('<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>');
    for (const sectPr of sectPrs) expect(sectPr).toContain('<w:footerReference w:type="default"');
    // Les sectPr des sections 1 et 2 sont dans le dernier paragraphe de leur segment.
    expect(count(document, '<w:pPr><w:sectPr>')).toBe(2);
    expect(document).toMatch(
      /<w:p><w:pPr><w:sectPr>[\s\S]*?<\/w:sectPr><\/w:pPr><w:r><w:t xml:space="preserve">Un<\/w:t>/,
    );
    expect(entries.get('word/settings.xml')).toContain('<w:evenAndOddHeaders/>');
    const headers = Array.from(entries.entries()).filter(([name]) =>
      /^word\/header\d+\.xml$/.test(name),
    );
    expect(headers).toHaveLength(5);

    // Relu par l'import stylé : même découpage, mêmes sections.
    const imported = await importDocx(await blob.arrayBuffer(), { fidelity: 'styled' });
    expect(imported.html).toContain('<hr data-section-break="1">');
    expect(imported.html).toContain('<hr data-section-break="2">');
    const sections = imported.layout.sections ?? [];
    expect(sections).toHaveLength(3);
    expect(sections[0]?.page?.orientation).toBe('portrait');
    expect(sections[0]?.titlePage).toBe(true);
    expect(sections[0]?.headers?.first?.html).toContain('Première');
    expect(sections[1]?.page?.size).toBe('Letter');
    expect(sections[1]?.columns).toBe(2);
    expect(sections[1]?.start).toBe('nextPage');
    expect(sections[1]?.headers?.even?.html).toContain('Pair');
    expect(sections[2]?.start).toBe('continuous');
    expect(sections[2]?.headers?.default?.html).toContain('En-tête trois');
    expect(sections[2]?.footers?.default?.html).toContain('Pied hérité');
    expect(imported.layout.page).toEqual(sections[2]?.page);
  });

  it('sans layout.sections, chaque segment prend la mise en page de premier niveau', async () => {
    const { xml, warnings } = await toDocumentXml(THREE_SECTIONS_HTML, {
      layout: { page: { size: 'A5' }, columns: 3 },
    });
    expect(warnings).toEqual([]);
    const sectPrs = sectPrsOf(xml);
    expect(sectPrs).toHaveLength(3);
    for (const sectPr of sectPrs) {
      expect(sectPr).toContain('<w:pgSz w:w="8391" w:h="11906" w:orient="portrait"/>');
      expect(sectPr).toContain('<w:cols w:num="3"');
    }
  });

  it('un corps sans saut reste une section (comportement 0.5), un saut imbriqué est ignoré', async () => {
    const { xml } = await toDocumentXml(
      '<p>a</p><blockquote><hr data-section-break="1"><p>b</p></blockquote>',
      { layout: { sections: [{ columns: 2 }, {}] } },
    );
    expect(sectPrsOf(xml)).toHaveLength(1);
    expect(xml).not.toContain('<w:cols');
    expect(xml).not.toContain('w:pBdr');
  });

  it('une section vide reçoit un paragraphe, et la table des matières va dans la première', async () => {
    const { xml } = await toDocumentXml('<hr data-section-break="1"><h1>Titre</h1>', {
      toc: true,
      layout: { sections: [{}, {}] },
    });
    expect(sectPrsOf(xml)).toHaveLength(2);
    // La table des matières (un `w:sdt`) ouvre la première section ; un paragraphe vide porte son sectPr.
    expect(xml.indexOf('TOC')).toBeLessThan(xml.indexOf('<w:sectPr'));
    expect(xml).toMatch(/<\/w:sdt><w:p><w:pPr><w:sectPr>/);
  });
});

describe('export neuf — tabulations', () => {
  it('data-tab → w:tab, data-stop → taquets left dédoublonnés et triés', async () => {
    const { xml } = await toDocumentXml(
      '<p>a<span data-tab="" data-stop="226.8pt"></span>b<span data-tab="" data-stop="56.7pt"></span>c<span data-tab="" data-stop="56.7pt"></span><span data-tab=""></span>d</p>' +
        '<h2><span data-tab=""></span>titre</h2><p>sans</p>',
    );
    expect(xml).toContain(
      '<w:tabs><w:tab w:val="left" w:pos="1134"/><w:tab w:val="left" w:pos="4536"/></w:tabs>',
    );
    expect(count(xml, '<w:tabs>')).toBe(1);
    expect(count(xml, '<w:r><w:tab/></w:r>')).toBe(5);
    expect(xml).toContain(
      '<w:t xml:space="preserve">a</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">b</w:t>',
    );
  });

  it('une tabulation dans un run marqué garde ses marques, l’espace cadratin de la 0.5 est accepté', async () => {
    const { xml } = await toDocumentXml(
      `<p><strong>x<span data-tab=""></span>y</strong>z${String.fromCharCode(0x2003)}w</p>`,
    );
    expect(xml).toContain('<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:tab/></w:r>');
    expect(count(xml, '<w:tab/>')).toBe(2);
    expect(xml).not.toContain(String.fromCharCode(0x2003));
  });
});

describe('export neuf — bordures et alignement de tableau', () => {
  it('padding-<côté> → w:space, couleur exacte, nil explicite sur pBdr et tcBorders', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p style="border-top: 0.5pt solid #bfbfbf; border-right: 0.5pt solid #bfbfbf; border-bottom: 0.5pt solid #bfbfbf; border-left: 0.5pt solid #bfbfbf; padding-top: 8pt; padding-right: 4pt; padding-bottom: 8pt; padding-left: 4pt">a</p>' +
        '<p style="border-bottom: 1pt solid #2f5496; padding-bottom: 1pt">b</p>' +
        '<p style="border-top: 1pt solid #000000; border-left: 0pt solid transparent">c</p>' +
        '<table style="border-top: 0.5pt solid #bfbfbf"><tr><td style="border-left: 0pt solid transparent; border-bottom: 0.5pt solid #2f5496; padding-bottom: 0pt">d</td><td>e</td></tr></table>',
    );
    expect(warnings).toEqual([]);
    expect(xml).toContain('<w:top w:val="single" w:color="BFBFBF" w:sz="4" w:space="8"/>');
    expect(xml).toContain('<w:left w:val="single" w:color="BFBFBF" w:sz="4" w:space="4"/>');
    expect(xml).toContain('<w:bottom w:val="single" w:color="2F5496" w:sz="8" w:space="1"/>');
    expect(xml).toContain(
      '<w:pBdr><w:top w:val="single" w:color="000000" w:sz="8" w:space="1"/><w:left w:val="nil"/></w:pBdr>',
    );
    expect(xml).toContain('<w:tcBorders><w:left w:val="nil"/>');
    expect(xml).toContain('<w:bottom w:val="single" w:color="2F5496" w:sz="4" w:space="0"/>');
  });

  it('sans padding, la règle 1 pt / 4 pt reste', async () => {
    const { xml } = await toDocumentXml(
      '<p style="border-left: 1pt solid #000000">a</p><p style="border-top: 1pt solid #000000; border-left: 1pt solid #000000">b</p>',
    );
    expect(xml).toContain('<w:left w:val="single" w:color="000000" w:sz="8" w:space="4"/>');
    expect(xml).toContain('<w:left w:val="single" w:color="000000" w:sz="8" w:space="1"/>');
  });

  it('data-align et margin auto → w:jc du tableau', async () => {
    const { xml } = await toDocumentXml(
      '<table data-align="center"><tr><td>a</td></tr></table>' +
        '<table data-align="right"><tr><td>b</td></tr></table>' +
        '<table style="margin: 0 auto"><tr><td>c</td></tr></table>' +
        '<table style="margin-left: auto; margin-right: auto"><tr><td>d</td></tr></table>' +
        '<table data-align="left"><tr><td>e</td></tr></table><table><tr><td>f</td></tr></table>',
    );
    expect(count(xml, '<w:jc w:val="center"/>')).toBe(3);
    expect(count(xml, '<w:jc w:val="right"/>')).toBe(1);
    expect(count(xml, '<w:jc ')).toBe(4);
  });
});
