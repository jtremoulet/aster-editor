import type {
  BlockBorder,
  CellVerticalAlign,
  DecorationStyle,
  DocumentLayout,
  OrderedListType,
  UploadHandler,
} from '@aster-editor/core';
import type { DocxImportWarning, DocxLostObject, DocxLostWhere } from '../types';

/**
 * Types du lecteur OOXML (session 3). Figés en phase 0 : `index.ts` orchestre, chaque
 * module (`styles`, `runs`, `paragraphs`, `tables`, `lists`, `images`, `notes`,
 * `headers`, `sections`, `lost`) implémente une de ces interfaces et ne connaît les
 * autres que par le `ConverterContext`.
 */

/** Parseur XML injectable (`DOMParser` global par défaut), jamais le `document`. */
export type XmlParse = (xml: string) => Document;

export interface ReaderOptions {
  readonly upload?: UploadHandler;
  /** Conserver les notes en liste finale. */
  readonly footnotes: boolean;
  readonly emptyParagraphs: 'keep' | 'drop';
  readonly parseXml: XmlParse;
}

export interface ReaderResult {
  readonly html: string;
  readonly layout: DocumentLayout;
  readonly lost: readonly DocxLostObject[];
  readonly warnings: readonly DocxImportWarning[];
}

/** Relation d'une partie (`_rels/*.rels`). `target` est déjà résolu en chemin absolu du zip. */
export interface Relationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external: boolean;
}

/** Accès en lecture au paquet `.docx` : parties XML parsées (en cache), binaires, relations. */
export interface DocxPackage {
  /** Chemin de la partie principale, en général `word/document.xml`. */
  readonly mainPart: string;
  has(path: string): boolean;
  /** Partie XML parsée, `null` si absente ou illisible (avertissement posé par l'appelant). */
  part(path: string): Promise<Document | null>;
  binary(path: string): Promise<Uint8Array | null>;
  /** Relations de la partie donnée, vide si elle n'en a pas. */
  rels(partPath: string): Promise<ReadonlyMap<string, Relationship>>;
  /** Partie liée par type (suffixe de l'URI, ex. `styles`, `numbering`, `footnotes`). */
  related(partPath: string, typeSuffix: string): Promise<string | null>;
}

