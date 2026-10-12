import type { DocxImportOptions, DocxImportWarning } from '../types';

/** Contexte partagé par les passes de post-traitement. */
export interface PostprocessContext {
  /** Options d'import résolues (valeurs par défaut appliquées). */
  readonly options: Readonly<Required<Pick<DocxImportOptions, 'footnotes'>>>;
  /** Avertissements accumulés, chaque passe peut en ajouter. */
  readonly warnings: DocxImportWarning[];
}

/**
 * Une passe mute le `Document` en place. Elle ne touche jamais au `document` global :
 * le `Document` reçu vient du `DOMParser` injecté dans `importDocx`.
 */
export type PostprocessPass = (doc: Document, ctx: PostprocessContext) => void;
