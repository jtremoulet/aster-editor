import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tests de contraste et de cohérence des thèmes CSS. Les fichiers sont lus tels quels
 * (pas de parseur CSS) : chaque thème est un seul bloc `.aster[data-theme='…'] { … }`
 * de déclarations `--aster-*`, voir `themes/light.css`.
 */

/** Dossier `themes/` du paquet, relatif à ce fichier (`__dirname` est fourni par Vitest). */
const THEMES_DIR = join(__dirname, '..', 'themes');

/** Seuil WCAG 2.1 AA pour du texte normal. */
const AA_RATIO = 4.5;

/**
 * Variables posées à chaud par les widgets ou par le core (vue page : dimensions et marges
 * calculées depuis `DocumentLayout`), jamais déclarées par un thème.
 */
const RUNTIME_VARIABLES: ReadonlySet<string> = new Set([
  '--aster-swatch',
  '--aster-table-grid-cols',
  '--aster-page-width',
  '--aster-page-height',
  '--aster-page-margin-top',
  '--aster-page-margin-right',
  '--aster-page-margin-bottom',
  '--aster-page-margin-left',
  '--aster-page-margin-header',
  '--aster-page-margin-footer',
  // Pagination approximative (L30) : posées par le plugin `pagination` du core.
  '--aster-page-count',
  '--aster-page-gap-fill',
]);

/** Variables de vue page que chaque thème doit déclarer (documentées dans `page.css`). */
const PAGE_THEME_VARIABLES: readonly string[] = [
  '--aster-page-bg',
  '--aster-page-desk',
  '--aster-page-shadow',
  '--aster-page-desk-padding',
];

type Rgb = readonly [number, number, number];

