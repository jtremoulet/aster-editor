import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ElementRef, Signal } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import type { ControlValueAccessor } from '@angular/forms';
import type {
  AsterDocument,
  AsterEditor,
  AsterLocale,
  AsterTheme,
  PasteTransformer,
  ToolbarConfig,
  Unsubscribe,
} from '@aster-editor/core';
import { createAster } from '@aster-editor/ui';
import type { AsterInstance, AsterUiOptions } from '@aster-editor/ui';
import type { DocxImportResult } from '@aster-editor/word';
import { ASTER_CONFIG } from './provide-aster';
import { ASTER_UPLOAD_HANDLER } from './tokens';

/** Vue minimale des options de l'extension Tiptap `Placeholder`, pour la changer à chaud. */
interface PlaceholderExtensionOptions {
  placeholder?: unknown;
}

type TiptapEditor = AsterEditor['tiptap'];
type ProseMirrorPlugin = Parameters<TiptapEditor['registerPlugin']>[0];

/** Signature de `addProseMirrorPlugins` d'une extension Tiptap (hors nœud et marque). */
type ExtensionPluginFactory = (this: {
  name: string;
  options: PlaceholderExtensionOptions;
  storage: unknown;
  editor: TiptapEditor;
  type: null;
  parent: undefined;
}) => ProseMirrorPlugin[];

/** Pose l'attribut quand une valeur est fournie, le retire sinon. */
function setOrRemoveAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined || value === '') {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

/**
 * Composant Angular standalone autour de `createAster` (`@aster-editor/ui`).
 *
 * - `ControlValueAccessor` : utilisable avec `formControlName`, `[formControl]` et `ngModel`.
 *   La valeur du formulaire est le HTML sémantique de `getHTML()`.
 * - Zoneless et `OnPush` : rien dans le template ne dépend de l'état, les sorties sont
 *   des `output()` et l'éditeur est exposé en signal.
 * - SSR-safe : l'éditeur est monté dans `afterNextRender`, jamais dans le constructeur, et
 *   le module Word n'est chargé qu'à partir du montage (donc jamais côté serveur).
 *
 * Configuration, par priorité croissante : `provideAster(config)` < input `config` <
 * inputs dédiés (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`). Un input dédié
 * laissé à `undefined` n'écrase donc pas la valeur venue de la configuration.
 *
 * Changements à chaud : `theme`, `locale`, `readonly`, `placeholder`, `ariaLabel` et
 * `ariaLabelledBy` sont appliqués sur l'instance vivante. `toolbar` remonte l'éditeur (le
 * contenu est conservé, l'historique d'annulation est perdu, `ready` est réémis avec la
 * nouvelle instance). Les autres clés de `config` (`extensions`, `commands`, `upload`…) ne
 * sont lues qu'au montage.
 */
@Component({
  selector: 'aster-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #host class="aster-editor__host"></div>',
  styles: ':host { display: block; }',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AsterEditorComponent),
      multi: true,
    },
  ],
})
export class AsterEditorComponent implements ControlValueAccessor {
  /** Preset, groupes déclaratifs, ou `false` pour aucune toolbar. Défaut effectif : `standard`. */
  readonly toolbar = input<ToolbarConfig | undefined>(undefined);
  /** Thème appliqué sur `.aster[data-theme]`. `light` et `night` sont fournis par `ui`. Défaut : `light`. */
  readonly theme = input<AsterTheme | undefined>(undefined);
  /** Locale de l'éditeur et de la toolbar. Défaut effectif : `fr`. */
  readonly locale = input<AsterLocale | undefined>(undefined);
  /** Texte affiché quand le document est vide. Sans valeur, la chaîne i18n `editor.placeholder`. */
  readonly placeholder = input<string | undefined>(undefined);
  /** Lecture seule. Le `disabled` d'un formulaire s'y ajoute (l'un ou l'autre suffit). Défaut : `false`. */
  readonly readonly = input<boolean | undefined>(undefined);
  /** Tout le reste des options (`extensions`, `commands`, `linkPolicy`, `upload`, `content`…). */
  readonly config = input<Partial<AsterUiOptions>>({});
  /**
   * Nettoyage automatique du HTML collé depuis Word et Google Docs via
   * `wordPasteTransformer()` de `@aster-editor/word`, chargé dynamiquement au montage.
   */
  readonly wordPaste = input<boolean>(true);
  /**
   * Nom accessible de la zone de saisie (`aria-label` sur le contenteditable). Un
   * contenteditable n'est pas associable à un `<label for>`, c'est le seul moyen de le nommer.
   */
  readonly ariaLabel = input<string | undefined>(undefined);
  /** `id` (ou liste d'ids) de l'élément qui sert de libellé (`aria-labelledby` sur le contenteditable). */
  readonly ariaLabelledBy = input<string | undefined>(undefined);

