import { expect, test } from '@playwright/test';
import {
  editor,
  fixturePath,
  getHtml,
  pasteHtml,
  readFixture,
  runCommand,
  screenshot,
  setHtml,
  toolbarButton,
  toolbarTrigger,
} from './fixtures';

/** Couleur de fond `--aster-surface` du thème night (`packages/ui/themes/night.css`). */
const NIGHT_SURFACE = 'rgb(23, 26, 33)';

/** Image SVG 1×1 en data URI : tolérée par la politique d'images, sans requête réseau. */
const PIXEL_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');

/**
 * Parcours utilisateur sur le playground vanilla (`scripts/vanilla-playground`), sans
 * framework : core + ui + word dans un vrai Chromium.
 */
test.describe('Playground vanilla', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('.aster-toolbar')).toBeVisible();
  });

  test('saisie puis gras au clavier (Control+B) produit un <strong>', async ({ page }) => {
    await setHtml(page, '<p></p>');
    await editor(page).click();
    await page.keyboard.type('Bonjour ');
    await page.keyboard.press('Control+B');
    await page.keyboard.type('monde');
    await expect(toolbarButton(page, 'bold')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+B');
    await page.keyboard.type(' entier');

    await expect(editor(page).locator('p strong')).toHaveText('monde');
    await expect(editor(page).locator('p')).toHaveText('Bonjour monde entier');
    expect(await getHtml(page)).toContain('<p>Bonjour <strong>monde</strong> entier</p>');
    await screenshot(page, 'playground-home');
  });

  test('le menu Titres transforme le paragraphe courant en <h2>', async ({ page }) => {
    await setHtml(page, '<p>Un titre</p>');
    await editor(page).click();

    const trigger = toolbarTrigger(page, 'Style de texte');
    await expect(trigger).toContainText('Paragraphe');
    await trigger.click();
    await page.locator('.aster-menu--heading .aster-menu__item--h2').click();

    await expect(editor(page).locator('h2')).toHaveText('Un titre');
    await expect(trigger).toContainText('Titre 2');
    expect(await getHtml(page)).toContain('<h2>Un titre</h2>');
  });

  test('liste à puces via le bouton, Enter puis Tab imbrique le second item', async ({ page }) => {
    await setHtml(page, '<p></p>');
    await editor(page).click();
    await toolbarButton(page, 'bulletList').click();
    await expect(toolbarButton(page, 'bulletList')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.type('Un');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Deux');

    await expect(editor(page).locator('ul > li > ul > li > p')).toHaveText('Deux');
    expect(await getHtml(page)).toMatch(
      /<ul[^>]*><li[^>]*><p>Un<\/p><ul[^>]*><li[^>]*><p>Deux<\/p><\/li><\/ul><\/li><\/ul>/,
    );
  });

  test('le dialogue de lien pose un <a href> sur la sélection', async ({ page }) => {
    await setHtml(page, '<p>Aster</p>');
    await editor(page).click();
    await page.keyboard.press('Control+A');

    await toolbarTrigger(page, 'Insérer un lien').click();
    const dialog = page.locator('.aster-link-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[type="url"]').fill('https://example.com/aster');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();

    await expect(dialog).toBeHidden();
    const link = editor(page).locator('a[href="https://example.com/aster"]');
    await expect(link).toHaveText('Aster');
    expect(await getHtml(page)).toContain('href="https://example.com/aster"');
  });

  test('la grille insère une table 3×2 et Tab passe de cellule en cellule', async ({ page }) => {
    await setHtml(page, '<p></p>');
    await editor(page).click();

    await toolbarTrigger(page, 'Insérer un tableau').click();
    const grid = page.locator('.aster-table-picker__grid');
    await expect(grid).toBeVisible();
    await grid.locator('[data-row="2"][data-col="3"]').click();

    const table = editor(page).locator('table');
    await expect(table.locator('tr')).toHaveCount(2);
    await expect(table.locator('th')).toHaveCount(3);
    await expect(table.locator('td')).toHaveCount(3);

    await page.keyboard.type('A');
    await page.keyboard.press('Tab');
    await page.keyboard.type('B');
    await expect(table.locator('th').nth(0)).toHaveText('A');
    await expect(table.locator('th').nth(1)).toHaveText('B');
  });

  test('coller depuis Word 365 reconstruit une liste imbriquée sans style mso-', async ({
    page,
  }) => {
    await setHtml(page, '<p></p>');
    const wordHtml = await readFixture('word-html', 'word-365-list-nested.html');
    await pasteHtml(page, wordHtml);

    await expect(editor(page).locator('ul > li > ul > li > p').first()).toHaveText('Pommes');
    const html = await getHtml(page);
    expect(html).toContain('Liste de courses');
    expect(html).toMatch(/<ul[^>]*><li[^>]*><p>Fruits<\/p><ul[^>]*><li[^>]*><p>Pommes/);
    expect(html).not.toContain('mso-');
    expect(html).not.toContain('MsoListParagraph');
  });

  test("l'import d'un .docx remplace le document par son contenu", async ({ page }) => {
    await page.locator('#docx').setInputFiles(fixturePath('docx', '01-headings-lists.docx'));

    await expect(editor(page).locator('h1')).toHaveText('Titre principal');
    await expect(page.locator('#out')).toContainText('importDocx(01-headings-lists.docx)');
    // Chemin stylé (L29) : le titre porte `data-docx-style` et un `<span>` de couleur / taille.
    expect(await getHtml(page)).toMatch(
      /<h1[^>]*data-docx-style="Heading1"[^>]*>(?:<span[^>]*>)?Titre principal/,
    );
  });

  test('le thème night change data-theme et la couleur de fond', async ({ page }) => {
    const root = page.locator('.aster');
    await expect(root).toHaveAttribute('data-theme', 'light');
    const lightBackground = await root.evaluate((node) => getComputedStyle(node).backgroundColor);

    await page.locator('#theme').selectOption('night');

    await expect(root).toHaveAttribute('data-theme', 'night');
    await expect(root).toHaveCSS('background-color', NIGHT_SURFACE);
    expect(lightBackground).not.toBe(NIGHT_SURFACE);
    await screenshot(page, 'playground-night');
  });

  test('la lecture seule désactive les boutons et fige le contenu', async ({ page }) => {
    await page.locator('#readonly').check();

    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    await expect(toolbarButton(page, 'bold')).toBeDisabled();
    await expect(page.locator('.aster-toolbar [data-command]:not([disabled])')).toHaveCount(0);

    await page.locator('#readonly').uncheck();
    await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
    await expect(toolbarButton(page, 'bold')).toBeEnabled();
  });

  test('ArrowRight déplace le focus entre les items actifs de la toolbar', async ({ page }) => {
    const items = page.locator('.aster-toolbar [data-toolbar-item]:not([disabled])');
    await expect(items.first()).toHaveAttribute('tabindex', '0');

    await items.first().focus();
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowRight');

    await expect(items.nth(1)).toBeFocused();
    await expect(items.nth(1)).toHaveAttribute('tabindex', '0');
    await expect(items.first()).toHaveAttribute('tabindex', '-1');

    await page.keyboard.press('Home');
    await expect(items.first()).toBeFocused();
  });

  test('annuler après une frappe restaure le texte précédent', async ({ page }) => {
    const title = editor(page).locator('h1');
    await expect(title).toHaveText('Aster playground');
    await expect(toolbarButton(page, 'undo')).toBeDisabled();

    await title.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Hop');
    await expect(title).toHaveText('Aster playground Hop');

    await expect(toolbarButton(page, 'undo')).toBeEnabled();
    await toolbarButton(page, 'undo').click();
    await expect(title).toHaveText('Aster playground');
    await expect(toolbarButton(page, 'redo')).toBeEnabled();
  });

  test('Control+F ouvre la recherche et surligne les correspondances', async ({ page }) => {
    await editor(page).click();
    await page.keyboard.press('Control+F');

    const panel = page.locator('.aster-search-panel');
    await expect(panel).toBeVisible();
    const query = panel.locator('.aster-search-panel__query');
    await expect(query).toBeFocused();
    await query.fill('playground');

    await expect(editor(page).locator('.aster-search-match')).toHaveCount(1);
    await expect(panel.locator('.aster-search-panel__count')).toContainText('1 / 1');

    await panel.locator('.aster-search-panel__close').click();
    await expect(panel).toBeHidden();
    await expect(editor(page).locator('.aster-search-match')).toHaveCount(0);
  });

  test('la vue source affiche le HTML et applique les modifications au retour', async ({
    page,
  }) => {
    const button = page.locator('.aster-source-button');
    await button.click();

    const source = page.locator('textarea.aster-source');
    await expect(source).toBeVisible();
    await expect(source).toHaveValue(/<h1>Aster playground<\/h1>/);
    await expect(page.locator('.aster')).toHaveClass(/aster--source/);
    await expect(toolbarButton(page, 'bold')).toBeDisabled();

    await source.fill('<p>Depuis la source</p>');
    await button.click();

    await expect(source).toBeHidden();
    await expect(editor(page)).toHaveText('Depuis la source');
    expect(await getHtml(page)).toBe('<p>Depuis la source</p>');
  });

  test('le plein écran ajoute aster--fullscreen et Échap le quitte', async ({ page }) => {
    const root = page.locator('.aster');
    const button = page.locator('.aster-fullscreen-button');
    await button.click();
    await expect(root).toHaveClass(/aster--fullscreen/);
    await expect(button).toHaveAttribute('aria-pressed', 'true');

    // Échap est écouté sur `.aster` en bouillonnement et ignoré si `defaultPrevented`.
    // Or prosemirror-view capture Échap (preventDefault) quand le focus est dans le
    // contenu, et les boutons de toolbar neutralisent `mousedown` pour ne pas voler le
    // focus : on simule donc l'accès clavier à la toolbar (focus sur le bouton) avant Échap.
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(root).not.toHaveClass(/aster--fullscreen/);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test("la poignée d'une image la redimensionne à la souris", async ({ page }) => {
    await setHtml(page, '<p></p>');
    await editor(page).click();
    expect(
      await runCommand(page, 'image.insert', { src: PIXEL_SVG, alt: 'pixel', width: 200 }),
    ).toBe(true);

    const image = editor(page).locator('figure.aster-image img');
    await expect(image).toHaveAttribute('width', '200');
    const handle = editor(page).locator('figure.aster-image .aster-image__handle');
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 50, startY, { steps: 5 });
    await page.mouse.move(startX + 100, startY, { steps: 5 });
    await page.mouse.up();

    await expect(image).toHaveAttribute('width', '300');
    expect(await getHtml(page)).toContain('width="300"');
  });

  test('le clic droit dans une cellule ouvre le menu contextuel de table', async ({ page }) => {
    const cell = editor(page).locator('td').first();
    await cell.click();
    await cell.click({ button: 'right' });

    const menu = page.locator('.aster-table-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await expect(menu.getByRole('menuitem', { name: 'Supprimer le tableau' })).toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // Le menu est en `position: fixed` au curseur et n'est pas ramené dans le viewport :
    // ses derniers items peuvent sortir de l'écran quand la table est basse. On agit
    // donc sur le premier item, toujours visible.
    const rows = editor(page).locator('table tr');
    await expect(rows).toHaveCount(2);
    await cell.click({ button: 'right' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Insérer une ligne au-dessus' }).click();
    await expect(menu).toBeHidden();
    await expect(rows).toHaveCount(3);
  });
});
