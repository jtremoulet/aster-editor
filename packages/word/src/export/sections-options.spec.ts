import type { DocumentLayout } from '@aster-editor/core';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../docx/import-docx.js';
import { exportDocx } from './export-docx.js';
import { sectionHeaderFooterSets, sectionLayoutOf } from './section-layout.js';
import { toDocumentXml, toZipEntries } from './testing/sample.js';

/**
 * Correctifs R43 sur les sections de l'export neuf : règle partagée « quelle
 * `SectionLayout` pour quel segment » (R43-01, R43-04), portée des options explicites
 * `page` / `pageSize` / `header` / `footer` sur un document sectionné (R43-03).
 */

/** Tous les `w:sectPr` d'un `document.xml`, dans l'ordre. */
function sectPrsOf(xml: string): string[] {
  return xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g) ?? [];
}

/** Références d'en-tête et de pied de chaque `w:sectPr`, sans leur `r:id`. */
function referencesOf(xml: string): string[][] {
  return sectPrsOf(xml).map((sectPr) =>
    (sectPr.match(/<w:(?:header|footer)Reference[^>]*>/g) ?? []).map((reference) =>
      reference.replace(/ r:id="[^"]*"/, ''),
    ),
  );
}

/** Texte de la partie d'en-tête `default` référencée par le `w:sectPr` d'index `index`. */
function defaultHeaderText(entries: ReadonlyMap<string, string>, index: number): string {
  const document = entries.get('word/document.xml') ?? '';
  const id = /headerReference w:type="default" r:id="(rId\d+)"/.exec(
    sectPrsOf(document)[index] ?? '',
  )?.[1];
  const rels = entries.get('word/_rels/document.xml.rels') ?? '';
  const target = new RegExp(`Id="${id ?? ''}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  return target
    ? (/<w:t[^>]*>([^<]*)</.exec(entries.get(`word/${target}`) ?? '')?.[1] ?? '')
    : 'none';
}

const ONE_BREAK = '<p>A</p><hr data-section-break="1"><p>B</p>';

describe('règle partagée sectionLayoutOf (R43-01, R43-04)', () => {
  const layout: DocumentLayout = {
    headers: { default: { html: '<p>TOP</p>' } },
    sections: [{ columns: 2 }, { headers: { default: { html: '<p>H2</p>' } } }],
  };

  it('segment intermédiaire : sections[index] ; dernier : sections[dernier] seulement à nombre égal', () => {
    expect(sectionLayoutOf(layout, 0, 2)).toBe(layout.sections?.[0]);
    expect(sectionLayoutOf(layout, 1, 2)).toBe(layout.sections?.[1]);
    expect(sectionLayoutOf(layout, 1, 3)).toBe(layout.sections?.[1]);
    expect(sectionLayoutOf(layout, 2, 3)).toBeUndefined();
    expect(sectionLayoutOf(layout, 0, 1)).toBeUndefined();
    expect(sectionLayoutOf(undefined, 0, 2)).toBeUndefined();
  });

  it('en-têtes du dernier segment : ceux de sa section, sinon ceux de premier niveau', () => {
    expect(sectionHeaderFooterSets(layout, 1, 2)).toEqual({
      headers: layout.sections?.[1]?.headers,
      footers: undefined,
    });
    expect(sectionHeaderFooterSets(layout, 2, 3)).toEqual({
      headers: layout.headers,
      footers: undefined,
    });
    // Un segment intermédiaire sans en-tête propre n'hérite pas de ceux de premier niveau.
    expect(sectionHeaderFooterSets(layout, 0, 2)).toEqual({
      headers: undefined,
      footers: undefined,
    });
  });

  it('les segments sont numérotés par position, quel que soit l’attribut du saut', async () => {
    const sections: DocumentLayout = {
      sections: [
        { headers: { default: { html: '<p>UN</p>' } } },
        { headers: { default: { html: '<p>DEUX</p>' } } },
        { headers: { default: { html: '<p>TROIS</p>' } } },
      ],
    };
    for (const html of [
      '<p>a</p><hr data-section-break="1"><p>b</p><hr data-section-break="2"><p>c</p>',
      '<p>a</p><hr data-section-break="2"><p>b</p><hr data-section-break="1"><p>c</p>',
      '<p>a</p><hr data-section-break="abc"><p>b</p><hr data-section-break="0"><p>c</p>',
      '<p>a</p><hr data-section-break=""><p>b</p><hr data-section-break="99999999999999999999"><p>c</p>',
    ]) {
      const entries = await toZipEntries(await exportDocx(html, { layout: sections }));
      expect([0, 1, 2].map((index) => defaultHeaderText(entries, index))).toEqual([
        'UN',
        'DEUX',
        'TROIS',
      ]);
    }
  });
});

describe('options explicites sur un document sectionné (R43-03)', () => {
  it('page et pageSize couvrent les sections sans page propre, une section qui déclare sa page la garde', async () => {
    const { xml } = await toDocumentXml(ONE_BREAK, {
      pageSize: 'LETTER',
      page: { orientation: 'landscape' },
    });
    expect(xml.match(/<w:pgSz[^>]*>/g)).toEqual([
      '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>',
      '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>',
    ]);
    const { xml: withSections } = await toDocumentXml(ONE_BREAK, {
      pageSize: 'LETTER',
      layout: { sections: [{}, {}] },
    });
    expect(withSections.match(/<w:pgSz[^>]*>/g)).toEqual([
      '<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>',
      '<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>',
    ]);
    const { xml: ownPage } = await toDocumentXml(ONE_BREAK, {
      pageSize: 'LETTER',
      layout: { sections: [{ page: { size: 'A5' } }, {}] },
    });
    expect(ownPage.match(/<w:pgSz[^>]*>/g)).toEqual([
      '<w:pgSz w:w="8391" w:h="11906" w:orient="portrait"/>',
      '<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>',
    ]);
  });

  it('header et footer (numéros de page) atteignent chaque section sans en-tête propre', async () => {
    const { xml } = await toDocumentXml(ONE_BREAK, {
      footer: { pageNumbers: true },
      header: 'Titre',
    });
    expect(referencesOf(xml)).toEqual([
      ['<w:headerReference w:type="default"/>', '<w:footerReference w:type="default"/>'],
      ['<w:headerReference w:type="default"/>', '<w:footerReference w:type="default"/>'],
    ]);
  });

  it('une section intermédiaire garde son en-tête propre, la dernière applique l’option (0.5)', async () => {
    const layout: DocumentLayout = {
      headers: { default: { html: '<p>TOP</p>' } },
      sections: [
        { headers: { default: { html: '<p>PROPRE</p>' } } },
        { headers: { first: { html: '<p>PREMIERE</p>' } }, titlePage: true },
      ],
    };
    const entries = await toZipEntries(await exportDocx(ONE_BREAK, { layout, header: 'OPTION' }));
    expect(defaultHeaderText(entries, 0)).toBe('PROPRE');
    expect(defaultHeaderText(entries, 1)).toBe('OPTION');
    expect(referencesOf(entries.get('word/document.xml') ?? '')[1]).toEqual([
      '<w:headerReference w:type="default"/>',
      '<w:headerReference w:type="first"/>',
    ]);
    const imported = await importDocx(
      await (await exportDocx(ONE_BREAK, { layout, header: 'OPTION' })).arrayBuffer(),
      {
        fidelity: 'styled',
      },
    );
    expect(imported.layout.sections?.[0]?.headers?.default?.html).toContain('PROPRE');
    expect(imported.layout.sections?.[1]?.headers?.default?.html).toContain('OPTION');
  });
});