function readTheme(name: string): Map<string, string> {
  const css = readFileSync(join(THEMES_DIR, `${name}.css`), 'utf8');
  const variables = new Map<string, string>();
  for (const match of css.matchAll(/(--aster-[\w-]+)\s*:\s*([^;]+);/g)) {
    variables.set(match[1] ?? '', (match[2] ?? '').replace(/\/\*.*?\*\//g, '').trim());
  }
  return variables;
}

function parseHex(value: string, name: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match)
    throw new Error(`${name} : couleur hexadécimale 6 chiffres attendue, reçu "${value}"`);
  const hex = match[1] ?? '';
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

/** Luminance relative WCAG d'une couleur sRGB. */
function luminance([r, g, b]: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Ratio de contraste WCAG entre deux couleurs, de 1 à 21. */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const THEMES = ['light', 'night'] as const;

/** Paires texte / fond dont le contraste doit atteindre AA. */
const PAIRS: readonly (readonly [string, string])[] = [
  ['--aster-text', '--aster-surface'],
  ['--aster-text', '--aster-surface-2'],
  ['--aster-text', '--aster-surface-3'],
  ['--aster-text-muted', '--aster-surface'],
  ['--aster-text', '--aster-highlight'],
  ['--aster-accent-contrast', '--aster-accent'],
  ['--aster-danger-contrast', '--aster-danger'],
  // Vue page : le corps du document est posé sur la feuille, ses libellés en muet aussi.
  ['--aster-text', '--aster-page-bg'],
  ['--aster-text-muted', '--aster-page-bg'],
];

describe('thèmes CSS', () => {
  describe.each(THEMES)('%s', (theme) => {
    const variables = readTheme(theme);

    it.each(PAIRS)('%s sur %s atteint un contraste AA (≥ 4,5 : 1)', (fg, bg) => {
      const ratio = contrastRatio(
        parseHex(variables.get(fg) ?? '', fg),
        parseHex(variables.get(bg) ?? '', bg),
      );
      expect(ratio, `${theme} : ${fg} sur ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        AA_RATIO,
      );
    });

    it('déclare les variables de vue page --aster-page-*', () => {
      for (const name of PAGE_THEME_VARIABLES) {
        expect(variables.has(name), `${theme} : ${name} manquante`).toBe(true);
      }
      // La feuille et le bureau sont des couleurs distinctes, pour que la feuille se voie.
      expect(variables.get('--aster-page-bg')).not.toBe(variables.get('--aster-page-desk'));
    });
  });

  it('chaque var(--aster-*) utilisée dans les CSS est définie dans les deux thèmes', () => {
    const used = new Set<string>();
    const files = readdirSync(THEMES_DIR);
    // Feuilles de composants attendues : la vérification porte sur chacune d'elles.
    for (const expected of [
      'base.css',
      'bubbles.css',
      'images-tables.css',
      'search-source.css',
      'variables.css',
      'page.css',
    ]) {
      expect(files, `${expected} manquant dans themes/`).toContain(expected);
    }
    for (const file of files) {
      if (!file.endsWith('.css') || file === 'light.css' || file === 'night.css') continue;
      const css = readFileSync(join(THEMES_DIR, file), 'utf8');
      for (const match of css.matchAll(/var\((--aster-[\w-]+)/g)) used.add(match[1] ?? '');
    }
    expect(used.size).toBeGreaterThan(20);
    for (const theme of THEMES) {
      const variables = readTheme(theme);
      const missing = Array.from(used).filter(
        (name) => !RUNTIME_VARIABLES.has(name) && !variables.has(name),
      );
      expect(missing, `variables absentes de ${theme}.css`).toEqual([]);
    }
  });

  it('light et night déclarent exactement les mêmes variables', () => {
    const light = Array.from(readTheme('light').keys()).sort();
    const night = Array.from(readTheme('night').keys()).sort();
    expect(night).toEqual(light);
  });

  it('aster.css importe page.css, qui rend la vue page, les en-têtes, pieds et sauts de page', () => {
    const aster = readFileSync(join(THEMES_DIR, 'aster.css'), 'utf8');
    expect(aster).toContain("@import './page.css';");
    // Importée après `base.css` : ses règles sur `.ProseMirror` doivent l'emporter.
    expect(aster.indexOf("'./page.css'")).toBeGreaterThan(aster.indexOf("'./base.css'"));
    const page = readFileSync(join(THEMES_DIR, 'page.css'), 'utf8');
    expect(page).toContain('.aster--page-view .aster-content .ProseMirror');
    expect(page).toContain('var(--aster-page-width, 210mm)');
    expect(page).toContain('.aster--page-view .aster-page-header');
    expect(page).toContain('.aster--page-view .aster-page-footer');
    expect(page).toContain('pointer-events: none');
    expect(page).toContain('user-select: none');
    expect(page).toContain('hr[data-page-break]');
    // Chaque variable runtime du core a un repli : la feuille s'affiche même sans `DocumentLayout`.
    for (const name of [
      '--aster-page-width',
      '--aster-page-height',
      '--aster-page-margin-top',
      '--aster-page-margin-right',
      '--aster-page-margin-bottom',
      '--aster-page-margin-left',
    ]) {
      expect(page, `${name} sans repli`).toMatch(new RegExp(`var\\(${name}, [\\d.]+mm\\)`));
    }
    const print = readFileSync(join(THEMES_DIR, 'print.css'), 'utf8');
    expect(print).toContain('.aster--page-view .aster-content .ProseMirror');
    expect(print).toContain('page-break-after: always');
    // Pas de règle `@page` globale (ses descripteurs n'acceptent pas `var()`), seulement une note.
    expect(print).not.toMatch(/^\s*@page\s*\{/m);
  });

  describe('vue page (R26)', () => {
    const page = readFileSync(join(THEMES_DIR, 'page.css'), 'utf8');
    const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    it('R26-01 : chaque variable de thème --aster-page-* a un repli (valeurs de light.css)', () => {
      // Preuve du relecteur : `var(--x)` seul → `padding: 0`, ni fond ni ombre sans thème.
      for (const name of PAGE_THEME_VARIABLES) {
        const uses = page.match(new RegExp(`var\\(${escapeRegExp(name)}[,)]`, 'g')) ?? [];
        expect(uses.length, `${name} jamais consommée par page.css`).toBeGreaterThan(0);
        expect(page, `${name} consommée sans repli`).not.toMatch(
          new RegExp(`var\\(${escapeRegExp(name)}\\)`),
        );
      }
      const light = readTheme('light');
      expect(page).toContain(
        `var(--aster-page-desk-padding, ${light.get('--aster-page-desk-padding') ?? ''})`,
      );
      expect(page).toContain(`var(--aster-page-desk, ${light.get('--aster-page-desk') ?? ''})`);
      expect(page).toContain(`var(--aster-page-shadow, ${light.get('--aster-page-shadow') ?? ''})`);
      expect(page).toContain('var(--aster-page-bg, #fff)');
    });

    it('R26-08 : en-tête et pied à opacité ≥ 0,7, texte AA sur la feuille dans les deux thèmes', () => {
      const block =
        /\.aster--page-view \.aster-page-header,\s*\.aster--page-view \.aster-page-footer \{([^}]*)\}/.exec(
          page,
        );
      const opacity = Number(/opacity:\s*([\d.]+)/.exec(block?.[1] ?? '')?.[1]);
      expect(opacity).toBeGreaterThanOrEqual(0.7);
      expect(opacity).toBeLessThanOrEqual(1);
      // Preuve du relecteur : à 0,55, texte clair `#1c1f26` sur `#ffffff` = 3,75 : 1 (< AA).
      for (const theme of THEMES) {
        const variables = readTheme(theme);
        const text = parseHex(variables.get('--aster-text') ?? '', '--aster-text');
        const sheet = parseHex(variables.get('--aster-page-bg') ?? '', '--aster-page-bg');
        const blended = [0, 1, 2].map((i) =>
          Math.round((text[i] ?? 0) * opacity + (sheet[i] ?? 0) * (1 - opacity)),
        ) as unknown as Rgb;
        const ratio = contrastRatio(blended, sheet);
        expect(
          ratio,
          `${theme} : en-tête à ${opacity} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(AA_RATIO);
      }
    });

    it('R26-09 : la règle print du saut de page en vue page vit dans page.css, après la règle écran', () => {
      const selector = '.aster--page-view .aster-content .ProseMirror hr[data-page-break]';
      const printAt = page.indexOf('@media print');
      expect(printAt).toBeGreaterThan(-1);
      const rule = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(
        page.slice(printAt),
      );
      expect(rule, 'règle print préfixée .aster--page-view absente de page.css').not.toBeNull();
      const body = rule?.[1] ?? '';
      expect(body).toContain('break-after: page');
      expect(body).toContain('page-break-after: always');
      expect(body).toMatch(/height:\s*0;/);
      expect(body).toMatch(/margin:\s*0;/);
      expect(body).toContain('background: transparent');
      expect(body).toContain('box-shadow: none');
      // Même spécificité (0,4,1) que la règle écran : elle gagne parce qu'elle vient après.
      expect(page.indexOf(selector)).toBeLessThan(printAt);
      // … et `page.css` est importée après `print.css`, dont la règle générique est en (0,3,1).
      const aster = readFileSync(join(THEMES_DIR, 'aster.css'), 'utf8');
      expect(aster.indexOf("'./page.css'")).toBeGreaterThan(aster.indexOf("'./print.css'"));
    });

    it('R30-02 : à l’impression, la feuille étirée à N pages retombe à min-height: 0 dans page.css', () => {
      const selector = '.aster--page-view .aster-content .ProseMirror';
      const rule = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'g');
      const printAt = page.indexOf('@media print');
      expect(printAt).toBeGreaterThan(-1);
      // Règle écran (sans média, avant le bloc print) : la feuille mesure N pages.
      const screen = [...page.slice(0, printAt).matchAll(rule)].map((match) => match[1] ?? '');
      expect(
        screen.some((body) => /min-height:\s*calc\(\s*var\(--aster-page-count/.test(body)),
      ).toBe(true);
      // Même sélecteur dans le bloc print, après : `min-height: 0` gagne la cascade sur
      // la règle écran, qui elle-même venait après celle de `print.css` (même spécificité).
      const print = [...page.slice(printAt).matchAll(rule)].map((match) => match[1] ?? '');
      expect(print.some((body) => /min-height:\s*0;/.test(body))).toBe(true);
      const printCss = readFileSync(join(THEMES_DIR, 'print.css'), 'utf8');
      const printCssAt = printCss.indexOf('@media print');
      expect(printCssAt).toBeGreaterThan(-1);
      expect(
        [...printCss.slice(printCssAt).matchAll(rule)].some((match) =>
          /min-height:\s*0;/.test(match[1] ?? ''),
        ),
      ).toBe(true);
    });
  });
});
