import type { DocumentLayout, PageSizeName } from '@aster-editor/core';
import type {
  IBorderOptions,
  ICharacterStyleOptions,
  INumberingOptions,
  IParagraphStyleOptions,
  IRunStylePropertiesOptions,
  IStylesOptions,
} from 'docx';
import type { ListDefinition } from './context';
import { parseColor, type CssBorder } from './css';
import type { DocxModule } from './docx-module';
import { sanitizeXmlText } from './sanitize';
import type {
  DocxExportOptions,
  DocxExportWarning,
  DocxHeadingStyle,
  DocxNumberedHeadingsOptions,
  DocxPageOrientation,
  DocxPageSize,
} from './types';

/** Police à chasse fixe des blocs et marques de code. */
export const CODE_FONT = 'Consolas';

/** Attribut du style Word d'origine d'un bloc ou d'un tableau (contrat `docxStyle`). */
export const DOCX_STYLE_ATTRIBUTE = 'data-docx-style';

/** Attribut de la numérotation Word d'origine d'une liste (`ListLayoutAttrs.docxNumId`). */
export const DOCX_NUM_ID_ATTRIBUTE = 'data-docx-num-id';

/**
 * Posé par l'import sur un paragraphe de liste dont `margin-left` / `text-indent` viennent
 * du niveau de numérotation : la numérotation Word les porte déjà, on ne les réécrit pas.
 */
export const NUM_INDENT_ATTRIBUTE = 'data-docx-num-indent';

/**
 * Espace texte-trait (`w:space`, en points) d'une bordure de paragraphe. Le contrat
 * `BlockBorder` ne le porte pas et l'import ne le lit pas : on reprend la valeur que Word
 * écrit lui-même. Par défaut **1 pt** sur chaque côté : c'est ce que Word donne à un
 * encadré (bordure haute ou basse présente, fixture 12 : quatre côtés à `w:space="1"`),
 * et un filet horizontal seul en a autant. Seul un filet vertical **seul** (barre de
 * citation à gauche ou à droite, sans bordure haute ni basse) prend les **4 pt** du
 * réglage par défaut de Word pour ce cas, faute d'original connu. `sides` est l'ensemble
 * des côtés bordés du paragraphe.
 */
export function paragraphBorderSpace(side: string, sides: ReadonlySet<string>): number {
  const vertical = side === 'left' || side === 'right';
  return vertical && !sides.has('top') && !sides.has('bottom') ? 4 : 1;
}

/**
 * Bordure CSS → `IBorderOptions` : épaisseur en huitièmes de point, couleur `RRGGBB`,
 * espace texte-trait selon `paragraphBorderSpace` (`sides` = côtés bordés du bloc ; pour
 * une cellule, un ensemble vide donne 1 pt partout). Le style `solid` du contrat est le
 * `single` de Word.
 */
export function borderOptions(
  border: CssBorder,
  side: string,
  sides: ReadonlySet<string> = new Set(),
): IBorderOptions {
  return {
    style: border.style === 'solid' ? 'single' : border.style,
    size: Math.max(2, Math.round(border.widthPt * 8)),
    color: border.color,
    space: paragraphBorderSpace(side, sides),
  };
}

/**
 * Identifiants des styles que l'export neuf définit toujours (ceux de `docx` plus ceux
 * d'Aster) : un `data-docx-style` hors de cette liste n'est écrit que si le gabarit le
 * définit. `TOCHeading` s'y ajoute avec une table des matières.
 */
export const GENERATED_STYLE_IDS: readonly string[] = [
  'Normal',
  'Title',
  'Heading1',
  'Heading2',
  'Heading3',
  'Heading4',
  'Heading5',
  'Heading6',
  'Strong',
  'ListParagraph',
  'Hyperlink',
  'FootnoteReference',
  'FootnoteText',
  'FootnoteTextChar',
  'EndnoteReference',
  'EndnoteText',
  'EndnoteTextChar',
  'TableNormal',
  'Quote',
  'HTMLPreformatted',
  'Code',
];

/** Profondeur de liste couverte par chaque numérotation (Word en accepte 9). */
export const LIST_LEVELS = 9;

/** Retrait gauche d'un niveau de liste, en twips (720 = 1,27 cm). */
export const LIST_INDENT = 720;

/** Retrait des citations, en twips. */
export const QUOTE_INDENT = 720;

/** Référence `numbering` de la numérotation des titres. */
export const HEADING_NUMBERING_REFERENCE = 'aster-headings';

