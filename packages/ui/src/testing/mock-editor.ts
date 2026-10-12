import type { Editor } from '@tiptap/core';
import type {
  AsterCommand,
  AsterDictionary,
  AsterEditor,
  AsterEventName,
  AsterEvents,
  AsterLocale,
  CommandId,
  CommandRegistry,
  I18n,
  TranslateParams,
  Unsubscribe,
} from '@aster-editor/core';
import { STANDARD_COMMAND_IDS, en, fr } from '@aster-editor/core';

/** Appel de commande enregistré par le mock, pour les assertions. */
export interface RecordedCall {
  readonly id: string;
  readonly args: unknown;
}

/** Options du mock : commandes enregistrées, locale, lecture seule initiales. */
export interface MockEditorOptions {
  /** Commandes à enregistrer, toutes les standard par défaut. */
  commands?: readonly string[];
  locale?: AsterLocale;
  readOnly?: boolean;
  /** Raccourcis déclarés par commande, ex. `{ bold: 'Mod-b' }`. */
  shortcuts?: Readonly<Record<string, string>>;
  /**
   * Commandes enregistrées **sans** `isActive` (actions pures comme `undo`), pour tester
   * les boutons sans `aria-pressed`. Les autres déclarent `isActive` et lisent `active`.
   */
  stateless?: readonly string[];
}

/**
 * Éditeur de test implémentant tout le contrat `AsterEditor` en mémoire, sans Tiptap.
 * L'état des commandes est piloté par les tests via `active`, `disabled`, `attributes`
 * et `activeNodes` ; les appels à `run` sont journalisés dans `calls`.
 */
export interface MockEditor extends AsterEditor {
  readonly calls: RecordedCall[];
  /** Commandes considérées actives (`isActive` → `true`). Clé : `id` ou `id:JSON(args)`. */
  readonly active: Set<string>;
  /** Commandes considérées non exécutables (`canRun` → `false`). */
  readonly disabled: Set<string>;
  /** Attributs renvoyés par `tiptap.getAttributes(name)`. */
  readonly attributes: Map<string, Record<string, unknown>>;
  /** Noms renvoyés vrais par `tiptap.isActive(name)`. */
  readonly activeNodes: Set<string>;
  readonly focusCalls: number;
  /** Nombre d'écouteurs encore abonnés, tous événements confondus. */
  listenerCount(): number;
}

