import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../export/export-docx';
import type { DocxExportWarning } from '../../export/types';
import { resolveVariableSettings } from '../../export/variables';
import { graftIntoTemplate } from './graft';
import { openTemplate } from './template';
import {
  alterTemplate,
  bodyOf,
  checkIntegrity,
  differingParts,
  exportInTemplate,
  fixture,
  importStyled,
  normalizeXml,
  partsOf,
  textOf,
} from './testing';
import { defaultXmlCodec, type XmlCodec } from './xml-io';

/**
 * Correctifs de la relecture R27 (lot F27), paquet : taille de la partie principale,
 * numérotation des titres, table des matières et réglages, en-têtes pairs, relations,
 * propriétés du document. Chaque test reprend la preuve du relecteur
 * (`docs/reviews/R27.md`) sur les fixtures 11-17. Suite dans `graft-fixes-body.spec.ts`.
 */

/** Variante d'un gabarit par mutation libre du zip. */
async function mutateZip(
  source: ArrayBuffer,
  mutate: (zip: JSZip) => Promise<void> | void,
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(source);
  await mutate(zip);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/** Styles intégrés que Word matérialise : tolérés par le validateur. */
const BUILT_IN = new Set(['TOC1', 'TOC2', 'TOC3', 'TOCHeading']);

describe('R27-01 : partie principale du gabarit', () => {
  it('20 Mo de <w:p/> : repli template-invalid sans parse, en moins de 3 s', async () => {
    const source = await fixture('13-styles-nommes.docx');
    const original = textOf(await partsOf(source), 'word/document.xml');
    const filler = '<w:p/>'.repeat(Math.ceil((20 * 1024 * 1024) / '<w:p/>'.length));
    const template = await mutateZip(source, (zip) => {
      zip.file('word/document.xml', original.replace('<w:body>', `<w:body>${filler}`));
    });
    const started = performance.now();
    const result = await exportInTemplate('<p>Corps</p>', template);
    const elapsed = performance.now() - started;
    expect(result.warnings.map((warning) => warning.code)).toEqual(['template-invalid']);
    expect(result.warnings[0]?.message).toMatch(/Mo/);
    expect(elapsed).toBeLessThan(3000);
    expect(result.parts.has('word/document.xml')).toBe(true);
    expect(checkIntegrity(result.parts)).toEqual([]);
  }, 60000);

  it('la partie principale du gabarit est parsée une seule fois (DOM du paquet réutilisé)', async () => {
    const buffer = await fixture('13-styles-nommes.docx');
    const base = defaultXmlCodec();
    let bodyParses = 0;
    const codec: XmlCodec = {
      parse: (xml) => {
        if (xml.includes('Retour au paragraphe Normal')) bodyParses += 1;
        return base.parse(xml);
      },
      serialize: (doc) => base.serialize(doc),
    };
    const warnings: DocxExportWarning[] = [];
    const template = await openTemplate(buffer, codec, warnings);
    expect(template).not.toBeNull();
    if (!template) return;
    const generated = await (await exportDocx('<p>Corps</p>')).arrayBuffer();
    const grafted = await graftIntoTemplate(
      {
        generated,
        template,
        lists: [],
        concreteNumbering: new Map(),
        variables: resolveVariableSettings(undefined),
        layout: undefined,
        toc: false,
        codec,
      },
      warnings,
    );
    expect(bodyParses).toBe(1);
    expect(warnings).toEqual([]);
    const document = textOf(await partsOf(grafted), 'word/document.xml');
    expect(document.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(
      true,
    );
    expect(document).toContain('>Corps</w:t>');
  });
});

describe('R27-02 : numberedHeadings dans le gabarit', () => {
  it('pose un w:numPr direct sur chaque titre, abstractNum ajouté, styles du gabarit intacts', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const original = await partsOf(template);
    const result = await exportInTemplate(
      '<h1>Un</h1><p>a</p><h2>Deux</h2><h3>Trois</h3>',
      template,
      {
        numberedHeadings: true,
      },
    );
    expect(result.warnings).toEqual([]);
    expect(differingParts(original, result.parts)).toEqual([
      'word/document.xml',
      'word/numbering.xml',
    ]);
    const body = normalizeXml(bodyOf(textOf(result.parts, 'word/document.xml')));
    const numIds = Array.from(
      body.matchAll(/<w:numPr><w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"\/><\/w:numPr>/g),
    );
    expect(numIds.map((match) => match[1])).toEqual(['0', '1', '2']);
    expect(new Set(numIds.map((match) => match[2])).size).toBe(1);
    const numbering = textOf(result.parts, 'word/numbering.xml');
    const originalNumbering = textOf(original, 'word/numbering.xml');
    expect(numbering.split('<w:abstractNum ').length).toBe(
      originalNumbering.split('<w:abstractNum ').length + 1,
    );
    expect(numbering).toContain('<w:lvlText w:val="%1.%2."/>');
    // Les niveaux ne sont liés à aucun style : les styles du gabarit ne sont pas modifiés.
    expect(numbering).not.toContain('<w:pStyle');
    expect(checkIntegrity(result.parts)).toEqual([]);
    const again = await importStyled(result.buffer);
    expect(again.html).toContain('Deux');
  });
});

describe('R27-03 : table des matières dans le gabarit', () => {
  it('garde TOC1-3 sans avertissement et pose w:updateFields dans settings.xml', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const original = await partsOf(template);
    expect(textOf(original, 'word/settings.xml')).not.toContain('updateFields');
    const result = await exportInTemplate(
      '<h1>Un</h1><p>a</p><h2>Deux</h2><h3>Trois</h3>',
      template,
      {
        toc: { title: 'Sommaire' },
      },
    );
    expect(result.warnings).toEqual([]);
    const document = textOf(result.parts, 'word/document.xml');
    for (const id of ['TOC1', 'TOC2', 'TOC3']) {
      expect(document).toContain(`<w:pStyle w:val="${id}"/>`);
    }
    expect(textOf(result.parts, 'word/settings.xml')).toContain('<w:updateFields w:val="true"/>');
    expect(differingParts(original, result.parts)).toEqual([
      'word/document.xml',
      'word/settings.xml',
      'word/styles.xml',
    ]);
    expect(checkIntegrity(result.parts, BUILT_IN)).toEqual([]);
  });

  it('un gabarit sans settings.xml la reçoit, avec relation et type de contenu', async () => {
    const template = await alterTemplate(await fixture('13-styles-nommes.docx'), {
      remove: ['word/settings.xml'],
    });
    const result = await exportInTemplate('<h1>Un</h1>', template, { toc: true });
    expect(textOf(result.parts, 'word/settings.xml')).toContain('<w:updateFields w:val="true"/>');
    expect(textOf(result.parts, 'word/_rels/document.xml.rels')).toContain('Target="settings.xml"');
    expect(textOf(result.parts, '[Content_Types].xml')).toContain('PartName="/word/settings.xml"');
    expect(checkIntegrity(result.parts, BUILT_IN)).toEqual([]);
  });
});

describe('R27-04 : en-tête de pages paires', () => {
  const LAYOUT = {
    layout: { headers: { even: { html: '<p>Pair</p>' }, default: { html: '<p>Défaut</p>' } } },
  };

  it('bascule <w:evenAndOddHeaders w:val="false"/> du gabarit (fixture 13 telle quelle)', async () => {
    const template = await fixture('13-styles-nommes.docx');
    expect(textOf(await partsOf(template), 'word/settings.xml')).toContain(
      '<w:evenAndOddHeaders w:val="false"/>',
    );
    const result = await exportInTemplate('<p>Corps</p>', template, LAYOUT);
    expect(result.warnings).toEqual([]);
    const settings = textOf(result.parts, 'word/settings.xml');
    expect(settings).toContain('<w:evenAndOddHeaders/>');
    expect(settings).not.toContain('w:val="false"');
    expect(textOf(result.parts, 'word/document.xml')).toMatch(/<w:headerReference w:type="even"/);
    expect(checkIntegrity(result.parts)).toEqual([]);
    const again = await importStyled(result.buffer);
    expect(again.layout.headers?.even?.html).toContain('Pair');
  });

  it('ajoute <w:evenAndOddHeaders/> à sa place quand le réglage manque', async () => {
    const source = await fixture('13-styles-nommes.docx');
    const settings = textOf(await partsOf(source), 'word/settings.xml');
    const template = await alterTemplate(source, {
      replace: {
        'word/settings.xml': settings.replace('<w:evenAndOddHeaders w:val="false"/>', ''),
      },
    });
    const result = await exportInTemplate('<p>Corps</p>', template, LAYOUT);
    const out = textOf(result.parts, 'word/settings.xml');
    expect(out).toContain('<w:evenAndOddHeaders/>');
    // Ordre du schéma : après `displayBackgroundShape`, avant `compat`.
    expect(out.indexOf('<w:evenAndOddHeaders/>')).toBeGreaterThan(
      out.indexOf('displayBackgroundShape'),
    );
    expect(out.indexOf('<w:evenAndOddHeaders/>')).toBeLessThan(out.indexOf('<w:compat>'));
    expect(checkIntegrity(result.parts)).toEqual([]);
  });

  it('un en-tête default seul ne touche pas settings.xml', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const result = await exportInTemplate('<p>Corps</p>', template, {
      layout: { headers: { default: { html: '<p>Défaut</p>' } } },
    });
    expect(differingParts(await partsOf(template), result.parts)).not.toContain(
      'word/settings.xml',
    );
  });
});

