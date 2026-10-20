import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../export/export-docx';
import { importDocx } from '../import-docx';
import { compareDocx } from './compare-docx';
import type { FidelityReport } from './types';

const DIR = join(import.meta.env.ASTER_FIXTURES, 'docx');
const CLIENT = join(DIR, 'client', 'Modele_Demo_DER.docx');
const LAYOUT_FIXTURES = [
  '11-styles-inline.docx',
  '12-paragraphes.docx',
  '13-styles-nommes.docx',
  '14-tableaux-riches.docx',
  '15-listes-numerotation.docx',
  '16-sections.docx',
  '17-objets-perdus.docx',
];

/** Cible de l'aller-retour dans le gabarit (critère d'acceptation de la session 3). */
const TEMPLATE_TARGET_SCORE = 0.98;

/** Seuil bas de l'aller-retour sans gabarit : l'export neuf perd volontairement les parties annexes. */
const ROUNDTRIP_MIN_SCORE = 0.3;

/**
 * Fixtures qui atteignent la cible dans le gabarit (mesure du 20/10/2026, L28c : le
 * comparateur mesure le rendu de Word, pas la forme XML — bordures effectives, saut de page
 * comme frontière de bloc, champs de fusion par nom, largeurs à ±0,5 pt), avec les seules
 * propriétés encore perdues, réelles et hors périmètre du comparateur :
 * - `11-styles-inline` (1) et `13-styles-nommes` (1) et `15-listes-numerotation` (1) : rien.
 * - `12-paragraphes` (0,990) : `paragraph.text` ×1 — `w:tab` lu comme un espace par
 *   l'import (« paragraphe\ttexte » → « paragraphe texte »).
 * - `14-tableaux-riches` (0,998) : `table.align` ×1 — centrage du tableau 2 (`w:jc center`)
 *   perdu par le writer.
 */
const TEMPLATE_AT_TARGET: Readonly<Record<string, readonly string[]>> = {
  '11-styles-inline.docx': [],
  '12-paragraphes.docx': ['paragraph.text'],
  '13-styles-nommes.docx': [],
  '14-tableaux-riches.docx': ['table.align'],
  '15-listes-numerotation.docx': [],
};

/**
 * Fixtures sous la cible dans le gabarit, avec le score mesuré le 20/10/2026 (L28c). Les
 * parties annexes du paquet sont toutes identiques à l'octet ; les pertes restantes
 * viennent du lecteur (`reader/**`) ou du writer (`writer/**`, `export/**`), hors
 * périmètre du comparateur :
 * - `16-sections` (0,756) : `section.count` 2 → 1, `section.pgSz`, `section.pgMar`,
 *   `section.cols`, `section.type`, `section.titlePg`, `header.*`, `footer.*` — l'import ne
 *   restitue que la dernière section (`layout`), le `w:sectPr` de la section 1 disparaît et
 *   ses en-têtes/pieds avec lui (les parties `header*.xml`/`footer*.xml` restent, mais
 *   référencées par la seule section restante).
 * - `17-objets-perdus` (0,944) : `paragraph.text` ×6 — espace final des paragraphes retiré
 *   à l'export (« Forme (wps:wsp sans texte) : » → « … : »), texte de la zone de texte
 *   réinjecté dans le paragraphe porteur, texte de l'équation (`x2+1=0`) absent.
 *
 * La valeur est un **plancher de non-régression** (score mesuré moins une marge), pas un
 * seuil : la cible reste `TEMPLATE_TARGET_SCORE`, assertée en `it.fails` jusqu'à ce que
 * ces lots corrigent le writer ou le lecteur. Quand une fixture atteint la cible, le test
 * `it.fails` échoue : la déplacer dans `TEMPLATE_AT_TARGET`.
 */
const TEMPLATE_BELOW_TARGET: Readonly<Record<string, number>> = {
  '16-sections.docx': 0.74,
  '17-objets-perdus.docx': 0.93,
};

/**
 * Document client dans le gabarit : 0,889 mesuré le 20/10/2026 (L28c ; 0,830 en L28b).
 * Pertes restantes, toutes réelles : `paragraph.text` ×21 (espaces finaux retirés à
 * l'export), `run.*` ×2 (runs réduits à un espace, retirés avec lui), `table.cellBorders`
 * ×8 (`w:tcBorders` à `nil` du document oubliés par le writer : la bordure du style
 * `Grilledutableau` réapparaît ; traits gris `#BFBFBF` réécrits en noir), `section.count`
 * 3 → 1 et `section.pgMar` (distance du pied 22,85 pt → 0), `run.runStyle` /
 * `run.underline` ajoutés sur un lien (`Lienhypertexte`). Toutes hors périmètre du
 * comparateur (lecteur, writer).
 */
const CLIENT_TEMPLATE_FLOOR = 0.869;

