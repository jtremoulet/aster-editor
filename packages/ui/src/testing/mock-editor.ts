import type { Editor, Range } from '@tiptap/core';
import type { Plugin } from '@tiptap/pm/state';
import type {
  AsterCommand,
  AsterDictionary,
  AsterEditor,
  AsterEventName,
  AsterEvents,
  AsterLocale,
  CommandId,
  CommandRegistry,
  DocumentLayout,
  I18n,
  PageViewOptions,
  TranslateParams,
  Unsubscribe,
} from '@aster-editor/core';
import { STANDARD_COMMAND_IDS, en, fr } from '@aster-editor/core';
import { createMockVariables, type MockVariablesOptions } from './mock-variables';

/** Appel de commande enregistré par le mock, pour les assertions. */
export interface RecordedCall {
  readonly id: string;
  readonly args: unknown;
}

/** Une étape d'une chaîne Tiptap (`tiptap.chain().focus().setMark(…).run()`). */
export interface ChainStep {
  readonly method: string;
  readonly args: readonly unknown[];
}

/** Classe posée sur l'hôte par le core quand la vue page est active (L23). */
const PAGE_VIEW_CLASS = 'aster--page-view';

/**
 * Options du mock : commandes enregistrées, locale, lecture seule initiales, variables
 * (voir `MockVariablesOptions`) et vue page.
 */
