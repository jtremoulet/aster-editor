import type { JSONContent } from '@tiptap/core';

/**
 * Document Aster au format JSON ProseMirror. C'est le format de stockage structuré
 * recommandé quand on ne veut pas dépendre de la sérialisation HTML.
 */
export type AsterDocument = JSONContent;

/** Compteurs exposés par `AsterEditor.getCounts()`. */
export interface AsterCounts {
  /** Nombre de mots, au sens Unicode (séquences séparées par des espaces ou ponctuations). */
  words: number;
  /** Nombre de caractères, espaces compris, hors balisage. */
  characters: number;
}
