import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  downloadSize,
  editor,
  getHtml,
  getResolvedHtml,
  importPlaygroundDocx,
  runCommand,
  screenshot,
  setHtml,
  toolbarTrigger,
} from './fixtures';

/** Fixture `{{client.nom}}`… : 11 puces, 9 noms distincts (voir `fixtures/docx/README.md`). */
const BRACES_DOCX = '08-variables-braces.docx';
const BRACES_CHIPS = 11;
const BRACES_NAMES = [
  'client.nom',
  'prestataire',
  'client.representant',
  'date_signature',
  'prestation',
  'duree_jours',
  'montant_ht',
  'tva',
  'lieu',
];

/** Fixture champs de fusion Word (`w:fldSimple` + `w:fldChar`) : 5 puces. */
const MERGEFIELDS_DOCX = '09-variables-mergefields.docx';
const MERGEFIELDS_CHIPS = 5;

/** Image SVG 1×1 en data URI : tolérée par la politique d'images, sans requête réseau. */
const PIXEL_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');

/** Puce de variable (NodeView du core) dans le contenu éditable, par nom. */
function chip(page: Page, name: string): Locator {
  return editor(page).locator(`.aster-variable[data-name="${name}"]`);
}

/**
 * Variables de document et composants de session 2 sur le playground vanilla : import de
 * modèles Word à variables, panneau Variables (`#vars-*`), suggestion `{{`, widget de
 * toolbar, dialogue de puce, exports, bulles de lien et d'image, menu `/`, sommaire.
 */
