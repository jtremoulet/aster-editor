/**
 * Entrée du playground vanilla. Assemble core + ui + word sans framework pour vérifier
 * le comportement réel dans un navigateur : frappe, toolbar, collage Word, import .docx.
 */
import type { AsterInstance, AsterUiOptions } from '@aster-editor/ui';
import { createAster } from '@aster-editor/ui';
import { importDocx, wordPasteTransformer } from '@aster-editor/word';
import '../../packages/ui/themes/aster.css';

const host = document.querySelector<HTMLElement>('#host');
const out = document.querySelector<HTMLElement>('#out');
const counts = document.querySelector<HTMLElement>('#counts');
const themeSelect = document.querySelector<HTMLSelectElement>('#theme');
const localeSelect = document.querySelector<HTMLSelectElement>('#locale');
const toolbarSelect = document.querySelector<HTMLSelectElement>('#toolbar');
const readonlyInput = document.querySelector<HTMLInputElement>('#readonly');
const docxInput = document.querySelector<HTMLInputElement>('#docx');
const dumpButton = document.querySelector<HTMLButtonElement>('#dump');

if (
  !host ||
  !out ||
  !counts ||
  !themeSelect ||
  !localeSelect ||
  !toolbarSelect ||
  !readonlyInput ||
  !docxInput ||
  !dumpButton
) {
  throw new Error('Playground : éléments manquants dans index.html');
}

const INITIAL_CONTENT =
  '<h1>Aster playground</h1><p>Colle ici du contenu depuis <strong>Word</strong> ou Google Docs, ou importe un .docx.</p>' +
  '<ul><li><p>Une liste</p><ul><li><p>imbriquée</p></li></ul></li></ul>' +
  '<table><thead><tr><th>Nom</th><th>Rôle</th></tr></thead><tbody><tr><td><p>Alice</p></td><td><p>Dev</p></td></tr></tbody></table>';

let instance: AsterInstance | null = null;

function log(label: string, value: unknown): void {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  out.textContent = `[${new Date().toLocaleTimeString()}] ${label}\n${text}`;
}

function mount(): void {
  const previousHtml = instance?.editor.getHTML() ?? INITIAL_CONTENT;
  instance?.destroy();
  const options: AsterUiOptions = {
    content: previousHtml,
    toolbar: toolbarSelect.value as AsterUiOptions['toolbar'],
    theme: themeSelect.value,
    locale: localeSelect.value,
    readOnly: readonlyInput.checked,
    placeholder: 'Écris quelque chose…',
    pasteTransformers: [wordPasteTransformer()],
  };
  instance = createAster(host, options);
  const { editor } = instance;
  editor.on('change', ({ editor: e }) => {
    const c = e.getCounts();
    counts.textContent = `${c.words} mots · ${c.characters} caractères`;
  });
  editor.on('ready', () => log('ready', 'éditeur monté'));
  const c = editor.getCounts();
  counts.textContent = `${c.words} mots · ${c.characters} caractères`;
  // Exposé pour inspection depuis la console du navigateur.
  (window as unknown as { aster: AsterInstance }).aster = instance;
}

themeSelect.addEventListener('change', () => instance?.setTheme(themeSelect.value));
localeSelect.addEventListener('change', () => instance?.editor.i18n.setLocale(localeSelect.value));
toolbarSelect.addEventListener('change', mount);
readonlyInput.addEventListener('change', () => instance?.editor.setReadOnly(readonlyInput.checked));
dumpButton.addEventListener('click', () => log('getHTML()', instance?.editor.getHTML() ?? ''));
docxInput.addEventListener('change', async () => {
  const file = docxInput.files?.[0];
  if (!file || !instance) return;
  try {
    const result = await importDocx(file);
    instance.editor.setHTML(result.html);
    log(`importDocx(${file.name}) — ${result.warnings.length} avertissement(s)`, result.warnings);
  } catch (error) {
    log('importDocx — erreur', error instanceof Error ? error.message : String(error));
  }
});

mount();
// Exposé pour les vérifications automatisées de l'orchestrateur.
(window as unknown as { asterImportDocx: typeof importDocx }).asterImportDocx = importDocx;