/** Nombre de niveaux de titres HTML (`h1`..`h6`). */
export const HEADING_LEVELS = 6;

/**
 * Identifiants de styles définis dans le document. Ils correspondent aux noms que la
 * style map d'import (`style-map.ts`) reconnaît : un aller-retour export → import
 * restitue ainsi `blockquote`, `pre` et `code`.
 */
export const STYLE_IDS = {
  quote: 'Quote',
  preformatted: 'HTMLPreformatted',
  code: 'Code',
  hyperlink: 'Hyperlink',
  /** Titre de la table des matières, hors des niveaux de titre pour ne pas s'y lister. */
  tocHeading: 'TOCHeading',
  /** Style Word des paragraphes de note de bas de page, fourni par `docx`. */
  footnoteText: 'FootnoteText',
} as const;

/** Formats de numérotation d'une liste HTML (`ol type`) et des puces. */
export type ListKind =
  'bullet' | 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman';

/** Attribut `type` d'un `<ol>` → format de niveau. Décimal par défaut. */
export function listKindFromType(type: string | null): ListKind {
  switch (type) {
    case 'a':
      return 'lowerLetter';
    case 'A':
      return 'upperLetter';
    case 'i':
      return 'lowerRoman';
    case 'I':
      return 'upperRoman';
    default:
      return 'decimal';
  }
}

/** Puces Word par niveau, cyclées au-delà de trois. */
const BULLET_GLYPHS = [String.fromCharCode(0x2022), 'o', String.fromCharCode(0x25aa)] as const;

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
function headingLevelText(level: number, format: HeadingNumbering['format']): string {
  const parts = Array.from({ length: level + 1 }, (_, index) => `%${String(index + 1)}`);
  return format === 'legal' ? parts.join('.') : `${parts.join('.')}.`;
}

/**
 * Numérotations du document : une par liste HTML rencontrée (voir `ListDefinition`),
 * chacune sur `LIST_LEVELS` niveaux avec un retrait croissant. Les numéros reprennent
 * le format à chaque niveau (`%1.`, `%2.`…) pour rester lisibles dans Word. Le `start`
 * de la liste est posé sur le niveau qu'elle occupe ; `docx` le recopie en
 * `startOverride` de l'instance quand c'est le niveau 0. S'y ajoute la numérotation
 * des titres, dont chaque niveau est lié au style `Heading n` (`w:pStyle`) en export
 * neuf ; en export dans le gabarit (`linkHeadingStyles` faux), les styles du gabarit ne
 * sont pas modifiés et ses identifiants peuvent différer : les niveaux ne sont liés à
 * aucun style, chaque titre porte sa numérotation en `w:numPr` direct.
 */
export function buildNumbering(
  docx: DocxModule,
  lists: readonly ListDefinition[],
  headings: HeadingNumbering | null = null,
  linkHeadingStyles = true,
): INumberingOptions {
  const { AlignmentType, LevelFormat } = docx;
  const formats: Record<ListKind, (typeof LevelFormat)[keyof typeof LevelFormat]> = {
    bullet: LevelFormat.BULLET,
    decimal: LevelFormat.DECIMAL,
    lowerLetter: LevelFormat.LOWER_LETTER,
    upperLetter: LevelFormat.UPPER_LETTER,
    lowerRoman: LevelFormat.LOWER_ROMAN,
    upperRoman: LevelFormat.UPPER_ROMAN,
  };
  const config: INumberingOptions['config'][number][] = lists.map((list) => ({
    reference: list.reference,
    levels: Array.from({ length: LIST_LEVELS }, (_, level) => ({
      level,
      format: formats[list.kind],
      start: level === list.level ? list.start : 1,
      text:
        list.kind === 'bullet'
          ? (BULLET_GLYPHS[level % BULLET_GLYPHS.length] ?? BULLET_GLYPHS[0])
          : `%${String(level + 1)}.`,
      alignment: AlignmentType.LEFT,
      style: {
        paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: 360 } },
      },
    })),
  }));
  if (headings) {
    config.push({
      reference: HEADING_NUMBERING_REFERENCE,
      levels: Array.from({ length: headings.levels }, (_, level) => ({
        level,
        format: LevelFormat.DECIMAL,
        start: 1,
        text: headingLevelText(level, headings.format),
        alignment: AlignmentType.LEFT,
        ...(headings.format === 'legal' ? { isLegalNumberingStyle: true } : {}),
        ...(linkHeadingStyles ? { style: { style: `Heading${String(level + 1)}` } } : {}),
      })),
    });
  }
  return { config };
}

