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

/**
 * Magasin des variables d'un éditeur : déclarations, valeurs, résolveur, événement
 * `variablesChange`. Les noms présents dans le document sont lus en parcourant les nœuds
 * `variable` ; tant que l'extension n'est pas enregistrée, le document n'en contient aucun.
 *
 * Le rafraîchissement visuel des puces est à la charge de l'extension `Variable`, qui
 * s'abonne à `variablesChange`.
 */
export function createVariableStore(
  editor: AsterEditor,
  source: VariableSource = {},
): VariableStore {
  const definitions = new Map<string, AsterVariable>();
  const values = new Map<string, string>();
  const resolver: VariableResolver | undefined = source.resolve;

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
        const name: unknown = node.attrs['name'];
        if (typeof name === 'string' && name.length > 0) names.add(name);
      }
      return true;
    });
    return [...names];
  };

  const emit = (): void => {
    editor.emit('variablesChange', { editor, values: getValues() });
  };

  return {
    list: () => {
      const seen = new Map<string, AsterVariable>();
      for (const [name, definition] of definitions) {
        seen.set(name, { ...definition, value: values.get(name) ?? definition.value });
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
