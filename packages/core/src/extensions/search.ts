import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** Nom de l'extension, clé de `editor.storage`. */
export const SEARCH_EXTENSION_NAME = 'search';

/** Classe CSS de chaque correspondance décorée, stylée par `ui`. */
export const SEARCH_MATCH_CLASS = 'aster-search-match';
/** Classe ajoutée à la correspondance courante (celle que `search.next` vient d'atteindre). */
export const SEARCH_CURRENT_CLASS = 'aster-search-match--current';

/** Une correspondance : plage de positions ProseMirror dans le document. */
export interface SearchMatch {
  readonly from: number;
  readonly to: number;
}

/** État de la recherche, exposé dans `editor.storage.search`. */
export interface SearchStorage {
  query: string;
  caseSensitive: boolean;
  matches: readonly SearchMatch[];
  /** Index de la correspondance courante dans `matches`, `-1` s'il n'y en a aucune. */
  currentIndex: number;
}

/** Options de `setSearchQuery`. */
export interface SearchQueryOptions {
  readonly caseSensitive?: boolean;
}

declare module '@tiptap/core' {
  interface Storage {
    search: SearchStorage;
  }

  interface Commands<ReturnType> {
    search: {
      /** Définit la requête, recalcule les correspondances et sélectionne la première après le curseur. */
      setSearchQuery: (query: string, options?: SearchQueryOptions) => ReturnType;
      /** Passe à la correspondance suivante, cycliquement. */
      nextMatch: () => ReturnType;
      /** Passe à la correspondance précédente, cycliquement. */
      previousMatch: () => ReturnType;
      /** Remplace la correspondance courante puis passe à la suivante. */
      replaceCurrent: (replacement: string) => ReturnType;
      /** Remplace toutes les correspondances. */
      replaceAll: (replacement: string) => ReturnType;
      /** Efface la requête et les surlignages. */
      clearSearch: () => ReturnType;
    };
  }
}

/**
 * État du plugin de recherche : les décorations des correspondances et un compteur de
 * demandes de défilement, incrémenté à chaque navigation (`setSearchQuery`, `nextMatch`,
 * `previousMatch`, `replaceCurrent`) pour que la vue fasse défiler la correspondance
 * courante à l'écran une fois le DOM à jour (voir `scrollCurrentIntoView`).
 */
export interface SearchPluginState {
  readonly decorations: DecorationSet;
  readonly scrollRequests: number;
}

/** Clé du plugin de décorations. La méta associée demande une resynchronisation depuis le storage. */
export const searchPluginKey = new PluginKey<SearchPluginState>('asterSearch');

/** Méta posée sur une transaction dont le storage a déjà été mis à jour par une commande. */
const SYNC_META = 'sync';
/** Méta des commandes qui sélectionnent une correspondance : resynchronisation **et** défilement. */
const SCROLL_META = 'sync-scroll';

const EMPTY_PLUGIN_STATE: SearchPluginState = {
  decorations: DecorationSet.empty,
  scrollRequests: 0,
};

/** Échappe une chaîne pour l'utiliser littéralement dans une RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Texte d'un bloc avec une correspondance 1:1 entre index de caractère et position
 * ProseMirror : un nœud texte contribue ses caractères, un nœud feuille (saut de ligne,
 * image inline) contribue autant de caractères de remplissage que sa taille. On peut donc
 * mapper `index → blockPos + 1 + index` sans table de correspondance.
 */
function blockText(block: ProseMirrorNode): string {
  let text = '';
  block.forEach((child) => {
    text += child.isText ? (child.text ?? '') : '\u0000'.repeat(child.nodeSize);
  });
  return text;
}

/**
 * Cherche `query` dans le texte de chaque bloc du document. Les correspondances ne
 * traversent jamais une frontière de bloc. Requête vide → aucune correspondance.
 */
export function findMatches(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive = false,
): SearchMatch[] {
  if (query.length === 0) return [];
  const pattern = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = blockText(node);
    pattern.lastIndex = 0;
    let found = pattern.exec(text);
    while (found !== null) {
      if (found[0].length === 0) break;
      const from = pos + 1 + found.index;
      matches.push({ from, to: from + found[0].length });
      found = pattern.exec(text);
    }
    return false;
  });
  return matches;
}

