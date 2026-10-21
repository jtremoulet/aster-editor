import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  clickInto,
  downloadZip,
  editor,
  editorHost,
  fixturePath,
  fixtureZip,
  getHtml,
  getText,
  hostCssVariable,
  importPlaygroundDocx,
  inlineCssVariable,
  placeCursorAtEnd,
  runCommand,
  sameBytes,
  screenshot,
  sectionBreaks,
  sectionGaps,
  setHtml,
  toolbarTrigger,
  zipPart,
} from './fixtures';

/**
 * Fixture à trois sections (session 4) : section 1 A4 portrait (en-tête « Section 1 »),
 * section 2 Letter paysage ouverte par un saut `nextPage` (en-tête « Section 2 », un
 * tableau), section 3 A4 portrait ouverte par un saut `continuous` (pied « Pied 3 »).
 */
const TRIPLE_DOCX = '18-sections-triple.docx';
/** Fixture de taquets de tabulation (left, center, right, decimal) et de bordures. */
const TABS_DOCX = '19-tabulations-bordures.docx';

/**
 * Parties de la fixture 18 que l'export dans le gabarit doit rendre à l'octet : les quatre
 * en-têtes (`header1` « Section 1 », `header2` « Première page », `header3` « Section 2 »,
 * `header4` « Section 2 paire »), les deux pieds (`footer1` `PAGE`, `footer2` « Pied 3 »)
 * et les styles (`fixtures/docx/README.md`).
 */
const PRESERVED_PARTS = [
  'word/header1.xml',
  'word/header2.xml',
  'word/header3.xml',
  'word/header4.xml',
  'word/footer1.xml',
  'word/footer2.xml',
  'word/styles.xml',
];

/** Paragraphe du corps repéré par son texte (les paragraphes de la fixture sont uniques). */
function paragraph(page: Page, text: string): Locator {
  return editor(page).locator('p', { hasText: text }).first();
}

/** Texte de la cellule qui contient le curseur, `null` si la sélection est hors d'une cellule. */
async function focusedCellText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const anchor = document.getSelection()?.anchorNode ?? null;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest('td, th')?.textContent ?? null;
  });
}

/**
 * Sections et tabulations sur le playground vanilla (session 4) : import d'un document à
 * trois sections, vue page par section (hôte = section 1, variables de la section
 * suivante sur chaque saut, coupure de section), dialogue « Mise en page » par section,
 * idempotence et commandes `section.*`, nœud `tab`, export dans le gabarit. Tourne sur
 * Chromium, Firefox et WebKit (projets `playground*`).
 */
