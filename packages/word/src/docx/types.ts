import type { AsterVariable, DocumentLayout, UploadHandler } from '@aster-editor/core';

/**
 * Entrée acceptée par `importDocx` : un `File` du navigateur, les octets bruts, ou une
 * vue typée (`Uint8Array`, `Buffer` Node) dont seule la fenêtre visible est lue.
 */
export type DocxInput = File | ArrayBuffer | ArrayBufferView;

/**
 * Codes stables des avertissements d'import :
 * - `mammoth` : message remonté tel quel par mammoth (style inconnu, image illisible…).
 * - `image-upload-failed` : le hook `upload` a rejeté ou n'a pas renvoyé d'URL, l'image est repliée en base64.
 * - `footnotes-dropped` : des notes de bas de page existaient et ont été supprimées (`footnotes: false`).
 * - `unsupported-style` : réservé aux post-traitements, élément non converti fidèlement.
 * - `variables-preprocess-failed` : le prétraitement des champs de fusion et contrôles de contenu
 *   a échoué (archive ou XML illisible) ; le document est importé sans, les `{{nom}}` saisis restent détectés.
 */
export type DocxImportWarningCode =
  | 'mammoth'
  | 'image-upload-failed'
  | 'footnotes-dropped'
  | 'unsupported-style'
  | 'variables-preprocess-failed'
  | 'image-skipped'
  | 'object-lost'
  | 'reader';

/** Avertissement remonté par l'import : un élément Word n'a pas pu être converti fidèlement. */
export interface DocxImportWarning {
  /** Code stable, voir `DocxImportWarningCode`. */
  code: DocxImportWarningCode;
  /** Détail en français, destiné aux journaux de l'intégrateur, pas à l'utilisateur final. */
  message: string;
}

/** Parseur HTML injectable, pour ne jamais dépendre d'un `document` global. */
export interface HtmlParser {
  parseFromString(html: string, type: 'text/html'): Document;
}

/**
 * Sources de variables reconnues dans un .docx :
 * - `braces` : `{{nom}}` saisi tel quel dans le texte ;
 * - `mergeFields` : champs de fusion Word (`MERGEFIELD`, simples ou complexes) ;
 * - `contentControls` : contrôles de contenu `w:sdt` avec `w:tag` ou `w:alias`.
 */
export type VariableDetection = 'braces' | 'mergeFields' | 'contentControls';

/** Options de détection des variables à l'import. */
export interface DocxVariableOptions {
  /** Sources activées. Les trois par défaut ; `[]` désactive toute détection. */
  readonly detect?: readonly VariableDetection[];
  /**
   * Motif alternatif à `{{nom}}` pour la détection `braces`, groupe 1 = nom
   * (ex. `/\[([a-z_]+)\]/g`). Le nom capturé doit respecter la règle des noms du core.
   * Un motif à backtracking exponentiel est à la charge de l'intégrateur.
   */
  readonly pattern?: RegExp;
}

/**
 * Options de `importDocx`. Toutes facultatives : sans option, l'import lit avec le lecteur
 * stylé d'Aster (`fidelity: 'styled'`, défaut depuis la 0.6) et produit du HTML stylé avec
 * images en base64 et notes de bas de page conservées, en parsant avec le `DOMParser` de
 * l'environnement.
 */