  /** L'éditeur est monté et prêt. Réémis après un remontage (changement de `toolbar`). */
  readonly ready = output<AsterEditor>();
  /** Le document a changé : HTML de `getHTML()`. Pas émis sur `writeValue`. */
  readonly changed = output<string>();
  /** Le contenteditable a pris le focus. */
  readonly focused = output<void>();
  /**
   * Le contenteditable a perdu le focus au profit d'un élément extérieur à l'éditeur. Un
   * blur vers la toolbar ou un de ses menus n'est pas remonté : l'utilisateur est toujours
   * « dans » l'éditeur. C'est aussi ce qui marque le contrôle de formulaire `touched`.
   */
  readonly blurred = output<void>();

  private readonly editorState = signal<AsterEditor | null>(null);
  /** Éditeur courant, `null` avant le montage et après la destruction. */
  readonly editor: Signal<AsterEditor | null> = this.editorState.asReadonly();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly globalConfig = inject(ASTER_CONFIG, { optional: true });
  private readonly uploadHandler = inject(ASTER_UPLOAD_HANDLER, { optional: true });
  private readonly formDisabled = signal(false);

  /** `ASTER_CONFIG` < `config`, fusion superficielle. */
  private readonly mergedConfig = computed<Partial<AsterUiOptions>>(() => ({
    ...(this.globalConfig ?? {}),
    ...this.config(),
  }));
  private readonly resolvedToolbar = computed<ToolbarConfig>(
    () => this.toolbar() ?? this.mergedConfig().toolbar ?? 'standard',
  );
  private readonly resolvedTheme = computed<AsterTheme>(
    () => this.theme() ?? this.mergedConfig().theme ?? 'light',
  );
  private readonly resolvedLocale = computed<AsterLocale>(
    () => this.locale() ?? this.mergedConfig().locale ?? 'fr',
  );
  private readonly resolvedPlaceholder = computed<string | undefined>(
    () => this.placeholder() ?? this.mergedConfig().placeholder,
  );
  private readonly resolvedReadOnly = computed<boolean>(
    () => (this.readonly() ?? this.mergedConfig().readOnly ?? false) || this.formDisabled(),
  );

  private instance: AsterInstance | null = null;
  private mountedToolbar: ToolbarConfig | null = null;
  private subscriptions: Unsubscribe[] = [];
  /** Valeur reçue par `writeValue` avant le montage, appliquée comme contenu initial. */
  private pendingValue: string | null = null;
  private wordTransformer: PasteTransformer | null = null;
  private wordLoading: Promise<void> | null = null;
  private onChange: ((html: string) => void) | null = null;
  private onTouched: (() => void) | null = null;

  /**
   * Transformateur synchrone branché au montage ; il délègue au vrai transformateur Word
   * une fois le module chargé. Garde `@aster-editor/word` optionnel et hors du bundle
   * initial tout en respectant le contrat synchrone de `PasteTransformer`.
   */
  private readonly lazyWordTransformer: PasteTransformer = (html, context) =>
    this.wordTransformer && untracked(() => this.wordPaste())
      ? this.wordTransformer(html, context)
      : html;