describe('R27-05 : relations des en-têtes créés', () => {
  it('aucun .rels vide pour un en-tête sans lien ni image, un .rels dès qu’il en a', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const plain = await exportInTemplate('<p>Corps</p>', template, {
      layout: { headers: { default: { html: '<p>Défaut</p>' } } },
    });
    expect(differingParts(await partsOf(template), plain.parts)).toEqual([
      '[Content_Types].xml',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/header1.xml',
    ]);
    expect(checkIntegrity(plain.parts)).toEqual([]);
    const linked = await exportInTemplate('<p>Corps</p>', template, {
      layout: { headers: { default: { html: '<p><a href="https://example.com">lien</a></p>' } } },
    });
    expect(linked.parts.has('word/_rels/header1.xml.rels')).toBe(true);
    expect(textOf(linked.parts, 'word/_rels/header1.xml.rels')).toContain('https://example.com');
    expect(checkIntegrity(linked.parts)).toEqual([]);
  });
});

describe('R27-06 : title et creator dans le gabarit', () => {
  it('réécrit dc:title et dc:creator de docProps/core.xml, le reste de la partie intact', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const original = await partsOf(template);
    const result = await exportInTemplate('<p>Corps</p>', template, {
      title: 'Titre <R27> & co',
      creator: 'R27',
    });
    expect(differingParts(original, result.parts)).toEqual([
      'docProps/core.xml',
      'word/document.xml',
    ]);
    const core = textOf(result.parts, 'docProps/core.xml');
    expect(core).toContain('<dc:title>Titre &lt;R27&gt; &amp; co</dc:title>');
    expect(core).toContain('<dc:creator>R27</dc:creator>');
    expect(core).not.toContain('<dc:creator>Un-named');
    // Les autres propriétés (dernier auteur, révision, dates) restent telles quelles.
    expect(core).toContain('<cp:lastModifiedBy>Un-named</cp:lastModifiedBy>');
    expect(core).toContain('<cp:revision>1</cp:revision>');
    expect(core.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    expect(checkIntegrity(result.parts)).toEqual([]);
  });

  it('sans option, core.xml reste intact ; créé si le gabarit n’en a pas', async () => {
    const source = await fixture('13-styles-nommes.docx');
    const untouched = await exportInTemplate((await importStyled(source)).html, source);
    expect(differingParts(await partsOf(source), untouched.parts)).toEqual([]);
    const template = await mutateZip(source, async (zip) => {
      zip.remove('docProps/core.xml');
      const rels = (await zip.file('_rels/.rels')?.async('string')) ?? '';
      zip.file('_rels/.rels', rels.replace(/<Relationship [^>]*core-properties[^>]*\/>/, ''));
      const types = (await zip.file('[Content_Types].xml')?.async('string')) ?? '';
      zip.file('[Content_Types].xml', types.replace(/<Override [^>]*core\.xml[^>]*\/>/, ''));
    });
    expect((await partsOf(template)).has('docProps/core.xml')).toBe(false);
    const result = await exportInTemplate('<p>Corps</p>', template, { title: 'Neuf' });
    expect(textOf(result.parts, 'docProps/core.xml')).toContain('<dc:title>Neuf</dc:title>');
    expect(textOf(result.parts, '_rels/.rels')).toContain('Target="docProps/core.xml"');
    expect(textOf(result.parts, '[Content_Types].xml')).toContain('PartName="/docProps/core.xml"');
    expect(checkIntegrity(result.parts)).toEqual([]);
  });
});