test.describe('Sections — playground', () => {
  test.skip(() => !test.info().project.name.startsWith('playground'), 'playground seulement');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('.aster-toolbar')).toBeVisible();
  });

  test("l'import de trois sections pose deux sauts, la feuille de la section 1 et une coupure de section", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, TRIPLE_DOCX);

    // Deux sauts numérotés dans l'ordre : le corps marque la fin des sections 1 et 2.
    const breaks = sectionBreaks(page);
    await expect(breaks).toHaveCount(2);
    await expect(breaks.nth(0)).toHaveAttribute('data-section-break', '1');
    await expect(breaks.nth(1)).toHaveAttribute('data-section-break', '2');

    // Hôte = section 1 (A4 portrait) ; chaque saut porte les variables de la section qu'il ouvre.
    const root = editorHost(page);
    await expect(root).toHaveClass(/aster--page-view/);
    await expect.poll(() => hostCssVariable(page, '--aster-page-width')).toBe('210mm');
    await expect.poll(() => hostCssVariable(page, '--aster-page-width-max')).toBe('279.4mm');
    await expect.poll(() => inlineCssVariable(breaks.nth(0), '--aster-page-width')).toBe('279.4mm');
    await expect
      .poll(() => inlineCssVariable(breaks.nth(0), '--aster-page-height'))
      .toBe('215.9mm');
    await expect(breaks.nth(0)).toHaveAttribute('data-section-start', 'nextPage');
    await expect.poll(() => inlineCssVariable(breaks.nth(1), '--aster-page-width')).toBe('210mm');
    await expect(breaks.nth(1)).toHaveAttribute('data-section-start', 'continuous');

    // La coupure qui ouvre la section 2 : libellé, en-tête de la section 2, pied de la section 1.
    const gaps = sectionGaps(page);
    await expect.poll(() => gaps.count()).toBeGreaterThanOrEqual(1);
    const opening = gaps.first();
    await expect(opening).toHaveAttribute('data-section', '2');
    await expect(opening.locator('.aster-page-gap__section')).toHaveText(
      'Section 2 · Letter paysage',
    );
    const sectionHeader = opening.locator('.aster-page-gap__header');
    await expect(sectionHeader).toBeVisible();
    // Page 2, paire : la section 2 distingue pages paires et impaires (L52, variante `even`).
    await expect(sectionHeader).toHaveText('Section 2 paire');
    await expect.poll(() => inlineCssVariable(opening, '--aster-page-width')).toBe('279.4mm');

    // En-tête de l'hôte = page 1 de la section 1, `titlePage` : sa variante `first` (L52) ;
    // pied de l'hôte = dernière section du corps.
    await expect(root.locator('.aster-page-header')).toHaveText('Première page');
    await expect(root.locator('.aster-page-footer')).toHaveText('Pied 3');
    await screenshot(page, `sections-import-${test.info().project.name}`);
  });

  test('le dialogue « Mise en page » édite la section du curseur sans toucher aux autres', async ({
    page,
  }) => {
    await importPlaygroundDocx(page, TRIPLE_DOCX);
    const breaks = sectionBreaks(page);
    await expect(breaks).toHaveCount(2);
    await expect.poll(() => inlineCssVariable(breaks.nth(0), '--aster-page-width')).toBe('279.4mm');

    // Curseur dans la section 2 : le dialogue affiche sa page (Letter paysage).
    await paragraph(page, 'Section 2, paragraphe 1').click();
    await toolbarTrigger(page, 'Mise en page').click();
    const dialog = page.locator('.aster-page-layout');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.aster-page-layout__section')).toHaveText('Section 2 sur 3');
    await expect(dialog.locator('.aster-page-layout__size')).toHaveValue('Letter');
    await expect(dialog.locator('.aster-page-layout__radio[value="landscape"]')).toBeChecked();

    // Passer la section 2 en A4 portrait : seul le saut 1 (qui l'ouvre) change.
    await dialog.locator('.aster-page-layout__size').selectOption('A4');
    await dialog.locator('.aster-page-layout__radio[value="portrait"]').check();
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => inlineCssVariable(breaks.nth(0), '--aster-page-width')).toBe('210mm');
    await expect.poll(() => inlineCssVariable(breaks.nth(0), '--aster-page-height')).toBe('297mm');
    await expect(breaks.nth(0)).toHaveAttribute('data-section-start', 'nextPage');
    await expect.poll(() => inlineCssVariable(breaks.nth(1), '--aster-page-width')).toBe('210mm');
    await expect.poll(() => hostCssVariable(page, '--aster-page-width')).toBe('210mm');
    await expect.poll(() => hostCssVariable(page, '--aster-page-margin-top')).toBe('20mm');
    // Plus aucune section plus large que A4 : la feuille revient à 210 mm.
    await expect.poll(() => hostCssVariable(page, '--aster-page-width-max')).toBe('210mm');
    await expect(sectionGaps(page).first().locator('.aster-page-gap__section')).toHaveText(
      'Section 2 · A4 portrait',
    );
    // Section 1 `titlePage` : l'hôte (page 1) garde l'en-tête `first` (L52).
    await expect(editorHost(page).locator('.aster-page-header')).toHaveText('Première page');

    // Rouvrir depuis la section 3 : « Section 3 sur 3 », A4 portrait, inchangée.
    await paragraph(page, 'Section 3, paragraphe 1').click();
    await toolbarTrigger(page, 'Mise en page').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.aster-page-layout__section')).toHaveText('Section 3 sur 3');
    await expect(dialog.locator('.aster-page-layout__size')).toHaveValue('A4');
    await expect(dialog.locator('.aster-page-layout__radio[value="portrait"]')).toBeChecked();
    await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('getHTML est idempotent, section.insertBreak renumérote 1..3 et undo revient à deux sauts', async ({
    page,
  }) => {
    await importPlaygroundDocx(page, TRIPLE_DOCX);
    const breaks = sectionBreaks(page);
    await expect(breaks).toHaveCount(2);

    // Le HTML ne porte que `data-section-break` : ni variables, ni widgets de pagination.
    const first = await getHtml(page);
    expect(first).toContain('<hr data-section-break="1">');
    expect(first).toContain('<hr data-section-break="2">');
    expect(first).not.toContain('data-section-start');
    expect(first).not.toContain('--aster-page');
    expect(first).not.toContain('aster-page-gap');
    // Chargement dans l'historique (`emit` par défaut) : `setHTML` ferme son groupe (L50),
    // le `undo` plus bas n'annule que le saut, sans se grouper avec ce chargement.
    await setHtml(page, first);
    expect(await getHtml(page)).toBe(first);
    await expect(breaks).toHaveCount(2);
    await expect(breaks.nth(1)).toHaveAttribute('data-section-break', '2');

    // Un saut au milieu de la section 1 : trois sauts 1, 2, 3 dans l'ordre du document,
    // et chaque NodeView suit la section positionnelle qu'il ouvre désormais. La commande
    // part de `page.evaluate` dans la même frame que le clic : on attend que l'état ait
    // relu la sélection du DOM (`clickInto`, voir `selectionBlockText`).
    await clickInto(page, paragraph(page, 'Section 1, paragraphe 2'));
    expect(await runCommand(page, 'section.insertBreak')).toBe(true);
    await expect(breaks).toHaveCount(3);
    await expect(breaks.nth(0)).toHaveAttribute('data-section-break', '1');
    await expect(breaks.nth(1)).toHaveAttribute('data-section-break', '2');
    await expect(breaks.nth(2)).toHaveAttribute('data-section-break', '3');
    await expect(
      paragraph(page, 'Section 1, paragraphe 2').locator('xpath=following-sibling::*[1]'),
    ).toHaveAttribute('data-section-break', '1');
    await expect(breaks.nth(0)).toHaveAttribute('data-section-start', 'nextPage');
    await expect(breaks.nth(1)).toHaveAttribute('data-section-start', 'continuous');
    await expect.poll(() => inlineCssVariable(breaks.nth(0), '--aster-page-width')).toBe('279.4mm');
    await expect.poll(() => inlineCssVariable(breaks.nth(1), '--aster-page-width')).toBe('210mm');
    const inserted = await getHtml(page);
    expect(inserted).toContain('<hr data-section-break="3">');

    // Annuler : deux sauts, HTML identique à l'import.
    expect(await runCommand(page, 'undo')).toBe(true);
    await expect(breaks).toHaveCount(2);
    await expect(breaks.nth(0)).toHaveAttribute('data-section-break', '1');
    await expect(breaks.nth(1)).toHaveAttribute('data-section-break', '2');
    await expect.poll(() => getHtml(page)).toBe(first);
  });

  test('tabulations : import des taquets, Tab insère dans un paragraphe, navigue dans une cellule, Backspace retire', async ({
    page,
  }) => {
    await importPlaygroundDocx(page, TABS_DOCX);

    // Les taquets lus : position, alignement ; `getText()` rend `\t`, le HTML est figé.
    const tabs = editor(page).locator('span[data-tab]');
    await expect.poll(() => tabs.count()).toBeGreaterThanOrEqual(9);
    await expect(tabs.first()).toHaveAttribute('data-stop', '56.7pt');
    await expect(
      editor(page).locator('span[data-tab][data-stop="226.8pt"][data-align="center"]'),
    ).toHaveCount(1);
    await expect(
      editor(page).locator('span[data-tab][data-stop="283.5pt"][data-align="decimal"]'),
    ).toHaveCount(1);
    expect(await getText(page)).toContain('\t');
    const html = await getHtml(page);
    expect(html).toContain(
      '<span data-tab="" data-stop="56.7pt"></span>gauche<span data-tab=""></span>',
    );
    expect(html).toContain('<span data-tab="" data-stop="396.9pt" data-align="right"></span>');

    // Tab en fin de paragraphe : un `span[data-tab]` sans taquet, retiré d'une frappe Backspace.
    const target = paragraph(page, 'Tabulation sans taquet défini');
    const targetText = await target.textContent();
    await expect(target.locator('span[data-tab]')).toHaveCount(1);
    await placeCursorAtEnd(page, target);
    await page.keyboard.press('Tab');
    await expect(target.locator('span[data-tab]')).toHaveCount(2);
    await expect(target.locator('span[data-tab]').last()).not.toHaveAttribute('data-stop');
    expect(await getHtml(page)).toContain(
      'texte après la tabulation par défaut<span data-tab=""></span></p>',
    );
    await page.keyboard.press('Backspace');
    await expect(target.locator('span[data-tab]')).toHaveCount(1);
    await expect(target).toHaveText(targetText ?? '');
    expect(await getHtml(page)).toBe(html);

    // Tab dans une cellule reste la navigation de tableau : pas de tabulation insérée.
    const table = editor(page).locator('table').first();
    const cells = table.locator('td, th');
    const secondCellText = await cells.nth(1).textContent();
    await placeCursorAtEnd(page, cells.first().locator('p').first());
    await page.keyboard.press('Tab');
    await expect.poll(() => focusedCellText(page)).toBe(secondCellText);
    await expect(table.locator('span[data-tab]')).toHaveCount(0);
    expect(await getHtml(page)).toBe(html);
  });

  test("l'export dans le gabarit écrit trois w:sectPr et rend les en-têtes de section à l'octet", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, TRIPLE_DOCX);
    await expect(sectionBreaks(page)).toHaveCount(2);

    const downloading = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('aster-playground.docx');
    await expect(page.locator('#out')).toContainText('exportDocx (gabarit)');

    const exported = await downloadZip(download);
    const original = await fixtureZip('docx', TRIPLE_DOCX);
    const document = Buffer.from(await zipPart(exported, 'word/document.xml')).toString('utf8');
    expect(document.match(/<w:sectPr[\s>]/g)).toHaveLength(3);
    expect(document).toContain('Section 3, paragraphe 4');
    expect(document).toContain('Section 2, cellule A1');
    for (const part of PRESERVED_PARTS) {
      expect(
        sameBytes(await zipPart(exported, part), await zipPart(original, part)),
        `${part} identique à l'octet`,
      ).toBe(true);
    }
  });
});

