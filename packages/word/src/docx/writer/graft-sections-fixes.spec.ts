import type { DocumentLayout } from '@aster-editor/core';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../export/export-docx.js';
import { toZipEntries } from '../../export/testing/sample.js';
import {
  alterTemplate,
  checkIntegrity,
  exportInTemplate,
  fixture,
  importStyled,
  partsOf,
  textOf,
} from './testing.js';

/**
 * Correctifs R43 sur la greffe des sections : même règle « quelle `SectionLayout` pour
 * quel segment » que l'export neuf (R43-01), segments numérotés par position (R43-04),
 * `w:titlePg` jamais hérité (R43-06).
 */

/** Tous les `w:sectPr` d'un `document.xml`, dans l'ordre. */
function sectPrsOf(xml: string): string[] {
  return xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g) ?? [];
}

/** Texte de l'en-tête `default` référencé par le `w:sectPr` d'index `index` d'un paquet. */
function defaultHeaderText(parts: ReadonlyMap<string, Uint8Array>, index: number): string {
  const document = textOf(parts, 'word/document.xml');
  const id = /headerReference w:type="default" r:id="(rId\d+)"/.exec(
    sectPrsOf(document)[index] ?? '',
  )?.[1];
  const rels = textOf(parts, 'word/_rels/document.xml.rels');
  const target = new RegExp(`Id="${id ?? ''}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  return target ? (/<w:t[^>]*>([^<]*)</.exec(textOf(parts, `word/${target}`))?.[1] ?? '') : 'none';
}

/** Texte des en-têtes `default` relus, section par section (sans les attributs du `<p>`). */
function headerTexts(layout: DocumentLayout): string[] {
  return (layout.sections ?? []).map((section) =>
    (section.headers?.default?.html ?? 'none').replace(/<[^>]+>/g, ''),
  );
}

const ONE_BREAK = '<p>A</p><hr data-section-break="1"><p>B</p>';

describe('dernier segment : sections[dernier] avant layout.headers, comme l’export neuf (R43-01)', () => {
  const layout: DocumentLayout = {
    sections: [
      { headers: { default: { html: '<p>H1</p>' } } },
      { headers: { default: { html: '<p>H2</p>' } } },
    ],
  };

  it('sans headers de premier niveau, la dernière section du gabarit reçoit H2 (plus de perte)', async () => {
    const template = await fixture('11-styles-inline.docx');
    const result = await exportInTemplate(ONE_BREAK, template, { layout });
    expect(result.warnings).toEqual([]);
    expect(checkIntegrity(result.parts)).toEqual([]);
    expect([0, 1].map((index) => defaultHeaderText(result.parts, index))).toEqual(['H1', 'H2']);
    const again = await importStyled(result.buffer);
    expect(headerTexts(again.layout)).toEqual(['H1', 'H2']);
    // L'export neuf décide pareil.
    const entries = await toZipEntries(await exportDocx(ONE_BREAK, { layout }));
    const neuf = await importStyled(await (await exportDocx(ONE_BREAK, { layout })).arrayBuffer());
    expect(entries.has('word/header2.xml')).toBe(true);
    expect(headerTexts(neuf.layout)).toEqual(['H1', 'H2']);
  });

  it('avec layout.headers = TOP différent, la décision et le contenu regardent sections[dernier]', async () => {
    const template = await fixture('11-styles-inline.docx');
    const withTop: DocumentLayout = { ...layout, headers: { default: { html: '<p>TOP</p>' } } };
    const result = await exportInTemplate(ONE_BREAK, template, { layout: withTop });
    expect(defaultHeaderText(result.parts, 1)).toBe('H2');
    const again = await importStyled(result.buffer);
    expect(headerTexts(again.layout)).toEqual(['H1', 'H2']);
    const neuf = await importStyled(
      await (await exportDocx(ONE_BREAK, { layout: withTop })).arrayBuffer(),
    );
    expect(headerTexts(neuf.layout)).toEqual(['H1', 'H2']);
  });

  it('layout.sections plus long que les segments : layout.headers fait foi pour la dernière section', async () => {
    const template = await fixture('11-styles-inline.docx');
    const longer: DocumentLayout = {
      headers: { default: { html: '<p>TOP</p>' } },
      sections: [...(layout.sections ?? []), { headers: { default: { html: '<p>H3</p>' } } }],
    };
    const result = await exportInTemplate(ONE_BREAK, template, { layout: longer });
    expect([0, 1].map((index) => defaultHeaderText(result.parts, index))).toEqual(['H1', 'TOP']);
  });

  it('template-section-missing suit la même règle : sections[dernier].headers suffit à le déclencher', async () => {
    const template = await fixture('16-sections.docx');
    const parts = await partsOf(template);
    const xml = textOf(parts, 'word/document.xml');
    const start = xml.lastIndexOf('<w:sectPr');
    const end = xml.indexOf('</w:sectPr>', start) + '</w:sectPr>'.length;
    const altered = await alterTemplate(template, {
      replace: { 'word/document.xml': xml.slice(0, start) + xml.slice(end) },
    });
    const result = await exportInTemplate(ONE_BREAK, altered, {
      layout: { sections: [{}, { headers: { default: { html: '<p>H2</p>' } } }] },
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(['template-section-missing']);
    const silent = await exportInTemplate(ONE_BREAK, altered, {
      layout: { sections: [{}, {}] },
    });
    expect(silent.warnings).toEqual([]);
  });
});

describe('segments numérotés par position dans les deux chemins (R43-04)', () => {
  it('18 avec les sauts renumérotés 2 puis 1 : sections[1] modifiée apparaît dans la section 2, neuf et gabarit', async () => {
    const template = await fixture('18-sections-triple.docx');
    const imported = await importStyled(template);
    const html = imported.html
      .replace('<hr data-section-break="1">', '<hr data-section-break="X">')
      .replace('<hr data-section-break="2">', '<hr data-section-break="1">')
      .replace('<hr data-section-break="X">', '<hr data-section-break="2">');
    const sections = (imported.layout.sections ?? []).map((section, index) =>
      index === 1 ? { ...section, headers: { default: { html: '<p>NOUVEAU</p>' } } } : section,
    );
    const layout: DocumentLayout = { ...imported.layout, sections };
    const result = await exportInTemplate(html, template, { layout });
    expect(result.warnings).toEqual([]);
    expect([0, 1, 2].map((index) => defaultHeaderText(result.parts, index))).toEqual([
      'Section 1',
      'NOUVEAU',
      'none',
    ]);
    const original = await partsOf(template);
    const originalSectPrs = sectPrsOf(textOf(original, 'word/document.xml'));
    const sectPrs = sectPrsOf(textOf(result.parts, 'word/document.xml'));
    expect(sectPrs[0]).toBe(originalSectPrs[0]);
    expect(sectPrs[2]).toBe(originalSectPrs[2]);
    const neuf = await toZipEntries(await exportDocx(html, { layout }));
    const neufParts = new Map(
      Array.from(neuf.entries()).map(([name, text]) => [name, new TextEncoder().encode(text)]),
    );
    expect([0, 1, 2].map((index) => defaultHeaderText(neufParts, index))).toEqual([
      'Section 1',
      'NOUVEAU',
      'Section 2',
    ]);
  });
});

describe('w:titlePg jamais hérité (R43-06)', () => {
  for (const [name, firstId] of [
    ['16-sections.docx', 'rId7'],
    ['18-sections-triple.docx', 'rId7'],
  ] as const) {
    it(`${name}, tous les sauts supprimés : le sectPr final garde la référence first héritée mais pas w:titlePg`, async () => {
      const template = await fixture(name);
      const imported = await importStyled(template);
      const all = imported.html.replace(/<hr data-section-break="\d+">/g, '');
      const result = await exportInTemplate(all, template, { layout: imported.layout });
      expect(result.warnings).toEqual([]);
      const sectPrs = sectPrsOf(textOf(result.parts, 'word/document.xml'));
      expect(sectPrs).toHaveLength(1);
      expect(sectPrs[0]).toContain(`<w:headerReference w:type="first" r:id="${firstId}"/>`);
      expect(sectPrs[0]).not.toContain('<w:titlePg');
      expect(checkIntegrity(result.parts)).toEqual([]);
      const again = await importStyled(result.buffer);
      expect(again.layout.titlePage).toBeUndefined();
    });
  }

  it('une section greffée qui demande titlePage le garde, une section du gabarit qui l’avait aussi', async () => {
    const template = await fixture('18-sections-triple.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template, { layout: imported.layout });
    const sectPrs = sectPrsOf(textOf(result.parts, 'word/document.xml'));
    expect(sectPrs[0]).toContain('<w:titlePg/>');
    expect(sectPrs[1]).not.toContain('<w:titlePg');
    expect(sectPrs[2]).not.toContain('<w:titlePg');
  });
});
