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
});
