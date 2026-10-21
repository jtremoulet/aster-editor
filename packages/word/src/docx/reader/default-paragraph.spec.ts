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

  it('interligne exact → lineHeightPt, qui l’emporte sur lineHeight ; « au moins » non transporté (R53-04)', async () => {
    expect(
      await resolverOf(NORMAL('<w:pPr><w:spacing w:line="360" w:lineRule="exact"/></w:pPr>')),
    ).toEqual({ lineHeightPt: 18 });
    // `atLeast` : le contrat ne connaît que l'exact, qui tronquerait toute ligne plus haute
    // dans tout le document ; l'interligne des docDefaults (1,15) est lui aussi effacé par
    // le `Normal`, qui pose un interligne en points.
    expect(
      await resolverOf(
        NORMAL('<w:pPr><w:spacing w:line="300" w:lineRule="atLeast"/></w:pPr>'),
        DOC_DEFAULTS_115,
      ),
    ).toEqual({ spacingAfterPt: 8 });
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

  it('les paragraphes ne portent que ce qui diffère de layout.defaultParagraph (13, R53-01)', async () => {
    const { html } = await importDocx(fixture('13-styles-nommes'), { fidelity: 'styled' });
    // `Normal` (1,15 / 8 pt) **est** le défaut du document : un paragraphe `Normal` ne porte
    // rien, un titre ne porte que ses espacements, `Citation` (basé sur `Normal`) que son retrait.
    expect(html).toContain('<p data-docx-style="Normal">Paragraphe Normal');
    expect(html).toContain(
      '<h1 style="margin-top: 12pt; margin-bottom: 4pt" data-docx-style="Heading1"',
    );
    expect(html).toContain(
      '<p style="margin-left: 28.35pt; border-left: 1.5pt solid #808080; padding-left: 4pt" data-docx-style="Citation">',
    );
    expect(html).not.toContain('line-height: 1.15');
    expect(html).not.toContain('margin-bottom: 8pt');
  });
});

/** `.docx` minimal : corps et `styles.xml` (styles, `docDefaults`) donnés. */
async function docxOf(body: string, styles: string, docDefaults = ''): Promise<ArrayBuffer> {
  return buildDocx(body, { 'word/styles.xml': stylesXml(styles, docDefaults) });
}

/** `w:p` au texte donné, avec un `w:pPr` optionnel. */
const P = (text: string, pPr = ''): string =>
  `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runXml(text)}</w:p>`;

