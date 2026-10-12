import type { UploadHandler } from '@aster-editor/core';

/** Avertissement remonté par l'import : un élément Word n'a pas pu être converti fidèlement. */
export interface DocxImportWarning {
  /** Code stable, ex. `unsupported-style`, `image-upload-failed`, `mammoth`. */
  code: string;
  message: string;
}

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
}

export interface DocxImportResult {
  /** HTML sémantique prêt pour `AsterEditor.setHTML` ou `insertHTML`. */
  html: string;
  warnings: readonly DocxImportWarning[];
}