/** Index de la première correspondance qui commence à `position` ou après, `0` sinon (cycle), `-1` si vide. */
function indexFrom(matches: readonly SearchMatch[], position: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((match) => match.from >= position);
  return index === -1 ? 0 : index;
}

/** Construit le jeu de décorations à partir de l'état courant. */
function buildDecorations(doc: ProseMirrorNode, storage: SearchStorage): DecorationSet {
  const decorations = storage.matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class:
        index === storage.currentIndex
          ? `${SEARCH_MATCH_CLASS} ${SEARCH_CURRENT_CLASS}`
          : SEARCH_MATCH_CLASS,
    }),
  );
  return DecorationSet.create(doc, decorations);
}

/**
 * Pose la sélection sur la correspondance courante et demande son défilement à l'écran.
 * `tr.scrollIntoView()` ne suffit pas (retour POC n° 5b) : ProseMirror ne fait défiler que
 * si la sélection du DOM est dans l'éditeur, or pendant une recherche le focus est dans le
 * champ du panneau, la sélection n'est pas écrite dans le DOM et le défilement est ignoré.
 * La méta `sync-scroll` fait défiler l'élément de la correspondance courante une fois le
 * DOM à jour (`scrollCurrentIntoView`), avec ou sans focus, conteneur et fenêtre compris.
 */
function selectCurrent(tr: Transaction, storage: SearchStorage): void {
  const current = storage.matches[storage.currentIndex];
  if (!current) return;
  tr.setSelection(TextSelection.create(tr.doc, current.from, current.to)).scrollIntoView();
  tr.setMeta(searchPluginKey, SCROLL_META);
}

/**
 * Vrai si l'élément est entièrement visible : dans la fenêtre et dans chaque ancêtre qui
 * défile (`overflow-y: auto | scroll` avec un débordement). Un élément sans dimensions
 * (pas encore rendu, jsdom) compte pour invisible : on fait défiler dans le doute.
 */
function isFullyVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  if (rect.top < 0 || rect.bottom > window.innerHeight) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      const box = parent.getBoundingClientRect();
      if (rect.top < box.top || rect.bottom > box.bottom) return false;
    }
  }
  return true;
}

/**
 * Fait défiler la correspondance courante (élément décoré `aster-search-match--current`)
 * jusqu'au centre de l'écran quand elle n'est pas entièrement visible, et ne touche à rien
 * sinon (enchaîner des correspondances visibles ne fait pas sauter la page). Tous les
 * ancêtres défilants sont concernés (hôte en `overflow: auto` comme fenêtre). Sans effet
 * quand le DOM ne la rend pas encore ou que l'environnement n'implémente pas
 * `scrollIntoView` (jsdom).
 */
export function scrollCurrentIntoView(view: EditorView): void {
  const element = view.dom.querySelector<HTMLElement>(`.${SEARCH_CURRENT_CLASS}`);
  if (!element || typeof element.scrollIntoView !== 'function') return;
  if (isFullyVisible(element)) return;
  element.scrollIntoView({ block: 'center', inline: 'nearest' });
}

/** Cycle l'index courant de `delta` (±1) dans les correspondances. */
function cycle(storage: SearchStorage, delta: 1 | -1): void {
  const count = storage.matches.length;
  if (count === 0) {
    storage.currentIndex = -1;
    return;
  }
  const base = storage.currentIndex < 0 ? (delta > 0 ? -1 : 0) : storage.currentIndex;
  storage.currentIndex = (base + delta + count) % count;
}

/**
 * Extension de recherche / remplacement.
 *
 * L'état vit dans `editor.storage.search` ; un plugin ProseMirror le traduit en
 * décorations inline (`aster-search-match`, `--current` pour la courante). Les
 * commandes mettent le storage à jour puis posent une méta `sync` pour que le plugin
 * reconstruise les décorations sans recalculer. Toute autre transaction qui modifie le
 * document recalcule les correspondances et garde comme courante la première qui
 * commence à la position (mappée) de l'ancienne courante, ou revient au début.
 */
