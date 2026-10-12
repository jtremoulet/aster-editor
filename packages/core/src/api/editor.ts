import type { Editor } from '@tiptap/core';
import type { CommandRegistry } from './commands';
import type { AsterCounts, AsterDocument } from './document';
import type { AsterEventName, AsterEvents, Unsubscribe } from './events';
import type { I18n } from './i18n';

/**
 * Instance d'éditeur Aster. C'est l'objet que manipulent `ui`, `word` et `angular`.
 * Toute l'API est synchrone sauf mention contraire. Après `destroy()`, aucune méthode
 * ne doit être appelée : les méthodes de contenu (`getHTML`, `setHTML`, `getJSON`,
 * `setJSON`, `getText`, `insertHTML`) lèvent alors `Error('AsterEditor détruit')`,
 * `on` devient un no-op, et le registre de commandes répond `false`.
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

  /**
   * HTML sémantique, stable : `setHTML(getHTML())` est idempotent. Le résultat est mis
   * en cache tant que le document ne change pas : appeler `getHTML()` à chaque frappe
   * ne coûte qu'une sérialisation par transaction.
   */
  getHTML(): string;
  /**
   * Remplace tout le contenu. `emit` à `false` n'émet pas `change`, n'entre pas dans
   * l'historique d'annulation et **vide l'historique antérieur** : un `undo` qui suit
   * ne fait rien, plutôt que de rejouer sur le nouveau document des étapes qui visaient
   * l'ancien. C'est le mode de `writeValue` côté Angular et de toute resynchronisation
   * silencieuse. Avec `emit` à `true` (défaut), le remplacement est une étape annulable.
   */
  setHTML(html: string, emit?: boolean): void;
  getJSON(): AsterDocument;
  /** Pendant JSON de `setHTML` : mêmes règles pour `emit` (pas de `change`, historique vidé). */
  setJSON(doc: AsterDocument, emit?: boolean): void;
  /**
   * Texte brut : un seul `\n` entre deux blocs de texte, quelle que soit l'imbrication
   * (cellules de table, items de liste), et un `\n` par saut de ligne (`hardBreak`).
   */
  getText(): string;
  /**
   * Insère du HTML à la position courante, en passant par le schéma. Le HTML est inséré
   * **tel quel** : ni les transformateurs de collage (`pasteTransformers`) ni le
   * normaliseur Word ne s'appliquent, seule la politique de liens et d'images filtre
   * au parsing. Pour insérer du HTML venant du presse-papier ou de Word, passe par le
   * pipeline de collage ou transforme le HTML avant d'appeler `insertHTML`.
   */
  insertHTML(html: string): void;
  isEmpty(): boolean;
  getCounts(): AsterCounts;

  // --- État ----------------------------------------------------------------

  /**
   * Donne le focus à l'éditeur, synchrone : au retour, la vue a le focus DOM et une
   * frappe immédiate l'atteint. Sans argument, la sélection courante est conservée.
   */
  focus(position?: 'start' | 'end' | 'all'): void;
  blur(): void;
  isFocused(): boolean;
  setReadOnly(value: boolean): void;
  isReadOnly(): boolean;
  isDestroyed(): boolean;

  // --- Événements ----------------------------------------------------------

  /** Abonne et renvoie une fonction de désabonnement. No-op après `destroy()`. */
  on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe;
  off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void;
  /** Émet un événement. Réservé aux extensions et aux paquets Aster. */
  emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void;

  destroy(): void;
}
