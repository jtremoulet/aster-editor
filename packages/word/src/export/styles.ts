import type {
  IBorderOptions,
  ICharacterStyleOptions,
  INumberingOptions,
  IParagraphStyleOptions,
} from 'docx';
import type { ListDefinition } from './context.js';
import type { CssBorder } from './css.js';
import type { DocxModule } from './docx-module.js';
import {
  HEADING_NUMBERING_REFERENCE,
  headingLevelText,
  type HeadingNumbering,
} from './styles-headings.js';

/**
 * Styles, numérotations et bordures de l'export : identifiants de styles, attributs du
 * contrat (`data-docx-*`), `IBorderOptions` d'une bordure CSS, numérotations des listes
 * et des titres, styles `Quote` / `HTMLPreformatted` / `Code`. Les titres et styles par
 * défaut (`styles-headings.ts`) et la mise en page (`styles-page.ts`) sont ré-exportés
 * d'ici : l'API du module est celle d'avant le découpage (L45).
 */

export {
  HEADING_LEVELS,
  HEADING_NUMBERING_REFERENCE,
  buildDefaultStyles,
  resolveHeadingNumbering,
  type HeadingNumbering,
} from './styles-headings.js';
export {
  HEADER_DISTANCE,
  MIN_CONTENT_EXTENT,
  PAGE_MARGIN,
  contentWidthPx,
  mmToTwips,
  pageDimensions,
  resolvePageLayout,
  type PageDimensions,
  type PageLayout,
  type PageMargins,
} from './styles-page.js';

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
 * Espace texte-trait maximal d'une bordure (`w:space`, `ST_PointMeasure`) : Word limite
 * l'interface à 31 pt et n'affiche pas au-delà (R43-07).
 */
export const MAX_BORDER_SPACE_PT = 31;

/**
 * Bordure CSS → `IBorderOptions` : épaisseur en huitièmes de point, couleur `RRGGBB`,
 * espace texte-trait lu dans `padding-<côté>` (`BlockBorder.spacePt`, session 4, plafonné
 * à `MAX_BORDER_SPACE_PT`) ou, à défaut, déduit par `paragraphBorderSpace` (`sides` =
 * côtés bordés du bloc ; pour une cellule, un ensemble vide donne 1 pt partout). Le style
 * `solid` du contrat est le `single` de Word.
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
    space: Math.min(MAX_BORDER_SPACE_PT, border.spacePt ?? paragraphBorderSpace(side, sides)),
  };
}

/** Bordure Word explicitement absente (`w:val="nil"`), sur un `w:pBdr` ou un `w:tcBorders`. */
export const NIL_BORDER: IBorderOptions = { style: 'nil' };

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
