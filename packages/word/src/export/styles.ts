import type { ICharacterStyleOptions, INumberingOptions, IParagraphStyleOptions } from 'docx';
import type { DocxModule } from './docx-module';
import type { DocxPageSize } from './types';

/** Police à chasse fixe des blocs et marques de code. */
export const CODE_FONT = 'Consolas';

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
} as const;

/** Formats de numérotation d'une liste HTML (`ol type`) et des puces. */
export type ListKind =
  'bullet' | 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman';

/** Référence `numbering` d'une liste, une par format. */
export function numberingReference(kind: ListKind): string {
  return `aster-${kind}`;
}

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
 * Numérotations du document : une par `ListKind`, chacune sur `LIST_LEVELS` niveaux
 * avec un retrait croissant. Les numéros reprennent le format à chaque niveau
 * (`%1.`, `%2.`…) pour rester lisibles dans Word.
 */
export function buildNumbering(docx: DocxModule): INumberingOptions {
  const { AlignmentType, LevelFormat } = docx;
  const formats: Record<ListKind, (typeof LevelFormat)[keyof typeof LevelFormat]> = {
    bullet: LevelFormat.BULLET,
    decimal: LevelFormat.DECIMAL,
    lowerLetter: LevelFormat.LOWER_LETTER,
    upperLetter: LevelFormat.UPPER_LETTER,
    lowerRoman: LevelFormat.LOWER_ROMAN,
    upperRoman: LevelFormat.UPPER_ROMAN,
  };
  const kinds = Object.keys(formats) as ListKind[];
  return {
    config: kinds.map((kind) => ({
      reference: numberingReference(kind),
      levels: Array.from({ length: LIST_LEVELS }, (_, level) => ({
        level,
        format: formats[kind],
        text:
          kind === 'bullet'
            ? (BULLET_GLYPHS[level % BULLET_GLYPHS.length] ?? BULLET_GLYPHS[0])
            : `%${String(level + 1)}.`,
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: 360 } },
        },
      })),
    })),
  };
}

/**
 * Styles de paragraphe : `Quote` (citation, italique indentée) et `HTMLPreformatted`
 * (bloc de code, Consolas). Les identifiants sont ceux que mammoth réimporte en
 * `blockquote` et `pre`.
 */
export function buildParagraphStyles(): IParagraphStyleOptions[] {
  return [
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
}

/** Style de caractère `Code`, que mammoth réimporte en `<code>`. */
export function buildCharacterStyles(): ICharacterStyleOptions[] {
  return [{ id: STYLE_IDS.code, name: 'Code', run: { font: CODE_FONT } }];
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

/** Marge de page par défaut (1 pouce), en twips. */
export const PAGE_MARGIN = 1440;

/**
 * Largeur utile de la page en pixels à 96 dpi : plafond des images pour qu'elles ne
 * débordent jamais de la zone de texte.
 */
export function contentWidthPx(size: DocxPageSize): number {
  return Math.floor(((pageDimensions(size).width - 2 * PAGE_MARGIN) / 1440) * 96);
}
