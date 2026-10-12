import type { UploadHandler } from '@aster-editor/core';

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
 */
export type DocxImportWarningCode =
  'mammoth' | 'image-upload-failed' | 'footnotes-dropped' | 'unsupported-style';

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
}
