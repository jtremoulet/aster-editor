import type { UploadHandler } from '@aster-editor/core';

/**
 * Codes stables des avertissements d'import :
 * - `mammoth` : message remonté tel quel par mammoth (style inconnu, image illisible…).
 * - `image-upload-failed` : le hook `upload` a rejeté, l'image est repliée en base64.
 * - `footnotes-dropped` : des notes de bas de page existaient et ont été supprimées (`footnotes: false`).
 * - `unsupported-style` : réservé aux post-traitements, élément non converti fidèlement.
 */
export type DocxImportWarningCode =
  'mammoth' | 'image-upload-failed' | 'footnotes-dropped' | 'unsupported-style';

/** Avertissement remonté par l'import : un élément Word n'a pas pu être converti fidèlement. */
export interface DocxImportWarning {
  /** Code stable, voir `DocxImportWarningCode`. */
  code: DocxImportWarningCode;
  message: string;
}

/** Parseur HTML injectable, pour ne jamais dépendre d'un `document` global. */
export interface HtmlParser {
  parseFromString(html: string, type: 'text/html'): Document;
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
  /** Parseur HTML utilisé par les post-traitements. `new DOMParser()` par défaut. */
  parse?: HtmlParser;
}

export interface DocxImportResult {
  /** HTML sémantique prêt pour `AsterEditor.setHTML` ou `insertHTML`. */
  html: string;
  warnings: readonly DocxImportWarning[];
}