export interface MockEditorOptions extends MockVariablesOptions {
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
  /**
   * Expose `setPageView` / `getLayout` (méthodes hors contrat annoncées par L23). Vrai par
   * défaut ; `false` simule un core sans vue page pour tester le widget désactivé.
   */
  pageViewApi?: boolean;
  /** Mise en page initiale renvoyée par `getLayout()`. */
  layout?: DocumentLayout | null;
  /** Vue page active au montage (classe `aster--page-view` sur l'hôte). */
  pageView?: boolean;
  /**
   * Sections du document (L44) : `tiptap.state` minimal dont le document alterne un
   * paragraphe et un `sectionBreak` par section (`count` sections) et dont la sélection
   * est dans le paragraphe de la section `current` (1-based). Absent : pas de `state`.
   */
  sections?: { readonly count: number; readonly current: number };
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
  /**
   * Noms des variables « présentes dans le document » (`variables.getNames`). Alimenté
   * par `variable.insert`, modifiable par les tests.
   */
  readonly presentVariables: Set<string>;
  /** Plugins ProseMirror enregistrés via `tiptap.registerPlugin`, dans l'ordre. */
  readonly plugins: Plugin[];
  /** Plages supprimées via `tiptap.commands.deleteRange`, dans l'ordre. */
  readonly deletedRanges: Range[];
  /** Chaînes Tiptap exécutées via `tiptap.chain()…run()`, une liste d'étapes par chaîne. */
  readonly chains: ChainStep[][];
  /** Appels à `setPageView`, dans l'ordre. */
  readonly pageViewCalls: (PageViewOptions | boolean)[];
  /** Mise en page courante renvoyée par `getLayout()`, modifiable par les tests. */
  layout: DocumentLayout | null;
  /** Vue page (hors contrat, L23) : présente sauf `pageViewApi: false`. */
  setPageView?(options: PageViewOptions | boolean): void;
  getLayout?(): DocumentLayout | null;
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

/** Un bloc de premier niveau du document simulé : juste un nom de type. */
interface MockTopLevelNode {
  readonly type: { readonly name: string };
}

/**
 * `EditorState` minimal pour les sections (L44) : `doc.forEach` énumère, par section, un
 * paragraphe puis un `sectionBreak` (sauf pour la dernière) ; `selection.$from.index(0)`
 * est l'index du paragraphe de la section courante. Suffit à `sectionOfSelection`.
 */
function createMockSectionsState(sections: { count: number; current: number }): unknown {
  const nodes: MockTopLevelNode[] = [];
  for (let section = 1; section <= sections.count; section += 1) {
    nodes.push({ type: { name: 'paragraph' } });
    if (section < sections.count) nodes.push({ type: { name: 'sectionBreak' } });
  }
  const cursorIndex = (Math.min(Math.max(sections.current, 1), sections.count) - 1) * 2;
  return {
    doc: {
      childCount: nodes.length,
      forEach: (callback: (node: MockTopLevelNode, offset: number, index: number) => void) => {
        nodes.forEach((node, index) => callback(node, index, index));
      },
    },
    selection: { $from: { index: () => cursorIndex } },
  };
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
  if (options.pageView) element.classList.add(PAGE_VIEW_CLASS);
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

  const plugins: Plugin[] = [];
  const deletedRanges: Range[] = [];
  const chains: ChainStep[][] = [];
  const pageViewCalls: (PageViewOptions | boolean)[] = [];

  /** Chaîne Tiptap minimale : chaque méthode est journalisée, `run()` valide la chaîne. */
  const createChain = (): Record<string, (...args: unknown[]) => unknown> => {
    const steps: ChainStep[] = [];
    const record =
      (method: string) =>
      (...args: unknown[]): unknown => {
        steps.push({ method, args });
        return chain;
      };
    const chain: Record<string, (...args: unknown[]) => unknown> = {
      focus: record('focus'),
      setMark: record('setMark'),
      unsetMark: record('unsetMark'),
      updateAttributes: record('updateAttributes'),
      run: (): boolean => {
        chains.push(steps);
        return !readOnly;
      },
    };
    return chain;
  };

  const tiptap = {
    ...(options.sections ? { state: createMockSectionsState(options.sections) } : {}),
    getAttributes: (name: string): Record<string, unknown> => attributes.get(name) ?? {},
    isActive: (name: string): boolean => activeNodes.has(name),
    registerPlugin: (plugin: Plugin): void => {
      plugins.push(plugin);
    },
    unregisterPlugin: (key: unknown): void => {
      const index = plugins.findIndex((plugin) => plugin.spec.key === key || plugin === key);
      if (index >= 0) plugins.splice(index, 1);
    },
    chain: createChain,
    commands: {
      deleteRange: (range: Range): boolean => {
        deletedRanges.push(range);
        return true;
      },
    },
  } as unknown as Editor;

  // Variables : magasin en mémoire fidèle au contrat `VariableStore` (`mock-variables.ts`).
  const mockVariables = createMockVariables(options, {
    commands,
    calls,
    disabled,
    isReadOnly: () => readOnly,
    emitChange: (values) => editor.emit('variablesChange', { editor, values }),
  });

  const editor: MockEditor = {
    tiptap,
    commands,
    i18n,
    variables: mockVariables.store,
    element,
    contentElement,
    calls,
    active,
    disabled,
    attributes,
    activeNodes,
    presentVariables: mockVariables.presentVariables,
    plugins,
    deletedRanges,
    chains,
    pageViewCalls,
    layout: options.layout ?? null,
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

  // Vue page (hors contrat, L23) : `setPageView` pose ou retire la classe sur l'hôte et
  // mémorise la mise en page ; `getLayout` la renvoie. Absents avec `pageViewApi: false`.
  if (options.pageViewApi !== false) {
    editor.setPageView = (pageView: PageViewOptions | boolean): void => {
      pageViewCalls.push(pageView);
      if (pageView === false) {
        element.classList.remove(PAGE_VIEW_CLASS);
        return;
      }
      element.classList.add(PAGE_VIEW_CLASS);
      if (typeof pageView === 'object' && pageView.layout) editor.layout = pageView.layout;
    };
    editor.getLayout = (): DocumentLayout | null => editor.layout;
  }

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

  // `variable.insert` suit le contrat du core (refus en lecture seule, nom invalide ou
  // non déclaré) : remplace la commande générique si elle est enregistrée.
  mockVariables.registerInsertCommand();

  return editor;
}
