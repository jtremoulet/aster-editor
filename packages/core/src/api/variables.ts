import type { AsterEditor } from './editor';

/**
 * Variable de document (« champ de fusion ») : un nom stable, un libellé affiché dans la
 * puce, une valeur courante optionnelle. Syntaxe canonique dans le texte et les documents
 * Word : `{{nom}}`.
 */
export interface AsterVariable {
  /** Identifiant stable : lettres, chiffres, `_`, `.`, `-`. Sensible à la casse. */
  readonly name: string;
  /** Libellé humain affiché dans la puce et les menus. Par défaut `name`. */
  readonly label?: string;
  /** Valeur courante. Absente → la puce affiche le libellé. */
  readonly value?: string;
  /** Aide affichée dans le menu d'insertion. */
  readonly description?: string;
}

/** Valeurs par nom de variable. */
export type VariableValues = Readonly<Record<string, string>>;

/** Résolveur asynchrone optionnel, appelé pour une variable sans valeur connue. */
export type VariableResolver = (
  name: string,
  editor: AsterEditor,
) => string | undefined | Promise<string | undefined>;

/** Configuration des variables dans `AsterOptions.variables`. */
export interface VariableSource {
  /** Variables déclarées, proposées dans le menu d'insertion même si absentes du document. */
  readonly variables?: readonly AsterVariable[];
  /** Valeurs initiales. */
  readonly values?: VariableValues;
  /** Résolveur appelé à la demande (`VariableStore.resolve`) pour les valeurs manquantes. */
  readonly resolve?: VariableResolver;
  /**
   * Autoriser l'insertion d'une variable non déclarée (saisie libre dans le menu).
   * Vrai par défaut : un document Word importé peut contenir n'importe quel nom.
   */
  readonly allowUnknown?: boolean;
}

/** Mode de rendu des variables dans `getHTML` et à l'export. */
export type VariableRenderMode =
  /** Puces conservées : `<span data-aster-variable="nom">{{nom}}</span>`. Défaut. */
  | 'placeholders'
  /** Valeurs substituées, texte brut ; une variable sans valeur garde `{{nom}}`. */
  | 'resolve';

/** Options de `AsterEditor.getHTML`. */
export interface GetHtmlOptions {
  readonly variables?: VariableRenderMode;
}

/**
 * Magasin des variables d'un éditeur. Les puces du document se rafraîchissent à chaque
 * `setValues`. `getNames` ne renvoie que les variables réellement présentes dans le
 * document, `list` ajoute les variables déclarées.
 */
export interface VariableStore {
  list(): readonly AsterVariable[];
  getNames(): readonly string[];
  getValues(): VariableValues;
  /** Fusionne les valeurs, émet `variablesChange`, rafraîchit les puces. `undefined` efface. */
  setValues(values: Readonly<Record<string, string | undefined>>): void;
  /** Déclare ou met à jour des variables (libellé, description, valeur). */
  define(variables: readonly AsterVariable[]): void;
  /** Insère une puce à la sélection courante. Équivaut à `commands.run('variable.insert', { name })`. */
  insert(name: string, label?: string): boolean;
  /**
   * Appelle le résolveur pour toutes les variables présentes sans valeur, applique les
   * valeurs obtenues et les renvoie. Sans résolveur, renvoie `getValues()`.
   */
  resolve(): Promise<VariableValues>;
  /** Vrai si au moins une variable présente dans le document n'a pas de valeur. */
  hasUnresolved(): boolean;
}
