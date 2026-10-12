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

/** Variables posées à chaud par les widgets, jamais déclarées par un thème. */
const RUNTIME_VARIABLES: ReadonlySet<string> = new Set([
  '--aster-swatch',
  '--aster-table-grid-cols',
]);

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
  });

  it('chaque var(--aster-*) utilisée dans les CSS est définie dans les deux thèmes', () => {
    const used = new Set<string>();
    for (const file of readdirSync(THEMES_DIR)) {
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
});