/** Style de paragraphe nommé, sans `basedOn` sauf `extra`. */
const STYLE = (id: string, pPr = '', extra = ''): string =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/>${extra}${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}</w:style>`;

const PPR_DEFAULT = (spacing: string): string =>
  `<w:pPrDefault><w:pPr>${spacing}</w:pPr></w:pPrDefault>`;

const SPACING_115 = '<w:spacing w:after="160" w:line="276" w:lineRule="auto"/>';
const SPACING_WORD = '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>';

type Imported = Awaited<ReturnType<typeof importDocx>>;

/** Import stylé → export neuf avec `layout` → import, plus le rapport original / export. */
async function roundTrip(docx: ArrayBuffer): Promise<{
  first: Imported;
  again: Imported;
  report: Awaited<ReturnType<typeof compareDocx>>;
  parts: ReadonlyMap<string, string>;
}> {
  const first = await importDocx(docx, { fidelity: 'styled' });
  const blob = await exportDocx(first.html, { layout: first.layout });
  const exported = await blob.arrayBuffer();
  const again = await importDocx(exported, { fidelity: 'styled' });
  const report = await compareDocx(docx, exported);
  return { first, again, report, parts: await toZipEntries(blob) };
}

/** Occurrences perdues d'une propriété du rapport, 0 si elle n'est pas comptée. */
function lostOf(report: Awaited<ReturnType<typeof compareDocx>>, name: string): number {
  return report.properties.find((property) => property.name === name)?.lost ?? 0;
}

/**
 * R53-01 : la base de comparaison des paragraphes est `layout.defaultParagraph`
 * (`docDefaults` puis `Normal`), pas les `docDefaults` seuls. Cas A, B, B2 de `probe.mjs`
 * (revue R53) et la fixture 13 : un style **sans** `basedOn` dans un document au `Normal`
 * modifié garde l'interligne simple de Word à l'export neuf, à la réimportation et dans la
 * vue page ; un style basé sur `Normal` ne porte rien.
 */
describe('R53-01 : paragraphes retranchés contre layout.defaultParagraph', () => {
  const BODY = P('normal') + P('foo', '<w:pStyle w:val="Foo"/>');

  it('cas A : docDefaults vides, Normal 1,15 / 8 pt, Foo sans basedOn → Foo écrit le défaut de Word', async () => {
    const docx = await docxOf(BODY, NORMAL(`<w:pPr>${SPACING_115}</w:pPr>`) + STYLE('Foo'));
    const { first, again, report, parts } = await roundTrip(docx);
    expect(first.layout.defaultParagraph).toEqual({ lineHeight: 1.15, spacingAfterPt: 8 });
    expect(first.html).toBe(
      '<p data-docx-style="Normal">normal</p>' +
        '<p style="line-height: 1; margin-bottom: 0pt" data-docx-style="Foo">foo</p>',
    );
    // Export neuf : les défauts dans `w:pPrDefault`, rien sur `normal`, le défaut de Word sur `foo`.
    const document = parts.get('word/document.xml') ?? '';
    expect(parts.get('word/styles.xml')).toMatch(
      /<w:pPrDefault><w:pPr><w:spacing [^>]*w:line="276"[^>]*\/><\/w:pPr><\/w:pPrDefault>/,
    );
    expect(document).not.toContain('w:line="276"');
    expect(document).toMatch(/<w:spacing [^>]*w:line="240"[^>]*\/>/);
    // Réimport : `Foo` n'existe plus (export neuf), mais l'interligne simple et le 0 pt tiennent.
    expect(again.layout.defaultParagraph).toEqual(first.layout.defaultParagraph);
    expect(again.html).toBe(
      '<p data-docx-style="Normal">normal</p>' +
        '<p style="line-height: 1; margin-bottom: 0pt" data-docx-style="Normal">foo</p>',
    );
    expect(lostOf(report, 'paragraph.lineHeight')).toBe(0);
    expect(lostOf(report, 'paragraph.spacingAfterPt')).toBe(0);
  });

  it('cas B : docDefaults 1,08 / 8 pt, Normal ramené à 1 / 0, Foo sans basedOn → Foo garde 1,08 / 8 pt', async () => {
    const docx = await docxOf(
      BODY,
      NORMAL(`<w:pPr>${SPACING_WORD}</w:pPr>`) + STYLE('Foo'),
      PPR_DEFAULT('<w:spacing w:after="160" w:line="259" w:lineRule="auto"/>'),
    );
    const { first, again, report, parts } = await roundTrip(docx);
    // Le `Normal` ramène tout au défaut de Word : rien à transporter…
    expect(first.layout.defaultParagraph).toBeUndefined();
    // … et chaque paragraphe porte sa valeur explicite, `Foo` celle des docDefaults.
    expect(first.html).toBe(
      '<p style="line-height: 1; margin-bottom: 0pt" data-docx-style="Normal">normal</p>' +
        '<p style="line-height: 1.08; margin-bottom: 8pt" data-docx-style="Foo">foo</p>',
    );
    expect(parts.get('word/styles.xml')).toContain('<w:pPrDefault/>');
    expect(again.layout.defaultParagraph).toBeUndefined();
    expect(again.html).toBe(
      '<p style="line-height: 1; margin-bottom: 0pt" data-docx-style="Normal">normal</p>' +
        '<p style="line-height: 1.08; margin-bottom: 8pt" data-docx-style="Normal">foo</p>',
    );
    expect(lostOf(report, 'paragraph.lineHeight')).toBe(0);
    expect(lostOf(report, 'paragraph.spacingAfterPt')).toBe(0);
  });

  it('cas B2 : Foo basé sur Normal (cas courant) → aucun des deux ne porte rien', async () => {
    const docx = await docxOf(
      BODY,
      NORMAL(`<w:pPr>${SPACING_115}</w:pPr>`) + STYLE('Foo', '', '<w:basedOn w:val="Normal"/>'),
    );
    const { first, again, report } = await roundTrip(docx);
    expect(first.layout.defaultParagraph).toEqual({ lineHeight: 1.15, spacingAfterPt: 8 });
    expect(first.html).toBe(
      '<p data-docx-style="Normal">normal</p><p data-docx-style="Foo">foo</p>',
    );
    expect(again.html).toBe(
      '<p data-docx-style="Normal">normal</p><p data-docx-style="Normal">foo</p>',
    );
    expect(lostOf(report, 'paragraph.lineHeight')).toBe(0);
    expect(lostOf(report, 'paragraph.spacingAfterPt')).toBe(0);
  });

  it('défaut exact du document : un paragraphe sans valeur écrit line-height: 1, un titre à 1,15 l’écrit', async () => {
    const docx = await docxOf(
      P('normal') + P('foo', '<w:pStyle w:val="Foo"/>') + P('direct', SPACING_115),
      NORMAL('<w:pPr><w:spacing w:before="60" w:line="280" w:lineRule="exact"/></w:pPr>') +
        STYLE('Foo'),
    );
    const { first } = await importDocx(docx, { fidelity: 'styled' }).then((first) => ({ first }));
    expect(first.layout.defaultParagraph).toEqual({ lineHeightPt: 14, spacingBeforePt: 3 });
    expect(first.html).toBe(
      '<p data-docx-style="Normal">normal</p>' +
        '<p style="line-height: 1; margin-top: 0pt" data-docx-style="Foo">foo</p>' +
        '<p style="line-height: 1.15; margin-bottom: 8pt" data-docx-style="Normal">direct</p>',
    );
  });

  it('fixture 13 : export neuf sans w:spacing redondant, réimport et comparateur sans perte', async () => {
    const original = fixture('13-styles-nommes');
    const { first, again, report, parts } = await roundTrip(original);
    expect(first.layout.defaultParagraph).toEqual({ lineHeight: 1.15, spacingAfterPt: 8 });
    const document = parts.get('word/document.xml') ?? '';
    // Avant R53-01 : 8 `w:spacing` directs sur 8 `w:p`, 5 identiques aux docDefaults écrits.
    // Désormais seuls les trois titres en portent un (espacements avant / après), sans `w:line`.
    expect(document.match(/<w:spacing /g)).toHaveLength(3);
    expect(document).not.toContain('w:line="276"');
    expect(parts.get('word/styles.xml')).toMatch(
      /<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"\/><\/w:pPr><\/w:pPrDefault>/,
    );
    expect(again.layout.defaultParagraph).toEqual(first.layout.defaultParagraph);
    expect(again.html).toContain('<p data-docx-style="Normal">Paragraphe Normal');
    expect(again.html).toContain('<p data-docx-style="Normal">Retour au paragraphe Normal</p>');
    expect(again.html).not.toContain('line-height');
    for (const name of ['paragraph.lineHeight', 'paragraph.spacingAfterPt']) {
      expect(report.properties.find((property) => property.name === name)).toMatchObject({
        total: 8,
        kept: 8,
        lost: 0,
      });
    }
    expect(lostOf(report, 'paragraph.spacingBeforePt')).toBe(0);
  });

  it('export dans le gabarit (13) : les paragraphes Normal nus ne reçoivent aucun w:spacing', async () => {
    const original = fixture('13-styles-nommes');
    const imported = await importDocx(original, { fidelity: 'styled' });
    const blob = await exportDocx(imported.html, {
      template: imported.template,
      layout: imported.layout,
    });
    const document = (await toZipEntries(blob)).get('word/document.xml') ?? '';
    // `Normal` sans `line-height` dans le HTML = l'interligne du document, pas l'interligne simple.
    expect(document).not.toContain('w:line="240"');
    expect(document).not.toContain('w:after="0"');
    const report = await compareDocx(original, await blob.arrayBuffer());
    expect(report.score).toBe(1);
  });
});

/**
 * R53-03 : `w:before` / `w:after` négatifs (`ST_TwipsMeasure` non signé) et `w:line`
 * nul ou négatif en `exact` ne sont ni lus ni transportés ; R53-04 : `w:lineRule` inconnu
 * ignoré, `atLeast` absent de `defaultParagraph` mais conservé sur les paragraphes.
 * Chaque cas est idempotent sur `import → export neuf → import` (cas C et D2 de `probe.mjs`).
 */
describe('R53-03 / R53-04 : docDefaults irrecevables, lineRule inconnu, atLeast', () => {
  it.each([
    ['before=-100', '<w:spacing w:before="-100"/>', {}],
    ['after=-20 before=60', '<w:spacing w:before="60" w:after="-20"/>', { spacingBeforePt: 3 }],
    ['line=0 exact', '<w:spacing w:line="0" w:lineRule="exact"/>', {}],
    ['line=-240 exact', '<w:spacing w:line="-240" w:lineRule="exact"/>', {}],
    ['line=0 auto', '<w:spacing w:line="0" w:lineRule="auto"/>', {}],
    ['line=276 lineRule=weird', '<w:spacing w:line="276" w:lineRule="weird"/>', {}],
    ['line=280 atLeast', '<w:spacing w:line="280" w:lineRule="atLeast"/>', {}],
    [
      'before=60 after=120 line=280 atLeast',
      '<w:spacing w:before="60" w:after="120" w:line="280" w:lineRule="atLeast"/>',
      { spacingBeforePt: 3, spacingAfterPt: 6 },
    ],
  ])('%s : defaultParagraph sain et idempotent', async (_label, spacing, expected) => {
    expect(await resolverOf(NORMAL(), PPR_DEFAULT(spacing))).toEqual(expected);
    const docx = await docxOf(P('x'), NORMAL(), PPR_DEFAULT(spacing));
    const { first, again, parts } = await roundTrip(docx);
    const layoutExpected = Object.keys(expected).length > 0 ? expected : undefined;
    expect(first.layout.defaultParagraph).toEqual(layoutExpected);
    expect(again.layout.defaultParagraph).toEqual(layoutExpected);
    expect(again.html).toBe(first.html);
    // Jamais de `lineRule="exact"` écrit dans les docDefaults à la place d'un `atLeast`.
    expect(parts.get('word/styles.xml')).not.toContain('w:lineRule="exact"');
  });

  it('lineRule inconnu sur un paragraphe : ignoré ; atLeast sur un paragraphe : lineHeightPt, comme avant', async () => {
    const docx = await docxOf(
      P('weird', '<w:spacing w:line="276" w:lineRule="weird"/>') +
        P('atLeast', '<w:spacing w:line="280" w:lineRule="atLeast"/>'),
      NORMAL(),
    );
    const { first, again } = await roundTrip(docx);
    expect(first.html).toBe(
      '<p data-docx-style="Normal">weird</p>' +
        '<p style="line-height: 14pt" data-docx-style="Normal">atLeast</p>',
    );
    expect(again.html).toBe(first.html);
  });

  it('docDefaults atLeast : les paragraphes portent l’interligne, pas les docDefaults de l’export neuf (D2)', async () => {
    const docx = await docxOf(
      P('x') + P('y', '<w:spacing w:line="360" w:lineRule="auto"/>'),
      NORMAL(),
      PPR_DEFAULT('<w:spacing w:before="60" w:after="120" w:line="280" w:lineRule="atLeast"/>'),
    );
    const { first, again, parts } = await roundTrip(docx);
    expect(first.layout.defaultParagraph).toEqual({ spacingBeforePt: 3, spacingAfterPt: 6 });
    expect(first.html).toBe(
      '<p style="line-height: 14pt" data-docx-style="Normal">x</p>' +
        '<p style="line-height: 1.5" data-docx-style="Normal">y</p>',
    );
    expect(parts.get('word/styles.xml')).toMatch(
      /<w:pPrDefault><w:pPr><w:spacing w:after="120" w:before="60"\/><\/w:pPr><\/w:pPrDefault>/,
    );
    expect(again.layout.defaultParagraph).toEqual(first.layout.defaultParagraph);
    expect(again.html).toBe(first.html);
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