/**
 * Styles de paragraphe : `Quote` (citation, italique indentée), `HTMLPreformatted`
 * (bloc de code, Consolas) et, avec une table des matières, `TOC Heading` pour son
 * titre. Les deux premiers identifiants sont ceux que mammoth réimporte en
 * `blockquote` et `pre`.
 */
export function buildParagraphStyles(withToc = false): IParagraphStyleOptions[] {
  const styles: IParagraphStyleOptions[] = [
    {
      id: STYLE_IDS.quote,
      name: 'Quote',
      basedOn: 'Normal',
      next: 'Normal',
      run: { italics: true, color: '404040' },
      paragraph: { indent: { left: QUOTE_INDENT, right: QUOTE_INDENT } },
    },
    {
      id: STYLE_IDS.preformatted,
      name: 'HTML Preformatted',
      basedOn: 'Normal',
      next: STYLE_IDS.preformatted,
      run: { font: CODE_FONT, size: 20 },
      paragraph: { spacing: { after: 0 } },
    },
  ];
  if (withToc) {
    styles.push({
      id: STYLE_IDS.tocHeading,
      name: 'TOC Heading',
      basedOn: 'Normal',
      next: 'Normal',
      run: { bold: true, size: 32, color: '2E74B5' },
      paragraph: { spacing: { before: 240, after: 120 }, keepNext: true },
    });
  }
  return styles;
}

/** Style de caractère `Code`, que mammoth réimporte en `<code>`. */
export function buildCharacterStyles(): ICharacterStyleOptions[] {
  return [{ id: STYLE_IDS.code, name: 'Code', run: { font: CODE_FONT } }];
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

/**
 * Styles par défaut du document : police, taille et langue du texte courant
 * (`docDefaults`), et styles `Heading n` quand ils sont numérotés ou surchargés. Sans
 * option, rien n'est émis et `docx` garde ses propres défauts.
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
  if (Object.keys(run).length > 0) defaults.document = { run };
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

/** Dimensions de page en twips (1/20 de point). */
export interface PageDimensions {
  readonly width: number;
  readonly height: number;
}

/** A4 = 210 × 297 mm, Letter = 8,5 × 11 pouces. */
export function pageDimensions(size: DocxPageSize): PageDimensions {
  return size === 'LETTER' ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 };
}

/** Formats nommés du contrat de mise en page (`PageSizeName`), en twips portrait. */
const NAMED_PAGE_SIZES: Readonly<Record<PageSizeName, PageDimensions>> = {
  A3: { width: 16838, height: 23811 },
  A4: { width: 11906, height: 16838 },
  A5: { width: 8391, height: 11906 },
  Letter: { width: 12240, height: 15840 },
  Legal: { width: 12240, height: 20160 },
};

/** `DocumentLayout.page.size` → dimensions portrait en twips, `null` si absent ou invalide. */
function layoutPageDimensions(
  size: NonNullable<DocumentLayout['page']>['size'],
): PageDimensions | null {
  if (size === undefined) return null;
  if (typeof size === 'string') return NAMED_PAGE_SIZES[size] ?? null;
  const { widthMm, heightMm } = size;
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
    return null;
  }
  return { width: mmToTwips(widthMm), height: mmToTwips(heightMm) };
}

/** Marge de page par défaut (1 pouce), en twips. */
export const PAGE_MARGIN = 1440;

/** Millimètres → twips (1 pouce = 25,4 mm = 1440 twips). */
export function mmToTwips(mm: number): number {
  return Math.round((mm * 1440) / 25.4);
}

/** Marges de page en twips. */
export interface PageMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Mise en page résolue : dimensions portrait (docx les inverse lui-même en paysage), marges, largeur utile. */
export interface PageLayout extends PageDimensions {
  /** Format nommé de l'option, `A4` pour un format du contrat (`A3`, `Legal`, libre…). */
  readonly size: DocxPageSize;
  readonly orientation: DocxPageOrientation;
  readonly margins: PageMargins;
  /** Distance du bord à l'en-tête et au pied, en twips (708 par défaut, comme Word). */
  readonly headerDistance: number;
  readonly footerDistance: number;
  /** Largeur utile en pixels à 96 dpi, plafond des images et des tables. */
  readonly contentWidthPx: number;
}

/** Distance par défaut du bord de page à l'en-tête ou au pied, en twips (1,25 cm). */
export const HEADER_DISTANCE = 708;

/** Zone utile minimale laissée par les marges, en twips (1 cm), dans chaque sens. */
export const MIN_CONTENT_EXTENT = mmToTwips(10);

