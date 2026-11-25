import { expect, test, type Page } from '@playwright/test';
import { editor, setHtml, setPageView, toolbarButton } from './fixtures.js';

/**
 * Tests visuels : captures comparées aux références de `e2e/__screenshots__/`, pour qu'une
 * régression d'affichage (bandeau de recherche de 700 px, icônes baveuses, en-tête sur le
 * texte : retours utilisateurs 0.7) casse un test au lieu d'arriver chez le client.
 *
 * Ces tests ne tournent que dans l'image Docker de Playwright (`npm run e2e:visual`, job
 * `visual` de la CI) : voir `scripts/visual-tests.mjs` et `docs/STRATEGIE_TESTS.md`. Après
 * un changement d'affichage voulu : `npm run e2e:visual:update`, relire les images, commiter.
 *
 * Règles pour rester stable : contenu posé par `setHtml` (jamais le contenu d'accueil du
 * playground), capture d'un élément (jamais la page, dont le journal porte une heure),
 * souris rangée hors de l'éditeur avant la capture (pas d'infobulle ni de survol).
 */

/** Vue minimale de `window.aster` (playground) pour ce que ces scénarios pilotent. */
interface VisualWindow {
  aster?: {
    setTheme(theme: string): void;
    editor: {
      variables: {
        define(variables: readonly { name: string; label?: string }[]): void;
        setValues(values: Record<string, string>): void;
      };
    };
  };
}

/** Document qui passe par tous les styles de contenu courants. */
const RICH_DOCUMENT =
  '<h1>Contrat de prestation</h1>' +
  '<p>Texte courant avec du <strong>gras</strong>, de l’<em>italique</em>, du <u>souligné</u>, ' +
  'du <s>barré</s>, du <code>code</code>, un <a href="https://example.com/">lien</a> et un ' +
  '<mark>surlignage</mark>.</p>' +
  '<h2>Listes</h2>' +
  '<ul><li><p>Première puce</p><ul><li><p>Puce imbriquée</p></li></ul></li><li><p>Seconde puce</p></li></ul>' +
  '<ol><li><p>Premier point</p></li><li><p>Deuxième point</p></li></ol>' +
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Tâche faite</p></li>' +
  '<li data-type="taskItem" data-checked="false"><p>Tâche à faire</p></li></ul>' +
  '<h3>Citation et code</h3>' +
  '<blockquote><p>Une citation sur une ligne.</p></blockquote>' +
  '<pre><code>const version = "0.8";</code></pre>' +
  '<hr>' +
  '<table><tbody><tr><th><p>Poste</p></th><th><p>Montant</p></th></tr>' +
  '<tr><td><p>Conception</p></td><td><p>1 200 €</p></td></tr>' +
  '<tr><td><p>Réalisation</p></td><td><p>3 400 €</p></td></tr></tbody></table>' +
  '<p style="text-align: right">Paragraphe aligné à droite.</p>';

