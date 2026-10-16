import type { AsterDocument, VariableValues } from '@aster-editor/core';
import type { HtmlParser } from '../docx/types';

/**
 * Codes stables des avertissements d'export :
 * - `image-skipped` : image ignorée (URL distante sans `fetchImage`, format non supporté,
 *   data URL illisible, hook en échec).
 * - `unsupported-element` : balise sans équivalent Word, son texte est conservé en
 *   paragraphe simple.
 * - `variable-unresolved` : en mode `resolve`, une variable sans valeur connue est laissée
 *   en `{{nom}}`.
 * - `footnote-missing` : appel de note sans note correspondante dans `data-footnotes`,
 *   laissé en exposant.
 */
export type DocxExportWarningCode =
  'image-skipped' | 'unsupported-element' | 'variable-unresolved' | 'footnote-missing';

/**
 * Avertissement générique de la passerelle .docx, paramétré par le code. Les
 * avertissements d'import (`DocxImportWarning`) et d'export (`DocxExportWarning`) en sont
 * deux spécialisations structurellement compatibles.
 */
export interface DocxWarning<Code extends string = string> {
  /** Code stable, propre à chaque sens de conversion. */
  code: Code;
  message: string;
}

/** Avertissement remonté par l'export : un élément HTML n'a pas pu être converti fidèlement. */
export type DocxExportWarning = DocxWarning<DocxExportWarningCode>;

/** Format de page du document produit. */
export type DocxPageSize = 'A4' | 'LETTER';

/** Orientation de la page. */
export type DocxPageOrientation = 'portrait' | 'landscape';

