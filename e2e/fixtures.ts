import type { Download, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFile, stat } from 'node:fs/promises';
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
  getHTML(options?: { variables?: 'placeholders' | 'resolve' }): string;
  setHTML(html: string, emit?: boolean): void;
  focus(position?: 'start' | 'end' | 'all'): void;
  commands: { run(id: string, args?: Record<string, unknown>): boolean };
  tiptap: { view: { pasteHTML(html: string): boolean } };
  /** Vue page (session 3) : `false` la retire, un objet `{ layout }` l'active ou la remplace. */
  setPageView(options: boolean | Record<string, unknown>): void;
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

/** HTML du playground avec les variables substituées (`getHTML({ variables: 'resolve' })`). */
export async function getResolvedHtml(page: Page): Promise<string> {
  return page.evaluate(() => {
    const aster = (window as unknown as PlaygroundWindow).aster;
    if (!aster) throw new Error('window.aster is not available: playground not mounted');
    return aster.editor.getHTML({ variables: 'resolve' });
  });
}

/**
 * Importe une fixture `.docx` dans le playground via `<input id="docx">` et attend la
 * trace `importDocx(<nom>)` dans `#out`, signe que `setHTML` a été appliqué.
 */
export async function importPlaygroundDocx(page: Page, fileName: string): Promise<void> {
  await page.locator('#docx').setInputFiles(fixturePath('docx', fileName));
  await expect(page.locator('#out')).toContainText(`importDocx(${fileName})`);
}

/**
 * Taille en octets d'un téléchargement intercepté (`page.waitForEvent('download')`), une
 * fois le fichier entièrement écrit sur disque. Un `.docx` vide ou tronqué fait moins
 * d'un kilooctet : on vérifie qu'il y a bien une archive dedans.
 */
export async function downloadSize(download: Download): Promise<number> {
  const file = await download.path();
  return (await stat(file)).size;
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

/**
 * Active (`{ layout }`), remplace ou retire (`false`) la vue page du playground, sans passer
 * par le dialogue « Mise en page » : pour les scénarios qui testent la pagination seule.
 */
export async function setPageView(
  page: Page,
  options: boolean | Record<string, unknown>,
): Promise<void> {
  await page.evaluate((value) => {
    const aster = (window as unknown as PlaygroundWindow).aster;
    if (!aster) throw new Error('window.aster is not available: playground not mounted');
    aster.editor.setPageView(value);
  }, options);
}

/**
 * Hôte de l'éditeur du core (`editor.element`, `.aster__content` posé par `createAster`) :
 * c'est lui qui porte `aster--page-view` et les variables `--aster-page-*`, pas `.aster`.
 */
export function editorHost(page: Page): Locator {
  return page.locator('.aster__content').first();
}

/**
 * Valeur calculée d'une variable CSS `--aster-*` sur l'hôte de l'éditeur, chaîne vide si
 * elle n'est pas posée. À combiner avec `expect.poll`.
 */
export async function hostCssVariable(page: Page, name: string): Promise<string> {
  return editorHost(page).evaluate(
    (host, variable) => getComputedStyle(host).getPropertyValue(variable).trim(),
    name,
  );
}

/**
 * Octets d'un téléchargement intercepté, une fois le fichier entièrement écrit. Sous
 * Windows, l'artefact fraîchement fermé par Chromium reste quelques instants inaccessible
 * (`EPERM` à l'ouverture, antivirus ou verrou de fin d'écriture) : la lecture est réessayée
 * jusqu'à 10 s, sans attente fixe.
 */
export async function downloadBytes(download: Download): Promise<Buffer> {
  const file = await download.path();
  let bytes: Buffer | null = null;
  await expect(async () => {
    bytes = await readFile(file);
  }).toPass({ timeout: 10_000, intervals: [100, 250, 500, 1_000] });
  if (bytes === null) throw new Error(`téléchargement illisible : ${file}`);
  return bytes;
}

/**
 * Archive d'un téléchargement `.docx` intercepté, ouverte avec `jszip` (dépendance de
 * `@aster-editor/word`, présente à la racine) : pour comparer des parties à l'octet.
 */
export async function downloadZip(download: Download): Promise<JSZip> {
  return JSZip.loadAsync(await downloadBytes(download));
}

/** Archive d'une fixture `.docx` de `fixtures/`, ouverte avec `jszip`. */
export async function fixtureZip(...segments: string[]): Promise<JSZip> {
  return JSZip.loadAsync(await readFile(fixturePath(...segments)));
}

/** Octets d'une partie d'une archive, ou erreur claire si elle manque. */
export async function zipPart(zip: JSZip, path: string): Promise<Uint8Array> {
  const file = zip.file(path);
  if (!file) throw new Error(`partie absente de l'archive : ${path}`);
  return file.async('uint8array');
}

/** Vrai si deux parties sont identiques à l'octet. */
export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

/**
 * Collecte les erreurs du navigateur (console `error` et exceptions non rattrapées) pour
 * vérifier qu'un parcours n'en produit aucune. À brancher avant la navigation.
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Capture pleine page dans `e2e/output/<name>.png`, pour le bilan visuel. */
export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: true });
}
