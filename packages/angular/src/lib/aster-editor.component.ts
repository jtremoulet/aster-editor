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
  AsterVariable,
  DocumentLayout,
  GetHtmlOptions,
  PasteTransformer,
  ToolbarConfig,
  Unsubscribe,
  VariableResolver,
  VariableSource,
  VariableValues,
} from '@aster-editor/core';
import { createAster } from '@aster-editor/ui';
import type { AsterInstance, AsterUiOptions } from '@aster-editor/ui';
import type { DocxExportOptions, DocxImportResult, FidelityReport } from '@aster-editor/word';
import { applyAriaAttributes, applyPlaceholder } from './editor-dom';
import {
  applyLayoutToPageView,
  onPageViewChange,
  readPageViewLayout,
  resolvePageViewOptions,
  setPageView,
} from './page-view';
import type { PageViewInput } from './page-view';
import { ASTER_CONFIG } from './provide-aster';
import { ASTER_UPLOAD_HANDLER } from './tokens';
import {
  compareWithTemplate,
  declareImportedVariables,
  exportWord,
  importWord,
  loadWordPasteTransformer,
  resolveExportOptions,
} from './word';
import type { DocxImportFidelity, DocxLostObject } from './word';

/** Égalité de deux listes de noms, pour ne pas notifier `variableNames` sans changement réel. */
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/** État du magasin de variables à conserver au travers d'un remontage. */
interface VariableSnapshot {
  readonly declared: readonly AsterVariable[];
  readonly values: VariableValues;
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
 * Changements à chaud : `theme`, `locale`, `readonly`, `placeholder`, `ariaLabel`,
 * `ariaLabelledBy`, `variables` et `variableValues` sont appliqués sur l'instance vivante.
 * `toolbar` remonte l'éditeur (le contenu, les déclarations et les valeurs de variables sont
 * conservés, l'historique d'annulation est perdu, `ready` est réémis avec la nouvelle
 * instance). Les autres clés de `config` (`extensions`, `commands`, `upload`…) ne sont lues
 * qu'au montage.
 *
 * Variables (champs de fusion) : les inputs `variables`, `variableValues`, `variableResolver`,
 * `allowUnknownVariables` et `variableSuggestion` se fusionnent dans `options.variables` et
 * `variableSuggestion` de `createAster`. `variableNames` expose les noms présents dans le
 * document, `variablesChanged` relaie `variablesChange`, `exportDocx` produit le `.docx` avec
 * les valeurs du magasin.
 *
 * Fidélité Word (session 3) : `importDocx` lit le `.docx` en mode stylé et conserve le
 * gabarit (`importedTemplate`), la mise en page (`layout`) et les objets non représentables
 * (`lostObjects`) ; `exportDocx` réutilise le gabarit par défaut (`exportInTemplate`) et
 * transmet la mise en page ; `pageView` active la vue page, `layout` (input) impose une mise
 * en page, `layoutChanged` signale celle que montre la vue page (dialogue « Mise en page »
 * compris) ; `compareWithTemplate` mesure la fidélité de l'export dans le gabarit.
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
  /**
   * Variables déclarées (libellé, description, valeur), proposées dans le menu d'insertion
   * même si absentes du document. À chaud : `editor.variables.define(...)`, fusion par nom.
   */
  readonly variables = input<readonly AsterVariable[] | undefined>(undefined);
  /**
   * Valeurs par nom. À chaud : `editor.variables.setValues(...)`, fusion avec les valeurs
   * connues (une clé absente n'efface rien, `undefined` efface).
   */
  readonly variableValues = input<VariableValues | undefined>(undefined);
  /** Résolveur asynchrone appelé par `resolveVariables()` pour les variables sans valeur. Lu au montage. */
  readonly variableResolver = input<VariableResolver | undefined>(undefined);
  /** Autoriser l'insertion d'une variable non déclarée. Défaut effectif : `true`. Lu au montage. */
  readonly allowUnknownVariables = input<boolean | undefined>(undefined);
  /** Menu de suggestion déclenché par `{{` dans le contenu. Défaut effectif : `true`. Lu au montage. */
  readonly variableSuggestion = input<boolean | undefined>(undefined);
  /**
   * Chemin de lecture d'`importDocx` : `styled` (lecteur OOXML d'Aster, HTML stylé, mise en
   * page et gabarit renseignés) ou `semantic` (mammoth, HTML sémantique, mise en page vide).
   * Défaut effectif : `styled`. Lu à chaque import.
   */
  readonly importFidelity = input<DocxImportFidelity | undefined>(undefined);
  /**
   * `exportDocx` sans `options.template` réutilise le gabarit du dernier import quand il
   * existe : tout ce qui n'est pas le corps ressort identique. `false` pour l'export neuf
   * (un `options.template` explicite reste honoré). Défaut : `true`. Lu à chaque export.
   */
  readonly exportInTemplate = input<boolean>(true);
  /**
   * Vue page (`AsterUiOptions.pageView`) : `true` pour les défauts d'Aster (A4 portrait), un
   * objet pour la mise en page, la pagination et l'affichage des en-têtes. La mise en page
   * effective du composant (`layout()`) prime sur `pageView.layout`. À chaud : la vue est
   * remontée. Le dialogue « Mise en page » de la toolbar peut aussi l'activer ou la modifier.
   */
  readonly pageView = input<PageViewInput>(undefined);
  /**
   * Mise en page imposée (input `layout`) : prime sur celle de l'import et sur celle posée
   * par le dialogue, se répercute sur la vue page active et sur `exportDocx`. Laisse
   * `undefined` pour suivre l'import ; avec une liaison, tiens-la à jour depuis
   * `layoutChanged` pour que le dialogue « Mise en page » reste pris en compte.
   */
  readonly layoutOverride = input<DocumentLayout | undefined>(undefined, { alias: 'layout' });

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
  /** Les valeurs ou déclarations de variables ont changé (`setValues`, `define`, `resolve`, import). */
  readonly variablesChanged = output<VariableValues>();
  /**
   * La mise en page effective a changé : import, input `layout`, ou dialogue « Mise en page »
   * de la toolbar (la vue page est alors relue). Jamais émis pour `null` (vue page retirée).
   */
  readonly layoutChanged = output<DocumentLayout>();

  private readonly editorState = signal<AsterEditor | null>(null);
  /** Éditeur courant, `null` avant le montage et après la destruction. */
  readonly editor: Signal<AsterEditor | null> = this.editorState.asReadonly();

  private readonly importedTemplateState = signal<ArrayBuffer | null>(null);
  /** Le `.docx` du dernier import, intact, réutilisé comme gabarit à l'export. `null` sans import. */
  readonly importedTemplate: Signal<ArrayBuffer | null> = this.importedTemplateState.asReadonly();

  private readonly lostObjectsState = signal<readonly DocxLostObject[]>([]);
  /** Objets Word non représentables rencontrés par le dernier import (vide en mode `semantic`). */
  readonly lostObjects: Signal<readonly DocxLostObject[]> = this.lostObjectsState.asReadonly();

  /** Mise en page lue par l'import ou posée par le dialogue « Mise en page ». */
  private readonly layoutState = signal<DocumentLayout | null>(null);
  /**
   * Mise en page effective : l'input `layout` s'il est fourni, sinon celle du dernier import
   * ou du dialogue « Mise en page ». `null` avant tout import sans vue page.
   */
  readonly layout: Signal<DocumentLayout | null> = computed(
    () => this.layoutOverride() ?? this.layoutState(),
  );

  private readonly variableNamesState = signal<readonly string[]>([], { equal: sameNames });
  /**
   * Noms des variables réellement présentes dans le document (`editor.variables.getNames()`),
   * relus sur `change` et `variablesChange`. Vide avant le montage et après la destruction.
   */
  readonly variableNames: Signal<readonly string[]> = this.variableNamesState.asReadonly();

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
  /** `config.variables` < inputs dédiés, clé par clé ; un input `undefined` ne masque rien. */
  private readonly resolvedVariableSource = computed<VariableSource | undefined>(() => {
    const base = this.mergedConfig().variables;
    const source: VariableSource = {
      ...base,
      ...(this.variables() !== undefined ? { variables: this.variables() } : {}),
      ...(this.variableValues() !== undefined ? { values: this.variableValues() } : {}),
      ...(this.variableResolver() !== undefined ? { resolve: this.variableResolver() } : {}),
      ...(this.allowUnknownVariables() !== undefined
        ? { allowUnknown: this.allowUnknownVariables() }
        : {}),
    };
    return Object.keys(source).length > 0 ? source : undefined;
  });
  private readonly resolvedVariableSuggestion = computed<boolean | undefined>(
    () => this.variableSuggestion() ?? this.mergedConfig().variableSuggestion,
  );
  private readonly resolvedPageView = computed<PageViewInput>(
    () => this.pageView() ?? this.mergedConfig().pageView,
  );

  private instance: AsterInstance | null = null;
  private mountedToolbar: ToolbarConfig | null = null;
  private mountedPageView: PageViewInput = undefined;
  /** Dernière mise en page émise par `layoutChanged`, pour ne pas la réémettre. */
  private emittedLayout: DocumentLayout | null = null;
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
          applyPlaceholder(this.instance.editor, placeholder);
        }
      });
    });
    effect(() => {
      const label = this.ariaLabel();
      const labelledBy = this.ariaLabelledBy();
      untracked(() => {
        if (this.instance) {
          applyAriaAttributes(this.instance.editor, label, labelledBy);
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
    // Au montage, déclarations et valeurs passent par `options.variables` ; ces deux effets
    // ne couvrent que les changements d'input sur un éditeur déjà monté.
    effect(() => {
      const declared = this.variables();
      untracked(() => {
        if (declared && this.instance) {
          this.instance.editor.variables.define(declared);
        }
      });
    });
    effect(() => {
      const values = this.variableValues();
      untracked(() => {
        if (values && this.instance) {
          this.instance.editor.variables.setValues(values);
        }
      });
    });
    // Au montage, la vue page passe par `options.pageView` ; cet effet ne couvre que les
    // changements d'input sur un éditeur déjà monté.
    effect(() => {
      const pageView = this.resolvedPageView();
      untracked(() => {
        if (this.instance && this.mountedPageView !== pageView) {
          this.mountedPageView = pageView;
          setPageView(this.instance.editor, resolvePageViewOptions(pageView, this.layout()));
        }
      });
    });
    // Mise en page effective : répercutée sur la vue page active, signalée par `layoutChanged`.
    effect(() => {
      const layout = this.layout();
      untracked(() => {
        if (layout && this.instance) {
          applyLayoutToPageView(this.instance.editor, layout);
        }
        this.notifyLayout(layout);
      });
    });
  }

  // --- API publique --------------------------------------------------------

  /**
   * Importe un `.docx` via `@aster-editor/word` (chargé à la demande, le lecteur reste dans
   * un chunk séparé), remplace le contenu de l'éditeur en émettant `change` pour que le
   * formulaire voie la nouvelle valeur, et rend le résultat avec ses avertissements.
   * Le hook d'upload de l'éditeur est réutilisé pour les images embarquées. En mode `styled`
   * (défaut, voir `importFidelity`), le gabarit, la mise en page et les objets non
   * représentables sont conservés dans `importedTemplate`, `layout` et `lostObjects`, et la
   * mise en page est appliquée à la vue page si elle est active. Si le composant est détruit
   * ou remonté pendant l'import, le résultat est rendu mais rien n'est écrit ni conservé :
   * l'instance vivante est relue après chaque `await`.
   */
  async importDocx(file: File): Promise<DocxImportResult> {
    this.requireEditor('importDocx');
    const defaults = untracked(() => ({
      upload: this.resolvedOptions().upload,
      fidelity: this.importFidelity() ?? 'styled',
    }));
    const result = await importWord(file, defaults);
    const editor = this.instance?.editor;
    if (editor && !editor.isDestroyed()) {
      editor.setHTML(result.html, true);
      declareImportedVariables(editor, result.variables, () => this.variableValues());
      this.importedTemplateState.set(result.template);
      this.lostObjectsState.set(result.lost);
      this.layoutState.set(result.layout);
    }
    return result;
  }

  /**
   * Convertit le document en `.docx` via `exportDocx` de `@aster-editor/word` (chargé à la
   * demande, la lib `docx` reste dans son chunk). Les valeurs du magasin de variables sont
   * transmises quand `options.variables.values` n'est pas fourni : `mode: 'resolve'` substitue
   * donc ce que l'utilisateur a saisi, `'fields'` produit des champs de fusion Word avec ces
   * valeurs comme résultat. Sans `options.template`, le gabarit du dernier import est utilisé
   * si `exportInTemplate` est vrai ; sans `options.layout`, la mise en page effective
   * (`layout()`) est transmise. Rend le `Blob`, à passer à `downloadDocx` ou à un upload.
   */
  async exportDocx(options: DocxExportOptions = {}): Promise<Blob> {
    const editor = this.requireEditor('exportDocx');
    const resolved = untracked(() =>
      resolveExportOptions(editor, options, {
        template: this.importedTemplate(),
        layout: this.layout(),
        inTemplate: this.exportInTemplate(),
      }),
    );
    return exportWord(editor, resolved);
  }

  /**
   * Rapport de fidélité du document courant : export dans le gabarit du dernier import
   * (valeurs du magasin de variables, mise en page effective) puis `compareDocx(gabarit,
   * export)`. `null` sans gabarit importé. Le comparateur est chargé à la demande.
   */
  async compareWithTemplate(): Promise<FidelityReport | null> {
    const template = this.importedTemplate();
    if (!template) {
      return null;
    }
    const exported = await this.exportDocx({ template });
    return compareWithTemplate(template, exported);
  }

  /**
   * HTML du document, `{ variables: 'resolve' }` substitue les valeurs connues. Avant le
   * montage, rend la valeur reçue par `writeValue` (puces conservées) ou une chaîne vide.
   */
  getHTML(options?: GetHtmlOptions): string {
    return this.instance?.editor.getHTML(options) ?? this.pendingValue ?? '';
  }

  /**
   * Appelle le résolveur (`variableResolver` ou `config.variables.resolve`) pour les
   * variables présentes sans valeur, applique les valeurs obtenues et les rend toutes.
   */
  resolveVariables(): Promise<VariableValues> {
    return this.requireEditor('resolveVariables').variables.resolve();
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
  private mount(content?: string, variables?: VariableSnapshot): void {
    if (this.instance) {
      return;
    }
    const options = untracked(() => this.resolvedOptions(content, variables));
    const instance = createAster(this.host().nativeElement, options);
    const editor = instance.editor;
    this.instance = instance;
    this.mountedToolbar = options.toolbar ?? 'standard';
    this.mountedPageView = untracked(() => this.resolvedPageView());
    this.pendingValue = null;
    // Le dialogue « Mise en page » de la toolbar pose sa mise en page via `setPageView` sans
    // passer par le composant : le core signale chaque changement de vue page par
    // `pageViewChange` (contrat, L45b), on y adopte la mise en page en vigueur.
    this.subscriptions = [onPageViewChange(editor, (layout) => this.adoptPageViewLayout(layout))];
    this.subscriptions.push(
      editor.on('ready', ({ editor: ready }) => this.ready.emit(ready)),
      editor.on('change', ({ editor: changed }) => {
        const html = changed.getHTML();
        this.onChange?.(html);
        this.changed.emit(html);
        this.refreshVariableNames(changed);
      }),
      editor.on('variablesChange', ({ editor: source, values }) => {
        this.refreshVariableNames(source);
        this.variablesChanged.emit(values);
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
    );
    untracked(() => applyAriaAttributes(editor, this.ariaLabel(), this.ariaLabelledBy()));
    // Une vue page montée depuis `options.pageView` sans import : sa mise en page devient
    // celle du composant (le dialogue de la toolbar part de la même base).
    this.adoptPageViewLayout(readPageViewLayout(editor));
    if (untracked(() => this.wordPaste())) {
      this.loadWordPaste();
    }
    this.refreshVariableNames(editor);
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
    this.mountedPageView = undefined;
    this.editorState.set(null);
    this.variableNamesState.set([]);
  }

  /**
   * Remonte l'éditeur en conservant le contenu, le focus, les déclarations et les valeurs
   * de variables ; l'historique est perdu.
   */
  private remount(): void {
    const current = this.instance;
    if (!current) {
      return;
    }
    const html = current.editor.getHTML();
    const focused = current.editor.isFocused();
    const variables: VariableSnapshot = {
      declared: current.editor.variables.list(),
      values: current.editor.variables.getValues(),
    };
    this.unmount();
    this.mount(html, variables);
    if (focused) {
      this.instance?.editor.focus('end');
    }
  }

  /**
   * Fusionne `ASTER_CONFIG` < `config` < inputs dédiés. Le transformateur Word est placé
   * en tête pour que les transformateurs de l'intégrateur reçoivent du HTML déjà nettoyé.
   * Avec `content` (remontage), `autofocus` est désactivé pour ne pas reprendre le focus et
   * `variables` réinjecte l'état du magasin précédent par-dessus la configuration.
   */
  private resolvedOptions(content?: string, variables?: VariableSnapshot): AsterUiOptions {
    const merged = this.mergedConfig();
    const initial: string | AsterDocument | undefined =
      content ?? this.pendingValue ?? merged.content;
    const source = this.resolvedVariableSource();
    const variableSource: VariableSource | undefined = variables
      ? {
          ...source,
          variables: [...(source?.variables ?? []), ...variables.declared],
          values: { ...source?.values, ...variables.values },
        }
      : source;
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
      variables: variableSource,
      variableSuggestion: this.resolvedVariableSuggestion(),
      pageView: resolvePageViewOptions(this.resolvedPageView(), this.layout()),
    };
  }

  /**
   * Adopte la mise en page de la vue page active (`null` : vue inactive, rien à adopter).
   * Si l'input `layout` la masque, `layoutChanged` est émis directement pour que
   * l'application puisse l'adopter ; sinon l'effet sur `layout()` s'en charge.
   */
  private adoptPageViewLayout(current: DocumentLayout | null): void {
    // Rien à relire si la vue montre déjà l'état connu, ou l'input `layout` que le composant
    // vient lui-même de poser : l'état garde alors la mise en page de l'import, retrouvée
    // quand l'input repasse à `undefined`.
    if (
      !current ||
      current === untracked(() => this.layoutState()) ||
      current === untracked(() => this.layoutOverride())
    ) {
      return;
    }
    this.layoutState.set(current);
    if (untracked(() => this.layout()) !== current) {
      this.notifyLayout(current);
    }
  }

  /** Émet `layoutChanged` une seule fois par mise en page (même référence = déjà émise). */
  private notifyLayout(layout: DocumentLayout | null): void {
    if (layout && layout !== this.emittedLayout) {
      this.emittedLayout = layout;
      this.layoutChanged.emit(layout);
    }
  }

  /** Éditeur monté, sinon erreur explicite nommant la méthode appelée trop tôt. */
  private requireEditor(method: string): AsterEditor {
    const editor = this.instance?.editor;
    if (!editor) {
      throw new Error(`[aster-editor/angular] ${method}: editor is not mounted yet`);
    }
    return editor;
  }

  /** Relit `getNames()` ; le signal n'est notifié que si la liste change réellement. */
  private refreshVariableNames(editor: AsterEditor): void {
    this.variableNamesState.set(editor.variables.getNames());
  }

  private loadWordPaste(): void {
    if (this.wordTransformer || this.wordLoading) {
      return;
    }
    this.wordLoading = loadWordPasteTransformer()
      .then((transformer) => {
        this.wordTransformer = transformer;
      })
      .catch((error: unknown) => {
        this.wordLoading = null;
        console.warn(
          '[aster-editor/angular] @aster-editor/word unavailable, paste kept raw',
          error,
        );
      });
  }
}
