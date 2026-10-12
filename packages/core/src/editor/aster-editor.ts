import { Editor, type FocusPosition } from '@tiptap/core';
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
  I18n,
  Unsubscribe,
} from '../api';
import { createCommandRegistry } from '../commands/registry';
import { createStandardCommands } from '../commands/standard';
import { createAsterExtensions } from '../extensions/aster-extensions';
import { createImageUploadProps } from '../extensions/image-upload';
import { resolveLinkPolicy } from '../extensions/link-safety';
import { createPastePipelineProps } from '../extensions/paste-pipeline';
import { collectShortcutBindings } from '../extensions/shortcuts';
import { normalizeOutputHtml } from '../html/normalize-output';
import { createI18n } from '../i18n/create-i18n';
import { createEventEmitter, type AsterEventEmitter } from './event-emitter';

/** Classe CSS du conteneur créé dans `options.element`. */
export const CONTENT_CLASS = 'aster-content';

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
  readonly element: HTMLElement;
  readonly contentElement: HTMLElement;

  private readonly emitter: AsterEventEmitter;
  private readonly container: HTMLElement;
  private destroyed = false;

  constructor(options: AsterOptions) {
    this.element = options.element;
    this.emitter = createEventEmitter();
    this.i18n = createI18n(options.locale ?? 'fr', this);
    this.commands = createCommandRegistry(this);

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
      content: options.content ?? '',
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
    // Microtâche : laisse l'appelant s'abonner à `ready` juste après `createEditor`.
    queueMicrotask(() => this.emit('ready', { editor: this }));
  }

  // --- Contenu -------------------------------------------------------------

  getHTML(): string {
    return normalizeOutputHtml(this.tiptap.getHTML());
  }

  setHTML(html: string, emit = true): void {
    this.replaceContent(html, emit);
  }

  getJSON(): AsterDocument {
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
   */
  private replaceContent(content: string | AsterDocument, emit: boolean): void {
    this.tiptap
      .chain()
      .setContent(content, { emitUpdate: emit })
      .command(({ tr }) => {
        if (!emit) {
          tr.setMeta('addToHistory', false);
        }
        return true;
      })
      .run();
  }

  getText(): string {
    return this.tiptap.getText({ blockSeparator: '\n' });
  }

  insertHTML(html: string): void {
    this.tiptap.chain().focus().insertContent(html).run();
  }

  isEmpty(): boolean {
    return this.tiptap.isEmpty;
  }

  getCounts(): AsterCounts {
    const storage = this.tiptap.storage.characterCount;
    return { words: storage.words(), characters: storage.characters() };
  }

  // --- État ----------------------------------------------------------------

  focus(position?: 'start' | 'end' | 'all'): void {
    const target: FocusPosition = position ?? null;
    this.tiptap.commands.focus(target);
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
    this.tiptap.setEditable(!value);
    this.emit('readOnlyChange', { editor: this, readOnly: value });
  }

  isReadOnly(): boolean {
    return !this.tiptap.isEditable;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  // --- Événements ----------------------------------------------------------

  on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe {
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
    this.tiptap.destroy();
    this.container.remove();
  }
}
