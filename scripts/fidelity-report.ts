/**
 * Rapport de fidélité d'un `.docx` (session 3, lot L28) :
 *
 *   node scripts/fidelity-report.ts <fichier.docx> [--out rapport.md] [--keep sortie.docx] [--threshold 0.98]
 *
 * Importe le document en mode `styled`, le réexporte sans modification, compare l'original
 * et le résultat avec `compareDocx` et imprime un tableau Markdown (groupe, propriété,
 * total, conservé, perdu, exemples), les parties changées, les objets perdus et le score.
 * Code de sortie 1 si le score est sous le seuil (0,98 par défaut).
 *
 * État L27 : `exportDocx({ template })` n'est pas encore intégré, l'export est un **export
 * neuf** avec `layout` ; les parties annexes (styles, numérotation, en-têtes…) sont donc
 * régénérées et le score reste loin du seuil. Quand L27 est intégré, remplacer
 * `{ layout }` par `{ template: imported.template }` dans `roundTrip` (voir TODO L27).
 *
 * Chargement des sources : le paquet `word` importe `@aster-editor/core` et ses modules
 * sans extension, ce que Node ne résout pas seul ; on bundle `packages/word/src/index.ts`
 * avec esbuild (déjà présent pour le playground vanilla) en laissant les dépendances
 * externes, dans `node_modules/.cache/aster-fidelity/`, puis on l'importe. jsdom fournit
 * `DOMParser`, `XMLSerializer` et `document` avant cet import. Node 24 strippe les types
 * de ce script lui-même.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORD_ENTRY = resolve(ROOT, 'packages/word/src/index.ts');
const BUNDLE_DIR = resolve(ROOT, 'node_modules/.cache/aster-fidelity');
const BUNDLE = resolve(BUNDLE_DIR, 'word.mjs');
const DEFAULT_THRESHOLD = 0.98;

interface CliOptions {
  readonly input: string;
  readonly out?: string;
  readonly keep?: string;
  readonly threshold: number;
}

interface FidelityExampleLike {
  readonly where: string;
  readonly expected: string;
  readonly actual: string;
}

interface FidelityPropertyLike {
  readonly name: string;
  readonly group: string;
  readonly total: number;
  readonly kept: number;
  readonly lost: number;
  readonly examples: readonly FidelityExampleLike[];
}

interface FidelityReportLike {
  readonly score: number;
  readonly properties: readonly FidelityPropertyLike[];
  readonly identicalParts: readonly string[];
  readonly changedParts: readonly { readonly path: string; readonly summary: string }[];
  readonly lost: readonly {
    readonly kind: string;
    readonly where: string;
    readonly detail?: string;
  }[];
  readonly notes: readonly string[];
}

interface ImportResultLike {
  readonly html: string;
  readonly layout: object;
  readonly template: ArrayBuffer;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
}

/** Surface du bundle utilisée ici, typée à la main : le bundle est du JavaScript. */
interface WordModule {
  importDocx(input: ArrayBuffer, options: { fidelity: 'styled' }): Promise<ImportResultLike>;
  exportDocx(html: string, options: { layout?: object; template?: ArrayBuffer }): Promise<Blob>;
  compareDocx(original: ArrayBuffer, result: ArrayBuffer): Promise<FidelityReportLike>;
}

function usage(): never {
  console.error(
    'Usage : node scripts/fidelity-report.ts <fichier.docx> [--out rapport.md] [--keep sortie.docx] [--threshold 0.98]',
  );
  process.exit(2);
}

function parseArgs(argv: readonly string[]): CliOptions {
  let input: string | undefined;
  let out: string | undefined;
  let keep: string | undefined;
  let threshold = DEFAULT_THRESHOLD;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) usage();
      i += 1;
      return value;
    };
    if (arg === '--out') out = next();
    else if (arg === '--keep') keep = next();
    else if (arg === '--threshold') threshold = Number(next());
    else if (arg.startsWith('--')) usage();
    else if (input === undefined) input = arg;
    else usage();
  }
  if (input === undefined || !Number.isFinite(threshold)) usage();
  return { input, out, keep, threshold };
}

/** Expose le DOM de jsdom en global : le lecteur et l'export en ont besoin (`DOMParser`, `document`). */
function installDom(): void {
  const { window } = new JSDOM('<!doctype html><html><body></body></html>');
  const globals: Record<string, unknown> = {
    window,
    document: window.document,
    DOMParser: window.DOMParser,
    XMLSerializer: window.XMLSerializer,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    NodeFilter: window.NodeFilter,
  };
  for (const [name, value] of Object.entries(globals)) {
    if (!(name in globalThis))
      Object.defineProperty(globalThis, name, { value, configurable: true });
  }
}

