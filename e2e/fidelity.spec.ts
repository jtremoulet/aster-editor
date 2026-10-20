import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import {
  collectPageErrors,
  downloadSize,
  downloadZip,
  editor,
  editorHost,
  fixturePath,
  fixtureZip,
  getHtml,
  hostCssVariable,
  importPlaygroundDocx,
  sameBytes,
  screenshot,
  setHtml,
  setPageView,
  toolbarTrigger,
  zipPart,
} from './fixtures';

/** Fixture de styles nommés : `Heading1`, `Citation` (bordure gauche), couleur directe verte. */
const STYLED_DOCX = '13-styles-nommes.docx';
/** Fixture d'objets non représentables : zone de texte, forme, équation, commentaire… */
const LOST_DOCX = '17-objets-perdus.docx';
/** Document client réel anonymisé, déposé à la main (absent du dépôt : scénario sauté). */
const CLIENT_DOCX = 'Modele_Demo_DER.docx';
const CLIENT_DOCX_PATH = fixturePath('docx', 'client', CLIENT_DOCX);

/** `#00b050` (couleur directe de la fixture 13) tel que Chromium le calcule. */
const GREEN_RGB = 'rgb(0, 176, 80)';

/**
 * Nombre de paragraphes pour dépasser quatre pages A4 en vue page (≈ 30 paragraphes d'une
 * ligne par page) : au moins trois coupures, avec de la marge.
 */
const LONG_PARAGRAPH_COUNT = 150;

/** Document long : `count` paragraphes numérotés, un saut de page optionnel après le 2e. */
function longDocument(count: number, breakAfterSecond = false): string {
  const paragraphs: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    paragraphs.push(`<p>Paragraphe ${index} — du texte pour remplir la page.</p>`);
    if (breakAfterSecond && index === 2) paragraphs.push('<hr data-page-break>');
  }
  return paragraphs.join('');
}

/** Éditeur principal de la page « Modèle » de la démo (les deux autres sont en-tête et pied). */
function demoMain(page: Page): Locator {
  return page.locator('aster-editor').first();
}

/**
 * Fidélité Word sur le playground vanilla (session 3) : import stylé, vue page et dialogue
 * « Mise en page », pagination approximative, export dans le gabarit, objets perdus,
 * document client.
 */
