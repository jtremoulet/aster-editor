// Test d'installation à blanc : emballe les quatre paquets (`npm pack`), les
// installe dans un projet vierge hors du monorepo, puis vérifie ce que le
// monorepo ne teste jamais (il résout tout via les `paths` de tsconfig) :
// - les `exports` et les types se résolvent par les vrais `node_modules` ;
// - les imports nus entre paquets (`@aster-editor/core` depuis `ui`) fonctionnent ;
// - le sous-chemin CSS `@aster-editor/ui/themes/aster.css` est servi ;
// - esbuild sait empaqueter l'usage vanilla ;
// - `ngc` compile un composant standalone qui utilise `<aster-editor>`.
//
// Usage : node scripts/smoke-install.mjs [--out <dossier>] [--skip-build]
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLISH_DIRS = ['packages/core', 'packages/word', 'packages/ui', 'packages/angular/dist'];

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex >= 0 && !args[outIndex + 1]) {
  console.error('Usage : node scripts/smoke-install.mjs [--out <dossier>] [--skip-build]');
  process.exit(1);
}
const OUT = resolve(outIndex >= 0 ? args[outIndex + 1] : join(tmpdir(), 'aster-smoke'));

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}  (${cwd})`);
  const result = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n✖ Échec : ${cmd}`);
    process.exit(result.status ?? 1);
  }
}

