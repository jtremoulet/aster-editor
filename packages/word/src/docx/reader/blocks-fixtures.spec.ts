import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx';
import { childNamed } from '../preprocess/xml-utils';
import { normalizeHtml } from '../testing/dom';
import { openPackage } from './package';
import { readDocumentLang } from './sections';
import { createTestContext, parseXml } from './testing-blocks';
import type { ConverterContext } from './types';

const FIXTURES = join(import.meta.env.ASTER_FIXTURES, 'docx');
const CLIENT = join(FIXTURES, 'client', 'Modele_Demo_DER.docx');

function fixture(name: string): ArrayBuffer {
  const buffer = readFileSync(name.startsWith('client') ? CLIENT : join(FIXTURES, `${name}.docx`));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function expected(name: string): string {
  return readFileSync(join(FIXTURES, 'expected', `${name}.html`), 'utf8');
}

/**
 * Conversion du corps d'une fixture avec le harnais de L25 (paragraphes en texte brut,
 * objets perdus inline signalés) : vérifie la structure indépendamment de L24.
 */
async function renderWithHarness(
  buffer: ArrayBuffer,
): Promise<{ html: string; ctx: ConverterContext }> {
  const pkg = await openPackage(buffer, parseXml);
  const main = await pkg.part(pkg.mainPart);
  const body = main ? childNamed(main.documentElement, 'body') : null;
  if (!body) throw new Error('corps introuvable');
  const ctx = await createTestContext(pkg);
  const blocks = await ctx.convert.blocks(body, ctx);
  return { html: ctx.convert.render(blocks, ctx), ctx };
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

describe('fixtures 14-17 en mode styled', () => {
  it('14-tableaux-riches : largeurs, bordures par côté, fusions, imbrication, attendu figé', async () => {
    const result = await importDocx(fixture('14-tableaux-riches'), { fidelity: 'styled' });
    const html = result.html;
    expect(result.warnings).toEqual([]);
    expect(result.lost).toEqual([]);
    expect(count(html, /<table/g)).toBe(3);
    // Tableau principal : 100 %, bordures extérieures (droite `none` omise), en-tête en th avec colwidth.
    expect(html).toContain(
      '<table style="width: 100%; border-top: 3pt solid #000000; border-bottom: 1pt solid #000000; border-left: 1pt solid #000000"><tbody><tr><th colwidth="160" style="border-right: 0.5pt solid #000000; border-bottom: 0.5pt solid #000000; background-color: #d9e2f3; padding: 4pt 4pt 4pt 4pt">',
    );
    expect(count(html, /<th /g)).toBe(3);
    expect(html).toContain('<td colspan="2" style="');
    expect(html).toContain('<td rowspan="2" style="');
    expect(html).toContain('vertical-align: middle');
    // Ligne 4 : la cellule de continuation est omise, il reste deux cellules.
    expect(html).toMatch(
      /<tr><td style="[^"]*">(?:<p[^>]*>Marges de cellule 4 pt<\/p>)<\/td><td style="[^"]*">(?:<p[^>]*>Cellule C4<\/p>)<\/td><\/tr>/,
    );
    // Tableau imbriqué suivi d'un paragraphe vide conservé.
    expect(html).toMatch(
      /Tableau imbriqué :<\/p><table style="width: 100%;[^"]*"><tbody><tr><td colwidth="80"/,
    );
    expect(html).toMatch(/Imbriqué B2<\/p><\/td><\/tr><\/tbody><\/table><p[^>]*><\/p><\/td>/);
    // Tableau 300 pt, style TableGrid résolu par L24 (bordures 0,5 pt), colwidth 200.
    expect(html).toContain(
      '<table style="width: 300pt; border-top: 0.5pt solid #000000; border-right: 0.5pt solid #000000; border-bottom: 0.5pt solid #000000; border-left: 0.5pt solid #000000" data-docx-style="TableGrid"><tbody><tr><td colwidth="200"',
    );
    expect(html).not.toContain('margin-left: auto');
    expect(normalizeHtml(html)).toBe(normalizeHtml(expected('14-tableaux-riches')));
  });

  it('15-listes-numerotation : formats, niveaux, redémarrage, continuation, liste en cellule', async () => {
    const result = await importDocx(fixture('15-listes-numerotation'), { fidelity: 'styled' });
    const html = result.html;
    expect(result.warnings).toEqual([]);
    expect(html).toMatch(
      /<ol data-docx-num-id="2"><li><p[^>]*>Liste décimale : premier<\/p><\/li><li><p[^>]*>Liste décimale : deuxième<\/p><\/li><\/ol>/,
    );
    expect(html).toMatch(/<ol type="a" data-docx-num-id="3"><li>/);
    expect(html).toMatch(/<ol type="I" data-docx-num-id="4"><li>/);
    expect(html).toMatch(
      /<ul data-bullet="•" data-docx-num-id="5"><li><p[^>]*>Puce niveau 1<\/p><ul data-bullet="–" data-docx-num-id="5"><li><p[^>]*>Puce niveau 2<\/p><ul data-bullet="▪" data-docx-num-id="5"><li><p[^>]*>Puce niveau 3<\/p><\/li><\/ul><\/li><\/ul><\/li><li><p[^>]*>Puce niveau 1 bis<\/p><\/li><\/ul>/,
    );
    // Nouvelle instance (`w:num` 6 avec startOverride) : repart à 1, sans `start`.
    expect(html).toMatch(/<ol data-docx-num-id="6"><li><p[^>]*>Liste redémarrée : premier/);
    expect(html).toMatch(
      /<ol data-docx-num-id="7"><li><p[^>]*>Niveau 1 imbriqué<\/p><ol data-docx-num-id="7"><li><p[^>]*>Niveau 2 imbriqué<\/p><ol data-docx-num-id="7"><li><p[^>]*>Niveau 3 imbriqué<\/p><\/li><\/ol><\/li><li><p[^>]*>Niveau 2 imbriqué bis<\/p><\/li><\/ol><\/li><li><p[^>]*>Niveau 1 imbriqué bis<\/p><\/li><\/ol>/,
    );
    // Paragraphe de continuation rattaché au même item.
    expect(html).toMatch(
      /<li><p[^>]*>Item avec deux paragraphes : premier paragraphe<\/p><p[^>]*>Second paragraphe du même item \(sans numéro, même retrait\)<\/p><\/li><li>/,
    );
    expect(html).toMatch(/<td colwidth="301"[^>]*><ul data-bullet="•" data-docx-num-id="5"><li>/);
    expect(count(html, /<ol/g)).toBe(8);
    expect(count(html, /<ul/g)).toBe(4);
    expect(normalizeHtml(html)).toBe(normalizeHtml(expected('15-listes-numerotation')));
  });

  it('16-sections : layout exact de la dernière section, en-têtes default/even, pied, langue', async () => {
    const buffer = fixture('16-sections');
    const result = await importDocx(buffer, { fidelity: 'styled' });
    expect(result.warnings).toEqual([]);
    expect(result.layout.page).toEqual({
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
    });
    expect(result.layout.columns).toBe(2);
    expect(Object.keys(result.layout.headers ?? {}).sort()).toEqual(['default', 'even', 'first']);
    expect(result.layout.headers?.default?.html).toMatch(
      /^<p[^>]*>Section 2 — en-tête par défaut<\/p>$/,
    );
    expect(result.layout.headers?.even?.html).toMatch(
      /^<p[^>]*>Section 2 — en-tête page paire<\/p>$/,
    );
    expect(Object.keys(result.layout.footers ?? {}).sort()).toEqual(['default', 'first']);
    expect(result.layout.footers?.default?.html).toMatch(
      /^<p[^>]*>Section 2 — pied par défaut<\/p>$/,
    );
    // Les sections héritent des en-têtes et pieds précédents : la première page différente de la
    // section 1 et son en-tête 'first' survivent à la section 2, qui ne les redéclare pas.
    expect(result.layout.titlePage).toBe(true);
    expect(result.layout.lang).toBe('fr-FR');
    expect(await readDocumentLang(await openPackage(buffer, parseXml))).toBe('fr-FR');
    expect(normalizeHtml(result.html)).toBe(normalizeHtml(expected('16-sections')));
  });

  it('17-objets-perdus : zone de texte et forme signalées, texte conservé, aucun plantage', async () => {
    const result = await importDocx(fixture('17-objets-perdus'), { fidelity: 'styled' });
    expect(result.html).toContain(
      'Zone de texte (w:drawing + wps:txbx) : Texte dans la zone de texte',
    );
    // Zone de texte et forme via images.ts, le reste via runs.ts (detectLostInline) : chaque
    // objet est signalé une fois, avec un avertissement object-lost par objet.
    const kinds = result.lost.map((lost) => lost.kind);
    expect(kinds.slice(0, 2)).toEqual(['textbox', 'shape']);
    for (const kind of ['equation', 'comment', 'revision', 'field', 'embedded-object']) {
      expect(kinds).toContain(kind);
    }
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(result.lost[0]).toEqual({
      kind: 'textbox',
      where: 'body',
      text: 'Texte dans la zone de texte',
      detail: 'Zone de texte 1',
    });
    expect(result.warnings.filter((w) => w.code === 'object-lost')).toHaveLength(
      result.lost.length,
    );
    expect(normalizeHtml(result.html)).toBe(normalizeHtml(expected('17-objets-perdus')));
  });

  it('17-objets-perdus avec le harnais : chaque objet inline est détecté, une fois', async () => {
    const { html, ctx } = await renderWithHarness(fixture('17-objets-perdus'));
    expect(ctx.lost.map((lost) => [lost.kind, lost.detail])).toEqual([
      ['textbox', 'Zone de texte 1'],
      ['shape', 'Ellipse 2'],
      ['equation', 'équation'],
      ['comment', 'commentaire 0'],
      ['revision', 'révisions (w:ins / w:del) non suivies'],
      ['field', 'champ DATE'],
      ['embedded-object', 'objet Package'],
    ]);
    expect(ctx.lost[2]?.text).toBe('x2+1=0');
    expect(html).toContain(
      'Révision insérée (w:ins) : texte inséré ; révision supprimée (w:del) : </p>',
    );
    expect(html).toContain('Champ DATE (w:fldSimple) : 20/10/2026</p>');
  });
});

describe.skipIf(!existsSync(CLIENT))('document client Modele_Demo_DER.docx', () => {
  it('s’importe en styled : 8 tableaux, A4 avec marges, texte inséré conservé', async () => {
    const result = await importDocx(fixture('client'), { fidelity: 'styled' });
    expect(count(result.html, /<table/g)).toBe(8);
    expect(result.layout.page?.size).toBe('A4');
    expect(result.layout.page?.margins).toEqual({
      topMm: 12.7,
      rightMm: 12.7,
      bottomMm: 20,
      leftMm: 12.7,
      headerMm: 12.49,
      footerMm: 0,
    });
    // `tblW auto` → pas de largeur ; `tblW dxa` → points ; style Grilledutableau posé.
    expect(count(result.html, /<table data-docx-style="Grilledutableau">/g)).toBeGreaterThanOrEqual(
      1,
    );
    expect(result.html).toContain('<table style="width: 524.5pt;');
    expect(result.html).toContain('Disclaimer');
    expect(result.html).not.toContain('<ol');
    expect(count(result.html, /<ul /g)).toBe(4);
    expect(result.warnings.filter((w) => w.code !== 'object-lost')).toEqual([]);
  });

  it('révisions w:ins signalées une seule fois (kind revision) sans perdre le texte inséré', async () => {
    const { html, ctx } = await renderWithHarness(fixture('client'));
    expect(ctx.lost.filter((lost) => lost.kind === 'revision')).toHaveLength(1);
    expect(html).toContain('Disclaimer');
    expect(count(html, /<table/g)).toBe(8);
  });
});
