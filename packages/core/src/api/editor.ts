import type { Editor } from '@tiptap/core';
import type { CommandRegistry } from './commands';
import type { AsterCounts, AsterDocument } from './document';
import type { AsterEventName, AsterEvents, Unsubscribe } from './events';
import type { I18n } from './i18n';

/**
 * Instance d'éditeur Aster. C'est l'objet que manipulent `ui`, `word` et `angular`.
 * Toute l'API est synchrone sauf mention contraire. Après `destroy()`, aucune méthode
 * ne doit être appelée.
 */
export interface AsterEditor {
  /**
   * Instance Tiptap sous-jacente. Porte de sortie assumée pour les cas non couverts,
   * mais pas garantie stable entre versions mineures d'Aster.
   */
  readonly tiptap: Editor;
  readonly commands: CommandRegistry;
  readonly i18n: I18n;
  /** Élément hôte passé dans les options. */
  readonly element: HTMLElement;
  /** Élément contenteditable réel, utile pour les tests et le focus. */
  readonly contentElement: HTMLElement;

  // --- Contenu -------------------------------------------------------------

  /** HTML sémantique, stable : `setHTML(getHTML())` est idempotent. */
  getHTML(): string;
  /** Remplace tout le contenu. `emit` à `false` n'émet pas `change`, pour `writeValue` côté Angular. */
  setHTML(html: string, emit?: boolean): void;
  getJSON(): AsterDocument;
  setJSON(doc: AsterDocument, emit?: boolean): void;
  /** Texte brut, paragraphes séparés par des sauts de ligne. */
  getText(): string;
  /** Insère du HTML à la position courante, en passant par le schéma. */
  insertHTML(html: string): void;
  isEmpty(): boolean;
  getCounts(): AsterCounts;

  // --- État ----------------------------------------------------------------

  focus(position?: 'start' | 'end' | 'all'): void;
  blur(): void;
  isFocused(): boolean;
  setReadOnly(value: boolean): void;
  isReadOnly(): boolean;
  isDestroyed(): boolean;

  // --- Événements ----------------------------------------------------------

  on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe;
  off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void;
  /** Émet un événement. Réservé aux extensions et aux paquets Aster. */
  emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void;

  destroy(): void;
}