export const Search = Extension.create<Record<string, never>, SearchStorage>({
  name: SEARCH_EXTENSION_NAME,

  addStorage() {
    return { query: '', caseSensitive: false, matches: [], currentIndex: -1 };
  },

  addCommands() {
    return {
      setSearchQuery:
        (query, options = {}) =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return true;
          const storage = this.storage;
          storage.query = query;
          storage.caseSensitive = options.caseSensitive === true;
          storage.matches = findMatches(state.doc, query, storage.caseSensitive);
          storage.currentIndex = indexFrom(storage.matches, state.selection.from);
          tr.setMeta(searchPluginKey, SYNC_META);
          selectCurrent(tr, storage);
          return true;
        },

      nextMatch:
        () =>
        ({ tr, dispatch }) => {
          const storage = this.storage;
          if (storage.matches.length === 0) return false;
          if (!dispatch) return true;
          cycle(storage, 1);
          tr.setMeta(searchPluginKey, SYNC_META);
          selectCurrent(tr, storage);
          return true;
        },

      previousMatch:
        () =>
        ({ tr, dispatch }) => {
          const storage = this.storage;
          if (storage.matches.length === 0) return false;
          if (!dispatch) return true;
          cycle(storage, -1);
          tr.setMeta(searchPluginKey, SYNC_META);
          selectCurrent(tr, storage);
          return true;
        },

      replaceCurrent:
        (replacement) =>
        ({ tr, dispatch }) => {
          const storage = this.storage;
          const current = storage.matches[storage.currentIndex];
          if (!current) return false;
          if (!dispatch) return true;
          tr.insertText(replacement, current.from, current.to);
          // Recalcul sur le document modifié ; la courante devient la première
          // correspondance après le texte inséré, pour ne jamais re-sélectionner
          // un remplacement qui contiendrait lui-même la requête.
          storage.matches = findMatches(tr.doc, storage.query, storage.caseSensitive);
          storage.currentIndex = indexFrom(storage.matches, current.from + replacement.length);
          tr.setMeta(searchPluginKey, SYNC_META);
          selectCurrent(tr, storage);
          return true;
        },

      replaceAll:
        (replacement) =>
        ({ tr, dispatch }) => {
          const storage = this.storage;
          if (storage.matches.length === 0) return false;
          if (!dispatch) return true;
          // De la fin vers le début : les positions précédentes restent valides.
          for (const match of [...storage.matches].reverse()) {
            tr.insertText(replacement, match.from, match.to);
          }
          storage.matches = [];
          storage.currentIndex = -1;
          tr.setMeta(searchPluginKey, SYNC_META);
          return true;
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          const storage = this.storage;
          storage.query = '';
          storage.matches = [];
          storage.currentIndex = -1;
          tr.setMeta(searchPluginKey, SYNC_META);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,
        state: {
          init: () => EMPTY_PLUGIN_STATE,
          apply: (tr, previous) => {
            const meta: unknown = tr.getMeta(searchPluginKey);
            if (meta === SYNC_META || meta === SCROLL_META) {
              return {
                decorations: buildDecorations(tr.doc, storage),
                scrollRequests: previous.scrollRequests + (meta === SCROLL_META ? 1 : 0),
              };
            }
            if (!tr.docChanged) return previous;
            if (storage.query.length === 0) {
              return { decorations: DecorationSet.empty, scrollRequests: previous.scrollRequests };
            }
            const current = storage.matches[storage.currentIndex];
            const anchor = current ? tr.mapping.map(current.from, -1) : 0;
            storage.matches = findMatches(tr.doc, storage.query, storage.caseSensitive);
            storage.currentIndex = indexFrom(storage.matches, anchor);
            return {
              decorations: buildDecorations(tr.doc, storage),
              scrollRequests: previous.scrollRequests,
            };
          },
        },
        props: {
          decorations: (state) =>
            searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        // Le DOM est à jour quand les vues de plugin sont prévenues : la correspondance
        // courante existe alors comme élément et peut défiler, focus ou pas.
        view: () => ({
          update: (view, prevState) => {
            const before = searchPluginKey.getState(prevState)?.scrollRequests ?? 0;
            const after = searchPluginKey.getState(view.state)?.scrollRequests ?? 0;
            if (after !== before) scrollCurrentIntoView(view);
          },
        }),
      }),
    ];
  },
});
