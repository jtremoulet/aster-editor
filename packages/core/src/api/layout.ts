/**
 * Contrat de mise en page (session 3). Partagé par `core` (attributs de paragraphe,
 * marques de run, vue page), `word` (lecture et écriture `.docx`) et `angular`.
 *
 * Principe : tout ce qui vient de Word et que l'éditeur sait représenter devient un
 * attribut ProseMirror sérialisé en `style` inline normalisé ou en `data-docx-*` ; tout ce
 * qu'il ne sait pas représenter reste dans le gabarit `.docx` (hors corps) ou est signalé.
 *
 * Unités : millimètres pour la page, points typographiques (pt) pour le texte et les
 * paragraphes, nombre sans unité pour un interligne multiple. Jamais de twips ni d'EMU
 * hors du paquet `word`.
 */

/** Formats de page nommés, dimensions ISO et US usuelles. */
export type PageSizeName = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal';

/** Format libre en millimètres, quand le document n'utilise pas un format nommé. */
export interface PageDimensions {
  readonly widthMm: number;
  readonly heightMm: number;
}

export type PageOrientation = 'portrait' | 'landscape';

/** Marges en millimètres ; `headerMm` / `footerMm` = distance du bord à l'en-tête / au pied. */
export interface PageMargins {
  readonly topMm?: number;
  readonly rightMm?: number;
  readonly bottomMm?: number;
  readonly leftMm?: number;
  readonly headerMm?: number;
  readonly footerMm?: number;
}

export interface PageSetup {
  /** `A4` par défaut. */
  readonly size?: PageSizeName | PageDimensions;
  /** `portrait` par défaut. */
  readonly orientation?: PageOrientation;
  readonly margins?: PageMargins;
}

/** Un en-tête ou un pied : fragment HTML stylé (mêmes règles que le corps). */
export interface HeaderFooterContent {
  readonly html: string;
}

/**
 * Jeu d'en-têtes ou de pieds d'une section : `default` sur toutes les pages, `first` sur
 * la première si `DocumentLayout.titlePage` est vrai, `even` sur les pages paires si le
 * document distingue pages paires et impaires.
 */
export interface HeaderFooterSet {
  readonly default?: HeaderFooterContent;
  readonly first?: HeaderFooterContent;
  readonly even?: HeaderFooterContent;
}

/** Police par défaut du document (style `Normal` résolu). */
export interface DefaultFont {
  readonly family?: string;
  readonly sizePt?: number;
}

/**
 * Mise en page d'un document : ce que l'import `.docx` lit dans la dernière section et
 * ce que l'export réécrit (export neuf) ou conserve (export dans le gabarit). Tous les
 * champs sont optionnels : un objet vide = les défauts d'Aster (A4 portrait, 25,4 mm).
 */
export interface DocumentLayout {
  readonly page?: PageSetup;
  /** Nombre de colonnes de texte, 1 par défaut. Conservé, non affiché par la vue page. */
  readonly columns?: number;
  readonly defaultFont?: DefaultFont;
  /** Langue BCP 47 du document, ex. `fr-FR`. */
  readonly lang?: string;
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
  /** Première page différente (en-tête et pied `first`). */
  readonly titlePage?: boolean;
}

/** Côtés d'une bordure de paragraphe ; `between` sépare deux paragraphes bordés consécutifs. */
export type BorderSide = 'top' | 'right' | 'bottom' | 'left' | 'between';

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';

export interface BlockBorder {
  readonly side: BorderSide;
  readonly style: BorderStyle;
  /** Épaisseur en points. */
  readonly widthPt: number;
  /** Couleur CSS (`#rrggbb`). */
  readonly color: string;
}

/**
 * Attributs de mise en page d'un paragraphe ou d'un titre. `null` ou absent = hérité du
 * style de l'éditeur. Sérialisation HTML figée, dans cet ordre, uniquement pour les
 * valeurs présentes :
 *
 * `<p style="line-height: 1.15; margin-top: 6pt; margin-bottom: 6pt; margin-left: 36pt;
 *  margin-right: 0pt; text-indent: 18pt; border-bottom: 1pt solid #000000;
 *  background-color: #eeeeee" data-docx-style="Normal" data-keep-next data-page-break-before>`
 *
 * `lineHeight` (multiple, sans unité) et `lineHeightPt` (exact, en pt) sont exclusifs :
 * `lineHeightPt` l'emporte et se sérialise en `line-height: 14pt`. Un retrait négatif de
 * première ligne (`indentFirstLinePt < 0`) est un retrait suspendu. `setHTML(getHTML())`
 * doit conserver chaque attribut à l'identique.
 */
