import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bodyOf,
  checkIntegrity,
  differingParts,
  exportInTemplate,
  fixture,
  fixturePath,
  importStyled,
  normalizeXml,
  partsOf,
  textOf,
  topLevelBlocks,
} from './testing';

/** Tous les `w:sectPr` d'un `document.xml`, dans l'ordre, tels qu'écrits. */
function sectPrsOf(xml: string): string[] {
  return xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g) ?? [];
}

/**
 * Blocs normalisés du corps d'un `document.xml`, tableaux exclus : l'export réécrit leurs
 * bordures en propriétés explicites par cellule (comportement de la 0.5, fixture 14), ce
 * qui n'est pas ce que ces tests mesurent.
 */
function blocksOf(xml: string): string[] {
  return topLevelBlocks(normalizeXml(bodyOf(xml))).filter((block) => !block.startsWith('<w:tbl'));
}

/** HTML comparable : blancs réduits, blancs collés aux balises retirés. */
function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/\s+</g, '<').replace(/>\s+/g, '>').trim();
}

describe('sections dans le gabarit : aller-retour sans modification', () => {
  for (const [name, count] of [
    ['16-sections.docx', 2],
    ['18-sections-triple.docx', 3],
  ] as const) {
    it(`${name} : ${String(count)} w:sectPr identiques à l'octet, parties annexes intactes, document.xml équivalent`, async () => {
      const template = await fixture(name);
      const imported = await importStyled(template);
      expect(imported.layout.sections).toHaveLength(count);
      const result = await exportInTemplate(imported.html, template, { layout: imported.layout });
      expect(result.warnings).toEqual([]);
      const original = await partsOf(template);
      expect(differingParts(original, result.parts)).toEqual(
        differingParts(original, result.parts).filter((path) => path === 'word/document.xml'),
      );
      const originalXml = textOf(original, 'word/document.xml');
      const resultXml = textOf(result.parts, 'word/document.xml');
      expect(sectPrsOf(resultXml)).toEqual(sectPrsOf(originalXml));
      expect(sectPrsOf(resultXml)).toHaveLength(count);
      expect(blocksOf(resultXml)).toEqual(blocksOf(originalXml));
      expect(checkIntegrity(result.parts)).toEqual([]);
      const again = await importStyled(result.buffer);
      expect(normalizeHtml(again.html)).toBe(normalizeHtml(imported.html));
      expect(again.layout).toEqual(imported.layout);
    });
  }

  it('18 : un mot changé dans la section 2 → seul ce bloc diffère, les trois sectPr restent', async () => {
    const template = await fixture('18-sections-triple.docx');
    const imported = await importStyled(template);
    const before = 'Section 2, paragraphe 2';
    expect(imported.html).toContain(before);
    const result = await exportInTemplate(
      imported.html.replace(before, 'Section 2, paragraphe deux'),
      template,
      { layout: imported.layout },
    );
    const original = await partsOf(template);
    expect(differingParts(original, result.parts)).toEqual(['word/document.xml']);
    const originalXml = textOf(original, 'word/document.xml');
    const resultXml = textOf(result.parts, 'word/document.xml');
    expect(sectPrsOf(resultXml)).toEqual(sectPrsOf(originalXml));
    const beforeBlocks = blocksOf(originalXml);
    const afterBlocks = blocksOf(resultXml);
    expect(afterBlocks.length).toBe(beforeBlocks.length);
    const changed = afterBlocks.filter((block, index) => block !== beforeBlocks[index]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('Section 2, paragraphe deux');
  });

  it('18 : la section 2 reçoit un nouvel en-tête, les autres sections et parties restent intactes', async () => {
    const template = await fixture('18-sections-triple.docx');
    const imported = await importStyled(template);
    const sections = imported.layout.sections ?? [];
    expect(sections).toHaveLength(3);
    const result = await exportInTemplate(imported.html, template, {
      layout: {
        ...imported.layout,
        sections: sections.map((section, index) =>
          index === 1
            ? {
                ...section,
                headers: { ...section.headers, default: { html: '<p>En-tête 2 modifié</p>' } },
              }
            : section,
        ),
      },
    });
    expect(result.warnings).toEqual([]);
    const original = await partsOf(template);
    const diff = differingParts(original, result.parts);
    const created = diff.filter((path) => !original.has(path));
    expect(created).toEqual(['word/header5.xml']);
    expect(diff.filter((path) => original.has(path))).toEqual([
      '[Content_Types].xml',
      'word/_rels/document.xml.rels',
      'word/document.xml',
    ]);
    const originalSectPrs = sectPrsOf(textOf(original, 'word/document.xml'));
    const sectPrs = sectPrsOf(textOf(result.parts, 'word/document.xml'));
    expect(sectPrs[0]).toBe(originalSectPrs[0]);
    expect(sectPrs[2]).toBe(originalSectPrs[2]);
    expect(sectPrs[1]).not.toBe(originalSectPrs[1]);
    expect(sectPrs[1]).toContain('<w:headerReference w:type="even" r:id="rId10"/>');
    expect(sectPrs[1]).toMatch(/<w:headerReference w:type="default" r:id="rId\d+"\/>/);
    expect(sectPrs[1]).not.toContain('r:id="rId9"');
    expect(checkIntegrity(result.parts)).toEqual([]);
    const again = await importStyled(result.buffer);
    expect(again.layout.sections?.[1]?.headers?.default?.html).toContain('En-tête 2 modifié');
    expect(again.layout.sections?.[0]).toEqual(sections[0]);
    expect(again.layout.sections?.[2]?.footers).toEqual(sections[2]?.footers);
  });

  it('18 : un corps à un seul saut reprend par ses propriétés la section 2 du gabarit, complétée des références de la section 1 abandonnée', async () => {
    const template = await fixture('18-sections-triple.docx');
    const imported = await importStyled(template);
    const sections = imported.layout.sections ?? [];
    const html =
      '<p>Dans la section paysage</p><hr data-section-break="1"><p>Dans la dernière section</p>';
    const result = await exportInTemplate(html, template, {
      layout: { ...imported.layout, sections: [sections[1] ?? {}, sections[2] ?? {}] },
    });
    expect(result.warnings).toEqual([]);
    const original = await partsOf(template);
    expect(differingParts(original, result.parts)).toEqual(['word/document.xml']);
    const originalSectPrs = sectPrsOf(textOf(original, 'word/document.xml'));
    const sectPrs = sectPrsOf(textOf(result.parts, 'word/document.xml'));
    expect(sectPrs).toHaveLength(2);
    expect(sectPrs[1]).toBe(originalSectPrs[2]);
    // Section 2 du gabarit, reprise telle quelle plus ce que la section 1 lui transmettait.
    expect(sectPrs[0]).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
    expect(sectPrs[0]).toContain('<w:headerReference w:type="default" r:id="rId9"/>');
    expect(sectPrs[0]).toContain('<w:headerReference w:type="first" r:id="rId7"/>');
    expect(sectPrs[0]).toContain('<w:footerReference w:type="default" r:id="rId8"/>');
    expect(sectPrs[0]).toContain('<w:titlePg/>');
    expect(sectPrs[0]).not.toContain('rId6');
    // Le porteur du gabarit est un paragraphe vide : il est recréé après le dernier paragraphe.
    const body = normalizeXml(bodyOf(textOf(result.parts, 'word/document.xml')));
    expect(body).toMatch(/Dans la section paysage<\/w:t><\/w:r><\/w:p><w:p><w:pPr><w:sectPr>/);
    expect(checkIntegrity(result.parts)).toEqual([]);
  });

  it('gabarit à une section, corps à deux sauts : sections 1 et 2 régénérées avec leurs en-têtes, la dernière garde le sectPr du gabarit', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const original = await partsOf(template);
    const html =
      '<p>Un</p><hr data-section-break="1"><p>Deux</p><table><tr><td>cellule</td></tr></table><hr data-section-break="2"><p>Trois</p>';
    const result = await exportInTemplate(html, template, {
      layout: {
        sections: [
          {
            page: { size: 'A4', orientation: 'landscape' },
            headers: { default: { html: '<p>En-tête <strong>un</strong></p>' } },
            footers: { default: { html: '<p>Pied un</p>' } },
            titlePage: true,
          },
          {
            page: { size: 'Letter' },
            columns: 2,
            start: 'continuous',
            headers: { default: { html: '<p>En-tête deux</p>' }, even: { html: '<p>Pair</p>' } },
          },
          {},
        ],
      },
    });
    expect(result.warnings).toEqual([]);
    const document = textOf(result.parts, 'word/document.xml');
    const sectPrs = sectPrsOf(document);
    expect(sectPrs).toHaveLength(3);
    expect(sectPrs[2]).toBe(sectPrsOf(textOf(original, 'word/document.xml'))[0]);
    expect(sectPrs[0]).toContain('w:orient="landscape"');
    expect(sectPrs[0]).toContain('<w:titlePg/>');
    expect(sectPrs[0]).toMatch(/<w:headerReference w:type="default" r:id="rId\d+"\/>/);
    expect(sectPrs[0]).toMatch(/<w:footerReference w:type="default" r:id="rId\d+"\/>/);
    expect(sectPrs[1]).toContain('<w:type w:val="continuous"/>');
    expect(sectPrs[1]).toContain('<w:cols w:num="2"');
    expect(sectPrs[1]).toMatch(/<w:headerReference w:type="even" r:id="rId\d+"\/>/);
    // Section 1 : sectPr dans le dernier paragraphe ; section 2 (table en dernier) : paragraphe vide créé.
    const body = normalizeXml(bodyOf(document));
    expect(body).toMatch(
      /<w:p><w:pPr>(?:(?!<\/w:pPr>).)*<w:sectPr>.*?<\/w:sectPr><\/w:pPr><w:r><w:t xml:space="preserve">Un<\/w:t>/,
    );
    expect(body).toMatch(/<\/w:tbl><w:p><w:pPr><w:sectPr>/);
    const created = differingParts(original, result.parts).filter((path) => !original.has(path));
    expect(created.sort()).toEqual([
      'word/footer1.xml',
      'word/header1.xml',
      'word/header2.xml',
      'word/header3.xml',
    ]);
    expect(textOf(result.parts, 'word/settings.xml')).toContain('<w:evenAndOddHeaders/>');
    expect(checkIntegrity(result.parts)).toEqual([]);
    const again = await importStyled(result.buffer);
    expect(again.layout.sections).toHaveLength(3);
    expect(again.layout.sections?.[0]?.headers?.default?.html).toContain(
      'En-tête <strong>un</strong>',
    );
    expect(again.layout.sections?.[0]?.page?.orientation).toBe('landscape');
    expect(again.layout.sections?.[1]?.start).toBe('continuous');
    expect(again.layout.sections?.[1]?.columns).toBe(2);
    expect(again.html).toContain('<hr data-section-break="1">');
    expect(again.html).toContain('<hr data-section-break="2">');
  });

  it('19 : tabulations, taquets, bordures et alignement de tableau restitués, idempotents', async () => {
    const template = await fixture('19-tabulations-bordures.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template, { layout: imported.layout });
    expect(result.warnings).toEqual([]);
    const original = await partsOf(template);
    expect(differingParts(original, result.parts)).toEqual(
      differingParts(original, result.parts).filter((path) => path === 'word/document.xml'),
    );
    const document = textOf(result.parts, 'word/document.xml');
    expect(document).toContain('<w:tabs><w:tab w:val="left" w:pos="1134"/></w:tabs>');
    expect(document).toContain('<w:tabs><w:tab w:val="left" w:pos="7938"/></w:tabs>');
    expect((document.match(/<w:tab\/>/g) ?? []).length).toBe(9);
    expect(document).toContain('w:space="8"');
    expect(document).toContain('w:color="BFBFBF"');
    expect(document).toContain('w:color="2F5496"');
    expect(document).toMatch(/<w:tcBorders>(?:<w:top[^>]*\/>)?<w:left w:val="nil"\/>/);
    expect(document).toMatch(/<w:bottom w:val="nil"\/>(?:<w:left[^>]*\/>)?<\/w:tcBorders>/);
    expect(document).toContain('<w:jc w:val="center"/>');
    expect(document).toContain('<w:jc w:val="right"/>');
    expect(checkIntegrity(result.parts)).toEqual([]);
    const again = await importStyled(result.buffer);
    expect(again.html).toBe(imported.html);
    expect(again.layout).toEqual(imported.layout);
  });
});

const CLIENT = fixturePath('client/Modele_Demo_DER.docx');

describe.skipIf(!existsSync(CLIENT))('sections du document client', () => {
  it('3 w:sectPr identiques à l’octet, pied effectif sur chaque section', async () => {
    const template = await fixture('client/Modele_Demo_DER.docx');
    const imported = await importStyled(template);
    expect(imported.layout.sections).toHaveLength(3);
    const result = await exportInTemplate(imported.html, template, {
      layout: imported.layout,
      variables: { mode: 'resolve', values: {} },
    });
    const original = await partsOf(template);
    expect(differingParts(original, result.parts)).toEqual([
      'word/_rels/document.xml.rels',
      'word/document.xml',
    ]);
    const sectPrs = sectPrsOf(textOf(result.parts, 'word/document.xml'));
    expect(sectPrs).toEqual(sectPrsOf(textOf(original, 'word/document.xml')));
    expect(sectPrs).toHaveLength(3);
    expect(checkIntegrity(result.parts)).toEqual([]);
    const again = await importStyled(result.buffer);
    for (const section of again.layout.sections ?? []) {
      expect(section.footers?.default?.html).toBe(imported.layout.footers?.default?.html);
    }
    expect(again.layout.sections).toEqual(imported.layout.sections);
  });
});
