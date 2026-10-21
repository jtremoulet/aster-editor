import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../export/export-docx.js';
import { defaultParagraphSpacing } from '../../export/styles-headings.js';
import { toZipEntries } from '../../export/testing/sample.js';
import { compareDocx } from '../compare/compare-docx.js';
import { importDocx } from '../import-docx.js';
import { buildDocx, run as runXml } from '../preprocess/minimal-docx.js';
import { readSectionLayout } from './sections.js';
import { createStyleResolver, defaultParagraphOf } from './styles.js';
import { fakePackage, stylesXml } from './test-support.js';
import { stubStyles } from './testing-blocks.js';

/**
 * Session 5, L53 (retour POC n° 2) : `layout.defaultParagraph` lu depuis les `docDefaults`
 * puis le style `Normal` résolu, réécrit dans les `docDefaults` de l'export neuf, comparé
 * par le rapport de fidélité (`section.defaultParagraph`), idempotent sur les fixtures.
 */

const FIXTURES = join(import.meta.env.ASTER_FIXTURES, 'docx');

function fixture(name: string): ArrayBuffer {
  const buffer = readFileSync(join(FIXTURES, `${name}.docx`));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

const NORMAL = (pPr = ''): string =>
  `<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/>${pPr}</w:style>`;

const DOC_DEFAULTS_115 =
  '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>';

/** Résolveur sur un `styles.xml` minimal (docDefaults + styles). */
async function resolverOf(
  styles: string,
  docDefaults = '',
): Promise<ReturnType<typeof defaultParagraphOf>> {
  const resolver = await createStyleResolver(
    fakePackage({ 'word/styles.xml': stylesXml(styles, docDefaults) }),
  );
  return defaultParagraphOf(resolver);
}

/** `layout.defaultParagraph` d'un `.docx` minimal au `styles.xml` donné. */
async function layoutOf(styles: string, docDefaults = ''): Promise<unknown> {
  const docx = await buildDocx(`<w:p>${runXml('a')}</w:p>`, {
    'word/styles.xml': stylesXml(styles, docDefaults),
  });
  return (await importDocx(docx, { fidelity: 'styled' })).layout.defaultParagraph;
}

/**
 * Valeurs attendues des fixtures 11-20 : seule la 13 modifie `Normal` (1,15, après 8 pt) ;
 * les autres sont produites par la lib `docx`, dont les `docDefaults` de paragraphe sont
 * vides et le style `Normal` sans `w:pPr` : défauts de Word, rien à transporter.
 */
const EXPECTED: Readonly<
  Record<string, { lineHeight?: number; spacingAfterPt?: number } | undefined>
> = {
  '11-styles-inline': undefined,
  '12-paragraphes': undefined,
  '13-styles-nommes': { lineHeight: 1.15, spacingAfterPt: 8 },
  '14-tableaux-riches': undefined,
  '15-listes-numerotation': undefined,
  '16-sections': undefined,
  '17-objets-perdus': undefined,
  '18-sections-triple': undefined,
  '19-tabulations-bordures': undefined,
  '20-champs-en-tete': undefined,
};

describe('lecture de layout.defaultParagraph', () => {
  it('docDefaults de paragraphe : interligne multiple et espacement après', async () => {
    expect(await resolverOf(NORMAL(), DOC_DEFAULTS_115)).toEqual({
      lineHeight: 1.15,
      spacingAfterPt: 8,
    });
    expect(await layoutOf(NORMAL(), DOC_DEFAULTS_115)).toEqual({
      lineHeight: 1.15,
      spacingAfterPt: 8,
    });
  });

  it('le style Normal résolu complète puis l’emporte sur les docDefaults', async () => {
    // `Normal` pose l'espacement avant, hérite de l'interligne et de l'après des docDefaults.
    expect(
      await resolverOf(NORMAL('<w:pPr><w:spacing w:before="240"/></w:pPr>'), DOC_DEFAULTS_115),
    ).toEqual({ lineHeight: 1.15, spacingBeforePt: 12, spacingAfterPt: 8 });
    // `Normal` ramène tout au défaut de Word : plus rien à transporter.
    expect(
      await resolverOf(
        NORMAL('<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'),
        DOC_DEFAULTS_115,
      ),
    ).toEqual({});
  });

  it('interligne exact ou minimal → lineHeightPt, qui l’emporte sur lineHeight', async () => {
    expect(
      await resolverOf(NORMAL('<w:pPr><w:spacing w:line="360" w:lineRule="exact"/></w:pPr>')),
    ).toEqual({ lineHeightPt: 18 });
    expect(
      await resolverOf(
        NORMAL('<w:pPr><w:spacing w:line="300" w:lineRule="atLeast"/></w:pPr>'),
        DOC_DEFAULTS_115,
      ),
    ).toEqual({ lineHeightPt: 15, spacingAfterPt: 8 });
  });

  it('rien pour les défauts de Word (interligne simple, 0 pt), sans styles.xml, ou pour un résolveur tiers', async () => {
    expect(
      await resolverOf(
        NORMAL(),
        '<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>',
      ),
    ).toEqual({});
    expect(await resolverOf(NORMAL())).toEqual({});
    expect(await layoutOf(NORMAL())).toBeUndefined();
    expect(defaultParagraphOf(await createStyleResolver(fakePackage({})))).toEqual({});
    expect(defaultParagraphOf(stubStyles())).toEqual({});
  });

  it('readSectionLayout pose defaultParagraph à côté de defaultFont, jamais vide', () => {
    const styles = {
      ...stubStyles({ defaultFont: () => ({ family: 'Arial', sizePt: 10 }) }),
      defaultParagraph: () => ({ lineHeight: 1.5, spacingBeforePt: 6 }),
    };
    expect(readSectionLayout(null, styles, 'fr-FR')).toEqual({
      defaultFont: { family: 'Arial', sizePt: 10 },
      defaultParagraph: { lineHeight: 1.5, spacingBeforePt: 6 },
      lang: 'fr-FR',
    });
    const bare = { ...stubStyles(), defaultParagraph: () => ({}) };
    expect(readSectionLayout(null, bare)).toEqual({});
  });

  it.each(Object.entries(EXPECTED))('%s : valeur lue', async (name, expected) => {
    const { layout } = await importDocx(fixture(name), { fidelity: 'styled' });
    expect(layout.defaultParagraph).toEqual(expected);
  });

  it('les paragraphes continuent de ne porter que ce qui diffère des docDefaults (13)', async () => {
    const { html } = await importDocx(fixture('13-styles-nommes'), { fidelity: 'styled' });
    // `Normal` diffère des docDefaults (vides) : chaque paragraphe porte 1,15 et 8 pt, comme avant.
    expect(html).toContain(
      '<p style="line-height: 1.15; margin-bottom: 8pt" data-docx-style="Normal">Paragraphe Normal',
    );
  });
});

describe('export neuf : docDefaults depuis layout.defaultParagraph', () => {
  it('defaultParagraphSpacing : twips, lineRule, bornes', () => {
    expect(defaultParagraphSpacing(undefined)).toBeUndefined();
    expect(defaultParagraphSpacing({})).toBeUndefined();
    expect(defaultParagraphSpacing({ lineHeight: 1.15, spacingAfterPt: 8 })).toEqual({
      line: 276,
      lineRule: 'auto',
      after: 160,
    });
    expect(
      defaultParagraphSpacing({ lineHeight: 1.5, lineHeightPt: 18, spacingBeforePt: 12 }),
    ).toEqual({ line: 360, lineRule: 'exact', before: 240 });
    // Valeurs irrecevables (négatives, infinies, hors bornes de Word) : ignorées une à une.
    expect(
      defaultParagraphSpacing({
        lineHeight: -1,
        spacingBeforePt: Number.POSITIVE_INFINITY,
        spacingAfterPt: 2000,
      }),
    ).toBeUndefined();
    expect(defaultParagraphSpacing({ lineHeight: 0, spacingAfterPt: 0 })).toEqual({ after: 0 });
  });

  it('écrit w:pPrDefault/w:spacing, avec ou sans police par défaut', async () => {
    const entries = await toZipEntries(
      await exportDocx('<p>a</p>', {
        layout: { defaultParagraph: { lineHeight: 1.15, spacingBeforePt: 6, spacingAfterPt: 8 } },
      }),
    );
    const styles = entries.get('word/styles.xml') ?? '';
    const defaults = styles.slice(
      styles.indexOf('<w:docDefaults>'),
      styles.indexOf('</w:docDefaults>'),
    );
    expect(defaults).toMatch(
      /<w:pPrDefault><w:pPr><w:spacing [^>]*w:line="276"[^>]*\/><\/w:pPr><\/w:pPrDefault>/,
    );
    expect(defaults).toContain('w:before="120"');
    expect(defaults).toContain('w:after="160"');
    expect(defaults).toContain('w:lineRule="auto"');

    const both = await toZipEntries(
      await exportDocx('<p>a</p>', {
        layout: { defaultFont: { family: 'Georgia' }, defaultParagraph: { lineHeightPt: 18 } },
      }),
    );
    const bothStyles = both.get('word/styles.xml') ?? '';
    expect(bothStyles).toContain('w:ascii="Georgia"');
    expect(bothStyles).toContain('w:line="360"');
    expect(bothStyles).toContain('w:lineRule="exact"');
  });

  it('n’écrit rien sans defaultParagraph (docDefaults de paragraphe vides)', async () => {
    const entries = await toZipEntries(
      await exportDocx('<p>a</p>', { layout: { defaultFont: { family: 'Arial' } } }),
    );
    expect(entries.get('word/styles.xml')).toContain('<w:pPrDefault/>');
  });

  it.each(Object.keys(EXPECTED))(
    '%s : import → export neuf → import rend le même defaultParagraph',
    async (name) => {
      const imported = await importDocx(fixture(name), { fidelity: 'styled' });
      const blob = await exportDocx(imported.html, { layout: imported.layout });
      const again = await importDocx(await blob.arrayBuffer(), { fidelity: 'styled' });
      expect(again.layout.defaultParagraph).toEqual(imported.layout.defaultParagraph);
    },
  );

  it('export dans le gabarit : les docDefaults du gabarit sont conservés tels quels', async () => {
    const original = fixture('13-styles-nommes');
    const imported = await importDocx(original, { fidelity: 'styled' });
    const blob = await exportDocx(imported.html, {
      template: imported.template,
      // Un `defaultParagraph` différent dans le layout ne réécrit pas les docDefaults du gabarit.
      layout: { ...imported.layout, defaultParagraph: { lineHeight: 2, spacingAfterPt: 20 } },
    });
    const report = await compareDocx(original, await blob.arrayBuffer());
    expect(report.identicalParts).toContain('word/styles.xml');
    expect(report.properties.find((p) => p.name === 'section.defaultParagraph')).toMatchObject({
      group: 'section',
      total: 1,
      kept: 1,
    });
  });
});

describe('comparateur : section.defaultParagraph', () => {
  /** Fixture 13 dont le style `Normal` est ramené aux défauts de Word. */
  async function withNormalReset(original: ArrayBuffer): Promise<ArrayBuffer> {
    const zip = await JSZip.loadAsync(original);
    const styles = await zip.file('word/styles.xml')?.async('string');
    if (styles === undefined) throw new Error('styles.xml absent');
    const patched = styles.replace(
      '<w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:style>',
      '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>',
    );
    expect(patched).not.toBe(styles);
    zip.file('word/styles.xml', patched);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const output = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(output).set(bytes);
    return output;
  }

  it('comparé à lui-même : conservé ; Normal ramené au défaut : perdu, une occurrence', async () => {
    const original = fixture('13-styles-nommes');
    const same = await compareDocx(original, original.slice(0));
    expect(same.properties.find((p) => p.name === 'section.defaultParagraph')).toMatchObject({
      group: 'section',
      total: 1,
      kept: 1,
      lost: 0,
    });
    const reset = await compareDocx(original, await withNormalReset(original));
    const property = reset.properties.find((p) => p.name === 'section.defaultParagraph');
    expect(property).toMatchObject({ group: 'section', total: 1, kept: 0, lost: 1 });
    expect(property?.examples[0]?.where).toBe('document');
    expect(reset.score).toBeLessThan(1);
  });

  it('absent des deux côtés : pas compté (fixture 12)', async () => {
    const original = fixture('12-paragraphes');
    const report = await compareDocx(original, original.slice(0));
    expect(report.properties.some((p) => p.name === 'section.defaultParagraph')).toBe(false);
  });
});