/**
 * Page « Modèle » de la démo Angular : la fixture 18 chargée par l'input de fichier, vue
 * page cochée → sections rendues par le composant (saut aux variables de la section
 * suivante, coupure de section, en-tête et pied de l'hôte).
 */
test.describe('Sections — démo', () => {
  test.skip(() => test.info().project.name !== 'demo', 'démo seulement');

  test('/template : la fixture à trois sections rend une coupure de section en vue page', async ({
    page,
  }) => {
    test.slow();
    await page.goto('/template');
    await expect(editor(page)).toBeVisible();

    const dropzone = page.locator('.demo-dropzone');
    // Même précaution que `demo.spec.ts` : le premier chargement du module Word sous
    // `ng serve` peut recharger la page en plein import, on relance tant que rien n'est importé.
    await expect(async () => {
      await dropzone.locator('input[type="file"]').setInputFiles(fixturePath('docx', TRIPLE_DOCX));
      await expect(dropzone).toContainText(`Importé : ${TRIPLE_DOCX}`, { timeout: 10_000 });
    }).toPass({ timeout: 45_000, intervals: [1_000] });
    await expect(page.locator('.demo-error')).toHaveCount(0);

    const main = page.locator('aster-editor').first();
    const breaks = main.locator('hr[data-section-break]');
    await expect(breaks).toHaveCount(2);

    const pageViewToggle = page.getByLabel('Vue page');
    await pageViewToggle.check();
    await expect(pageViewToggle).toBeChecked();
    await expect(main.locator('.aster--page-view')).toHaveCount(1);
    await expect.poll(() => inlineCssVariable(breaks.nth(0), '--aster-page-width')).toBe('279.4mm');
    await expect(breaks.nth(0)).toHaveAttribute('data-section-start', 'nextPage');
    await expect(breaks.nth(1)).toHaveAttribute('data-section-start', 'continuous');

    const gaps = main.locator('.aster-page-gap--section');
    await expect.poll(() => gaps.count()).toBeGreaterThanOrEqual(1);
    await expect(gaps.first().locator('.aster-page-gap__section')).toHaveText(
      'Section 2 · Letter paysage',
    );
    // Page 2, paire → variante `even` ; page 1 de la section 1 `titlePage` → `first` (L52).
    await expect(gaps.first().locator('.aster-page-gap__header')).toHaveText('Section 2 paire');
    await expect(main.locator('.aster-page-header')).toHaveText('Première page');
    await expect(main.locator('.aster-page-footer')).toHaveText('Pied 3');
    await expect(page.locator('.demo-error')).toHaveCount(0);
    await screenshot(page, 'sections-demo-template');
  });
});
