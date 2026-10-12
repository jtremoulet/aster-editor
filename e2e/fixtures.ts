import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dossier `e2e/` (celui de ce fichier). */
const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Racine du monorepo, pour atteindre `fixtures/`. */
export const REPO_ROOT = path.resolve(E2E_DIR, '..');

/** Dossier des captures de bilan (`e2e/output/`, gitignoré). */
export const OUTPUT_DIR = path.join(E2E_DIR, 'output');

/**
 * Vue minimale de `window.aster` exposé par le playground vanilla
 * (`scripts/vanilla-playground/main.ts`). Seules les méthodes utilisées ici sont typées,
 * pour rester découplé des types internes sans recourir à `any`.
 *
 * Les callbacks de `page.evaluate` sont sérialisés et exécutés dans le navigateur : ils ne
 * peuvent référencer aucune fonction de ce module, d'où l'accès à `window` répété inline.
 */
interface PlaygroundEditor {
  getHTML(): string;
  setHTML(html: string, emit?: boolean): void;
  focus(position?: 'start' | 'end' | 'all'): void;
  commands: { run(id: string, args?: Record<string, unknown>): boolean };
  tiptap: { view: { pasteHTML(html: string): boolean } };
}

interface PlaygroundWindow {
  aster?: { editor: PlaygroundEditor };
}

/** Chemin absolu d'une fixture de `fixtures/` à la racine du monorepo. */
export function fixturePath(...segments: string[]): string {
  return path.join(REPO_ROOT, 'fixtures', ...segments);
}

/** Lit une fixture texte (HTML de collage Word) côté Node. */
export async function readFixture(...segments: string[]): Promise<string> {
  return readFile(fixturePath(...segments), 'utf8');
}

/** Zone éditable ProseMirror. Un seul éditeur par page dans les deux applications. */
export function editor(page: Page): Locator {
  return page.locator('.ProseMirror');
}

/** Bouton de toolbar lié à une commande du core (`[data-command="bold"]`). */
export function toolbarButton(page: Page, commandId: string): Locator {
  return page.locator(`.aster-toolbar [data-command="${commandId}"]`);
}

/**
 * Déclencheur d'un dropdown de toolbar (titres, lien, tableau, recherche…), repéré par son
 * `aria-label` i18n : les widgets n'ont pas de `data-command`.
 */
export function toolbarTrigger(page: Page, label: string): Locator {
  return page.locator(`.aster-toolbar .aster-dropdown__trigger[aria-label="${label}"]`);
}

/** HTML sémantique du document, via `window.aster.editor.getHTML()` (playground). */
export async function getHtml(page: Page): Promise<string> {
  return page.evaluate(() => {
    const aster = (window as unknown as PlaygroundWindow).aster;
    if (!aster) throw new Error('window.aster is not available: playground not mounted');
    return aster.editor.getHTML();
  });
}

/** Remplace le document du playground, sans passer par le clavier. */
export async function setHtml(page: Page, html: string): Promise<void> {
  await page.evaluate((value) => {
    const aster = (window as unknown as PlaygroundWindow).aster;
    if (!aster) throw new Error('window.aster is not available: playground not mounted');
    aster.editor.setHTML(value, true);
  }, html);
}

/** Exécute une commande du registre du playground, en renvoyant son résultat. */
export async function runCommand(
  page: Page,
  commandId: string,
  args?: Record<string, unknown>,
): Promise<boolean> {
  return page.evaluate(
    ({ id, params }) => {
      const aster = (window as unknown as PlaygroundWindow).aster;
      if (!aster) throw new Error('window.aster is not available: playground not mounted');
      return aster.editor.commands.run(id, params);
    },
    { id: commandId, params: args },
  );
}

/**
 * Simule un collage HTML dans le playground via `view.pasteHTML` de ProseMirror : le HTML
 * traverse `transformPastedHTML`, donc le pipeline de collage et le normaliseur Word.
 * Le presse-papier système n'est pas sollicité, ce qui reste stable en headless.
 */
export async function pasteHtml(page: Page, html: string): Promise<void> {
  await page.evaluate((value) => {
    const aster = (window as unknown as PlaygroundWindow).aster;
    if (!aster) throw new Error('window.aster is not available: playground not mounted');
    aster.editor.focus('end');
    aster.editor.tiptap.view.pasteHTML(value);
  }, html);
}

/**
 * HTML du document sur la démo Angular : clic sur le bouton « HTML » du playground
 * Angular puis lecture du `<pre class="demo-output">`.
 */
export async function getDemoHtml(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'HTML', exact: true }).click();
  const output = page.locator('pre.demo-output[data-kind="html"]');
  await expect(output).toBeVisible();
  return (await output.textContent()) ?? '';
}

/** Capture pleine page dans `e2e/output/<name>.png`, pour le bilan visuel. */
export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: true });
}