test.describe('Playground vanilla — variables et parité', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('.aster-toolbar')).toBeVisible();
  });

  test("l'import de 08-variables-braces.docx crée les puces et liste les noms", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, BRACES_DOCX);

    const chips = editor(page).locator('.aster-variable');
    await expect(chips).toHaveCount(BRACES_CHIPS);
    await expect(chips.first()).toHaveClass(/aster-variable--unresolved/);
    await expect(editor(page).locator('h1 .aster-variable')).toHaveText('client.nom');

    // `#vars-names` n'est rafraîchi que par les boutons du panneau, pas par l'import.
    await page.locator('#vars-resolve').click();
    const names = page.locator('#vars-names');
    await expect(names).toContainText('présentes :');
    for (const name of BRACES_NAMES) {
      await expect(names).toContainText(name);
    }
    expect(await getHtml(page)).toContain('data-aster-variable="client.nom"');
    await screenshot(page, 'playground-variables');
  });

  test('setValues() depuis le panneau résout les puces avec le texte des valeurs', async ({
    page,
  }) => {
    await importPlaygroundDocx(page, BRACES_DOCX);
    await page
      .locator('#vars')
      .fill('{ "client.nom": "ACME SAS", "prestataire": "Nebula", "tva": "20" }');
    await page.locator('#vars-apply').click();

    await expect(chip(page, 'client.nom').first()).toHaveClass(/aster-variable--resolved/);
    await expect(chip(page, 'client.nom').first()).toHaveText('ACME SAS');
    await expect(chip(page, 'prestataire')).toHaveText('Nebula');
    await expect(chip(page, 'tva')).toHaveText('20');
    // Les variables sans valeur restent non résolues et affichent leur nom.
    await expect(chip(page, 'lieu')).toHaveClass(/aster-variable--unresolved/);
    await expect(chip(page, 'lieu')).toHaveText('lieu');
    await expect(page.locator('#out')).toContainText('"client.nom": "ACME SAS"');
  });

  test("getHTML({ variables: 'resolve' }) substitue les valeurs sans data-aster-variable", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, BRACES_DOCX);
    await page.locator('#vars').fill('{ "client.nom": "ACME SAS", "prestataire": "Nebula" }');
    await page.locator('#vars-apply').click();
    await expect(chip(page, 'client.nom').first()).toHaveText('ACME SAS');

    const resolved = await getResolvedHtml(page);
    expect(resolved).not.toContain('data-aster-variable');
    expect(resolved).toContain('<h1>Contrat de prestation — ACME SAS</h1>');
    expect(resolved).toContain('<strong>Nebula</strong>');
    // Sans valeur, la variable garde sa syntaxe canonique.
    expect(resolved).toContain('{{lieu}}');
    // Le mode par défaut conserve les puces.
    expect(await getHtml(page)).toContain('data-aster-variable="client.nom"');

    await page.locator('#vars-resolve').click();
    await expect(page.locator('#out')).toContainText("getHTML({ variables: 'resolve' })");
    await expect(page.locator('#out')).toContainText('Contrat de prestation — ACME SAS');
  });

  test('taper {{cli ouvre la suggestion et Entrée insère la puce', async ({ page }) => {
    // `variables.list()` ne propose que les variables présentes dans le document ou
    // déclarées : on tape dans le document importé, sans le remplacer.
    await importPlaygroundDocx(page, BRACES_DOCX);
    const paragraph = editor(page).locator('p', { hasText: 'Date de signature' });
    await expect(chip(page, 'client.nom')).toHaveCount(2);
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' {{cli');

    const panel = page.locator('.aster-variable-suggestion');
    await expect(panel).toBeVisible();
    const options = panel.getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await expect(options.first()).toContainText('{{client.nom}}');
    await expect(editor(page)).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Enter');
    await expect(panel).toBeHidden();
    await expect(chip(page, 'client.nom')).toHaveCount(3);
    await expect(paragraph.locator('.aster-variable[data-name="client.nom"]')).toHaveCount(1);
    await expect(paragraph).not.toContainText('{{cli');
    expect(await getHtml(page)).toContain(
      '. <span data-aster-variable="client.nom">{{client.nom}}</span></p>',
    );
  });

  test('le widget Variables de la toolbar insère la puce choisie', async ({ page }) => {
    await importPlaygroundDocx(page, BRACES_DOCX);
    const paragraph = editor(page).locator('p', { hasText: 'Date de signature' });
    await expect(chip(page, 'prestataire')).toHaveCount(1);
    await paragraph.click();
    await page.keyboard.press('End');

    await toolbarTrigger(page, 'Variables').click();
    const menu = page.locator('.aster-variable-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.aster-variable-menu__item')).toHaveCount(BRACES_NAMES.length);
    const entry = menu.locator('.aster-variable-menu__item[data-name="prestataire"]');
    await expect(entry).toContainText('{{prestataire}}');
    await expect(entry.locator('.aster-variable-entry__unresolved')).toHaveText('Sans valeur');
    await entry.click();

    await expect(menu).toBeHidden();
    await expect(chip(page, 'prestataire')).toHaveCount(2);
    await expect(paragraph.locator('.aster-variable[data-name="prestataire"]')).toHaveCount(1);
    expect(await getHtml(page)).toContain(
      '.<span data-aster-variable="prestataire">{{prestataire}}</span></p>',
    );
    // Curseur sur la puce → déclencheur « enfoncé » (variable.remove actif).
    await expect(toolbarTrigger(page, 'Variables')).toHaveAttribute('aria-pressed', 'true');
  });

  test('double-clic sur une puce ouvre le dialogue, la valeur saisie résout la puce', async ({
    page,
  }) => {
    await setHtml(
      page,
      '<p>Client : <span data-aster-variable="client.nom" data-label="Nom du client">{{client.nom}}</span></p>',
    );
    const target = chip(page, 'client.nom');
    await expect(target).toHaveText('Nom du client');
    await target.dblclick();

    const dialog = page.locator('.aster-variable-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-label', 'Modifier la variable');
    await expect(dialog.locator('.aster-variable-entry__name')).toHaveText('{{client.nom}}');
    await expect(dialog.locator('.aster-variable-dialog__label')).toHaveValue('Nom du client');
    await dialog.locator('.aster-variable-dialog__value').fill('ACME SAS');
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(target).toHaveClass(/aster-variable--resolved/);
    await expect(target).toHaveText('ACME SAS');
    await expect(target).toHaveAttribute('title', '{{client.nom}}');
    expect(await getResolvedHtml(page)).toContain('<p>Client : ACME SAS</p>');
  });

  test("l'import de 09-variables-mergefields.docx convertit les 5 champs de fusion", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, MERGEFIELDS_DOCX);

    await expect(editor(page).locator('.aster-variable')).toHaveCount(MERGEFIELDS_CHIPS);
    for (const name of ['Nom', 'NumeroFacture', 'Montant', 'DateEcheance', 'Signataire']) {
      await expect(chip(page, name)).toHaveCount(1);
    }
    const html = await getHtml(page);
    expect(html).toContain('<h1>Courrier de relance</h1>');
    expect(html).toContain('data-aster-variable="DateEcheance"');
    expect(html).not.toContain('MERGEFIELD');
  });

  test("l'export « champs » télécharge un .docx non vide", async ({ page }) => {
    await importPlaygroundDocx(page, BRACES_DOCX);
    await page.locator('#vars').fill('{ "client.nom": "ACME SAS" }');
    await page.locator('#vars-apply').click();
    await expect(chip(page, 'client.nom').first()).toHaveText('ACME SAS');

    const downloading = page.waitForEvent('download');
    await page.locator('#vars-export-fields').click();
    const download = await downloading;

    expect(download.suggestedFilename()).toBe('aster-variables-fields.docx');
    expect(await downloadSize(download)).toBeGreaterThan(1_000);
    await expect(page.locator('#out')).toContainText('exportDocx variables=fields');
  });

  test("l'export « résolu » télécharge un .docx non vide", async ({ page }) => {
    await importPlaygroundDocx(page, BRACES_DOCX);

    const downloading = page.waitForEvent('download');
    await page.locator('#vars-export-resolved').click();
    const download = await downloading;

    expect(download.suggestedFilename()).toBe('aster-variables-resolve.docx');
    expect(await downloadSize(download)).toBeGreaterThan(1_000);
    await expect(page.locator('#out')).toContainText('exportDocx variables=resolve');
  });

  test('la bulle de lien apparaît quand le curseur entre dans un lien', async ({ page }) => {
    await setHtml(page, '<p>Voir <a href="https://example.com/aster">le site</a> maintenant</p>');
    const bubble = page.locator('.aster-link-bubble');
    await expect(bubble).toBeHidden();

    await editor(page).locator('a').click();
    await expect(bubble).toBeVisible();
    const url = bubble.locator('.aster-bubble__url');
    await expect(url).toHaveText('https://example.com/aster');
    await expect(url).toHaveAttribute('href', 'https://example.com/aster');
    await expect(bubble.getByRole('button', { name: 'Modifier', exact: true })).toBeEnabled();

    // Curseur hors du lien → bulle cachée.
    await page.keyboard.press('End');
    await expect(bubble).toBeHidden();

    // « Supprimer le lien » depuis la bulle retire le <a>.
    await editor(page).locator('a').click();
    await expect(bubble).toBeVisible();
    await bubble.getByRole('button', { name: 'Supprimer le lien', exact: true }).click();
    await expect(bubble).toBeHidden();
    await expect(editor(page).locator('a')).toHaveCount(0);
    expect(await getHtml(page)).toBe('<p>Voir le site maintenant</p>');
  });

  test("la bulle d'image apparaît quand l'image est sélectionnée", async ({ page }) => {
    await setHtml(page, '<p></p>');
    await editor(page).click();
    expect(
      await runCommand(page, 'image.insert', { src: PIXEL_SVG, alt: 'pixel', width: 120 }),
    ).toBe(true);
    const image = editor(page).locator('figure.aster-image img');
    await expect(image).toHaveAttribute('width', '120');

    await image.click();
    const bubble = page.locator('.aster-image-bubble');
    await expect(bubble).toBeVisible();
    await expect(bubble.locator('.aster-image-bubble__align')).toHaveCount(3);

    await bubble.locator('.aster-image-bubble__align--center').click();
    await expect(bubble.locator('.aster-image-bubble__align--center')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // `getHTML()` sérialise l'image en `<img>` nu, l'alignement en `data-align`.
    expect(await getHtml(page)).toMatch(/<img[^>]*data-align="center"/);
  });

  test('le menu / filtré sur « tab » insère un tableau 3 × 3', async ({ page }) => {
    await setHtml(page, '<p></p>');
    await editor(page).click();
    await page.keyboard.type('/tab');

    const menu = page.locator('.aster-slash-menu');
    await expect(menu).toBeVisible();
    const options = menu.getByRole('option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('Tableau 3 × 3');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    // Validation au clic : le plugin `/` est enregistré après les keymaps de Tiptap, donc
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    const table = editor(page).locator('table');
    await expect(table).toHaveCount(1);
    await expect(table.locator('tr')).toHaveCount(3);
    await expect(table.locator('th')).toHaveCount(3);
    await expect(table.locator('td')).toHaveCount(6);
    await expect(editor(page)).not.toContainText('/tab');
  });

  test('le sommaire liste les titres et un clic déplace la sélection', async ({ page }) => {
    await setHtml(
      page,
      '<h1>Premier</h1><p>Un paragraphe.</p><h2>Second</h2><p>Un autre.</p><h3>Troisième</h3>',
    );
    await editor(page).locator('h1').click();

    await toolbarTrigger(page, 'Sommaire').click();
    const outline = page.locator('.aster-outline');
    await expect(outline).toBeVisible();
    const items = outline.locator('.aster-outline__item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveClass(/aster-outline__item--h1/);
    await expect(items.nth(1)).toHaveClass(/aster-outline__item--h2/);
    await expect(items.nth(1)).toHaveText('Second');

    await items.nth(1).click();
    await expect(outline).toBeHidden();
    // `scrollToHeading` focalise l'éditeur et place le curseur au début du titre.
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('X');
    await expect(editor(page).locator('h2')).toHaveText('XSecond');
    await expect(editor(page).locator('h1')).toHaveText('Premier');
  });
});