/** Souris hors de l'éditeur : ni survol de bouton, ni infobulle dans la capture. */
async function parkMouse(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/** Change le thème de l'instance du playground. */
async function setTheme(page: Page, theme: 'light' | 'night'): Promise<void> {
  await page.evaluate((value) => {
    const aster = (window as unknown as VisualWindow).aster;
    if (!aster) throw new Error('window.aster is not available: playground not mounted');
    aster.setTheme(value);
  }, theme);
}

test.describe('Captures de référence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('.aster-toolbar')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  });

  for (const theme of ['light', 'night'] as const) {
    test(`toolbar complète et contenu riche, thème ${theme}`, async ({ page }) => {
      await setHtml(page, RICH_DOCUMENT, false);
      await setTheme(page, theme);
      await parkMouse(page);
      await expect(page.locator('.aster__toolbar')).toHaveScreenshot(`toolbar-${theme}.png`);
      await expect(page.locator('.aster')).toHaveScreenshot(`document-${theme}.png`);
    });
  }

  test('bandeau de recherche ouvert, correspondances surlignées', async ({ page }) => {
    await setHtml(page, '<p>Première ligne du document</p><p>Seconde ligne, même mot</p>', false);
    await editor(page).locator('p').first().click();
    await page.keyboard.press('Control+F');
    const band = page.locator('.aster-search-panel');
    await band.locator('.aster-search-panel__query').fill('ligne');
    await expect(band.locator('.aster-search-panel__count')).toContainText('1 / 2');
    await band.locator('.aster-search-panel__replacement').fill('phrase');
    await parkMouse(page);
    await expect(page.locator('.aster')).toHaveScreenshot('search-band.png');
  });

  test('bulle de tableau au-dessus du tableau courant', async ({ page }) => {
    await setHtml(
      page,
      '<p>Paragraphe avant le tableau.</p>' +
        '<table><tbody><tr><th><p>Nom</p></th><th><p>Rôle</p></th></tr>' +
        '<tr><td><p>Alice</p></td><td><p>Développeuse</p></td></tr></tbody></table>' +
        '<p>Paragraphe après le tableau.</p>',
      false,
    );
    await editor(page).locator('td').first().click();
    await expect(page.locator('.aster-table-bubble')).toBeVisible();
    await parkMouse(page);
    await expect(page.locator('.aster')).toHaveScreenshot('table-bubble.png');
  });

  test('puces de variables : libellé propre, libellé déclaré, nom seul, valeur', async ({
    page,
  }) => {
    await setHtml(
      page,
      '<p>Libellé de la puce : <span data-aster-variable="client.nom" data-label="Nom du client">{{client.nom}}</span></p>' +
        '<p>Libellé déclaré : <span data-aster-variable="SalespersonFullName">{{SalespersonFullName}}</span></p>' +
        '<p>Nom seul : <span data-aster-variable="reference">{{reference}}</span></p>' +
        '<p>Valeur connue : <span data-aster-variable="ville">{{ville}}</span></p>',
      false,
    );
    await page.evaluate(() => {
      const aster = (window as unknown as VisualWindow).aster;
      if (!aster) throw new Error('window.aster is not available: playground not mounted');
      aster.editor.variables.define([
        { name: 'SalespersonFullName', label: 'Nom complet du conseiller' },
      ]);
      aster.editor.variables.setValues({ ville: 'Montpellier' });
    });
    await expect(editor(page).locator('.aster-variable').nth(1)).toHaveText(
      'Nom complet du conseiller',
    );
    await parkMouse(page);
    await expect(page.locator('.aster')).toHaveScreenshot('variables.png');
  });

  test('icônes de listes de la toolbar', async ({ page }) => {
    await parkMouse(page);
    for (const command of ['bulletList', 'orderedList', 'taskList']) {
      await expect(toolbarButton(page, command)).toHaveScreenshot(`icon-${command}.png`);
    }
  });

  test('vue page : en-tête et pied sur une ligne, deux pages', async ({ page }) => {
    // Même ordre que `fidelity.spec.ts` : la vue page d'abord, le contenu ensuite (la
    // pagination mesure à la mise à jour du document).
    await setPageView(page, {
      layout: {
        page: { size: 'A4', orientation: 'portrait' },
        headers: { default: { html: '<p>Nebula — Document de référence</p>' } },
        footers: { default: { html: '<p style="text-align: center">Pied de page</p>' } },
      },
    });
    await expect(page.locator('.aster--page-view')).toHaveCount(1);
    await setHtml(
      page,
      Array.from({ length: 40 }, (_, index) => `<p>Paragraphe ${index + 1} du document.</p>`).join(
        '',
      ),
    );
    await expect(editor(page).locator('.aster-page-gap')).toHaveCount(1);
    await parkMouse(page);
    await expect(page.locator('.aster')).toHaveScreenshot('page-view-headers.png');
  });

  test('vue page : en-tête de quatre lignes et pied de trois lignes sur des marges étroites', async ({
    page,
  }) => {
    // Retour utilisateurs 0.7 : l'en-tête et le pied recouvraient le texte. Ils poussent
    // désormais le corps, comme dans Word.
    await setPageView(page, {
      layout: {
        page: {
          size: 'A4',
          orientation: 'portrait',
          margins: { topMm: 12.7, bottomMm: 12.7, headerMm: 12.49, footerMm: 12.49 },
        },
        headers: {
          default: {
            html: '<p><strong>Cabinet Nebula</strong></p><p>12 rue des Étoiles</p><p>34000 Montpellier</p><p>contact@example.com</p>',
          },
        },
        footers: {
          default: {
            html: '<p>Document confidentiel</p><p>Ne pas diffuser</p><p>Page de garde</p>',
          },
        },
      },
    });
    await expect(page.locator('.aster--page-view')).toHaveCount(1);
    await setHtml(
      page,
      Array.from({ length: 40 }, (_, index) => `<p>Paragraphe ${index + 1} du document.</p>`).join(
        '',
      ),
    );
    await expect(editor(page).locator('.aster-page-gap')).toHaveCount(1);
    await parkMouse(page);
    await expect(page.locator('.aster')).toHaveScreenshot('page-view-tall-headers.png');
  });

  test('vue page : variables dans l’en-tête et le pied, avec et sans valeur', async ({ page }) => {
    await page.evaluate(() => {
      const aster = (window as unknown as VisualWindow).aster;
      if (!aster) throw new Error('window.aster is not available: playground not mounted');
      aster.editor.variables.define([{ name: 'conseiller', label: 'Nom du conseiller' }]);
      aster.editor.variables.setValues({ reference: 'A-2026-014' });
    });
    await setPageView(page, {
      layout: {
        page: { size: 'A4', orientation: 'portrait' },
        headers: {
          default: {
            html: '<p>Dossier <span data-aster-variable="reference">{{reference}}</span> — suivi par <span data-aster-variable="conseiller">{{conseiller}}</span></p>',
          },
        },
        footers: {
          default: {
            html: '<p style="text-align: center"><span data-aster-variable="societe" data-label="Société">{{societe}}</span></p>',
          },
        },
      },
    });
    await expect(page.locator('.aster--page-view')).toHaveCount(1);
    await setHtml(
      page,
      Array.from({ length: 40 }, (_, index) => `<p>Paragraphe ${index + 1} du document.</p>`).join(
        '',
      ),
    );
    await expect(editor(page).locator('.aster-page-gap')).toHaveCount(1);
    await expect(page.locator('.aster-page-header')).toHaveText(
      'Dossier A-2026-014 — suivi par Nom du conseiller',
    );
    await parkMouse(page);
    await expect(page.locator('.aster')).toHaveScreenshot('page-view-header-variables.png');
  });

  test('dialogue « Mise en page » : champs d’en-tête et de pied avec puces et liste des variables', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const aster = (window as unknown as VisualWindow).aster;
      if (!aster) throw new Error('window.aster is not available: playground not mounted');
      aster.editor.variables.define([
        { name: 'reference', label: 'Référence du dossier' },
        { name: 'conseiller', label: 'Nom du conseiller' },
      ]);
    });
    await setPageView(page, {
      layout: {
        page: { size: 'A4', orientation: 'portrait' },
        headers: {
          default: {
            html: '<p>Dossier <span data-aster-variable="reference">{{reference}}</span></p>',
          },
        },
        footers: {
          default: {
            html: '<p>Suivi par <span data-aster-variable="conseiller">{{conseiller}}</span></p>',
          },
        },
      },
    });
    await setHtml(page, '<p>Un paragraphe.</p>', false);
    await page.locator('.aster-dropdown__trigger[aria-label="Mise en page"]').click();
    const dialog = page.locator('.aster-page-layout');
    await expect(dialog).toBeVisible();
    await parkMouse(page);
    await expect(dialog.locator('.aster-page-layout__headers')).toHaveScreenshot(
      'page-layout-header-fields.png',
    );
  });
});
