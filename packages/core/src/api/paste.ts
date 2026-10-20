import type { AsterEditor } from './editor';

/** Contexte passé à chaque transformateur de collage. */
export interface PasteContext {
  readonly editor: AsterEditor;
  /** Version texte brut du presse-papier, utile pour les heuristiques. */
  readonly plainText: string;
  /** Événement d'origine, absent quand le collage est simulé en test. */
  readonly event?: ClipboardEvent;
}

/**
 * Transformateur de HTML collé. Les transformateurs s'enchaînent dans l'ordre de
 * déclaration, chacun reçoit la sortie du précédent. Retourner la chaîne inchangée
 * si le HTML ne concerne pas le transformateur.
 *
 * C'est par ce hook que `@aster-editor/word` branche le nettoyage du HTML Word.
 */
export type PasteTransformer = (html: string, context: PasteContext) => string;