  constructor() {
    afterNextRender(() => this.mount());
    inject(DestroyRef).onDestroy(() => this.unmount());

    effect(() => {
      const theme = this.resolvedTheme();
      untracked(() => this.instance?.setTheme(theme));
    });
    effect(() => {
      const locale = this.resolvedLocale();
      untracked(() => {
        const editor = this.instance?.editor;
        if (editor && editor.i18n.getLocale() !== locale) {
          editor.i18n.setLocale(locale);
        }
      });
    });
    effect(() => {
      const readOnly = this.resolvedReadOnly();
      untracked(() => this.instance?.editor.setReadOnly(readOnly));
    });
    effect(() => {
      const placeholder = this.resolvedPlaceholder();
      untracked(() => {
        if (this.instance) {
          this.applyPlaceholder(this.instance.editor, placeholder);
        }
      });
    });
    effect(() => {
      const label = this.ariaLabel();
      const labelledBy = this.ariaLabelledBy();
      untracked(() => {
        if (this.instance) {
          this.applyAriaAttributes(this.instance.editor, label, labelledBy);
        }
      });
    });
    effect(() => {
      const toolbar = this.resolvedToolbar();
      untracked(() => {
        if (this.instance && this.mountedToolbar !== toolbar) {
          this.remount();
        }
      });
    });
    // Le chargement initial du module Word part de `mount()` (jamais côté serveur) ; cet
    // effet ne couvre que le passage `false → true` d'un éditeur déjà monté.
    effect(() => {
      if (this.wordPaste()) {
        untracked(() => {
          if (this.instance) {
            this.loadWordPaste();
          }
        });
      }
    });
  }

  // --- API publique --------------------------------------------------------

  /**
   * Importe un `.docx` via `@aster-editor/word` (chargé à la demande, mammoth reste dans
   * un chunk séparé), remplace le contenu de l'éditeur en émettant `change` pour que le
   * formulaire voie la nouvelle valeur, et rend le résultat avec ses avertissements.
   * Le hook d'upload de l'éditeur est réutilisé pour les images embarquées. Si le
   * composant est détruit ou remonté pendant l'import, le résultat est rendu mais aucun
   * contenu n'est écrit : l'instance vivante est relue après chaque `await`.
   */
  async importDocx(file: File): Promise<DocxImportResult> {
    if (!this.instance) {
      throw new Error('[aster-editor/angular] importDocx: editor is not mounted yet');
    }
    const upload = untracked(() => this.resolvedOptions().upload);
    const { importDocx } = await import('@aster-editor/word');
    const result = await importDocx(file, upload ? { upload } : {});
    const editor = this.instance?.editor;
    if (editor && !editor.isDestroyed()) {
      editor.setHTML(result.html, true);
    }
    return result;
  }

  // --- ControlValueAccessor ------------------------------------------------

  /**
   * Applique la valeur du formulaire sans émettre `change` ni entrer dans l'historique ;
   * mémorisée si l'éditeur n'est pas monté. Une valeur identique au HTML courant est
   * ignorée pour ne pas déplacer la sélection (les reactive forms réécrivent la valeur à
   * chaque `setValue`, y compris quand elle n'a pas changé).
   */
  writeValue(value: string | null | undefined): void {
    const html = value ?? '';
    const editor = this.instance?.editor;
    if (!editor) {
      this.pendingValue = html;
      return;
    }
    if (editor.getHTML() === html) {
      return;
    }
    editor.setHTML(html, false);
  }

  /** Enregistre le rappel appelé avec le HTML à chaque modification du document par l'utilisateur. */
  registerOnChange(fn: (html: string) => void): void {
    this.onChange = fn;
  }

