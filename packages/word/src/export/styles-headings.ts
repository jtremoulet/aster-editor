import type { IRunStylePropertiesOptions, IStylesOptions } from 'docx';
import type { DefaultParagraph } from '@aster-editor/core';
import type { IParagraphStylePropertiesOptions } from 'docx';
import { parseColor } from './css.js';
import { sanitizeXmlText } from './sanitize.js';
import type { DocxExportOptions, DocxHeadingStyle, DocxNumberedHeadingsOptions } from './types.js';

/**
 * Titres `Heading 1..6` : numérotation (`numberedHeadings`), surcharges `headingStyles`
 * et styles par défaut du document (`docDefaults`). Module de `styles.ts` (ré-exporté par
 * lui) : découpage L45, aucune logique modifiée.
 */

/** Référence `numbering` de la numérotation des titres. */
export const HEADING_NUMBERING_REFERENCE = 'aster-headings';

/** Nombre de niveaux de titres HTML (`h1`..`h6`). */
export const HEADING_LEVELS = 6;

/** Numérotation des titres résolue : profondeur (1-6) et format. */
export interface HeadingNumbering {
  readonly levels: number;
  readonly format: 'decimal' | 'legal';
}

/** Entier borné à `[min, max]`, `fallback` s'il n'est pas un nombre fini. */
function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** `options.numberedHeadings` → numérotation effective, `null` si désactivée. */
export function resolveHeadingNumbering(
  option: boolean | DocxNumberedHeadingsOptions | undefined,
): HeadingNumbering | null {
  if (!option) return null;
  const options = option === true ? {} : option;
  return {
    levels: clampInt(options.levels, 1, HEADING_LEVELS, 3),
    format: options.format ?? 'decimal',
  };
}

/** Texte de niveau `%1.%2.` (décimal, point final) ou `%1.%2` (légal). */
export function headingLevelText(level: number, format: HeadingNumbering['format']): string {
  const parts = Array.from({ length: level + 1 }, (_, index) => `%${String(index + 1)}`);
  return format === 'legal' ? parts.join('.') : `${parts.join('.')}.`;
}

type MutableRunStyle = {
  -readonly [K in keyof IRunStylePropertiesOptions]: IRunStylePropertiesOptions[K];
};

/**
 * Propriétés de run que `docx` donne par défaut aux styles `Heading 1..6` (couleur
 * bleue, tailles décroissantes, italique en 4). `docx` remplace le `run` entier
 * quand on surcharge un titre : on repart de ces défauts pour ne changer que ce qui
 * est demandé.
 */
const HEADING_RUN_DEFAULTS: readonly IRunStylePropertiesOptions[] = [
  { color: '2E74B5', size: 32 },
  { color: '2E74B5', size: 26 },
  { color: '1F4D78', size: 24 },
  { color: '2E74B5', italics: true },
  { color: '2E74B5' },
  { color: '1F4D78' },
];

/** Clés `docx` des styles de titres par défaut, dans l'ordre `h1`..`h6`. */
const HEADING_STYLE_KEYS = [
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
] as const;

/** Clés des surcharges `headingStyles`, dans l'ordre `h1`..`h6`. */
const HEADING_HTML_KEYS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/** Couleur de titre : CSS (`#hex`, `rgb()`, nom) ou `RRGGBB` déjà au format Word. */
function headingColor(value: string): string | null {
  return parseColor(value) ?? (/^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null);
}

/** Fusionne une surcharge de titre avec les défauts de `docx` du niveau. */
function headingRun(
  defaults: IRunStylePropertiesOptions,
  override: DocxHeadingStyle | undefined,
): IRunStylePropertiesOptions {
  const run: MutableRunStyle = { ...defaults };
  if (!override) return run;
  const color = override.color === undefined ? null : headingColor(override.color);
  if (color) run.color = color;
  if (override.sizePt !== undefined && override.sizePt > 0)
    run.size = Math.round(override.sizePt * 2);
  if (override.bold !== undefined) run.bold = override.bold;
  if (override.italics !== undefined) run.italics = override.italics;
  if (override.font) run.font = sanitizeXmlText(override.font);
  return run;
}

