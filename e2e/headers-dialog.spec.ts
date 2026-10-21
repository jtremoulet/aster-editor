import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import {
  editor,
  editorHost,
  fixturePath,
  fixtureZip,
  importPlaygroundDocx,
  sameBytes,
  sectionGaps,
  toolbarTrigger,
  zipPart,
} from './fixtures.js';

/**
 * En-têtes et pieds éditables dans le dialogue « Mise en page » (session 5, L54, retour
 * POC n° 8) sur le playground vanilla : la fixture à trois sections (`sections.spec.ts`),
 * l'en-tête de la section 2 modifié via le dialogue, la coupure « Section 2 » qui le
 * reflète, puis l'export dans le gabarit avec la mise en page relue (`getLayout()`) : une
 * partie d'en-tête régénérée pour la section 2, les parties d'origine à l'octet.
 */

/** Fixture à trois sections : voir `sections.spec.ts` et `fixtures/docx/README.md`. */
const TRIPLE_DOCX = '18-sections-triple.docx';

/** Parties de la fixture 18 que l'export dans le gabarit laisse intactes à l'octet. */
const PRESERVED_PARTS = [
  'word/header1.xml',
  'word/header2.xml',
  'word/header3.xml',
  'word/header4.xml',
  'word/footer1.xml',
  'word/footer2.xml',
  'word/styles.xml',
];

/** Un jeu d'en-têtes ou de pieds tel que `getLayout()` le rend (vue partielle). */
interface HeaderFooterSetLike {
  default?: { html: string };
  first?: { html: string };
  even?: { html: string };
}

/** Mise en page relue sur le playground (seuls les champs vérifiés ici sont typés). */
interface LayoutLike {
  headers?: HeaderFooterSetLike;
  footers?: HeaderFooterSetLike;
  titlePage?: boolean;
  sections?: {
    headers?: HeaderFooterSetLike;
    footers?: HeaderFooterSetLike;
    titlePage?: boolean;
  }[];
}

/** `window.aster` et `window.asterExportDocx` du playground, pour la mise en page et l'export. */
interface PlaygroundWindowL54 {
  aster?: { editor: { getHTML(): string; getLayout(): LayoutLike | null } };
  asterExportDocx?: (html: string, options: Record<string, unknown>) => Promise<Blob>;
}

/** Paragraphe du corps repéré par son texte (les paragraphes de la fixture sont uniques). */
function paragraph(page: Page, text: string): Locator {
  return editor(page).locator('p', { hasText: text }).first();
}

/** Mise en page relue depuis le core (`editor.getLayout()`), telle que le dialogue l'a écrite. */
async function getLayout(page: Page): Promise<LayoutLike> {
  return page.evaluate(() => {
    const aster = (window as unknown as PlaygroundWindowL54).aster;
    if (!aster) throw new Error('window.aster is not available: playground not mounted');
    return aster.editor.getLayout() ?? {};
  });
}

/**
 * Export dans le gabarit de la fixture avec le document et la mise en page **courants** du
 * playground (le bouton « Exporter » du playground repart de la mise en page de l'import,
 * pas de celle du dialogue) : les octets du gabarit font l'aller-retour en base64.
 */
async function exportInTemplate(page: Page, fixture: string): Promise<JSZip> {
  const template = await readFile(fixturePath('docx', fixture));
  const exported = await page.evaluate(async (templateBase64) => {
    const w = window as unknown as PlaygroundWindowL54;
    if (!w.aster || !w.asterExportDocx) {
      throw new Error('window.aster / asterExportDocx indisponibles : playground non monté');
    }
    const bytes = Uint8Array.from(atob(templateBase64), (char) => char.charCodeAt(0));
    const blob = await w.asterExportDocx(w.aster.editor.getHTML(), {
      title: 'L54',
      template: bytes.buffer,
      layout: w.aster.editor.getLayout(),
    });
    const out = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of out) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, template.toString('base64'));
  return JSZip.loadAsync(Buffer.from(exported, 'base64'));
}

/** Chemins des parties d'en-tête d'une archive, triés. */
function headerParts(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((path) => /^word\/header\d+\.xml$/.test(path))
    .sort();
}

