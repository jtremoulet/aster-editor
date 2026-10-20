import { Editor, type FocusPosition } from '@tiptap/core';
import { history } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorProps } from '@tiptap/pm/view';
import type {
  AsterCommand,
  AsterCounts,
  AsterDocument,
  AsterEditor,
  AsterEventName,
  AsterEvents,
  AsterOptions,
  CommandRegistry,
  DocumentLayout,
  GetHtmlOptions,
  PageViewOptions,
  SectionLayout,
  VariableStore,
  I18n,
  Unsubscribe,
} from '../api';
import { createCommandRegistry } from '../commands/registry';
import { createStandardCommands } from '../commands/standard';
import { createAsterExtensions } from '../extensions/aster-extensions';
import { createImageUploadProps } from '../extensions/image-upload';
import { resolveLinkPolicy } from '../extensions/link-safety';
import { applyPageView, resolveSectionLayout, type PageViewHandle } from '../extensions/page-view';
import { createPastePipelineProps } from '../extensions/paste-pipeline';
import { SET_CONTENT_META } from '../extensions/section-break';
import { collectShortcutBindings } from '../extensions/shortcuts';
import { TAB_NODE_NAME, TAB_TEXT, normalizeTabsInCodeBlocks } from '../extensions/tab';
import { normalizeOutputHtml } from '../html/normalize-output';
import { resolveVariablesHtml } from '../html/resolve-variables';
import { serializeDocumentHtml } from '../html/serialize-html';
import { createI18n } from '../i18n/create-i18n';
import { createEventEmitter, type AsterEventEmitter } from './event-emitter';
import { VARIABLE_NODE_NAME, createVariableStore, variableText } from './variable-store';

/** Classe CSS du conteneur créé dans `options.element`. */
export const CONTENT_CLASS = 'aster-content';

/** Message de l'erreur levée par les méthodes de contenu appelées après `destroy()`. */
export const DESTROYED_ERROR_MESSAGE = 'AsterEditor détruit';

/**
 * Options du plugin d'historique, identiques à celles de `UndoRedo` dans `StarterKit`
 * (`@tiptap/extensions`) : on recrée le même plugin pour vider la pile, rien d'autre.
 */
const HISTORY_OPTIONS = { depth: 100, newGroupDelay: 500 } as const;

/**
 * Vrai dans un navigateur, faux sous jsdom : ProseMirror mesure la sélection avec
 * `Range.getClientRects` pour la faire défiler, et jsdom ne l'implémente pas.
 */
const CAN_MEASURE_SELECTION =
  typeof Range !== 'undefined' && typeof Range.prototype.getClientRects === 'function';

/**
 * Contenu prêt pour le parseur : un HTML passe par `normalizeTabsInCodeBlocks` (une
 * tabulation dans un bloc de code devient le texte `\t` au lieu de scinder le bloc,
 * R41-04) ; un document JSON passe tel quel.
 */
function normalizeContent(content: string | AsterDocument): string | AsterDocument {
  return typeof content === 'string' ? normalizeTabsInCodeBlocks(content) : content;
}

/**
 * Implémentation de `AsterEditor`.
 *
 * Ordre de construction imposé par les dépendances croisées : l'émetteur d'abord
 * (i18n émet `localeChange` dessus), puis i18n et registre (ils reçoivent `this`
 * mais ne l'utilisent qu'après), puis Tiptap dont les extensions lisent registre
 * et i18n. `ready` n'est émis qu'une fois tout en place.
 */
export class AsterEditorImpl implements AsterEditor {
  readonly tiptap: Editor;
  readonly commands: CommandRegistry;
  readonly i18n: I18n;
  readonly variables: VariableStore;
  readonly element: HTMLElement;
  readonly contentElement: HTMLElement;

  private readonly emitter: AsterEventEmitter;
  private readonly container: HTMLElement;
  private destroyed = false;
  /** Document pour lequel `cachedHtml` a été calculé : identité, pas égalité. */
  private cachedDoc: ProseMirrorNode | null = null;
  private cachedHtml = '';
  /** Vue page montée, `null` quand elle est inactive. */
  private pageView: PageViewHandle | null = null;