/** Propriétés de run résolues (style de caractère + style de paragraphe + défauts + directes). */
export interface ResolvedRunProps {
  readonly fontFamily?: string;
  readonly fontSizePt?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: DecorationStyle | null;
  readonly strike?: DecorationStyle | null;
  readonly color?: string;
  readonly highlight?: string;
  readonly superscript?: boolean;
  readonly subscript?: boolean;
  readonly letterSpacingPt?: number;
  readonly caps?: 'all' | 'small';
  readonly runStyle?: string;
  readonly lang?: string;
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type ParagraphAlign = 'left' | 'center' | 'right' | 'justify';

/** Propriétés de paragraphe résolues (style hérité + propriétés directes). */
export interface ResolvedParagraphProps {
  readonly styleId?: string;
  readonly headingLevel?: HeadingLevel;
  readonly align?: ParagraphAlign;
  readonly lineHeight?: number;
  readonly lineHeightPt?: number;
  readonly spacingBeforePt?: number;
  readonly spacingAfterPt?: number;
  readonly indentLeftPt?: number;
  readonly indentRightPt?: number;
  readonly indentFirstLinePt?: number;
  readonly borders?: readonly BlockBorder[];
  readonly shading?: string;
  readonly keepWithNext?: boolean;
  readonly pageBreakBefore?: boolean;
  readonly numbering?: { readonly numId: string; readonly level: number };
  /** Défauts de run hérités du style de paragraphe, base de la résolution des runs. */
  readonly runDefaults: ResolvedRunProps;
}

export interface TableStyleProps {
  readonly borders?: readonly BlockBorder[];
  readonly cellBorders?: readonly BlockBorder[];
  readonly cellShading?: string;
  readonly cellPaddingPt?: readonly [number, number, number, number];
  readonly runDefaults?: ResolvedRunProps;
}

/** Résolution des styles (`styles.xml`, `docDefaults`, thème). Implémenté par `styles.ts` (L24). */
export interface StyleResolver {
  paragraph(pPr: Element | null): ResolvedParagraphProps;
  run(rPr: Element | null, paragraph: ResolvedParagraphProps): ResolvedRunProps;
  tableStyle(styleId: string | null): TableStyleProps | null;
  defaultFont(): { readonly family?: string; readonly sizePt?: number };
}

export type ListFormat = 'bullet' | OrderedListType | 'none';

export interface ListLevel {
  readonly level: number;
  readonly format: ListFormat;
  /** Puce ou modèle de texte (`%1.`), tel que Word le donne. */
  readonly text: string;
  readonly start: number;
  readonly indentLeftPt?: number;
  readonly hangingPt?: number;
}

export interface ListDefinition {
  readonly numId: string;
  readonly levels: readonly ListLevel[];
}

/** Résolution de `numbering.xml`. Implémenté par `lists.ts` (L25). */
export interface NumberingResolver {
  definition(numId: string): ListDefinition | null;
}

export interface ParagraphBlock {
  readonly kind: 'paragraph';
  /** HTML complet du bloc (`<p …>…</p>` ou `<hN …>…</hN>`). */
  readonly html: string;
  readonly numbering?: { readonly numId: string; readonly level: number };
  readonly isEmpty: boolean;
}

export interface TableBlock {
  readonly kind: 'table';
  readonly html: string;
}

/** Bloc déjà rendu : saut de page (`<hr data-page-break>`), texte d'un objet perdu… */
export interface RawBlock {
  readonly kind: 'raw';
  readonly html: string;
}

export type Block = ParagraphBlock | TableBlock | RawBlock;

/** Conversion des dessins. Implémenté par `images.ts` (L25). */
export interface ImageConverter {
  /** `<img …>` ou chaîne vide si l'image est ignorée (avertissement posé). */
  drawing(drawing: Element, ctx: ConverterContext): Promise<string>;
}

/** Notes de bas de page et de fin. Implémenté par `notes.ts` (L25). */
export interface NoteRegistry {
  /** HTML inline de l'appel de note (`<sup data-footnote-ref="n">n</sup>`). */
  reference(id: string, kind: 'footnote' | 'endnote', ctx: ConverterContext): string;
  /** Liste finale des notes référencées, vide s'il n'y en a pas ou si `footnotes` est faux. */
  render(ctx: ConverterContext): Promise<string>;
}

/** Points d'entrée de conversion, pour que les modules s'appellent sans dépendre des fichiers. */
export interface BlockConverters {
  paragraph(p: Element, ctx: ConverterContext): Promise<ParagraphBlock>;
  table(tbl: Element, ctx: ConverterContext): Promise<TableBlock>;
  /** Enfants bloc d'un conteneur (`w:body`, `w:tc`, `w:sdtContent`, `w:footnote`…). */
  blocks(container: Element, ctx: ConverterContext): Promise<Block[]>;
  /** Rendu HTML d'une suite de blocs, listes regroupées. */
  render(blocks: readonly Block[], ctx: ConverterContext): string;
}

export interface ConverterContext {
  readonly pkg: DocxPackage;
  /** Partie en cours de lecture (chemin zip), pour les relations et les images. */
  readonly part: string;
  readonly where: DocxLostWhere;
  readonly styles: StyleResolver;
  readonly numbering: NumberingResolver;
  readonly images: ImageConverter;
  readonly notes: NoteRegistry;
  readonly convert: BlockConverters;
  readonly options: ReaderOptions;
  readonly warnings: DocxImportWarning[];
  readonly lost: DocxLostObject[];
  /** Style de tableau courant (cellules), `null` hors tableau. */
  readonly tableStyle: TableStyleProps | null;
  readonly cellVerticalAlign?: CellVerticalAlign;
}

/** Contexte dérivé pour une autre partie (en-tête, note) ou un autre conteneur. */
export type ContextPatch = Partial<
  Pick<ConverterContext, 'part' | 'where' | 'tableStyle' | 'cellVerticalAlign'>
>;