/**
 * Marge en twips depuis une valeur en mm, défaut si absente. Une valeur négative ou
 * non finie prend aussi le défaut, avec avertissement `page-margins-clamped` : Word
 * refuse un `w:pgMar` négatif.
 */
function marginTwips(
  name: keyof PageMargins,
  mm: number | undefined,
  warnings: DocxExportWarning[],
): number {
  if (mm === undefined) return PAGE_MARGIN;
  if (!Number.isFinite(mm) || mm < 0) {
    warnings.push({
      code: 'page-margins-clamped',
      message: `Marge ${name} invalide (${String(mm)} mm), défaut de 25,4 mm appliqué`,
    });
    return PAGE_MARGIN;
  }
  return mmToTwips(mm);
}

/**
 * Réduit deux marges opposées, à proportion, pour laisser au moins `MIN_CONTENT_EXTENT`
 * sur `extent` (largeur ou hauteur de page), avec avertissement : des marges qui se
 * recouvrent donnent une zone de texte négative que Word refuse d'afficher.
 */
function clampMargins(
  first: number,
  second: number,
  extent: number,
  axis: string,
  warnings: DocxExportWarning[],
): [number, number] {
  const available = extent - MIN_CONTENT_EXTENT;
  const total = first + second;
  if (total <= available) return [first, second];
  const scale = available / total;
  warnings.push({
    code: 'page-margins-clamped',
    message: `Marges ${axis} (${String(total)} twips) plus grandes que la page : réduites pour laisser 1 cm utile`,
  });
  return [Math.floor(first * scale), Math.floor(second * scale)];
}

/** Distance d'en-tête ou de pied en twips depuis `layout.page.margins`, défaut si absente ou invalide. */
function distanceTwips(mm: number | undefined): number {
  if (mm === undefined || !Number.isFinite(mm) || mm < 0) return HEADER_DISTANCE;
  return mmToTwips(mm);
}

/**
 * `options.page` (et `pageSize` en repli), complété champ par champ par `options.layout`
 * (contrat `DocumentLayout`, en général celui de l'import) → mise en page. En paysage, la
 * largeur utile est celle du grand côté : `docx` inverse `w:w`/`w:h` quand
 * `w:orient="landscape"`, on lui donne donc toujours les dimensions portrait. Les marges
 * invalides ou qui ne laissent pas 1 cm utile sont corrigées et signalées dans `warnings`.
 */
export function resolvePageLayout(
  options: DocxExportOptions,
  warnings: DocxExportWarning[] = [],
): PageLayout {
  const page = options.layout?.page;
  const size = options.page?.size ?? options.pageSize ?? 'A4';
  const fromLayout =
    options.page?.size || options.pageSize ? null : layoutPageDimensions(page?.size);
  const orientation = options.page?.orientation ?? page?.orientation ?? 'portrait';
  const { width, height } = fromLayout ?? pageDimensions(size);
  const horizontal = orientation === 'landscape' ? height : width;
  const vertical = orientation === 'landscape' ? width : height;
  const requested = options.page?.margins;
  const layoutMargins = page?.margins;
  const [left, right] = clampMargins(
    marginTwips('left', requested?.left ?? layoutMargins?.leftMm, warnings),
    marginTwips('right', requested?.right ?? layoutMargins?.rightMm, warnings),
    horizontal,
    'gauche + droite',
    warnings,
  );
  const [top, bottom] = clampMargins(
    marginTwips('top', requested?.top ?? layoutMargins?.topMm, warnings),
    marginTwips('bottom', requested?.bottom ?? layoutMargins?.bottomMm, warnings),
    vertical,
    'haut + bas',
    warnings,
  );
  const margins: PageMargins = { top, right, bottom, left };
  const usable = horizontal - margins.left - margins.right;
  return {
    size,
    orientation,
    width,
    height,
    margins,
    headerDistance: distanceTwips(layoutMargins?.headerMm),
    footerDistance: distanceTwips(layoutMargins?.footerMm),
    contentWidthPx: Math.max(1, Math.floor((usable / 1440) * 96)),
  };
}

/**
 * Largeur utile de la page en pixels à 96 dpi : plafond des images pour qu'elles ne
 * débordent jamais de la zone de texte (portrait, marges par défaut).
 */
export function contentWidthPx(size: DocxPageSize): number {
  return Math.floor(((pageDimensions(size).width - 2 * PAGE_MARGIN) / 1440) * 96);
}