  constructor(options: AsterOptions) {
    this.element = options.element;
    this.emitter = createEventEmitter();
    this.i18n = createI18n(options.locale ?? 'fr', this);
    this.commands = createCommandRegistry(this);
    this.variables = createVariableStore(this, options.variables);

    const linkPolicy = resolveLinkPolicy(options.linkPolicy);
    const disabled = new Set(options.disabledCommands ?? []);
    const standard = createStandardCommands({ linkPolicy, upload: options.upload });
    const custom: readonly AsterCommand[] = options.commands ?? [];
    for (const command of standard) {
      if (!disabled.has(command.id)) {
        this.commands.register(command);
      }
    }
    for (const command of custom) {
      this.commands.register(command);
    }

    this.container = document.createElement('div');
    this.container.className = CONTENT_CLASS;
    this.element.appendChild(this.container);

    const paste = createPastePipelineProps(this, options.pasteTransformers ?? []);
    const images = createImageUploadProps(this, options.upload);
    const editorProps: EditorProps = {
      transformPastedHTML: paste.transformPastedHTML,
      handlePaste: images.handlePaste,
      handleDrop: images.handleDrop,
      handleDOMEvents: { paste: paste.onPasteEvent },
    };

    this.tiptap = new Editor({
      element: this.container,
      content: normalizeContent(options.content ?? ''),
      editable: !options.readOnly,
      injectCSS: false,
      autofocus: options.autofocus ? 'end' : false,
      editorProps,
      extensions: createAsterExtensions({
        editor: this,
        options,
        linkPolicy,
        shortcuts: {
          registry: this.commands,
          // Les liaisons sont calculées sur le jeu complet, désactivées comprises,
          // pour que le raccourci d'une commande retirée soit bien avalé ; et sur
          // les commandes custom, dont le `shortcut` doit être câblé lui aussi.
          bindings: collectShortcutBindings([...standard, ...custom]),
          disabled,
        },
      }),
      onUpdate: () => this.emit('change', { editor: this }),
      onTransaction: ({ transaction }) => {
        if (transaction.docChanged || transaction.selectionSet) {
          this.emit('selectionChange', { editor: this });
        }
      },
      onFocus: ({ event }) => this.emit('focus', { editor: this, event }),
      onBlur: ({ event }) => this.emit('blur', { editor: this, event }),
    });
    this.contentElement = this.tiptap.view.dom;
    if (options.pageView) {
      // Une mise en page hostile (en-tête importé d'un .docx) ne doit jamais laisser un
      // éditeur à moitié construit : la vue page est ignorée, l'éditeur reste utilisable.
      try {
        this.setPageView(options.pageView);
      } catch (error) {
        console.warn('[aster] vue page ignorée : mise en page invalide', error);
      }
    }
    // Microtâche : laisse l'appelant s'abonner à `ready` juste après `createEditor`.
    queueMicrotask(() => this.emit('ready', { editor: this }));
  }

  // --- Vue page (hors contrat `AsterEditor`, proposée en session 3) -------

  /**
   * Active, remplace ou désactive la vue page : classe `aster--page-view` et variables
   * `--aster-page-*` sur l'hôte, conteneurs d'en-tête et de pied autour du corps. `true`
   * vaut `{}` (A4 portrait, marges 25,4 mm), `false` retire tout. Indépendante de la
   * lecture seule. Si la nouvelle mise en page lève (entrée hostile), la vue précédente
   * est remontée à l'identique avant de relayer l'erreur : l'appelant retrouve l'état
   * d'avant l'appel, jamais un éditeur sans vue page (R41-05). Hors contrat : à proposer
   * dans `api/editor.ts`.
   */
  setPageView(options: boolean | PageViewOptions): void {
    const previous = this.pageView;
    previous?.remove();
    this.pageView = null;
    if (options === false || this.destroyed) {
      return;
    }
    const resolved: PageViewOptions = options === true ? {} : options;
    try {
      this.pageView = applyPageView(this.element, this.contentElement, resolved);
    } catch (error) {
      if (previous) {
        this.pageView = applyPageView(this.element, this.contentElement, previous.options);
      }
      throw error;
    }
  }

  /** Mise en page de la vue page active, `null` si elle est inactive. Hors contrat. */
  getLayout(): DocumentLayout | null {
    return this.pageView?.layout ?? null;
  }

