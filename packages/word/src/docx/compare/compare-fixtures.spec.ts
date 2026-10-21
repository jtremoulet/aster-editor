import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../export/export-docx.js';
import { importDocx } from '../import-docx.js';
import { compareDocx } from './compare-docx.js';
import type { FidelityReport } from './types.js';

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
  '18-sections-triple.docx',
  '19-tabulations-bordures.docx',
];

/** Cible de l'aller-retour dans le gabarit (critère d'acceptation de la session 3). */
const TEMPLATE_TARGET_SCORE = 0.98;

/**
 * Part minimale du texte conservée par l'aller-retour sans gabarit (R30-03). On asserte
 * la propriété, pas un plancher de score : un résultat au corps vide score encore 0,3 à
 * 0,36 sur ces fixtures (`package-part`, `section` et `header-footer` restent à 1), ce
 * qu'un plancher global ne détectait pas.
 */
const ROUNDTRIP_MIN_TEXT_RATIO = 0.7;

/**
 * Fixtures qui atteignent la cible dans le gabarit (mesure du 21/10/2026 après L49 : le
 * comparateur résout les styles conditionnels de tableau comme le lecteur et compare
 * `w:jc` et `w:tblLook` — `model.ts`, `compare-tables.ts`), avec les seules propriétés
 * encore perdues :
 * - `11`, `12`, `13`, `14`, `15`, `16-sections`, `18-sections-triple` (1) : rien. La 14
 *   était à 0,988 (`table.borders` ×1, `table.cellBorders` ×4 : `spacePt: 0` d'un côté,
 *   rien ou 1 / 4 pt de l'autre) avant L45a, qui a cessé de comparer `w:space` sur les
 *   bordures de tableau et de cellule, où Word ne l'applique pas.
 * - `19-tabulations-bordures` (**1** depuis L49, 0,998 après L46, 0,919 avant, 0,893
 *   avant L45a) : rien. Le `w:tblLook` est relu en `data-docx-look`
 *   (`TableLayoutAttrs.look`), réécrit par le writer, et la greffe ne réécrit plus en
 *   direct le fond, le gras et les bordures que le style conditionnel du gabarit produit
 *   (`writer/table-look.ts`) : le tableau suit à nouveau son style dans Word. Avant L49,
 *   `table.conditional` ×1 : sans `w:tblLook`, Word appliquait `0x04A0` et activait
 *   `firstColumn` en plus de `firstRow`.
 */
const TEMPLATE_AT_TARGET: Readonly<Record<string, readonly string[]>> = {
  '11-styles-inline.docx': [],
  '12-paragraphes.docx': [],
  '13-styles-nommes.docx': [],
  '14-tableaux-riches.docx': [],
  '15-listes-numerotation.docx': [],
  '16-sections.docx': [],
  '18-sections-triple.docx': [],
  '19-tabulations-bordures.docx': [],
};

/**
 * Fixtures sous la cible dans le gabarit, avec le score mesuré le 21/10/2026 (inchangé
 * de L45a à L49). Les parties annexes du paquet sont toutes identiques à l'octet ; les
 * pertes restantes viennent du lecteur (`reader/**`) ou du writer (`writer/**`,
 * `export/**`), hors périmètre du comparateur :
 * - `17-objets-perdus` (0,972, inchangé) : `paragraph.text` ×3 — texte de la zone de texte
 *   réinjecté dans le paragraphe porteur, texte de l'équation (`x2+1=0`) absent.
 *
 * La valeur est un **plancher de non-régression** (score mesuré moins une marge), pas un
 * seuil : la cible reste `TEMPLATE_TARGET_SCORE`, assertée en `it.fails` jusqu'à ce que
 * ces lots corrigent le writer ou le lecteur. Quand une fixture atteint la cible, le test
 * `it.fails` échoue : la déplacer dans `TEMPLATE_AT_TARGET` (la 19 l'a rejoint avec L46).
 */
const TEMPLATE_BELOW_TARGET: Readonly<Record<string, number>> = {
  '17-objets-perdus.docx': 0.96,
};

/**
 * Document client dans le gabarit : **0,995** mesuré le 21/10/2026 après L45a, confirmé
 * après F42 à 00:36, après L46 et après L49 (ses tableaux n'ont pas de style conditionnel :
 * le comparateur étendu ne change rien, et le `w:tblLook` de Word est désormais relu et
 * réécrit tel quel ; 0,99 après L43, 0,889 en L28c, 0,830 en L28b) : la
 * cible de la session 3 est atteinte, les trois `w:sectPr` ressortent identiques à l'octet.
 * Pertes restantes, toutes réelles et hors périmètre du comparateur : `paragraph.text` ×2,
 * `run.runStyle` / `run.underline` ×1 sur un lien (`Lienhypertexte`), `table.cellBorders`
 * ×6 (traits gris `#bfbfbf` de côtés de cellules réécrits en noir sur un tableau, bordures
 * ajoutées sur une cellule d'un autre : lecteur ou writer). Les `table.borders` ×6 et deux
 * `table.cellBorders` (`spacePt`) ont disparu avec L45a. Le plancher est la cible elle-même.
 */