function capture(cmd, cwd) {
  const result = spawnSync(cmd, { cwd, encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    console.error(`\n✖ Échec : ${cmd}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

// 0. Versions à installer : celles du monorepo, pour tester exactement ce qui est publié.
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const angularVersion =
  (rootPkg.dependencies ?? {})['@angular/core'] ?? rootPkg.devDependencies['@angular/core'];
const typescriptVersion =
  rootPkg.devDependencies['typescript'] ?? (rootPkg.dependencies ?? {})['typescript'];

// 1. Build puis pack.
if (!args.includes('--skip-build')) run('npm run build', ROOT);
rmSync(OUT, { recursive: true, force: true });
const tarballDir = join(OUT, 'tarballs');
mkdirSync(tarballDir, { recursive: true });
for (const dir of PUBLISH_DIRS) {
  run(`npm pack --pack-destination "${tarballDir}"`, join(ROOT, dir));
}
const tarballs = readdirSync(tarballDir).map((f) => join(tarballDir, f));
if (tarballs.length !== PUBLISH_DIRS.length) {
  console.error(`✖ ${tarballs.length} tarballs au lieu de ${PUBLISH_DIRS.length}`);
  process.exit(1);
}

// 2. Projet vierge : package.json minimal, installation des tarballs + peers Angular.
const app = join(OUT, 'app');
mkdirSync(join(app, 'src'), { recursive: true });
writeFileSync(
  join(app, 'package.json'),
  JSON.stringify({ name: 'aster-smoke', private: true, type: 'module' }, null, 2),
);
const peers = [
  `@angular/core@${angularVersion}`,
  `@angular/common@${angularVersion}`,
  `@angular/forms@${angularVersion}`,
  `@angular/platform-browser@${angularVersion}`,
  `@angular/compiler@${angularVersion}`,
  `@angular/compiler-cli@${angularVersion}`,
  `typescript@${typescriptVersion}`,
  'esbuild@0.25.x',
];
run(
  `npm install --no-audit --no-fund --loglevel=error ${tarballs.map((t) => `"${t}"`).join(' ')} ${peers.join(' ')}`,
  app,
);

// 2b. Une seule copie physique de @tiptap/core : un épinglage trop strict dans nos paquets
// en ferait installer plusieurs (plugins ProseMirror dupliqués chez le client).
writeFileSync(
  join(app, 'tiptap-copies.mjs'),
  `import { readdirSync } from 'node:fs';
const walk = (dir, out) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const path = dir + '/' + entry.name;
    if (path.endsWith('@tiptap/core')) out.push(path);
    else walk(path, out);
  }
  return out;
};
console.log(JSON.stringify(walk('node_modules', [])));
`,
);
const tiptapCopies = JSON.parse(capture('node tiptap-copies.mjs', app));
if (tiptapCopies.length !== 1) {
  console.error(
    `✖ ${tiptapCopies.length} copies de @tiptap/core installées au lieu de 1 (intervalles trop stricts ?) :`,
    tiptapCopies,
  );
  process.exit(1);
}
console.log('✔ une seule copie de @tiptap/core');

// 3. Résolution des sous-chemins (exports) depuis Node.
const probe = `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const css = require.resolve('@aster-editor/ui/themes/aster.css');
const core = require.resolve('@aster-editor/core');
console.log(JSON.stringify({ css, core }));
`;
writeFileSync(join(app, 'probe.mjs'), probe);
const resolved = JSON.parse(capture('node probe.mjs', app));
if (!resolved.css.endsWith('aster.css') || !existsSync(resolved.css)) {
  console.error('✖ Feuille aster.css non résolue :', resolved);
  process.exit(1);
}
console.log('✔ exports résolus :', resolved);

// 4. Usage vanilla : typecheck strict + bundle esbuild.
writeFileSync(
  join(app, 'src', 'vanilla.ts'),
  `import { createEditor, type AsterEditor } from '@aster-editor/core';
import { createAster } from '@aster-editor/ui';
import { importDocx, exportDocx, normalizeWordHtml } from '@aster-editor/word';

export function mount(host: HTMLElement): AsterEditor {
  const aster = createAster(host, { toolbar: 'full', variables: { values: { nom: 'Ada' } } });
  const html: string = aster.editor.getHTML({ variables: 'resolve' });
  void normalizeWordHtml(html);
  void importDocx;
  void exportDocx;
  void createEditor;
  return aster.editor;
}
`,
);
writeFileSync(
  join(app, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        lib: ['es2022', 'dom'],
        skipLibCheck: false,
        noEmit: true,
        experimentalDecorators: false,
        useDefineForClassFields: false,
      },
      files: ['src/vanilla.ts'],
    },
    null,
    2,
  ),
);
run('npx tsc -p tsconfig.json', app);
run(
  'npx esbuild src/vanilla.ts --bundle --format=esm --platform=browser --log-level=warning --outfile=dist/vanilla.js',
  app,
);
console.log('✔ vanilla : typecheck strict et bundle esbuild OK');

// 5. Usage Angular : composant standalone compilé par ngc avec strictTemplates.
writeFileSync(
  join(app, 'src', 'smoke.component.ts'),
  `import { Component, signal, type ApplicationConfig } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AsterEditorComponent, provideAster } from '@aster-editor/angular';
import type { VariableValues } from '@aster-editor/core';

@Component({
  selector: 'app-smoke',
  imports: [AsterEditorComponent, ReactiveFormsModule],
  template: \`
    <aster-editor
      [formControl]="control"
      toolbar="full"
      [variableValues]="values()"
      (variablesChanged)="onValues($event)"
    />
  \`,
})
export class SmokeComponent {
  readonly control = new FormControl<string>('<p>Bonjour {{nom}}</p>', { nonNullable: true });
  readonly values = signal<VariableValues>({ nom: 'Ada' });
  onValues(next: VariableValues): void {
    this.values.set(next);
  }
}

export const appConfig: ApplicationConfig = { providers: [provideAster({ locale: 'fr' })] };
`,
);
writeFileSync(
  join(app, 'tsconfig.ng.json'),
  JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        lib: ['es2022', 'dom'],
        skipLibCheck: false,
        noEmit: true,
        experimentalDecorators: false,
        useDefineForClassFields: false,
      },
      angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true },
      files: ['src/smoke.component.ts'],
    },
    null,
    2,
  ),
);
run('npx ngc -p tsconfig.ng.json', app);
console.log('✔ angular : composant standalone compilé par ngc (strictTemplates)');

console.log(`\n✔ Installation à blanc réussie dans ${OUT}`);