/** Clé d'état pour une commande avec arguments. */
export function stateKey(id: string, args?: unknown): string {
  return args === undefined ? id : `${id}:${JSON.stringify(args)}`;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Crée un `MockEditor` prêt à l'emploi. */
export function createMockEditor(options: MockEditorOptions = {}): MockEditor {
  const listeners = new Map<AsterEventName, Set<(payload: never) => void>>();
  const dictionaries = new Map<string, Record<string, string>>([
    ['en', { ...en }],
    ['fr', { ...fr }],
  ]);
  let locale: AsterLocale = options.locale ?? 'en';
  let readOnly = options.readOnly ?? false;
  let destroyed = false;
  let focusCalls = 0;

  const calls: RecordedCall[] = [];
  const active = new Set<string>();
  const disabled = new Set<string>();
  const attributes = new Map<string, Record<string, unknown>>();
  const activeNodes = new Set<string>();
  const registry = new Map<string, AsterCommand>();

  const element = document.createElement('div');
  element.className = 'aster-content';
  const contentElement = document.createElement('div');
  contentElement.className = 'ProseMirror';
  contentElement.contentEditable = 'true';
  element.append(contentElement);

  const i18n: I18n = {
    getLocale: () => locale,
    setLocale: (next) => {
      locale = next;
      editor.emit('localeChange', { editor, locale: next });
    },
    t: (key, params) => {
      const current = dictionaries.get(locale)?.[key];
      const fallback = dictionaries.get('en')?.[key];
      return interpolate(current ?? fallback ?? key, params);
    },
    addTranslations: (target, dictionary: AsterDictionary) => {
      dictionaries.set(target, { ...(dictionaries.get(target) ?? {}), ...dictionary });
    },
    has: (key) => key in (dictionaries.get(locale) ?? {}) || key in (dictionaries.get('en') ?? {}),
  };

  const commands: CommandRegistry = {
    register: (command) => {
      registry.set(command.id, command as AsterCommand);
    },
    unregister: (id) => {
      registry.delete(id);
    },
    get: (id) => registry.get(id),
    has: (id) => registry.has(id),
    list: () => Array.from(registry.values()),
    run: (id: string, args?: unknown): boolean => {
      const command = registry.get(id);
      if (!command || !commands.canRun(id, args)) return false;
      return command.run(editor, args);
    },
    canRun: (id: string, args?: unknown): boolean => {
      const command = registry.get(id);
      if (!command) return false;
      if (command.canRun) return command.canRun(editor, args);
      return !readOnly && !disabled.has(id) && !disabled.has(stateKey(id, args));
    },
    isActive: (id: string, args?: unknown): boolean => {
      const command = registry.get(id);
      if (!command) return false;
      if (command.isActive) return command.isActive(editor, args);
      return active.has(stateKey(id, args)) || (args !== undefined && active.has(id));
    },
  };

  const tiptap = {
    getAttributes: (name: string): Record<string, unknown> => attributes.get(name) ?? {},
    isActive: (name: string): boolean => activeNodes.has(name),
  } as unknown as Editor;

  const editor: MockEditor = {
    tiptap,
    commands,
    i18n,
    element,
    contentElement,
    calls,
    active,
    disabled,
    attributes,
    activeNodes,
    get focusCalls() {
      return focusCalls;
    },
    listenerCount: () => {
      let total = 0;
      for (const set of listeners.values()) total += set.size;
      return total;
    },
    getHTML: () => contentElement.innerHTML,
    setHTML: (html, emit = true) => {
      contentElement.textContent = html;
      if (emit) editor.emit('change', { editor });
    },
    getJSON: () => ({ type: 'doc', content: [] }),
    setJSON: (_doc, emit = true) => {
      if (emit) editor.emit('change', { editor });
    },
    getText: () => contentElement.textContent ?? '',
    insertHTML: () => undefined,
    isEmpty: () => (contentElement.textContent ?? '').length === 0,
    getCounts: () => ({ words: 0, characters: 0 }),
    focus: () => {
      focusCalls += 1;
    },
    blur: () => undefined,
    isFocused: () => false,
    setReadOnly: (value) => {
      readOnly = value;
      editor.emit('readOnlyChange', { editor, readOnly: value });
    },
    isReadOnly: () => readOnly,
    isDestroyed: () => destroyed,
    on: <E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe => {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler as (payload: never) => void);
      return () => editor.off(event, handler);
    },
    off: (event, handler) => {
      listeners.get(event)?.delete(handler as (payload: never) => void);
    },
    emit: <E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void => {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of Array.from(set)) {
        (handler as unknown as (...args: Parameters<AsterEvents[E]>) => void)(...payload);
      }
    },
    destroy: () => {
      editor.emit('destroy', { editor });
      destroyed = true;
      listeners.clear();
    },
  };

  const ids: readonly string[] = options.commands ?? STANDARD_COMMAND_IDS;
  const stateless = new Set(options.stateless ?? []);
  for (const id of ids) {
    const shortcut = options.shortcuts?.[id];
    const command: AsterCommand = {
      id: id as CommandId,
      labelKey: `command.${id}`,
      ...(shortcut ? { shortcut } : {}),
      run: (_editor, args) => {
        calls.push({ id, args });
        return true;
      },
      // Comme les commandes standard du core, chaque commande à état déclare `isActive` ;
      // l'UI ne pose `aria-pressed` que dans ce cas.
      ...(stateless.has(id)
        ? {}
        : {
            isActive: (_editor, args: unknown) =>
              active.has(stateKey(id, args)) || (args !== undefined && active.has(id)),
          }),
    };
    commands.register(command);
  }

  return editor;
}