export interface ParagraphLayoutAttrs {
  readonly lineHeight?: number | null;
  readonly lineHeightPt?: number | null;
  readonly spacingBeforePt?: number | null;
  readonly spacingAfterPt?: number | null;
  readonly indentLeftPt?: number | null;
  readonly indentRightPt?: number | null;
  readonly indentFirstLinePt?: number | null;
  readonly borders?: readonly BlockBorder[] | null;
  /** Fond du paragraphe, couleur CSS. */
  readonly shading?: string | null;
  readonly keepWithNext?: boolean | null;
  readonly pageBreakBefore?: boolean | null;
  /**
   * Identifiant du style Word d'origine (`Heading1`, `Normal`, style personnalisé), posé
   * par l'import et relu par l'export dans le gabarit, qui ne réécrit en propriétés
   * directes que ce qui diffère du style. Jamais interprété par l'éditeur.
   */
  readonly docxStyle?: string | null;
}

/** Noms des attributs de `ParagraphLayoutAttrs`, dans l'ordre de sérialisation. */
export const PARAGRAPH_LAYOUT_ATTR_NAMES = [
  'lineHeight',
  'lineHeightPt',
  'spacingBeforePt',
  'spacingAfterPt',
  'indentLeftPt',
  'indentRightPt',
  'indentFirstLinePt',
  'borders',
  'shading',
  'keepWithNext',
  'pageBreakBefore',
  'docxStyle',
] as const;

export type ParagraphLayoutAttrName = (typeof PARAGRAPH_LAYOUT_ATTR_NAMES)[number];

/**
 * Attributs de run portés par la marque `textStyle` en plus de ceux de Tiptap (`fontFamily`,
 * `fontSize`, `color`, `backgroundColor`). Sérialisés dans le `style` du `<span>` :
 * `letter-spacing: 1pt`, `text-transform: uppercase`, `font-variant: small-caps`.
 * Le nom du style de caractère Word va dans `data-docx-run-style`.
 */
export interface RunLayoutAttrs {
  readonly letterSpacingPt?: number | null;
  readonly caps?: 'all' | 'small' | null;
  readonly docxRunStyle?: string | null;
}

/** Styles de trait des marques `underline` et `strike` : `style="text-decoration-style: …"`. */
export type DecorationStyle = 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy';

/** Formats de numérotation d'une liste ordonnée, valeurs de l'attribut HTML `type`. */
export type OrderedListType = '1' | 'a' | 'A' | 'i' | 'I';

/**
 * Attributs des listes. `<ol type="a" start="3" data-docx-num-id="5">`,
 * `<ul data-bullet="–" data-docx-num-id="7">`. `docxNumId` relie la liste à la définition
 * de numérotation du gabarit pour l'export, jamais interprété par l'éditeur.
 */
export interface ListLayoutAttrs {
  readonly type?: OrderedListType | null;
  readonly start?: number | null;
  readonly bullet?: string | null;
  readonly docxNumId?: string | null;
}

/** Alignement vertical du contenu d'une cellule. */
export type CellVerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * Attributs de tableau et de cellule, sérialisés en `style` :
 * table : `width: 100%` ou `width: 450pt`, `border-collapse` implicite, `data-docx-style` ;
 * cellule : `border-top: 0.5pt solid #000000` (un par côté), `background-color: #rrggbb`,
 * `vertical-align: middle`, `padding: 2pt 4pt`. `colwidth` reste celui de Tiptap.
 */
export interface TableLayoutAttrs {
  readonly width?: string | null;
  readonly borders?: readonly BlockBorder[] | null;
  readonly docxStyle?: string | null;
}

export interface CellLayoutAttrs {
  readonly borders?: readonly BlockBorder[] | null;
  readonly shading?: string | null;
  readonly verticalAlign?: CellVerticalAlign | null;
  /** Marges internes en points : `top right bottom left`. */
  readonly paddingPt?: readonly [number, number, number, number] | null;
}

/**
 * Vue page : l'hôte de l'éditeur rend une feuille aux dimensions et marges de
 * `layout.page`, avec les en-têtes et pieds `default` en lecture seule au-dessus et
 * au-dessous du corps. Aucune pagination : les sauts de page explicites sont visibles, le
 * nombre de pages n'est pas calculé.
 */
export interface PageViewOptions {
  readonly layout?: DocumentLayout;
  /** Afficher les en-têtes et pieds, vrai par défaut. */
  readonly showHeadersFooters?: boolean;
}
