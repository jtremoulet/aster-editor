import type { AsterVariable, UploadHandler } from '@aster-editor/core';

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
  | 'variables-preprocess-failed';

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
 * Options de `importDocx`. Toutes facultatives : sans option, l'import produit du HTML
 * avec images en base64 et notes de bas de page conservées, en parsant avec le
 * `DOMParser` de l'environnement.
 */
export interface DocxImportOptions {
  /**
   * Hook d'upload des images embarquées. En son absence, les images sont insérées
   * en data URL base64.
   */
  upload?: UploadHandler;
  /** Conserver les notes de bas de page sous forme de liste en fin de document. Vrai par défaut. */
  footnotes?: boolean;
  /** Style map mammoth additionnelle, ajoutée après celle d'Aster. */
  styleMap?: readonly string[];
  /** Parseur HTML utilisé par les post-traitements. `new DOMParser()` par défaut. */
  parse?: HtmlParser;
  /** Détection des variables (`{{nom}}`, champs de fusion, contrôles de contenu). Tout actif par défaut. */
  variables?: DocxVariableOptions;
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
}
