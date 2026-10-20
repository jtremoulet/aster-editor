import type { Editor } from '@tiptap/core';
import type { CommandRegistry } from './commands';
import type { AsterCounts, AsterDocument } from './document';
import type { AsterEventName, AsterEvents, Unsubscribe } from './events';
import type { I18n } from './i18n';
import type { DocumentLayout, PageViewOptions, SectionLayout } from './layout';
import type { GetHtmlOptions, VariableStore } from './variables';

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
  /** Variables de document (champs de fusion), voir `VariableStore`. */
  readonly variables: VariableStore;
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
  getHTML(options?: GetHtmlOptions): string;
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

  // --- Vue page (session 4, L45b : entrée au contrat, additif) ------------

  /**
   * Active, remplace ou retire la vue page : classe `aster--page-view` et variables
   * `--aster-page-*` sur `element`, conteneurs d'en-tête et de pied autour du corps.
   * `true` vaut `{}` (A4 portrait, marges 25,4 mm), `false` retire tout. Indépendante de
   * la lecture seule. Une mise en page hostile (qui lève à la lecture) laisse la vue
   * précédente en place et relaie l'erreur. Émet `pageViewChange` une fois l'état à jour,
   * en plus de l'événement DOM `aster:page-view-change` sur `contentElement`.
   *
   * Optionnelle, comme `getLayout` et `getSectionLayout` : `createEditor` les fournit
   * toujours, mais un double de test ou un core réduit peut ne pas porter de vue page
   * (`ui` les détecte déjà à l'exécution). Elles deviendront obligatoires quand tous les
   * doubles les porteront.
   */
  setPageView?(options: boolean | PageViewOptions): void;
  /** Mise en page de la vue page active (`options.layout`, ou `{}` pour `true`), `null` si elle est inactive. */
  getLayout?(): DocumentLayout | null;
  /**
   * Mise en page de la section `index` (numéro 1-based, celui de `data-section-break` et
   * de `getSections`) dans la vue page active : `layout.sections[index - 1]`, sinon les
   * champs de premier niveau (seule section d'un document sans `sections`, copie de la
   * dernière sinon). `null` hors vue page.
   */
  getSectionLayout?(index: number): SectionLayout | null;

  // --- Événements ----------------------------------------------------------

  /** Abonne et renvoie une fonction de désabonnement. No-op après `destroy()`. */
  on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe;
  off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void;
  /** Émet un événement. Réservé aux extensions et aux paquets Aster. */
  emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void;

  destroy(): void;
}
