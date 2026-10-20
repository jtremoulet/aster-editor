/**
 * Rapport de fidélité d'un `.docx` (session 3, lot L28) :
 *
 *   node scripts/fidelity-report.ts <fichier.docx> [--out rapport.md] [--keep sortie.docx]
 *                                    [--threshold 0.98] [--no-template]
 *
 * Importe le document en mode `styled`, le réexporte sans modification **dans son gabarit**
 * (`exportDocx({ template, layout })`, L27 : les parties annexes du paquet sont conservées,
 * seul le corps est régénéré), compare l'original et le résultat avec `compareDocx` et
 * imprime un tableau Markdown (groupe, propriété, total, conservé, perdu, exemples), les
 * parties changées, les objets perdus et le score.
 *
 * Verdict (R30-10) : OK si le score **et** la part de texte conservée (`paragraph.text`
 * conservé / total) atteignent le seuil (0,98 par défaut, borné à [0, 1]). Le score seul
 * ne suffit pas : un document dont tout le texte a disparu score encore ≈ 0,6, un corps
 * vide ≈ 0,3 (les parties du paquet, les sections et les en-têtes restent identiques).
 *
 * Codes de sortie (R30-11) : 0 verdict OK, 1 verdict KO, 2 usage (arguments), 3 erreur
 * d'exécution (fichier introuvable, document illisible, dossier de sortie absent…), avec
 * un message sans pile d'appels.
 *
 * `--no-template` : export **neuf** avec `layout` seul (styles, numérotation, en-têtes…
 * régénérés). Sert à mesurer ce que l'export neuf sait reconstruire ; le score y est
 * structurellement plus bas et le seuil s'y applique quand même (ajuster `--threshold`).
 *
 * Chargement des sources : le paquet `word` importe `@aster-editor/core` et ses modules
 * sans extension, ce que Node ne résout pas seul ; on bundle `packages/word/src/index.ts`
 * avec esbuild (déjà présent pour le playground vanilla) en laissant les dépendances
 * externes, dans `node_modules/.cache/aster-fidelity/`, puis on l'importe. jsdom fournit
 * `DOMParser`, `XMLSerializer` et `document` avant cet import. Node 24 strippe les types
 * de ce script lui-même.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORD_ENTRY = resolve(ROOT, 'packages/word/src/index.ts');
const BUNDLE_DIR = resolve(ROOT, 'node_modules/.cache/aster-fidelity');
const BUNDLE = resolve(BUNDLE_DIR, 'word.mjs');
const DEFAULT_THRESHOLD = 0.98;

/** Codes de sortie : verdict OK / KO, usage, erreur d'exécution. */
const EXIT_OK = 0;
const EXIT_BELOW_THRESHOLD = 1;
const EXIT_USAGE = 2;
const EXIT_ERROR = 3;

/** Erreur d'exécution attendue (entrée absente, document illisible…) : message seul, sans pile. */
class ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

interface CliOptions {
  readonly input: string;
  readonly out?: string;
  readonly keep?: string;
  readonly threshold: number;
  /** `false` avec `--no-template` : export neuf avec `layout` seul. */
  readonly template: boolean;
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
  exportDocx(
    html: string,
    options: {
      layout?: object;
      template?: ArrayBuffer;
      onWarning?: (warning: { readonly code: string; readonly message: string }) => void;
    },
  ): Promise<Blob>;
  compareDocx(original: ArrayBuffer, result: ArrayBuffer): Promise<FidelityReportLike>;
}

function usage(): never {
  console.error(
    'Usage : node scripts/fidelity-report.ts <fichier.docx> [--out rapport.md] [--keep sortie.docx] [--threshold 0.98] [--no-template]',
  );
  console.error('  --threshold : nombre entre 0 et 1 (0,98 par défaut).');
  process.exit(EXIT_USAGE);
}