  /**
   * Mise en page de la section `section` (numéro 1-based, celui de `data-section-break`
   * et de `getSections`) dans la vue page active : `layout.sections[section - 1]`, sinon
   * les champs de premier niveau (`resolveSectionLayout`). `null` hors vue page. Hors
   * contrat (session 4).
   */
  getSectionLayout(section: number): SectionLayout | null {
    const layout = this.getLayout();
    return layout ? resolveSectionLayout(layout, section) : null;
  }

  // --- Contenu -------------------------------------------------------------

  /**
   * Mode `placeholders` (défaut) : les puces restent des `span[data-aster-variable]`,
   * résultat mis en cache. Mode `resolve` : les puces sont substituées par leurs valeurs
   * courantes, en texte échappé, à chaque appel (les valeurs ne font pas partie du
   * document, donc pas du cache) ; une variable sans valeur garde `{{nom}}`.
   */
  getHTML(options?: GetHtmlOptions): string {
    this.assertAlive();
    const html = this.placeholdersHtml();
    return options?.variables === 'resolve'
      ? resolveVariablesHtml(html, this.variables.getValues())
      : html;
  }

  /**
   * Le HTML est mis en cache par identité du document ProseMirror : Angular appelle
   * `getHTML()` à chaque `change`, et `normalizeOutputHtml` reparse tout le document
   * dès qu'il contient une table. Le document est immuable, toute transaction en
   * produit un nouveau : le cache s'invalide tout seul, sans compteur ni événement.
   *
   * La sérialisation n'est pas `tiptap.getHTML()` mais `serializeDocumentHtml` : les
   * attributs `style` sortent tels que les extensions les écrivent (`#rrggbb`, ordre du
   * contrat), pas réécrits par le moteur CSS.
   */
  private placeholdersHtml(): string {
    const { doc } = this.tiptap.state;
    if (doc === this.cachedDoc) {
      return this.cachedHtml;
    }
    const html = normalizeOutputHtml(serializeDocumentHtml(doc));
    this.cachedDoc = doc;
    this.cachedHtml = html;
    return html;
  }

  setHTML(html: string, emit = true): void {
    this.replaceContent(html, emit);
  }

  getJSON(): AsterDocument {
    this.assertAlive();
    return this.tiptap.getJSON();
  }

  setJSON(doc: AsterDocument, emit = true): void {
    this.replaceContent(doc, emit);
  }

  /**
   * Remplace tout le document en une seule transaction. Sans `emit`, le remplacement
   * est aussi exclu de l'historique (`addToHistory: false`) : une écriture programmatique
   * silencieuse (`writeValue` d'un formulaire, resynchronisation) ne doit pas devenir une
   * étape que Ctrl+Z annulerait. La chaîne partage la même transaction entre `setContent`
   * et `command`, donc la méta s'applique bien à l'écriture elle-même.
   *
   * L'historique antérieur est ensuite vidé : ses étapes visaient l'ancien document, et
   * un `undo` les rejouerait, remappées, sur le nouveau (annulation fantôme). Le plugin
   * `history` ne s'efface pas, on le remplace par un neuf aux mêmes options.
   *
   * La méta `SET_CONTENT_META` signale aux plugins un chargement complet (le saut de
   * section garde alors la numérotation reçue), ce qu'un collage de tout le document ne
   * doit pas obtenir (R41-02).
   */
  private replaceContent(content: string | AsterDocument, emit: boolean): void {
    this.assertAlive();
    this.tiptap
      .chain()
      .setContent(normalizeContent(content), { emitUpdate: emit })
      .command(({ tr }) => {
        tr.setMeta(SET_CONTENT_META, true);
        if (!emit) {
          tr.setMeta('addToHistory', false);
        }
        return true;
      })
      .run();
    if (!emit) {
      this.clearHistory();
    }
  }

  /** Vide la pile d'annulation en recréant le plugin `history` de ProseMirror. */
  private clearHistory(): void {
    this.tiptap.unregisterPlugin('history');
    this.tiptap.registerPlugin(history(HISTORY_OPTIONS));
  }