export interface DocxImportOptions {
  /**
   * Hook d'upload des images embarquées. En son absence, les images sont insérées
   * en data URL base64.
   */
  upload?: UploadHandler;
  /** Conserver les notes de bas de page sous forme de liste en fin de document. Vrai par défaut. */
  footnotes?: boolean;
  /** Style map mammoth additionnelle, ajoutée après celle d'Aster. Mode `semantic` seulement. */
  styleMap?: readonly string[];
  /** Parseur HTML utilisé par les post-traitements. `new DOMParser()` par défaut. */
  parse?: HtmlParser;
  /** Détection des variables (`{{nom}}`, champs de fusion, contrôles de contenu). Tout actif par défaut. */
  variables?: DocxVariableOptions;
  /**
   * Sort des paragraphes vides du document (lignes laissées par Entrée). `keep` par défaut :
   * ils deviennent des `<p></p>`, ce qui rend l'aller-retour export → import fidèle aux
   * sauts de ligne de l'auteur. `drop` retrouve l'ancien comportement (mammoth les ignore),
   * utile pour nettoyer un document Word qui espace ses blocs avec des lignes vides.
   */
  emptyParagraphs?: 'keep' | 'drop';
  /**
   * Chemin de lecture. `styled` (**défaut depuis la 0.6**, déjà celui du composant Angular,
   * de la démo et du playground depuis la 0.5) : lecteur OOXML d'Aster, HTML stylé
   * (polices, interlignes, bordures, tableaux complets, listes fidèles), `layout`, `lost`
   * et gabarit renseignés. `semantic` : mammoth, HTML sémantique sans mise en forme,
   * comportement des versions 0.4.x ; `styleMap` n'a d'effet que sur ce chemin. Migration
   * depuis la 0.5 : `importDocx(file, { fidelity: 'semantic' })` retrouve l'ancien défaut.
   */
  fidelity?: 'styled' | 'semantic';
}

/** Nature d'un objet Word que l'éditeur ne sait pas représenter. */
export type DocxLostKind =
  | 'textbox'
  | 'shape'
  | 'smartart'
  | 'chart'
  | 'equation'
  | 'comment'
  | 'revision'
  | 'field'
  | 'embedded-object'
  | 'unknown';

/** Où l'objet se trouvait dans le document. */
export type DocxLostWhere = 'body' | 'header' | 'footer' | 'footnote' | 'endnote';

/**
 * Objet non représentable rencontré à l'import. Hors du corps, il est conservé tel quel
 * dans le gabarit ; dans le corps, il est remplacé par son texte quand il en a un et
 * signalé ici (et par un avertissement `object-lost`).
 */
export interface DocxLostObject {
  readonly kind: DocxLostKind;
  readonly where: DocxLostWhere;
  /** Texte de remplacement inséré dans le corps, s'il y en a un. */
  readonly text?: string;
  /** Détail lisible : nom de la forme, type d'objet incorporé… */
  readonly detail?: string;
}

/**
 * Résultat de `importDocx` : le HTML à donner à l'éditeur et la liste, souvent vide, de
 * ce qui n'a pas été converti fidèlement. L'import ne lève que pour une entrée illisible.
 */
export interface DocxImportResult {
  /** HTML sémantique prêt pour `AsterEditor.setHTML` ou `insertHTML`. */
  html: string;
  /** Avertissements accumulés pendant la conversion, vide si tout est passé. */
  warnings: readonly DocxImportWarning[];
  /**
   * Variables trouvées : celles du HTML dans l'ordre d'apparition, avec libellé (alias
   * du contrôle de contenu) et valeur saisie quand Word les connaît, puis celles des
   * en-têtes et pieds de page, que mammoth ne rend pas. Vide si aucune.
   */
  variables: readonly AsterVariable[];
  /**
   * Mise en page lue dans la dernière section du document (format, orientation, marges,
   * colonnes, police par défaut, langue, en-têtes et pieds en HTML stylé). Objet vide en
   * mode `semantic`.
   */
  layout: DocumentLayout;
  /**
   * Le `.docx` d'origine, intact, à repasser à `exportDocx({ template })` pour que tout ce
   * qui n'est pas le corps (styles, numérotation, thème, en-têtes, sections) ressorte
   * identique. C'est le tampon reçu, pas une copie.
   */
  template: ArrayBuffer;
  /** Objets non représentables rencontrés dans le corps ou les parties lues. Vide en mode `semantic`. */
  lost: readonly DocxLostObject[];
}