/** Marges de page en millimètres. Une marge absente garde le défaut (25,4 mm). */
export interface DocxPageMargins {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

/** Mise en page : format, orientation et marges. Complète `pageSize`, qui reste accepté. */
export interface DocxPageOptions {
  /** Format, `A4` par défaut. Prime sur `DocxExportOptions.pageSize`. */
  readonly size?: DocxPageSize;
  /** `portrait` par défaut. */
  readonly orientation?: DocxPageOrientation;
  /** Marges en millimètres, 25,4 mm (1 pouce) par défaut. */
  readonly margins?: DocxPageMargins;
}

/** Police par défaut du document (style `Normal`). */
export interface DocxDefaultFont {
  /** Famille, ex. `Arial`. */
  readonly family?: string;
  /** Taille en points, ex. `11`. */
  readonly sizePt?: number;
}

/** Entrée acceptée par `exportDocx` : HTML sérialisé ou JSON ProseMirror. */
export type DocxExportInput = string | AsterDocument;

/** Hook de récupération d'une image distante (`http(s)://`). `null` pour l'ignorer. */
export type DocxImageFetcher = (src: string) => Promise<ArrayBuffer | null>;

/**
 * Mode de rendu des variables (`<span data-aster-variable>` et `{{nom}}` en texte brut) :
 * - `placeholders` : texte `{{nom}}` tel quel (défaut) ;
 * - `resolve` : valeur de `values[nom]`, marques du span conservées ; sans valeur, `{{nom}}`
 *   et avertissement `variable-unresolved` ;
 * - `fields` : champ de fusion Word `MERGEFIELD nom`, avec la valeur connue comme résultat
 *   de champ, sinon `«nom»`.
 */
export type DocxVariableMode = 'placeholders' | 'resolve' | 'fields';

/** Options des variables à l'export (`DocxVariableOptions` est celui de l'import). */
export interface DocxExportVariableOptions {
  /** `placeholders` par défaut. */
  readonly mode?: DocxVariableMode;
  /** Valeurs connues par nom. */
  readonly values?: VariableValues;
  /**
   * Motif des variables en texte brut, en modes `fields` et `resolve`. Le premier groupe
   * de capture est le nom. Par défaut `{{nom}}` (lettres, chiffres, `_`, `.`, `-`, blancs
   * tolérés autour du nom). Les blocs `<pre>` et marques `<code>` ne sont jamais analysés.
   */
  readonly pattern?: RegExp;
}

/** Alignement d'un en-tête ou d'un pied de page. */
export type DocxHeaderAlign = 'left' | 'center' | 'right';

/** En-tête de page : texte brut ou HTML inline simple (gras, italique, liens, variables). */
export interface DocxHeaderOptions {
  /** Fragment HTML, converti par le même convertisseur que le corps. Prime sur `text`. */
  readonly html?: string;
  /** Texte brut, un seul paragraphe. */
  readonly text?: string;
  /** Alignement des paragraphes qui n'en précisent pas, `left` par défaut. */
  readonly align?: DocxHeaderAlign;
}

/** Pied de page : comme l'en-tête, plus la numérotation des pages. */
export interface DocxFooterOptions extends DocxHeaderOptions {
  /**
   * `true` : numéro de page seul (`PAGE`) ; `'x-of-y'` : `PAGE / NUMPAGES`. Ajouté en
   * paragraphe final du pied, centré sauf `align`. Champs calculés par Word.
   */
  readonly pageNumbers?: boolean | 'x-of-y';
}

/** Table des matières, insérée en tête du corps. */
export interface DocxTocOptions {
  /** Titre affiché au-dessus de la table, style `TOC Heading`. Aucun par défaut. */
  readonly title?: string;
  /** Profondeur de titres incluse (1-6), 3 par défaut. */
  readonly levels?: number;
}

/** Numérotation automatique des titres `Heading 1`..`Heading 6`. */
export interface DocxNumberedHeadingsOptions {
  /** Profondeur numérotée (1-6), 3 par défaut. */
  readonly levels?: number;
  /** `decimal` : `1.`, `1.1.`, `1.1.1.` (défaut) ; `legal` : `1`, `1.1`, `1.1.1`. */
  readonly format?: 'decimal' | 'legal';
}

/** Surcharge d'un style de titre. Les champs absents gardent le défaut de `docx`. */
export interface DocxHeadingStyle {
  /** Couleur `RRGGBB` ou CSS (`#hex`, `rgb()`, nom). */
  readonly color?: string;
  /** Taille en points. */
  readonly sizePt?: number;
  readonly bold?: boolean;
  readonly italics?: boolean;
  /** Famille de police. */
  readonly font?: string;
}

/** Styles de titres par niveau. */
export type DocxHeadingStyles = Partial<
  Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', DocxHeadingStyle>
>;

export interface DocxExportOptions {
  /** Parseur HTML injectable. `new DOMParser()` par défaut, jamais le `document` global. */
  parse?: HtmlParser;
  /**
   * Récupère les octets d'une image dont `src` est une URL distante. Sans ce hook,
   * seules les data URL base64 sont embarquées, les autres remontent `image-skipped`.
   */
  fetchImage?: DocxImageFetcher;
  /** Titre inscrit dans les propriétés du document (`docProps/core.xml`). */
  title?: string;
  /** Auteur inscrit dans les propriétés du document. */
  creator?: string;
  /** Format de page, `A4` par défaut. `page.size` prime. */
  pageSize?: DocxPageSize;
  /** Mise en page : format, orientation, marges. */
  page?: DocxPageOptions;
  /** Langue du document (`w:lang`, ex. `fr-FR`), utilisée par le correcteur de Word. */
  lang?: string;
  /** Police et taille par défaut du texte courant. */
  defaultFont?: DocxDefaultFont;
  /** Rendu des variables, `placeholders` par défaut. */
  variables?: DocxExportVariableOptions;
  /** En-tête de page, texte brut ou options. */
  header?: string | DocxHeaderOptions;
  /** Pied de page, texte brut ou options (numérotation des pages comprise). */
  footer?: string | DocxFooterOptions;
  /**
   * Table des matières en tête du document, préremplie depuis les titres. Word la met à
   * jour à l'ouverture (il demande confirmation) : les numéros de page sont vides avant.
   */
  toc?: boolean | DocxTocOptions;
  /** Numérotation `1.`, `1.1.`… des titres, liée aux styles `Heading 1..6`. */
  numberedHeadings?: boolean | DocxNumberedHeadingsOptions;
  /** Surcharges des styles de titres (couleur, taille…). Par défaut, titres de Word. */
  headingStyles?: DocxHeadingStyles;
  /**
   * Reçoit chaque avertissement au fil de la conversion. `exportDocx` rend un `Blob`
   * nu pour rester simple à brancher sur un bouton : c'est ici que remontent les
   * images ignorées et les éléments non supportés.
   */
  onWarning?: (warning: DocxExportWarning) => void;
}
