/** Options du normaliseur de collage Word. */
export interface WordPasteOptions {
  /** Conserver les couleurs de texte explicites. Faux par défaut : on privilégie le sémantique. */
  keepColors?: boolean;
  /** Conserver l'alignement des paragraphes. Vrai par défaut. */
  keepAlignment?: boolean;
  /**
   * Fournisseur de `Document` pour parser le HTML. Par défaut `DOMParser` global.
   * Injectable pour les tests et les environnements sans DOM.
   */
  parse?: (html: string) => Document;
}
