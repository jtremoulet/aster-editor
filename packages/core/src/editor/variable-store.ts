import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type {
  AsterEditor,
  AsterVariable,
  VariableResolver,
  VariableSource,
  VariableStore,
  VariableValues,
} from '../api';

/** Nom du nœud ProseMirror des variables, fourni par l'extension `Variable` du core. */
export const VARIABLE_NODE_NAME = 'variable';

/** Vrai si le nom respecte la syntaxe autorisée : lettres, chiffres, `_`, `.`, `-`. */
export function isValidVariableName(name: string): boolean {
  return /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(name);
}

/** Syntaxe canonique d'une variable dans le texte et les documents Word : `{{nom}}`. */
export function variablePlaceholder(name: string): string {
  return `{{${name}}}`;
}

/** Nom porté par un nœud `variable`, chaîne vide s'il est absent ou mal typé. */
export function variableName(node: ProseMirrorNode): string {
  const name: unknown = node.attrs['name'];
  return typeof name === 'string' ? name : '';
}

/** Libellé d'un nœud `variable`, `null` s'il n'en a pas. */
export function variableLabel(node: ProseMirrorNode): string | null {
  const label: unknown = node.attrs['label'];
  return typeof label === 'string' && label !== '' ? label : null;
}

/** Texte brut d'un nœud `variable` : sa valeur si connue, sinon `{{nom}}`. C'est ce que rend `getText()`. */
export function variableText(node: ProseMirrorNode, values: VariableValues): string {
  const name = variableName(node);
  return values[name] ?? variablePlaceholder(name);
}

/**
 * Magasin concret du core : le contrat `VariableStore` plus ce dont les commandes ont
 * besoin pour appliquer `allowUnknown`. `AsterEditor.variables` reste typé sur le contrat
 * figé ; on y accède par `isAsterVariableStore` ou `canInsertVariable`.
 */
export interface AsterVariableStore extends VariableStore {
  /** `VariableSource.allowUnknown`, vrai par défaut. */
  readonly allowUnknown: boolean;
  /** Vrai si la variable est déclarée (`options.variables.variables` ou `define`). */
  isDeclared(name: string): boolean;
  /** Vrai si `variable.insert` accepterait ce nom : syntaxe valide et, si `allowUnknown` est faux, déclarée. */
  canInsert(name: string): boolean;
}

/** Vrai si le magasin est celui du core (et non un mock ou une implémentation tierce). */
export function isAsterVariableStore(store: VariableStore): store is AsterVariableStore {
  return typeof (store as Partial<AsterVariableStore>).canInsert === 'function';
}

/**
 * Vrai si l'éditeur accepterait d'insérer cette variable. Avec un magasin tiers qui ne
 * connaît pas `allowUnknown`, seule la syntaxe du nom est vérifiée.
 */
export function canInsertVariable(editor: AsterEditor, name: string): boolean {
  const store = editor.variables;
  return isAsterVariableStore(store) ? store.canInsert(name) : isValidVariableName(name);
}

/**
 * Magasin des variables d'un éditeur : déclarations, valeurs, résolveur, événement
 * `variablesChange`. Les noms présents dans le document sont lus en parcourant les nœuds
 * `variable` ; tant que l'extension n'est pas enregistrée, le document n'en contient aucun.
 *
 * Le rafraîchissement visuel des puces est à la charge de l'extension `Variable`, dont
 * le NodeView s'abonne à `variablesChange`.
 */
export function createVariableStore(
  editor: AsterEditor,
  source: VariableSource = {},
): AsterVariableStore {
  const definitions = new Map<string, AsterVariable>();
  const values = new Map<string, string>();
  const resolver: VariableResolver | undefined = source.resolve;
  const allowUnknown = source.allowUnknown !== false;

  for (const variable of source.variables ?? []) {
    definitions.set(variable.name, variable);
    if (variable.value !== undefined) values.set(variable.name, variable.value);
  }
  for (const [name, value] of Object.entries(source.values ?? {})) {
    values.set(name, value);
  }

  const getValues = (): VariableValues => Object.fromEntries(values);

  const getNames = (): readonly string[] => {
    const names = new Set<string>();
    editor.tiptap.state.doc.descendants((node) => {
      if (node.type.name === VARIABLE_NODE_NAME) {
        const name = variableName(node);
        if (name.length > 0) names.add(name);
      }
      return true;
    });
    return [...names];
  };

  const emit = (): void => {
    editor.emit('variablesChange', { editor, values: getValues() });
  };

  const isDeclared = (name: string): boolean => definitions.has(name);

  return {
    allowUnknown,
    isDeclared,
    canInsert: (name) => isValidVariableName(name) && (allowUnknown || isDeclared(name)),
    list: () => {
      const seen = new Map<string, AsterVariable>();
      for (const [name, definition] of definitions) {
        const value = values.get(name) ?? definition.value;
        seen.set(name, value === undefined ? { ...definition } : { ...definition, value });
      }
      for (const name of getNames()) {
        if (!seen.has(name)) {
          const value = values.get(name);
          seen.set(name, value === undefined ? { name } : { name, value });
        }
      }
      return [...seen.values()];
    },
    getNames,
    getValues,
    setValues: (next) => {
      for (const [name, value] of Object.entries(next)) {
        if (value === undefined) values.delete(name);
        else values.set(name, value);
      }
      emit();
    },
    define: (variables) => {
      for (const variable of variables) {
        definitions.set(variable.name, { ...definitions.get(variable.name), ...variable });
        if (variable.value !== undefined) values.set(variable.name, variable.value);
      }
      emit();
    },
    insert: (name, label) =>
      editor.commands.run('variable.insert', label === undefined ? { name } : { name, label }),
    resolve: async () => {
      if (resolver) {
        const missing = getNames().filter((name) => !values.has(name));
        const resolved = await Promise.all(
          missing.map(async (name) => [name, await resolver(name, editor)] as const),
        );
        let changed = false;
        for (const [name, value] of resolved) {
          if (value !== undefined) {
            values.set(name, value);
            changed = true;
          }
        }
        if (changed) emit();
      }
      return getValues();
    },
    hasUnresolved: () => getNames().some((name) => !values.has(name)),
  };
}
