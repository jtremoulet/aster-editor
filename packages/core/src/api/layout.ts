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
 * Défauts de paragraphe du document (`docDefaults` de `styles.xml` puis style `Normal`
 * résolu), session 5 (retour POC n° 2) : ce que prend tout paragraphe qui ne porte pas sa
 * propre valeur. Le lecteur n'écrit sur un paragraphe que ce qui diffère de ces défauts ;
 * la vue page les applique aux blocs sans valeur propre (variables
 * `--aster-page-default-line-height`, `--aster-page-default-spacing-before`,
 * `--aster-page-default-spacing-after`) ; l'export neuf les écrit dans `docDefaults`.
 * Mêmes règles que `ParagraphLayoutAttrs` : `lineHeightPt` l'emporte sur `lineHeight`.
 */
export interface DefaultParagraph {
  readonly lineHeight?: number;
  readonly lineHeightPt?: number;
  readonly spacingBeforePt?: number;
  readonly spacingAfterPt?: number;
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
  readonly defaultParagraph?: DefaultParagraph;
  /** Langue BCP 47 du document, ex. `fr-FR`. */
  readonly lang?: string;
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
  /** Première page différente (en-tête et pied `first`). */
  readonly titlePage?: boolean;
  /**
   * Sections du document dans l'ordre (session 4). La dernière est aussi recopiée dans
   * `page`, `columns`, `headers`, `footers`, `titlePage` (compatibilité 0.5). Absent ou vide
   * = une seule section. Le corps marque la fin de chaque section sauf la dernière par un
   * nœud `sectionBreak` (`<hr data-section-break="n">`).
   */
  readonly sections?: readonly SectionLayout[];
}

/** Type de saut qui ouvre une section (`w:type` du `sectPr`). `nextPage` par défaut. */
export type SectionStart = 'nextPage' | 'continuous' | 'evenPage' | 'oddPage';

/** Mise en page d'une section : ce que Word porte dans un `w:sectPr`. */
export interface SectionLayout {
  readonly page?: PageSetup;
  readonly columns?: number;
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
  readonly titlePage?: boolean;
  readonly start?: SectionStart;
}

/**
 * Saut de section : nœud bloc atomique `<hr data-section-break="n">` où `n` (à partir de 1)
 * est l'index dans `DocumentLayout.sections` de la section qui **se termine** ici ; la
 * section `n + 1` commence au bloc suivant. Jamais émis pour la dernière section. La vue
 * page change de feuille (format, marges, en-têtes) à chaque saut ; l'export écrit un
 * `w:sectPr` dans le dernier paragraphe de la section, greffé depuis le gabarit quand il
 * existe. `setHTML(getHTML())` conserve l'attribut.
 */
export interface SectionBreakAttrs {
  readonly section: number;
}

/** Alignement du texte sur un taquet (`w:tab w:val`) ; `left` est le défaut, non sérialisé. */
export type TabAlign = 'left' | 'center' | 'right' | 'decimal';

/** Points de suite entre la tabulation et le taquet (`w:leader`) ; absent = aucun. */
export type TabLeader = 'dot' | 'hyphen' | 'underscore';

/**
 * Tabulation : nœud inline atomique `<span data-tab=""></span>`, plus, dans cet ordre et
 * seulement quand ils sont connus : `data-stop="36pt"` (position du taquet),
 * `data-align="center"` (alignement autre que `left`), `data-leader="dot"` (points de
 * suite). Rendu comme un espace élastique par la feuille de style ; l'export écrit `w:tab`
 * et le taquet (`w:tabs`) avec son alignement et ses points de suite. Remplace l'espace
 * cadratin de la 0.5. Session 4 : `align` et `leader` ajoutés (R43-05).
 */
export interface TabAttrs {
  readonly stopPt?: number | null;
  readonly align?: TabAlign | null;
  readonly leader?: TabLeader | null;
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
  /**
   * Distance entre le texte et la bordure, en points (`w:space`). Sérialisée juste après
   * les `border-*` en `padding-<côté>: Npt` ; absente = défaut de l'export (1 pt).
   */
  readonly spacePt?: number;
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

/** Drapeaux `w:tblLook` ; les six noms sont ceux d'ECMA-376 §17.4.56. */
export const TABLE_LOOK_FLAGS = [
  'firstRow',
  'lastRow',
  'firstColumn',
  'lastColumn',
  'noHBand',
  'noVBand',
] as const;

export type TableLookFlag = (typeof TABLE_LOOK_FLAGS)[number];

/** Jeu de drapeaux `w:tblLook` : un drapeau absent vaut faux. */
export type TableLook = Readonly<Partial<Record<TableLookFlag, boolean>>>;

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
  /** Alignement horizontal du tableau (`w:jc`), sérialisé en `data-align`. */
  readonly align?: 'left' | 'center' | 'right' | null;
  /**
   * Drapeaux `w:tblLook` du style de tableau conditionnel (session 4, vague 3) : quels
   * formats conditionnels le document active. Sérialisé en `data-docx-look` avec les
   * drapeaux à vrai, dans l'ordre de `TABLE_LOOK_FLAGS`, séparés par un espace
   * (`data-docx-look="firstRow firstColumn noVBand"`) ; absent = pas de `w:tblLook`
   * (le lecteur applique alors le défaut de Word, `0x04A0`, mais ne sérialise rien).
   * Le writer dans le gabarit réécrit `w:tblLook` depuis ce jeu de drapeaux et retire
   * les propriétés directes posées par le lecteur pour refléter le style conditionnel.
   */
  readonly look?: TableLook | null;
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
 * au-dessous du corps. La pagination est **approximative** : des coupures visuelles sont
 * posées là où la hauteur utile de la page est dépassée (blocs insécables, sauts de page
 * explicites respectés), sans garantie d'exactitude avec Word.
 */
export interface PageViewOptions {
  readonly layout?: DocumentLayout;
  /** Afficher les en-têtes et pieds, vrai par défaut. */
  readonly showHeadersFooters?: boolean;
  /** Pagination approximative (coupures visuelles, numéros de page), vrai par défaut. */
  readonly pagination?: boolean;
}