  /** Enregistre le rappel appelé quand l'éditeur perd le focus vers l'extérieur (`touched`). */
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  /** `disabled` du formulaire → lecture seule, cumulé avec l'input `readonly`. */
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
    this.instance?.editor.setReadOnly(untracked(() => this.resolvedReadOnly()));
  }

  // --- Cycle de vie --------------------------------------------------------

  /**
   * Monte l'éditeur. `content` force le contenu initial (remontage) et, dans ce cas,
   * `autofocus` est neutralisé : le focus est restauré explicitement par `remount()`.
   */
  private mount(content?: string): void {
    if (this.instance) {
      return;
    }
    const options = untracked(() => this.resolvedOptions(content));
    const instance = createAster(this.host().nativeElement, options);
    const editor = instance.editor;
    this.instance = instance;
    this.mountedToolbar = options.toolbar ?? 'standard';
    this.pendingValue = null;
    this.subscriptions = [
      editor.on('ready', ({ editor: ready }) => this.ready.emit(ready)),
      editor.on('change', ({ editor: changed }) => {
        const html = changed.getHTML();
        this.onChange?.(html);
        this.changed.emit(html);
      }),
      editor.on('focus', () => this.focused.emit()),
      editor.on('blur', ({ event }) => {
        // Un blur vers la toolbar, un menu ou un dialogue de l'éditeur n'est pas une sortie.
        const related = event.relatedTarget;
        if (related instanceof Node && instance.element.contains(related)) {
          return;
        }
        this.onTouched?.();
        this.blurred.emit();
      }),
    ];
    untracked(() => this.applyAriaAttributes(editor, this.ariaLabel(), this.ariaLabelledBy()));
    if (untracked(() => this.wordPaste())) {
      this.loadWordPaste();
    }
    this.editorState.set(editor);
  }

  private unmount(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
    this.instance?.destroy();
    this.instance = null;
    this.mountedToolbar = null;
    this.editorState.set(null);
  }

  /** Remonte l'éditeur en conservant le contenu et le focus ; l'historique est perdu. */
  private remount(): void {
    const current = this.instance;
    if (!current) {
      return;
    }
    const html = current.editor.getHTML();
    const focused = current.editor.isFocused();
    this.unmount();
    this.mount(html);
    if (focused) {
      this.instance?.editor.focus('end');
    }
  }

  /**
   * Fusionne `ASTER_CONFIG` < `config` < inputs dédiés. Le transformateur Word est placé
   * en tête pour que les transformateurs de l'intégrateur reçoivent du HTML déjà nettoyé.
   * Avec `content` (remontage), `autofocus` est désactivé pour ne pas reprendre le focus.
   */
  private resolvedOptions(content?: string): AsterUiOptions {
    const merged = this.mergedConfig();
    const initial: string | AsterDocument | undefined =
      content ?? this.pendingValue ?? merged.content;
    return {
      ...merged,
      content: initial,
      autofocus: content === undefined ? merged.autofocus : false,
      toolbar: this.resolvedToolbar(),
      theme: this.resolvedTheme(),
      locale: this.resolvedLocale(),
      placeholder: this.resolvedPlaceholder(),
      readOnly: this.resolvedReadOnly(),
      pasteTransformers: [this.lazyWordTransformer, ...(merged.pasteTransformers ?? [])],
      upload: merged.upload ?? this.uploadHandler ?? undefined,
    };
  }

  private loadWordPaste(): void {
    if (this.wordTransformer || this.wordLoading) {
      return;
    }
    this.wordLoading = import('@aster-editor/word')
      .then((word) => {
        this.wordTransformer = word.wordPasteTransformer();
      })
      .catch((error: unknown) => {
        this.wordLoading = null;
        console.warn(
          '[aster-editor/angular] @aster-editor/word unavailable, paste kept raw',
          error,
        );
      });
  }

  /** Nom accessible du contenteditable : `aria-label` et/ou `aria-labelledby`, retirés si vides. */
  private applyAriaAttributes(
    editor: AsterEditor,
    label: string | undefined,
    labelledBy: string | undefined,
  ): void {
    setOrRemoveAttribute(editor.contentElement, 'aria-label', label);
    setOrRemoveAttribute(editor.contentElement, 'aria-labelledby', labelledBy);
  }

  /**
   * Change le placeholder à chaud. L'extension `Placeholder` lit ses options au moment où
   * son plugin ProseMirror est créé (et `extension.options` est une copie à chaque accès),
   * donc on refabrique le plugin via `addProseMirrorPlugins` avec un `placeholder` surchargé
   * et on le substitue à l'ancien par `unregisterPlugin`/`registerPlugin`, API publiques de
   * Tiptap. Le repli sur la chaîne i18n `editor.placeholder` est conservé.
   */
  private applyPlaceholder(editor: AsterEditor, placeholder: string | undefined): void {
    const tiptap = editor.tiptap;
    const extension = tiptap.extensionManager.extensions.find(
      (candidate) => candidate.name === 'placeholder',
    );
    if (extension?.type !== 'extension') {
      return;
    }
    const factory = extension.config.addProseMirrorPlugins as ExtensionPluginFactory | undefined;
    if (!factory) {
      return;
    }
    const options: PlaceholderExtensionOptions = {
      ...extension.options,
      placeholder: (): string => placeholder ?? editor.i18n.t('editor.placeholder'),
    };
    const plugins = factory.call({
      name: extension.name,
      options,
      storage: extension.storage,
      editor: tiptap,
      type: null,
      parent: undefined,
    });
    for (const plugin of plugins) {
      tiptap.unregisterPlugin(plugin.spec.key ?? extension.name);
      tiptap.registerPlugin(plugin);
    }
  }
}
