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

/**
 * Format de numérotation d'un niveau de liste Word, tel que déclaré par
 * `mso-level-number-format` dans le bloc `<style>` du presse-papier.
 * `bullet` donne un `<ul>`, les autres un `<ol>` avec l'attribut `type` HTML correspondant.
 */
export type ListLevelFormat =
  'bullet' | 'decimal' | 'alpha-lower' | 'alpha-upper' | 'roman-lower' | 'roman-upper';

/**
 * Options résolues passées à chaque passe du pipeline. Les valeurs par défaut sont
 * appliquées une seule fois par `normalizeWordHtml`, les passes n'ont plus à les deviner.
 */
export interface ResolvedPasteOptions {
  readonly keepColors: boolean;
  readonly keepAlignment: boolean;
  /**
   * Formats déclarés dans le `<style>` Word, indexés par `lX:levelN`
   * (ex. `l0:level1`). Vide quand le presse-papier ne contient pas de feuille de style,
   * auquel cas les passes se rabattent sur le texte du marqueur de liste.
   */
  readonly listFormats: ReadonlyMap<string, ListLevelFormat>;
}

/** Signature commune des passes : elles mutent le `Document` en place et ne renvoient rien. */
export type PastePass = (doc: Document, options: ResolvedPasteOptions) => void;

/** Construit des options résolues avec les valeurs par défaut du normaliseur. */
export function resolvePasteOptions(
  options: WordPasteOptions = {},
  listFormats: ReadonlyMap<string, ListLevelFormat> = new Map(),
): ResolvedPasteOptions {
  return {
    keepColors: options.keepColors ?? false,
    keepAlignment: options.keepAlignment ?? true,
    listFormats,
  };
}