const CLIENT_TEMPLATE_FLOOR = 0.98;

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

/** Part du texte des paragraphes conservée (`paragraph.text` kept / total), `0` sans occurrence. */
function textKeptRatio(report: FidelityReport): number {
  const text = report.properties.find((p) => p.name === 'paragraph.text');
  return text && text.total > 0 ? text.kept / text.total : 0;
}

/** Le même paquet dont le corps est réduit à un paragraphe vide et son `w:sectPr` (preuve P4 de R30). */
async function emptyBody(original: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(original);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (xml === undefined) throw new Error('word/document.xml absent');
  const start = xml.lastIndexOf('<w:sectPr');
  const end = xml.indexOf('</w:sectPr>', start);
  const sectPr = start >= 0 && end >= 0 ? xml.slice(start, end + '</w:sectPr>'.length) : '';
  zip.file(
    'word/document.xml',
    xml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body><w:p/>${sectPr}</w:body>`),
  );
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
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

  it.each(LAYOUT_FIXTURES)('%s aller-retour sans gabarit : texte conservé à 70 %', async (name) => {
    const original = fixture(name);
    const report = await compareDocx(original, await roundTrip(original));
    expect(report.score).toBeLessThan(1);
    // L'export neuf réécrit styles.xml : la partie est forcément différente ou absente.
    expect(report.changedParts.some((part) => part.path === 'word/styles.xml')).toBe(true);
    // Le texte survit presque toujours ; les blocs coupés par un saut de page ou une
    // tabulation (cadratin à l'export) expliquent les quelques paragraphes désalignés.
    // C'est la propriété assertée, pas le score (R30-03) : voir le test suivant.
    expect(report.properties.some((p) => p.name === 'paragraph.text')).toBe(true);
    expect(textKeptRatio(report)).toBeGreaterThanOrEqual(ROUNDTRIP_MIN_TEXT_RATIO);
  });

  it.each(LAYOUT_FIXTURES)(
    '%s R30-03 : un résultat au corps vide passe un plancher de score à 0,3, pas la part de texte',
    async (name) => {
      const original = fixture(name);
      const report = await compareDocx(original, await emptyBody(original));
      // Preuve du relecteur : 11 → 0,364 ; 12, 13, 14 → 0,308 ; 17 → 0,364 (15 → 0,25, 16 → 0,167) :
      // les groupes `package-part`, `section` et `header-footer` restent à 1 sans aucun texte.
      expect(report.score).toBeGreaterThan(0.15);
      expect(report.score).toBeLessThan(0.4);
      if (name === '13-styles-nommes.docx') expect(report.score).toBeGreaterThanOrEqual(0.3);
      // La fixture 18 garde un paragraphe vide porteur de w:sectPr : le <w:p/> du corps vidé
      // s'aligne dessus (1/22), le reste du texte est perdu.
      expect(textKeptRatio(report)).toBeLessThanOrEqual(0.05);
      expect(textKeptRatio(report)).toBeLessThan(ROUNDTRIP_MIN_TEXT_RATIO);
    },
  );

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

  it('18-sections-triple : trois sections conservées dans le gabarit, en-têtes compris', async () => {
    const report = await templateReport('18-sections-triple.docx');
    expect(report.score).toBe(1);
    expect(report.properties.find((p) => p.name === 'section.count')?.lost).toBe(0);
    expect(report.properties.find((p) => p.name === 'section.pgSz')?.total).toBe(3);
    expect(report.properties.filter((p) => p.group === 'header-footer' && p.lost > 0)).toEqual([]);
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

  it('aller-retour sans gabarit : ne plante pas, texte conservé à 70 %', async () => {
    const original = client();
    const report = await compareDocx(original, await roundTrip(original));
    expect(report.score).toBeLessThan(1);
    expect(textKeptRatio(report)).toBeGreaterThanOrEqual(ROUNDTRIP_MIN_TEXT_RATIO);
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
    expect(textKeptRatio(report)).toBeGreaterThanOrEqual(0.75);
  });

  it('aller-retour dans le gabarit : score >= 0,98, trois sections conservées', async () => {
    const report = await templateReportOfClient();
    expect(report.score).toBeGreaterThanOrEqual(TEMPLATE_TARGET_SCORE);
    expect(report.properties.find((p) => p.name === 'section.count')?.lost).toBe(0);
    expect(report.properties.find((p) => p.name === 'section.pgMar')?.lost).toBe(0);
    const lost = report.properties.filter((p) => p.lost > 0).map((p) => p.name);
    expect(lost).toEqual(['paragraph.text', 'run.runStyle', 'run.underline', 'table.cellBorders']);
  });
});
