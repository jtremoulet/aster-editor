import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  downloadSize,
  editor,
  fixturePath,
  getDemoHtml,
  screenshot,
  toolbarButton,
} from './fixtures';

/** `<select>` d'un contrôle du playground Angular, repéré par le texte de son `<label>`. */
function control(page: Page, label: string): Locator {
  return page.locator('.demo-controls label', { hasText: label }).locator('select');
}

/** Pastille d'état du reactive form (`dirty`, `touched`, `valid`, `body disabled`). */
function status(page: Page, name: string): Locator {
  return page.locator('.demo-status li', { hasText: name });
}

/**
 * Parcours utilisateur sur la démo Angular (`apps/demo`) : une page par cas d'usage du
 * composant `<aster-editor>` (playground, reactive form, import Word, lecture seule).
 */
test.describe('Démo Angular', () => {
  test('la page / rend aster-editor avec la toolbar full', async ({ page }) => {
    await page.goto('/');

    const host = page.locator('aster-editor');
    await expect(host).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(host.locator('.aster-toolbar')).toBeVisible();
    // `subscript`, les polices et la recherche n'existent que dans le preset `full`.
    await expect(toolbarButton(page, 'subscript')).toBeVisible();
    for (const label of [
      'Style de texte',
      'Police',
      'Insérer un tableau',
      'Rechercher et remplacer',
    ]) {
      await expect(host.locator(`.aster-toolbar [aria-label="${label}"]`)).toBeVisible();
    }
    await expect(editor(page).locator('h1')).toHaveText('Bienvenue dans Aster Editor');
    await expect(page.locator('.demo-counts')).toHaveText(/\d+ mots · \d+ caractères/);
    await screenshot(page, 'demo-playground');
  });

  test('/form : dirty à la frappe, touched au blur, payload JSON et désactivation', async ({
    page,
  }) => {
    await page.goto('/form');
    await expect(editor(page)).toBeVisible();
    for (const name of ['dirty', 'touched', 'valid', 'body disabled']) {
      await expect(status(page, name)).not.toHaveClass(/is-on/);
    }

    await editor(page).click();
    await page.keyboard.type('Bonjour');
    await expect(status(page, 'dirty')).toHaveClass(/is-on/);
    await expect(status(page, 'touched')).not.toHaveClass(/is-on/);
    await expect(page.locator('.demo-preview')).toContainText('<p>Bonjour</p>');

    await page.keyboard.press('Tab');
    await expect(editor(page)).not.toBeFocused();
    await expect(status(page, 'touched')).toHaveClass(/is-on/);

    await page.getByRole('button', { name: 'Envoyer' }).click();
    const payload = page.locator('pre.demo-output');
    await expect(payload).toBeVisible();
    await expect(payload).toContainText('"body": "<p>Bonjour</p>"');

    await page.getByLabel("Désactiver l'éditeur").check();
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    await expect(status(page, 'body disabled')).toHaveClass(/is-on/);
    await expect(toolbarButton(page, 'bold')).toBeDisabled();

    await page.getByLabel("Désactiver l'éditeur").uncheck();
    await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
    await screenshot(page, 'demo-form');
  });

  test('/import : le .docx sélectionné est importé dans l’éditeur', async ({ page }) => {
    test.slow();
    await page.goto('/import');
    await expect(editor(page)).toBeVisible();

    const dropzone = page.locator('.demo-dropzone');
    // `importDocx` charge `@aster-editor/word` (mammoth) à la demande. Au tout premier
    // import d'une session `ng serve`, l'optimiseur de dépendances de Vite découvre mammoth
    // et recharge la page en plein import : l'état est perdu sans erreur. On relance la
    // sélection du fichier tant que le libellé « Importé » n'apparaît pas.
    await expect(async () => {
      await dropzone
        .locator('input[type="file"]')
        .setInputFiles(fixturePath('docx', '01-headings-lists.docx'));
      await expect(dropzone).toContainText('Importé : 01-headings-lists.docx', {
        timeout: 10_000,
      });
    }).toPass({ timeout: 45_000, intervals: [1_000] });
    await expect(editor(page).locator('h1')).toHaveText('Titre principal');
    await expect(editor(page).locator('ul > li > ul > li > p').first()).toHaveText('Sous-point A');
    await expect(page.locator('.demo-error')).toHaveCount(0);
    await screenshot(page, 'demo-import');
  });

  test('/readonly : pas de toolbar, contenu figé, thème night', async ({ page }) => {
    await page.goto('/readonly');
    await expect(editor(page)).toBeVisible();

    await expect(page.locator('.aster-toolbar')).toHaveCount(0);
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.aster')).toHaveAttribute('data-theme', 'night');
    await expect(editor(page).locator('table')).toHaveCount(1);
    await screenshot(page, 'demo-readonly');
  });

  test('/ : changement de thème et de langue à chaud', async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    const root = page.locator('.aster');
    const toolbar = page.locator('.aster-toolbar');
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(toolbar).toHaveAttribute('aria-label', 'Barre de mise en forme');
    await expect(toolbarButton(page, 'bold')).toHaveAttribute('aria-label', 'Gras');

    await control(page, 'Thème').selectOption('night');
    await expect(root).toHaveAttribute('data-theme', 'night');

    await control(page, 'Langue').selectOption('en');
    await expect(toolbar).toHaveAttribute('aria-label', 'Formatting toolbar');
    await expect(toolbarButton(page, 'bold')).toHaveAttribute('aria-label', 'Bold');
    // Le contenu survit aux changements à chaud.
    await expect(editor(page).locator('h1')).toHaveText('Bienvenue dans Aster Editor');

    expect(await getDemoHtml(page)).toContain('<h1>Bienvenue dans Aster Editor</h1>');
    await screenshot(page, 'demo-night-en');
  });

  test('/template : exemple chargé, formulaire généré, aperçu résolu et export résolu', async ({
    page,
  }) => {
    test.slow();
    await page.goto('/template');
    await expect(editor(page)).toBeVisible();

    const dropzone = page.locator('.demo-dropzone');
    // Même précaution que /import : le premier chargement de mammoth sous `ng serve` peut
    // recharger la page en plein import, on relance le bouton tant que rien n'est importé.
    await expect(async () => {
      // `exact` : « Charger l'exemple stylé » (session 3) partage le préfixe.
      await dropzone.getByRole('button', { name: "Charger l'exemple", exact: true }).click();
      await expect(dropzone).toContainText('Importé : 08-variables-braces.docx', {
        timeout: 10_000,
      });
    }).toPass({ timeout: 45_000, intervals: [1_000] });
    await expect(page.locator('.demo-error')).toHaveCount(0);
    await expect(editor(page).locator('.aster-variable')).toHaveCount(11);

    // Formulaire généré depuis `variableNames()` : un champ par variable présente.
    const form = page.locator('form.demo-variables');
    await expect(form).toBeVisible();
    await expect(form.locator('.demo-field')).toHaveCount(9);
    await expect(form.locator('input[name="client.nom"]')).toHaveAttribute(
      'placeholder',
      '{{client.nom}}',
    );
    await expect(form.locator('.demo-variables__status')).toHaveText('9 variables sans valeur');

    await form.locator('input[name="client.nom"]').fill('ACME SAS');
    await form.locator('input[name="prestataire"]').fill('Nebula');
    await form.getByRole('button', { name: 'Appliquer', exact: true }).click();
    const client = editor(page).locator('.aster-variable[data-name="client.nom"]').first();
    await expect(client).toHaveClass(/aster-variable--resolved/);
    await expect(client).toHaveText('ACME SAS');
    await expect(form.locator('.demo-variables__status')).toHaveText('7 variables sans valeur');

    // Onglet « Résolu » : aperçu sans puce, avec les valeurs substituées.
    await page.getByRole('tab', { name: 'Résolu' }).click();
    const resolved = page.locator('.demo-resolved');
    await expect(resolved).toBeVisible();
    await expect(resolved.locator('h1')).toHaveText('Contrat de prestation — ACME SAS');
    await expect(resolved.locator('.aster-variable')).toHaveCount(0);
    await expect(resolved).toContainText('Nebula');
    await expect(resolved).toContainText('{{lieu}}');
    await screenshot(page, 'demo-template');

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger résolu' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('modele-resolu.docx');
    expect(await downloadSize(download)).toBeGreaterThan(1_000);
    await expect(page.locator('.demo-error')).toHaveCount(0);
  });
});