function fixture(name: string): ArrayBuffer {
  const bytes = readFileSync(join(DIR, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Import stylé puis export neuf avec `layout` : ce que l'export reconstruit sans le gabarit. */
async function roundTrip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const imported = await importDocx(buffer, { fidelity: 'styled' });
  const blob = await exportDocx(imported.html, { layout: imported.layout });
  return blob.arrayBuffer();
}

/** Import stylé puis export dans le gabarit (L27), sans modification du contenu. */
async function templateRoundTrip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const imported = await importDocx(buffer, { fidelity: 'styled' });
  const blob = await exportDocx(imported.html, {
    template: imported.template,
    layout: imported.layout,
  });
  return blob.arrayBuffer();
}

/** Rapports de l'aller-retour dans le gabarit, mémorisés : plusieurs tests lisent le même. */
const templateReports = new Map<string, Promise<FidelityReport>>();

function templateReport(name: string): Promise<FidelityReport> {
  let report = templateReports.get(name);
  if (!report) {
    const original = fixture(name);
    report = templateRoundTrip(original).then((result) => compareDocx(original, result));
    templateReports.set(name, report);
  }
  return report;
}

/** Parties changées hors ajouts (une image ou une numérotation ajoutée n'est pas une perte). */
function changedNotAdded(report: FidelityReport): readonly { path: string; summary: string }[] {
  return report.changedParts.filter((part) => part.summary !== 'ajoutée');
}

describe('compareDocx sur les fixtures de mise en page', () => {
  it.each(LAYOUT_FIXTURES)(
    '%s comparé à lui-même : score 1, toutes parties identiques',
    async (name) => {
      const buffer = fixture(name);
      const report = await compareDocx(buffer, buffer.slice(0));
      expect(report.score).toBe(1);
      expect(report.changedParts).toEqual([]);
      expect(report.identicalParts).toContain('word/styles.xml');
      expect(report.identicalParts).not.toContain('word/document.xml');
      expect(report.identicalParts).not.toContain('docProps/core.xml');
      expect(report.properties.every((p) => p.lost === 0)).toBe(true);
      expect(report.properties.some((p) => p.group === 'text')).toBe(true);
    },
  );

  it.each(LAYOUT_FIXTURES)('%s aller-retour sans gabarit : score cohérent', async (name) => {
    const original = fixture(name);
    const report = await compareDocx(original, await roundTrip(original));
    expect(report.score).toBeGreaterThanOrEqual(ROUNDTRIP_MIN_SCORE);
    expect(report.score).toBeLessThan(1);
    // L'export neuf réécrit styles.xml : la partie est forcément différente ou absente.
    expect(report.changedParts.some((part) => part.path === 'word/styles.xml')).toBe(true);
    // Le texte survit presque toujours ; les blocs coupés par un saut de page ou une
    // tabulation (cadratin à l'export) expliquent les quelques paragraphes désalignés.
    const text = report.properties.find((p) => p.name === 'paragraph.text');
    expect(text).toBeDefined();
    expect(text && text.kept / text.total).toBeGreaterThanOrEqual(0.7);
  });

  it.each(LAYOUT_FIXTURES)(
    '%s aller-retour dans le gabarit : parties annexes identiques à l’octet',
    async (name) => {
      const report = await templateReport(name);
      expect(changedNotAdded(report)).toEqual([]);
      expect(report.identicalParts).toContain('word/styles.xml');
      expect(report.identicalParts).toContain('word/settings.xml');
      expect(report.identicalParts).toContain('word/theme/theme1.xml');
      expect(report.properties.filter((p) => p.group === 'package-part' && p.lost > 0)).toEqual([]);
    },
  );

  it.each(Object.entries(TEMPLATE_AT_TARGET))(
    '%s aller-retour dans le gabarit : score >= 0,98, seules les pertes documentées',
    async (name, allowed) => {
      const report = await templateReport(name);
      expect(report.score).toBeGreaterThanOrEqual(TEMPLATE_TARGET_SCORE);
      const lost = report.properties.filter((p) => p.lost > 0).map((p) => p.name);
      expect(lost).toEqual(allowed);
    },
  );

  // Cible non atteinte, causes hors périmètre du comparateur : voir TEMPLATE_BELOW_TARGET.
  it.fails.each(Object.keys(TEMPLATE_BELOW_TARGET))(
    '%s aller-retour dans le gabarit : score >= 0,98 (TODO lecteur/writer)',
    async (name) => {
      const report = await templateReport(name);
      expect(report.score).toBeGreaterThanOrEqual(TEMPLATE_TARGET_SCORE);
    },
  );

  it.each(Object.entries(TEMPLATE_BELOW_TARGET))(
    '%s aller-retour dans le gabarit : pas de régression sous %d',
    async (name, floor) => {
      const report = await templateReport(name);
      expect(report.score).toBeGreaterThanOrEqual(floor);
      expect(report.score).toBeLessThan(TEMPLATE_TARGET_SCORE);
      // Les pertes sont dans le corps (texte, tableaux, sections), jamais dans les parties.
      const lostGroups = new Set(report.properties.filter((p) => p.lost > 0).map((p) => p.group));
      expect(lostGroups.has('package-part')).toBe(false);
      expect(lostGroups.size).toBeGreaterThan(0);
    },
  );

  it('13-styles-nommes modifié localement : seul paragraph.text diffère, une occurrence', async () => {
    const original = fixture('13-styles-nommes.docx');
    const imported = await importDocx(original, { fidelity: 'styled' });
    const before = 'Retour au paragraphe Normal';
    expect(imported.html).toContain(before);
    const html = imported.html.replace(before, 'Retour au paragraphe Final');
    const blob = await exportDocx(html, { template: imported.template, layout: imported.layout });
    const report = await compareDocx(original, await blob.arrayBuffer());

    const text = report.properties.find((p) => p.name === 'paragraph.text');
    expect(text?.total).toBe(8);
    expect(text?.lost).toBe(1);
    expect(text?.examples).toEqual([
      { where: 'paragraphe 8', expected: before, actual: 'Retour au paragraphe Final' },
    ]);
    // Le mot changé ne désaligne ni le paragraphe ni ses runs : rien d'autre n'est perdu.
    expect(report.properties.filter((p) => p.lost > 0).map((p) => p.name)).toEqual([
      'paragraph.text',
    ]);
    // Les parties hors corps du gabarit ressortent identiques.
    expect(report.changedParts).toEqual([]);
    expect(report.identicalParts).toEqual(
      expect.arrayContaining([
        'word/styles.xml',
        'word/numbering.xml',
        'word/settings.xml',
        'word/fontTable.xml',
        'word/theme/theme1.xml',
      ]),
    );
    // Un paragraphe sur huit modifié : le score reflète la modification (0,971), pas une perte.
    expect(report.score).toBeLessThan(1);
    expect(report.score).toBeGreaterThan(0.95);
  });

  it('17-objets-perdus : les objets non représentables sont listés', async () => {
    const buffer = fixture('17-objets-perdus.docx');
    const report = await compareDocx(buffer, buffer.slice(0));
    expect(report.lost.length).toBeGreaterThan(0);
    expect(report.lost.map((item) => item.kind)).toContain('textbox');
  });

  it('16-sections : deux sections, en-têtes et pieds comparés', async () => {
    const buffer = fixture('16-sections.docx');
    const report = await compareDocx(buffer, buffer.slice(0));
    const count = report.properties.find((p) => p.name === 'section.count');
    expect(count?.kept).toBe(1);
    expect(report.properties.some((p) => p.name === 'header.default.text')).toBe(true);
    expect(report.properties.some((p) => p.name === 'footer.default.text')).toBe(true);
    expect(report.properties.find((p) => p.name === 'section.pgSz')?.total).toBe(2);
  });
});

describe.skipIf(!existsSync(CLIENT))('compareDocx sur le document client', () => {
  function client(): ArrayBuffer {
    const bytes = readFileSync(CLIENT);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  let clientTemplateReport: Promise<FidelityReport> | undefined;

  function templateReportOfClient(): Promise<FidelityReport> {
    if (!clientTemplateReport) {
      const original = client();
      clientTemplateReport = templateRoundTrip(original).then((result) =>
        compareDocx(original, result),
      );
    }
    return clientTemplateReport;
  }

  it('comparé à lui-même : score 1', async () => {
    const buffer = client();
    const report = await compareDocx(buffer, buffer.slice(0));
    expect(report.score).toBe(1);
    expect(report.changedParts).toEqual([]);
  });

  it('aller-retour sans gabarit : ne plante pas, score mesuré', async () => {
    const original = client();
    const report = await compareDocx(original, await roundTrip(original));
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(1);
    if (process.env.ASTER_CLIENT_DOC_LOG) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(
        process.env.ASTER_CLIENT_DOC_LOG,
        `client fidelity score ${String(report.score)}\n${JSON.stringify(report.properties.map((p) => [p.name, p.total, p.kept]))}\n`,
      );
    }
  });

  it('aller-retour dans le gabarit : parties annexes identiques, pas de régression', async () => {
    const report = await templateReportOfClient();
    expect(changedNotAdded(report)).toEqual([]);
    expect(report.identicalParts).toEqual(
      expect.arrayContaining(['word/styles.xml', 'word/numbering.xml', 'word/footer1.xml']),
    );
    expect(report.score).toBeGreaterThanOrEqual(CLIENT_TEMPLATE_FLOOR);
    // Le texte reste très majoritairement conservé : les pertes sont des espaces finaux
    // et des champs de fusion réécrits, pas des paragraphes manquants.
    const text = report.properties.find((p) => p.name === 'paragraph.text');
    expect(text && text.kept / text.total).toBeGreaterThanOrEqual(0.75);
  });

  // Cible non atteinte, causes hors périmètre du comparateur : voir CLIENT_TEMPLATE_FLOOR.
  it.fails('aller-retour dans le gabarit : score >= 0,98 (TODO lecteur/writer)', async () => {
    const report = await templateReportOfClient();
    expect(report.score).toBeGreaterThanOrEqual(TEMPLATE_TARGET_SCORE);
  });
});