/** Bundle les sources de `@aster-editor/word` (alias vers `src/`), dépendances tierces externes. */
async function loadWord(): Promise<WordModule> {
  await mkdir(BUNDLE_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: [WORD_ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    outfile: BUNDLE,
    logLevel: 'silent',
    alias: {
      '@aster-editor/core': resolve(ROOT, 'packages/core/src/index.ts'),
      '@aster-editor/word': WORD_ENTRY,
    },
    plugins: [
      {
        name: 'externalize-bare-imports',
        setup(build) {
          // Spécificateurs nus (`jszip`, `@tiptap/core`…) : externes. Les chemins absolus
          // (point d'entrée, alias résolus) et relatifs restent dans le bundle.
          build.onResolve({ filter: /^[^./].*/ }, (args) =>
            args.kind === 'entry-point' ||
            isAbsolute(args.path) ||
            args.path.startsWith('@aster-editor/')
              ? null
              : { path: args.path, external: true },
          );
        },
      },
    ],
  });
  const loaded: unknown = await import(pathToFileURL(BUNDLE).href);
  return loaded as WordModule;
}

async function readDocx(path: string): Promise<ArrayBuffer> {
  const bytes = await readFile(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Import stylé puis export sans modification. TODO L27 : `{ template: imported.template }`. */
async function roundTrip(
  word: WordModule,
  original: ArrayBuffer,
): Promise<{ result: ArrayBuffer; warnings: readonly string[] }> {
  const imported = await word.importDocx(original, { fidelity: 'styled' });
  const blob = await word.exportDocx(imported.html, { layout: imported.layout });
  return {
    result: await blob.arrayBuffer(),
    warnings: imported.warnings.map((warning) => `${warning.code} : ${warning.message}`),
  };
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '⏎');
}

function clip(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function ratio(kept: number, total: number): string {
  return total === 0 ? '-' : `${String(Math.round((kept / total) * 1000) / 10)} %`;
}

function renderMarkdown(
  name: string,
  report: FidelityReportLike,
  warnings: readonly string[],
  threshold: number,
): string {
  const lines: string[] = [];
  const verdict = report.score >= threshold ? 'OK' : 'KO';
  lines.push(`# Rapport de fidélité — ${name}`, '');
  lines.push(
    `**Score : ${String(report.score)}** (seuil ${String(threshold)}, ${verdict}) — export neuf avec \`layout\` (gabarit L27 non intégré).`,
    '',
  );
  lines.push('| Groupe | Propriété | Total | Conservé | Perdu | Taux | Exemples |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const property of report.properties) {
    if (property.group === 'package-part' && property.lost === 0) continue;
    const examples = property.examples
      .slice(0, 2)
      .map((e) => `${cell(e.where)} : « ${cell(clip(e.expected))} » → « ${cell(clip(e.actual))} »`)
      .join('<br>');
    lines.push(
      `| ${property.group} | \`${property.name}\` | ${String(property.total)} | ${String(property.kept)} | ${String(property.lost)} | ${ratio(property.kept, property.total)} | ${examples} |`,
    );
  }
  lines.push('');
  lines.push(`## Parties du paquet`, '');
  lines.push(
    `Identiques à l'octet (${String(report.identicalParts.length)}) : ${report.identicalParts.map((p) => `\`${p}\``).join(', ') || 'aucune'}`,
    '',
  );
  if (report.changedParts.length > 0) {
    lines.push('| Partie | Différence |', '| --- | --- |');
    for (const part of report.changedParts)
      lines.push(`| \`${part.path}\` | ${cell(part.summary)} |`);
    lines.push('');
  }
  if (report.lost.length > 0) {
    lines.push('## Objets non représentables', '');
    for (const item of report.lost) {
      lines.push(`- ${item.kind} (${item.where})${item.detail ? ` : ${item.detail}` : ''}`);
    }
    lines.push('');
  }
  if (warnings.length > 0) {
    lines.push("## Avertissements d'import", '');
    for (const warning of warnings) lines.push(`- ${warning}`);
    lines.push('');
  }
  lines.push('## Notes', '');
  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  installDom();
  const word = await loadWord();
  const original = await readDocx(options.input);
  const { result, warnings } = await roundTrip(word, original);
  if (options.keep) await writeFile(options.keep, new Uint8Array(result));
  const report = await word.compareDocx(original, result);
  const markdown = renderMarkdown(basename(options.input), report, warnings, options.threshold);
  if (options.out) {
    await writeFile(options.out, markdown, 'utf8');
    console.log(`Rapport écrit dans ${options.out}`);
  }
  console.log(markdown);
  console.log(
    `Score ${String(report.score)} ${report.score >= options.threshold ? '>=' : '<'} seuil ${String(options.threshold)}`,
  );
  process.exitCode = report.score >= options.threshold ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
