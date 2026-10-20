import type {
  AsterVariable,
  CommandRegistry,
  VariableStore,
  VariableValues,
} from '@aster-editor/core';

/**
 * Magasin de variables en mémoire du `MockEditor`, fidèle au contrat `VariableStore` du
 * core, et commande `variable.insert` associée. Extrait de `mock-editor.ts` pour le garder
 * sous 400 lignes ; n'est utile qu'aux tests des widgets de variables.
 */

/** Options du magasin : déclarations, valeurs et politique d'insertion initiales. */
export interface MockVariablesOptions {
  /** Variables déclarées initialement (voir `VariableSource.variables`). */
  variables?: readonly AsterVariable[];
  /** Valeurs initiales des variables. */
  variableValues?: VariableValues;
  /** Insertion d'une variable non déclarée autorisée ? Vrai par défaut, comme le core. */
  allowUnknownVariables?: boolean;
}

/** Ce que le magasin attend de l'éditeur mock qui l'héberge. */
export interface MockVariablesHost {
  readonly commands: CommandRegistry;
  /** Journal des appels de commandes, alimenté par `variable.insert`. */
  readonly calls: { id: string; args: unknown }[];
  /** Commandes rendues non exécutables par le test. */
  readonly disabled: ReadonlySet<string>;
  readonly isReadOnly: () => boolean;
  /** Émet `variablesChange` avec les valeurs courantes. */
  readonly emitChange: (values: VariableValues) => void;
}

/** Magasin monté : le `VariableStore` du contrat et les noms présents dans le document. */
export interface MockVariables {
  readonly store: VariableStore;
  /**
   * Noms des variables « présentes dans le document » (`variables.getNames`). Alimenté
   * par `variable.insert`, modifiable par les tests.
   */
  readonly presentVariables: Set<string>;
  /**
   * Remplace la commande générique `variable.insert` du registre par une version fidèle
   * au contrat : refusée en lecture seule, pour un nom invalide, et pour un nom non
   * déclaré quand `allowUnknownVariables` est faux ; l'insertion marque la variable
   * comme présente. Sans effet si la commande n'est pas enregistrée.
   */
  registerInsertCommand(): void;
}

/** Nom de variable valide : même règle que le core (`isValidVariableName`). */
const VARIABLE_NAME_PATTERN = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u;

/** Vrai si `args` ressemble aux arguments de `variable.insert`. */
function readVariableInsertArgs(args: unknown): { name: string; label?: string } | null {
  if (typeof args !== 'object' || args === null) return null;
  const { name, label } = args as { name?: unknown; label?: unknown };
  if (typeof name !== 'string') return null;
  return typeof label === 'string' ? { name, label } : { name };
}

/** Crée le magasin de variables du mock. */
export function createMockVariables(
  options: MockVariablesOptions,
  host: MockVariablesHost,
): MockVariables {
  const declared = new Map<string, AsterVariable>();
  for (const variable of options.variables ?? []) declared.set(variable.name, variable);
  let values: Record<string, string> = { ...(options.variableValues ?? {}) };
  const allowUnknown = options.allowUnknownVariables ?? true;
  const presentVariables = new Set<string>();

  /** Variable enrichie de sa valeur courante, comme `list()` du core. */
  const withValue = (variable: AsterVariable): AsterVariable => {
    const value = values[variable.name];
    return value === undefined ? variable : { ...variable, value };
  };

  const store: VariableStore = {
    list: () => {
      const result: AsterVariable[] = Array.from(declared.values(), withValue);
      for (const name of presentVariables) {
        if (!declared.has(name)) result.push(withValue({ name }));
      }
      return result;
    },
    getNames: () => Array.from(presentVariables),
    getValues: () => ({ ...values }),
    setValues: (next) => {
      const merged: Record<string, string> = { ...values };
      for (const [name, value] of Object.entries(next)) {
        if (value === undefined) delete merged[name];
        else merged[name] = value;
      }
      values = merged;
      host.emitChange({ ...values });
    },
    define: (list) => {
      for (const variable of list) {
        const { value, ...rest } = variable;
        declared.set(variable.name, { ...(declared.get(variable.name) ?? {}), ...rest });
        if (value !== undefined) values = { ...values, [variable.name]: value };
      }
      host.emitChange({ ...values });
    },
    insert: (name, label) =>
      host.commands.run('variable.insert', label === undefined ? { name } : { name, label }),
    resolve: () => Promise.resolve({ ...values }),
    hasUnresolved: () => Array.from(presentVariables).some((name) => values[name] === undefined),
  };

  const registerInsertCommand = (): void => {
    const generic = host.commands.get('variable.insert');
    if (!generic) return;
    host.commands.register<unknown>({
      id: 'variable.insert',
      labelKey: 'command.variable.insert',
      run: (_editor, args) => {
        const parsed = readVariableInsertArgs(args);
        if (!parsed) return false;
        host.calls.push({ id: 'variable.insert', args });
        presentVariables.add(parsed.name);
        return true;
      },
      canRun: (_editor, args) => {
        const parsed = readVariableInsertArgs(args);
        if (!parsed || host.isReadOnly() || host.disabled.has('variable.insert')) return false;
        if (!VARIABLE_NAME_PATTERN.test(parsed.name)) return false;
        return allowUnknown || declared.has(parsed.name);
      },
      ...(generic.isActive ? { isActive: generic.isActive } : {}),
    });
  };

  return { store, presentVariables, registerInsertCommand };
}
