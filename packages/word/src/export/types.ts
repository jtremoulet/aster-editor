import type { AsterDocument } from '@aster-editor/core';
import type { HtmlParser } from '../docx/types';

/**
 * Codes stables des avertissements d'export :
 * - `image-skipped` : image ignorée (URL distante sans `fetchImage`, format non supporté,
 *   data URL illisible, hook en échec).
 * - `unsupported-element` : balise sans équivalent Word, son texte est conservé en
 *   paragraphe simple.
 */
export type DocxExportWarningCode = 'image-skipped' | 'unsupported-element';

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

/** Entrée acceptée par `exportDocx` : HTML sérialisé ou JSON ProseMirror. */
export type DocxExportInput = string | AsterDocument;

/** Hook de récupération d'une image distante (`http(s)://`). `null` pour l'ignorer. */
export type DocxImageFetcher = (src: string) => Promise<ArrayBuffer | null>;

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
  /** Format de page, `A4` par défaut. */
  pageSize?: DocxPageSize;
  /**
   * Reçoit chaque avertissement au fil de la conversion. `exportDocx` rend un `Blob`
   * nu pour rester simple à brancher sur un bouton : c'est ici que remontent les
   * images ignorées et les éléments non supportés.
   */
  onWarning?: (warning: DocxExportWarning) => void;
}