test.describe('En-têtes dans le dialogue « Mise en page » — playground', () => {
  test.skip(() => !test.info().project.name.startsWith('playground'), 'playground seulement');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('.aster-toolbar')).toBeVisible();
  });

  test("éditer l'en-tête de la section 2 met à jour la coupure « Section 2 » et l'export dans le gabarit", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, TRIPLE_DOCX);
    const gaps = sectionGaps(page);
    await expect.poll(() => gaps.count()).toBeGreaterThanOrEqual(1);
    const opening = gaps.first();
    await expect(opening).toHaveAttribute('data-section', '2');
    // « Section 2 » (default) ou « Section 2 paire » (even, si la vue page distingue les
    // pages paires, L52) : dans les deux cas l'en-tête de la section 2.
    await expect(opening.locator('.aster-page-gap__header')).toContainText('Section 2');

    // Curseur dans la section 2 : le dialogue montre ses en-têtes (default « Section 2 »,
    // even « Section 2 paire » avec la case cochée), pas de première page.
    await paragraph(page, 'Section 2, paragraphe 1').click();
    await toolbarTrigger(page, 'Mise en page').click();
    const dialog = page.locator('.aster-page-layout');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.aster-page-layout__section')).toHaveText('Section 2 sur 3');
    const header = dialog.locator('.aster-page-layout__headers-default');
    await expect(header).toHaveAttribute('contenteditable', 'true');
    await expect(header).toHaveText('Section 2');
    await expect(dialog.locator('.aster-page-layout__even-pages')).toBeChecked();
    await expect(dialog.locator('.aster-page-layout__headers-even')).toHaveText('Section 2 paire');
    await expect(dialog.locator('.aster-page-layout__title-page')).not.toBeChecked();
    await expect(dialog.locator('.aster-page-layout__headers-first')).toBeHidden();

    // Saisie réelle au clavier : tout remplacer, Entrée ouvre un second paragraphe. Les pages
    // paires sont décochées : l'en-tête `default` vaut alors pour toutes les pages de la
    // section, quelle que soit la parité de la page que la coupure ouvre.
    await header.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Nouvel en-tête');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Seconde ligne');
    await expect(dialog).toBeVisible();
    await dialog.locator('.aster-page-layout__even-pages').uncheck();
    await expect(dialog.locator('.aster-page-layout__headers-even')).toBeHidden();
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog).toBeHidden();

    // La coupure qui ouvre la section 2 affiche le nouveau texte ; l'hôte garde « Section 1 ».
    await expect(opening.locator('.aster-page-gap__header')).toContainText('Nouvel en-tête');
    await expect(opening.locator('.aster-page-gap__header')).toContainText('Seconde ligne');
    // L'hôte garde l'en-tête de la section 1 (« Première page » si la vue page rend le
    // `first` de sa page de titre, L52), jamais celui de la section 2.
    await expect(editorHost(page).locator('.aster-page-header')).toHaveText(
      /^(Section 1|Première page)$/,
    );
    await expect(editorHost(page).locator('.aster-page-footer')).toHaveText('Pied 3');

    // La mise en page relue : section 2 seule modifiée (even retiré), premier niveau =
    // section 3 (invariant), pas de titlePage.
    // Chromium garde le `<p>` importé (et son `data-docx-style`) en remplaçant son texte.
    const layout = await getLayout(page);
    expect(layout.sections?.[1]?.headers?.default?.html).toMatch(
      /^<p(?: data-docx-style="Normal")?>Nouvel en-tête<\/p><p>Seconde ligne<\/p>$/,
    );
    expect(layout.sections?.[1]?.headers?.even).toBeUndefined();
    expect(layout.sections?.[1]?.titlePage).toBeUndefined();
    expect(layout.sections?.[0]?.headers?.default?.html).toContain('Section 1');
    expect(layout.sections?.[0]?.titlePage).toBe(true);
    expect(layout.footers?.default?.html).toContain('Pied 3');
    expect(layout.headers?.default?.html ?? '').not.toContain('Nouvel en-tête');

    // Export dans le gabarit : trois `w:sectPr`, les parties d'origine à l'octet, une partie
    // d'en-tête régénérée qui porte le nouveau texte et que le `w:sectPr` de la section 2
    // référence comme en-tête `default`.
    const exported = await exportInTemplate(page, TRIPLE_DOCX);
    const original = await fixtureZip('docx', TRIPLE_DOCX);
    const document = Buffer.from(await zipPart(exported, 'word/document.xml')).toString('utf8');
    const sectPrs = document.match(/<w:sectPr[\s>][\s\S]*?<\/w:sectPr>/g) ?? [];
    expect(sectPrs).toHaveLength(3);
    for (const part of PRESERVED_PARTS) {
      expect(
        sameBytes(await zipPart(exported, part), await zipPart(original, part)),
        `${part} identique à l'octet`,
      ).toBe(true);
    }
    const added = headerParts(exported).filter((path) => !headerParts(original).includes(path));
    expect(added).toHaveLength(1);
    const regenerated = Buffer.from(await zipPart(exported, added[0] ?? '')).toString('utf8');
    expect(regenerated).toContain('Nouvel en-tête');
    expect(regenerated).toContain('Seconde ligne');
    const reference = /<w:headerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"/.exec(
      sectPrs[1] ?? '',
    );
    const rels = Buffer.from(await zipPart(exported, 'word/_rels/document.xml.rels')).toString(
      'utf8',
    );
    const target = new RegExp(`Id="${reference?.[1] ?? ''}"[^>]*Target="([^"]+)"`).exec(rels);
    expect(`word/${target?.[1] ?? ''}`).toBe(added[0]);
  });
});