test.describe('Fidélité Word — playground', () => {
  // Projets `playground`, `playground-firefox` et `playground-webkit` (session 4, L47).
  test.skip(() => !test.info().project.name.startsWith('playground'), 'playground seulement');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('.aster-toolbar')).toBeVisible();
  });

  test("l'import stylé conserve styles nommés, bordure et couleur, et getHTML est idempotent", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, STYLED_DOCX);

    const content = editor(page);
    await expect(content.locator('h1[data-docx-style="Heading1"]').first()).toHaveText(
      'Fixture 13 — Styles nommés',
    );
    const citation = content.locator('p[data-docx-style="Citation"]').first();
    await expect(citation).toContainText('Paragraphe Citation');
    await expect(citation).toHaveCSS('border-left-style', 'solid');
    await expect(citation).toHaveCSS('border-left-color', 'rgb(128, 128, 128)');
    const green = content.locator('span', { hasText: 'couleur directe verte' }).first();
    await expect(green).toHaveCSS('color', GREEN_RGB);

    // Idempotence dans un vrai navigateur : relire le HTML produit ne le change pas.
    const first = await getHtml(page);
    expect(first).toContain('data-docx-style="Citation"');
    expect(first).toContain('border-left');
    expect(first).toContain('#00b050');
    await setHtml(page, first);
    expect(await getHtml(page)).toBe(first);
    await screenshot(page, 'fidelity-styled-import');
  });

  test('la vue page suit la mise en page importée et le dialogue « Mise en page »', async ({
    page,
  }) => {
    await importPlaygroundDocx(page, STYLED_DOCX);

    const root = editorHost(page);
    await expect(root).toHaveClass(/aster--page-view/);
    await expect.poll(() => hostCssVariable(page, '--aster-page-width')).toBe('210mm');
    await expect(root.locator('.aster-page-header')).toHaveCount(1);
    await expect(root.locator('.aster-page-footer')).toHaveCount(1);

    // Format Letter depuis le dialogue : la largeur de la feuille suit.
    await toolbarTrigger(page, 'Mise en page').click();
    const dialog = page.locator('.aster-page-layout');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.aster-page-layout__size')).toHaveValue('A4');
    await dialog.locator('.aster-page-layout__size').selectOption('Letter');
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => hostCssVariable(page, '--aster-page-width')).toBe('215.9mm');
    await expect(root).toHaveClass(/aster--page-view/);
    await screenshot(page, 'fidelity-page-view-letter');

    // Décocher « Vue page » retire la classe (et les variables) de l'hôte.
    await toolbarTrigger(page, 'Mise en page').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.aster-page-layout__size')).toHaveValue('Letter');
    await dialog.locator('.aster-page-layout__enabled').uncheck();
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(root).not.toHaveClass(/aster--page-view/);
    await expect.poll(() => hostCssVariable(page, '--aster-page-width')).toBe('');
  });

  test('la pagination pose des coupures, respecte le saut explicite et reste hors du HTML', async ({
    page,
  }) => {
    await setPageView(page, { layout: { page: { size: 'A4', orientation: 'portrait' } } });
    await expect(editorHost(page)).toHaveClass(/aster--page-view/);
    await setHtml(page, longDocument(LONG_PARAGRAPH_COUNT));

    const gaps = editor(page).locator('.aster-page-gap');
    await expect.poll(() => gaps.count()).toBeGreaterThanOrEqual(3);
    await expect(gaps.first()).toHaveAttribute('data-page-number', '2');
    await expect
      .poll(async () => Number(await hostCssVariable(page, '--aster-page-count')))
      .toBeGreaterThanOrEqual(3);
    await expect(gaps.first().locator('.aster-page-gap__number')).toHaveText(/^Page 2 sur \d+$/);

    // Saut de page explicite après le 2e paragraphe : une coupure juste après lui.
    await setHtml(page, longDocument(LONG_PARAGRAPH_COUNT, true));
    const forced = editor(page).locator('hr[data-page-break] + .aster-page-gap');
    await expect(forced).toHaveCount(1);
    await expect(forced).toHaveAttribute('data-page-number', '2');
    await expect(editor(page).locator('p').nth(1)).toHaveText(/^Paragraphe 2/);
    await expect.poll(() => gaps.count()).toBeGreaterThanOrEqual(4);
    const before = await gaps.count();
    const htmlBefore = await getHtml(page);
    expect(htmlBefore).not.toContain('aster-page-gap');
    await screenshot(page, 'fidelity-pagination');

    // Taper dans un paragraphe ne change ni les coupures ni le HTML (widgets jamais sérialisés).
    await editor(page).locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Hop');
    await expect(editor(page).locator('p').first()).toHaveText(/ Hop$/);
    await expect(gaps).toHaveCount(before);
    const htmlAfter = await getHtml(page);
    expect(htmlAfter).not.toContain('aster-page-gap');
    expect(htmlAfter).not.toContain('ProseMirror-widget');
    expect(htmlAfter.replace(' Hop', '')).toBe(htmlBefore);
  });

  test("l'export dans le gabarit conserve styles.xml à l'octet et le style Citation", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, STYLED_DOCX);

    const downloading = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('aster-playground.docx');
    await expect(page.locator('#out')).toContainText('exportDocx (gabarit)');

    const exported = await downloadZip(download);
    const original = await fixtureZip('docx', STYLED_DOCX);
    expect(
      sameBytes(
        await zipPart(exported, 'word/styles.xml'),
        await zipPart(original, 'word/styles.xml'),
      ),
    ).toBe(true);
    const document = Buffer.from(await zipPart(exported, 'word/document.xml')).toString('utf8');
    expect(document).toContain('<w:pStyle w:val="Citation"');
    expect(document).toContain('Paragraphe Citation');
  });

  test("l'import signale les objets perdus et garde le texte de la zone de texte", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, LOST_DOCX);

    const log = page.locator('#out');
    await expect(log).toContainText('object-lost');
    await expect(log).toContainText('"kind": "textbox"');
    await expect(log).toContainText('objet(s) non représentable(s)');
    await expect(editor(page)).toContainText('Texte dans la zone de texte');
    await expect(editor(page).locator('h1')).toContainText('Fixture 17 — Objets perdus');
  });

  test('document client : import sans erreur, 8 tables, 14 variables, pied conservé', async ({
    page,
  }) => {
    test.skip(!existsSync(CLIENT_DOCX_PATH), `fixture absente : ${CLIENT_DOCX_PATH}`);
    // Même bug lecteur que `variables.spec.ts` (champs de fusion) : dans Chromium, le
    // prétraitement double la déclaration XML des parties réécrites et le chemin stylé rend
    // un HTML vide (`object-lost (unknown) : parsererror`). Le chemin `semantic` rend bien
    // 8 tables et 14 noms de variables.
    const errors = collectPageErrors(page);

    await page.locator('#docx').setInputFiles(CLIENT_DOCX_PATH);
    await expect(page.locator('#out')).toContainText(`importDocx(${CLIENT_DOCX})`);
    await expect(page.locator('#out')).not.toContainText('importDocx — erreur');
    expect(errors).toEqual([]);

    await expect(editor(page).locator('table')).toHaveCount(8);
    const chips = editor(page).locator('.aster-variable');
    await expect.poll(() => chips.count()).toBeGreaterThanOrEqual(14);
    const names = new Set(
      await chips.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-name'))),
    );
    expect(names.size).toBe(14);

    const downloading = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloading;
    const exported = await downloadZip(download);
    const original = await fixtureZip('docx', 'client', CLIENT_DOCX);
    expect(
      sameBytes(
        await zipPart(exported, 'word/footer1.xml'),
        await zipPart(original, 'word/footer1.xml'),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
});

/**
 * Page « Modèle » de la démo Angular : exemple stylé (`16-sections.docx`), vue page avec
 * en-tête et pied, rapport de fidélité, édition de l'en-tête répercutée, export gabarit.
 */
test.describe('Fidélité Word — démo', () => {
  test.skip(() => test.info().project.name !== 'demo', 'démo seulement');

  test('/template : exemple stylé, vue page, rapport de fidélité, en-tête édité, export gabarit', async ({
    page,
  }) => {
    test.slow();
    await page.goto('/template');
    await expect(editor(page)).toBeVisible();

    const dropzone = page.locator('.demo-dropzone');
    // Même précaution que `demo.spec.ts` : le premier chargement du module Word sous
    // `ng serve` peut recharger la page en plein import, on relance tant que rien n'est importé.
    await expect(async () => {
      await dropzone.getByRole('button', { name: "Charger l'exemple stylé", exact: true }).click();
      await expect(dropzone).toContainText('Importé : 16-sections.docx', { timeout: 10_000 });
    }).toPass({ timeout: 45_000, intervals: [1_000] });
    await expect(page.locator('.demo-error')).toHaveCount(0);

    // Vue page cochée : en-tête et pied `default` de la section affichés dans les marges.
    const pageViewToggle = page.getByLabel('Vue page');
    await pageViewToggle.check();
    await expect(pageViewToggle).toBeChecked();
    const main = demoMain(page);
    await expect(main.locator('.aster--page-view')).toHaveCount(1);
    const header = main.locator('.aster-page-header');
    const footer = main.locator('.aster-page-footer');
    await expect(header).toBeVisible();
    await expect(header).toContainText('en-tête par défaut');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('pied par défaut');
    await expect(page.locator('.demo-layout-summary')).toContainText('Letter');

    // Rapport de fidélité : un score et au moins une propriété mesurée.
    await page.getByRole('button', { name: 'Rapport de fidélité' }).click();
    const report = page.locator('.demo-fidelity');
    await expect(report).toBeVisible({ timeout: 15_000 });
    // Score affiché en pourcentage (`scorePercent`), entouré des blancs du template Angular.
    await expect(report.locator('.demo-fidelity__score')).toHaveText(/^\s*\d{1,3}[.,]\d %\s*$/);
    await expect(report.locator('.demo-fidelity__table tbody tr').first()).toBeVisible();
    await expect(page.locator('.demo-error')).toHaveCount(0);
    await screenshot(page, 'fidelity-demo-template');

    // Éditer l'en-tête dans le panneau : `layoutChanged` → l'en-tête affiché change.
    const headerEditor = page
      .locator('.demo-header-footer .demo-field', { hasText: 'En-tête' })
      .locator('.ProseMirror');
    await expect(headerEditor).toContainText('en-tête par défaut');
    await headerEditor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' (édité)');
    await expect(headerEditor).toContainText('(édité)');
    await expect(header).toContainText('en-tête par défaut (édité)');
    await expect(footer).toContainText('pied par défaut');

    // Export dans le gabarit : un .docx non vide.
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger (gabarit)' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('modele-gabarit.docx');
    expect(await downloadSize(download)).toBeGreaterThan(1_000);
    await expect(page.locator('.demo-error')).toHaveCount(0);
  });
});