  /**
   * Un seul `\n` entre deux blocs de texte, quelle que soit l'imbrication (cellule de
   * table, item de liste) ; `hardBreak` compte pour un `\n`. `tiptap.getText` ajoute
   * un séparateur à chaque niveau de conteneur, d'où des lignes vides dans les tables.
   * Une puce de variable rend sa valeur courante si elle est connue, sinon `{{nom}}`.
   */
  getText(): string {
    this.assertAlive();
    const values = this.variables.getValues();
    const blocks: string[] = [];
    this.tiptap.state.doc.descendants((node) => {
      if (!node.isTextblock) {
        return true;
      }
      blocks.push(
        node.textBetween(0, node.content.size, undefined, (leaf) => {
          if (leaf.type.name === 'hardBreak') {
            return '\n';
          }
          if (leaf.type.name === TAB_NODE_NAME) {
            return TAB_TEXT;
          }
          return leaf.type.name === VARIABLE_NODE_NAME ? variableText(leaf, values) : '';
        }),
      );
      return false;
    });
    return blocks.join('\n');
  }

  insertHTML(html: string): void {
    this.assertAlive();
    this.tiptap.chain().focus().insertContent(normalizeTabsInCodeBlocks(html)).run();
  }

  isEmpty(): boolean {
    return this.tiptap.isEmpty;
  }

  getCounts(): AsterCounts {
    const storage = this.tiptap.storage.characterCount;
    return { words: storage.words(), characters: storage.characters() };
  }

  // --- État ----------------------------------------------------------------

  /**
   * La commande Tiptap pose la sélection puis diffère le focus DOM à la prochaine frame
   * (`requestAnimationFrame`). Le contrat Aster est synchrone : une frappe qui suit
   * immédiatement `focus()` doit atteindre l'éditeur, pas `body` (cas réel : la toolbar
   * ferme son menu puis rend le focus à l'éditeur, le tout dans un seul clic). On focalise
   * donc la vue tout de suite quand elle ne l'est pas ; le rappel différé de Tiptap devient
   * un no-op. Sauf sous jsdom : sans `getClientRects`, une sélection DOM réellement posée
   * fait planter le défilement vers la sélection au dispatch suivant, et le focus n'y a
   * de toute façon aucune valeur observable (les tests passent par les événements).
   */
  focus(position?: 'start' | 'end' | 'all'): void {
    const target: FocusPosition = position ?? null;
    this.tiptap.commands.focus(target);
    if (CAN_MEASURE_SELECTION && !this.tiptap.view.hasFocus()) {
      this.tiptap.view.focus();
    }
  }

  blur(): void {
    this.tiptap.commands.blur();
  }

  isFocused(): boolean {
    return this.tiptap.isFocused;
  }

  setReadOnly(value: boolean): void {
    if (this.isReadOnly() === value) {
      return;
    }
    // Sans `emitUpdate` : Tiptap émettrait `update`, relayé en `change`, et un formulaire
    // Angular passerait `dirty` à chaque `disabled` ou `readonly`.
    this.tiptap.setEditable(!value, false);
    this.emit('readOnlyChange', { editor: this, readOnly: value });
  }

  isReadOnly(): boolean {
    return !this.tiptap.isEditable;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  // --- Événements ----------------------------------------------------------

  /** Après `destroy()`, abonner est un no-op : rien ne sera plus émis, inutile de retenir le handler. */
  on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe {
    if (this.destroyed) {
      return () => undefined;
    }
    return this.emitter.on(event, handler);
  }

  off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void {
    this.emitter.off(event, handler);
  }

  emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void {
    if (this.destroyed) {
      return;
    }
    this.emitter.emit(event, ...payload);
  }

  /**
   * `destroy` est émis avant le démontage pour que les abonnés voient encore un
   * éditeur vivant, puis l'émetteur est vidé : plus aucun handler ne sera appelé.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.emit('destroy', { editor: this });
    this.destroyed = true;
    this.emitter.clear();
    this.pageView?.remove();
    this.pageView = null;
    this.tiptap.destroy();
    this.container.remove();
    this.cachedDoc = null;
    this.cachedHtml = '';
  }

  /**
   * Les méthodes de contenu lèvent une erreur explicite après `destroy()` plutôt que le
   * `TypeError` opaque d'une vue ProseMirror démontée : un `getHTML()` tardif dans un
   * composant détruit se diagnostique en une ligne de pile.
   */
  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error(DESTROYED_ERROR_MESSAGE);
    }
  }
}