type DefaultStyles = NonNullable<IStylesOptions['default']>;
type MutableDefaultStyles = { -readonly [K in keyof DefaultStyles]: DefaultStyles[K] };

/** Espacement `w:spacing` des `docDefaults`, en twips (`before`, `after`, `line` + `lineRule`). */
type DefaultSpacing = NonNullable<IParagraphStylePropertiesOptions['spacing']>;
type MutableSpacing = { -readonly [K in keyof DefaultSpacing]: DefaultSpacing[K] };

/** Point typographique fini et positif, borné comme le lecteur (±1584 pt, 132 lignes). */
function finitePt(value: number | undefined, max: number): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 && value <= max
    ? value
    : undefined;
}

/**
 * `layout.defaultParagraph` (session 5) → `w:pPrDefault/w:pPr/w:spacing` de l'export
 * neuf : `lineHeightPt` (exact) l'emporte sur `lineHeight` (multiple, en 240e), les
 * espacements avant et après passent en twips. Rien pour un objet vide ou des valeurs
 * irrecevables : `docx` garde alors l'interligne simple et 0 pt de Word.
 */
export function defaultParagraphSpacing(
  paragraph: DefaultParagraph | undefined,
): DefaultSpacing | undefined {
  if (!paragraph) return undefined;
  const spacing: MutableSpacing = {};
  const exact = finitePt(paragraph.lineHeightPt, 1584);
  const multiple = finitePt(paragraph.lineHeight, 132);
  if (exact !== undefined && exact > 0) {
    spacing.line = Math.round(exact * 20);
    spacing.lineRule = 'exact';
  } else if (multiple !== undefined && multiple > 0) {
    spacing.line = Math.round(multiple * 240);
    spacing.lineRule = 'auto';
  }
  const before = finitePt(paragraph.spacingBeforePt, 1584);
  if (before !== undefined) spacing.before = Math.round(before * 20);
  const after = finitePt(paragraph.spacingAfterPt, 1584);
  if (after !== undefined) spacing.after = Math.round(after * 20);
  return Object.keys(spacing).length > 0 ? spacing : undefined;
}

/**
 * Styles par défaut du document : police, taille et langue du texte courant
 * (`docDefaults`), interligne et espacements par défaut des paragraphes
 * (`layout.defaultParagraph`, session 5), et styles `Heading n` quand ils sont numérotés
 * ou surchargés. Sans option, rien n'est émis et `docx` garde ses propres défauts.
 */
export function buildDefaultStyles(
  options: DocxExportOptions,
  headings: HeadingNumbering | null,
): DefaultStyles {
  const defaults: MutableDefaultStyles = {};
  const run: MutableRunStyle = {};
  // Les options explicites priment champ par champ sur `layout` (export neuf).
  const family = options.defaultFont?.family ?? options.layout?.defaultFont?.family;
  if (family) run.font = sanitizeXmlText(family);
  const sizePt = options.defaultFont?.sizePt ?? options.layout?.defaultFont?.sizePt;
  if (sizePt !== undefined && sizePt > 0) run.size = Math.round(sizePt * 2);
  const lang = options.lang ?? options.layout?.lang;
  if (lang) run.language = { value: sanitizeXmlText(lang) };
  const spacing = defaultParagraphSpacing(options.layout?.defaultParagraph);
  if (Object.keys(run).length > 0 || spacing) {
    defaults.document = {
      ...(Object.keys(run).length > 0 ? { run } : {}),
      ...(spacing ? { paragraph: { spacing } } : {}),
    };
  }
  HEADING_STYLE_KEYS.forEach((key, index) => {
    const override = options.headingStyles?.[HEADING_HTML_KEYS[index] ?? 'h1'];
    const numbered = headings !== null && index < headings.levels;
    if (!override && !numbered) return;
    defaults[key] = {
      run: headingRun(HEADING_RUN_DEFAULTS[index] ?? {}, override),
      ...(numbered
        ? { paragraph: { numbering: { reference: HEADING_NUMBERING_REFERENCE, level: index } } }
        : {}),
    };
  });
  return defaults;
}
