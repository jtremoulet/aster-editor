import { expect, test, type Page } from '@playwright/test';
import { editor, screenshot, setHtml, setPageView } from './fixtures';

/**
 * Recherche sur le playground vanilla (session 5, L52, retour POC n° 5) : le bandeau
 * pousse le document au lieu de le recouvrir (5a) et « suivant » fait défiler jusqu'à la
 * correspondance, en vue page ou non, que ce soit la fenêtre ou un conteneur `overflow:
 * auto` qui défile (5b).
 */

/** 200 paragraphes, « cible » dans le 20e et le 180e : la seconde est hors écran. */
function longDocument(): string {
  return Array.from(
    { length: 200 },
    (_, index) => `<p>Paragraphe ${index + 1}${index === 19 || index === 179 ? ' cible' : ''}</p>`,
  ).join('');
}

/** Le conteneur `#host` du playground devient (ou cesse d'être) une zone qui défile. */
async function setScrollingContainer(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate((on) => {
    const host = document.querySelector<HTMLElement>('#host');
    if (!host) throw new Error('#host introuvable');
    host.style.height = on ? '420px' : '';
    host.style.overflow = on ? 'auto' : '';
    host.scrollTop = 0;
    window.scrollTo(0, 0);
  }, enabled);
}

/** Position de défilement de la fenêtre et du conteneur `#host`. */
async function scrollOffsets(page: Page): Promise<{ window: number; host: number }> {
  return page.evaluate(() => ({
    window: window.scrollY,
    host: document.querySelector<HTMLElement>('#host')?.scrollTop ?? 0,
  }));
}

/**
 * Vrai si la correspondance courante est entièrement visible : dans la fenêtre et, quand
 * `#host` défile, dans la zone visible de `#host`.
 */
async function currentMatchVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const match = document.querySelector('.aster-search-match--current');
    const host = document.querySelector<HTMLElement>('#host');
    if (!match || !host) return false;
    const rect = match.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) return false;
    if (host.style.overflow !== 'auto') return true;
    const box = host.getBoundingClientRect();
    return rect.top >= box.top && rect.bottom <= box.bottom;
  });
}

test.describe('Recherche (playground)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('.aster-toolbar')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await setScrollingContainer(page, false);
    await setPageView(page, false);
  });

  test('5a : le bandeau pousse le document sous la toolbar et reste ouvert au clic dans le texte', async ({
    page,
  }) => {
    await setHtml(page, '<p>Première ligne du document</p><p>Seconde ligne</p>', false);
    const before = await editor(page).boundingBox();
    await editor(page).click();
    await page.keyboard.press('Control+F');

    const band = page.locator('.aster-search-panel');
    await expect(band).toBeVisible();
    await expect(band.locator('.aster-search-panel__query')).toBeFocused();
    // Dans le flux : au-dessus de l'hôte, qui a été poussé vers le bas de la hauteur du bandeau.
    const bandBox = await band.boundingBox();
    const after = await editor(page).boundingBox();
    expect(bandBox).not.toBeNull();
    expect(after).not.toBeNull();
    expect(before).not.toBeNull();
    expect(bandBox!.y + bandBox!.height).toBeLessThanOrEqual(after!.y + 1);
    expect(after!.y).toBeGreaterThan(before!.y + bandBox!.height - 1);
    // Rien n'est recouvert : la première ligne est entièrement sous le bandeau.
    const firstLine = await editor(page).locator('p').first().boundingBox();
    expect(firstLine!.y).toBeGreaterThanOrEqual(bandBox!.y + bandBox!.height);
    expect(await band.evaluate((element) => getComputedStyle(element).position)).not.toBe(
      'absolute',
    );
    await screenshot(page, 'search-band');

    // Un clic dans le document ne referme pas le bandeau (contrairement à l'ancien dropdown).
    await band.locator('.aster-search-panel__query').fill('ligne');
    await expect(editor(page).locator('.aster-search-match')).toHaveCount(2);
    await editor(page).locator('p').last().click();
    await expect(band).toBeVisible();
    await expect(editor(page).locator('.aster-search-match')).toHaveCount(2);
    // Échap depuis le bandeau : fermé, surlignage effacé, focus sur le déclencheur.
    await band.locator('.aster-search-panel__query').focus();
    await page.keyboard.press('Escape');
    await expect(band).toBeHidden();
    await expect(editor(page).locator('.aster-search-match')).toHaveCount(0);
    await expect(page.locator('.aster-toolbar .aster-search-panel__trigger')).toBeFocused();
  });

  for (const pageView of [false, true]) {
    for (const container of [false, true]) {
      const label = `${pageView ? 'vue page' : 'vue simple'}, ${container ? 'conteneur overflow: auto' : 'défilement de la fenêtre'}`;
      test(`5b : « suivant » fait défiler jusqu'à la correspondance (${label})`, async ({
        page,
      }) => {
        await setHtml(page, longDocument(), false);
        await setPageView(page, pageView ? { layout: {} } : false);
        await setScrollingContainer(page, container);
        if (pageView) {
          await expect(page.locator('.aster--page-view')).toHaveCount(1);
        }
        await editor(page).locator('p').first().click();
        await page.keyboard.press('Control+F');
        const band = page.locator('.aster-search-panel');
        await expect(band.locator('.aster-search-panel__query')).toBeFocused();
        await band.locator('.aster-search-panel__query').fill('cible');
        await expect(editor(page).locator('.aster-search-match')).toHaveCount(2);
        await expect(band.locator('.aster-search-panel__count')).toContainText('1 / 2');
        await expect.poll(() => currentMatchVisible(page)).toBe(true);

        const start = await scrollOffsets(page);
        await band.locator('.aster-search-panel__nav').nth(1).click();
        await expect(band.locator('.aster-search-panel__count')).toContainText('2 / 2');
        // La correspondance du 180e paragraphe est visible : ce qui défile a défilé.
        await expect.poll(() => currentMatchVisible(page)).toBe(true);
        const end = await scrollOffsets(page);
        if (container) {
          expect(end.host).toBeGreaterThan(start.host);
        } else {
          expect(end.window).toBeGreaterThan(start.window);
        }
        // Le focus est resté dans le champ : on enchaîne au clavier (Entrée = suivant, cycle).
        await expect(band.locator('.aster-search-panel__query')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(band.locator('.aster-search-panel__count')).toContainText('1 / 2');
        await expect.poll(() => currentMatchVisible(page)).toBe(true);
        const back = await scrollOffsets(page);
        if (container) {
          expect(back.host).toBeLessThan(end.host);
        } else {
          expect(back.window).toBeLessThan(end.window);
        }
      });
    }
  }
});