function parseArgs(argv: readonly string[]): CliOptions {
  let input: string | undefined;
  let out: string | undefined;
  let keep: string | undefined;
  let threshold = DEFAULT_THRESHOLD;
  let template = true;
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
    else if (arg === '--no-template') template = false;
    else if (arg.startsWith('--')) usage();
    else if (input === undefined) input = arg;
    else usage();
  }
  // Seuil borné à [0, 1] (R30-11) : `-1` rendait tout OK, `2` tout KO.
  if (input === undefined || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    usage();
  }
  return { input, out, keep, threshold, template };
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
  try {
    await access(path);
  } catch {
    throw new ReportError(`Fichier introuvable : ${path}`);
  }
  const bytes = await readFile(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Verdict du rapport : score et part de texte conservée, tous deux au seuil (R30-10). */
interface Verdict {
  readonly ok: boolean;
  readonly textKept: number;
  readonly textTotal: number;
  /** `kept / total`, `1` sans aucun paragraphe comparé. */
  readonly textRatio: number;
}

function verdictOf(report: FidelityReportLike, threshold: number): Verdict {
  const text = report.properties.find((property) => property.name === 'paragraph.text');
  const textKept = text?.kept ?? 0;
  const textTotal = text?.total ?? 0;
  const textRatio = textTotal === 0 ? 1 : textKept / textTotal;
  return {
    ok: report.score >= threshold && textRatio >= threshold,
    textKept,
    textTotal,
    textRatio,
  };
}

/**
 * Import stylé puis export sans modification : dans le gabarit (`template` + `layout`, la
 * mise en page est alors portée par le gabarit) ou, avec `--no-template`, export neuf avec
 * `layout` seul. Les avertissements d'import et d'export sont collectés ensemble.
 */
async function roundTrip(
  word: WordModule,
  original: ArrayBuffer,
  useTemplate: boolean,
): Promise<{ result: ArrayBuffer; warnings: readonly string[] }> {
  const imported = await word.importDocx(original, { fidelity: 'styled' });
  const warnings = imported.warnings.map((w) => `import \`${w.code}\` : ${w.message}`);
  const onWarning = (w: { readonly code: string; readonly message: string }): void => {
    warnings.push(`export \`${w.code}\` : ${w.message}`);
  };
  const blob = await word.exportDocx(
    imported.html,
    useTemplate
      ? { template: imported.template, layout: imported.layout, onWarning }
      : { layout: imported.layout, onWarning },
  );
  return { result: await blob.arrayBuffer(), warnings };
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
  useTemplate: boolean,
): string {
  const lines: string[] = [];
  const verdict = verdictOf(report, threshold);
  const mode = useTemplate
    ? 'export dans le gabarit (`template` + `layout`)'
    : 'export neuf avec `layout` (`--no-template`)';
  lines.push(`# Rapport de fidélité — ${name}`, '');
  lines.push(
    `**Score : ${String(report.score)}**, texte conservé ${String(verdict.textKept)}/${String(verdict.textTotal)} (${ratio(verdict.textKept, verdict.textTotal)}) — seuil ${String(threshold)} sur les deux, ${verdict.ok ? 'OK' : 'KO'} — ${mode}.`,
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
    lines.push("## Avertissements d'import et d'export", '');
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
  const { result, warnings } = await roundTrip(word, original, options.template);
  if (options.keep) await writeFile(options.keep, new Uint8Array(result));
  const report = await word.compareDocx(original, result);
  const markdown = renderMarkdown(
    basename(options.input),
    report,
    warnings,
    options.threshold,
    options.template,
  );
  if (options.out) {
    await writeFile(options.out, markdown, 'utf8');
    console.log(`Rapport écrit dans ${options.out}`);
  }
  console.log(markdown);
  const verdict = verdictOf(report, options.threshold);
  const compare = (value: number): string => (value >= options.threshold ? '>=' : '<');
  console.log(
    `Score ${String(report.score)} ${compare(report.score)} seuil ${String(options.threshold)} ; ` +
      `paragraph.text ${String(verdict.textKept)}/${String(verdict.textTotal)} (${ratio(verdict.textKept, verdict.textTotal)}) ${compare(verdict.textRatio)} seuil`,
  );
  process.exitCode = verdict.ok ? EXIT_OK : EXIT_BELOW_THRESHOLD;
}

/** Message d'une erreur d'exécution : jamais de pile ; un `ENOENT` nomme le chemin. */
function describeError(error: unknown): string {
  if (error instanceof ReportError) return error.message;
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const path = (error as { path?: unknown }).path;
    if (code === 'ENOENT' && typeof path === 'string')
      return `Fichier ou dossier introuvable : ${path}`;
    return `${error.name} : ${error.message}`;
  }
  return String(error);
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = EXIT_ERROR;
});
