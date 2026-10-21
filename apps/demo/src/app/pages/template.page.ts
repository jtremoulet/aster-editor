import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AsterEditorComponent } from '@aster-editor/angular';
import type {
  AsterVariable,
  DocumentLayout,
  DocxImportWarning,
  DocxLostObject,
  DocxVariableMode,
  FidelityReport,
  VariableValues,
} from '@aster-editor/angular';

/** Un champ du formulaire généré : nom de variable, libellé affiché et placeholder `{{nom}}`. */
interface VariableField {
  readonly name: string;
  readonly label: string;
  readonly placeholder: string;
}

type PreviewTab = 'chips' | 'resolved';

/** Fixtures servies depuis `apps/demo/public/samples/`, copiées depuis `fixtures/docx/`. */
const SAMPLES = {
  variables: { url: 'samples/08-variables-braces.docx', name: '08-variables-braces.docx' },
  styled: { url: 'samples/16-sections.docx', name: '16-sections.docx' },
} as const;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Nom de fichier téléchargé selon le mode d'export des variables. */
const EXPORT_NAMES: Readonly<Record<DocxVariableMode, string>> = {
  resolve: 'modele-resolu.docx',
  fields: 'modele-champs-word.docx',
  placeholders: 'modele.docx',
};

/** Export dans le gabarit : les champs de fusion du modèle sont conservés (`fields`). */
const TEMPLATE_EXPORT_NAME = 'modele-gabarit.docx';

/**
 * Déclenche le téléchargement d'un `Blob` via un lien `<a download>` éphémère. Évite
 * d'importer `downloadDocx` de `@aster-editor/word` dans la démo : le composant a déjà
 * chargé le module, inutile d'en faire une dépendance de la page.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Libellé lisible d'un objet non représentable. */
function describeLost(lost: DocxLostObject): string {
  const parts = [lost.kind, `(${lost.where})`];
  if (lost.detail) {
    parts.push(`— ${lost.detail}`);
  }
  return parts.join(' ');
}

/**
 * Modèle : import d'un `.docx` à variables (`{{client.nom}}`, champs de fusion), formulaire
 * généré depuis `variableNames()`, aperçu puces / résolu, export dans les trois modes.
 * Session 3 : vue page, en-têtes et pieds éditables (répercutés sur la vue page et sur
 * l'export), export dans le gabarit, rapport de fidélité et objets non représentables.
 */
@Component({
  selector: 'app-template',
  imports: [AsterEditorComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="demo-page">
      <h1>Modèle</h1>
      <p class="demo-lead">
        Importe un modèle Word à variables (<code>{{ example }}</code
        >, champs de fusion), remplis les valeurs, puis exporte le document résolu, avec champs
        Word, ou dans son gabarit d'origine.
      </p>

      <div
        class="demo-dropzone"
        [class.is-over]="over()"
        (dragover)="onDragOver($event)"
        (dragleave)="over.set(false)"
        (drop)="onDrop($event)"
      >
        <strong>Glisse un modèle .docx ici</strong>
        <span>ou</span>
        <input
          type="file"
          accept=".docx"
          aria-label="Choisir un modèle .docx à importer"
          (change)="onFileChange($event)"
          [disabled]="busy()"
        />
        <span>ou</span>
        <span class="demo-dropzone__samples">
          <button
            type="button"
            class="demo-button"
            (click)="loadSample('variables')"
            [disabled]="busy()"
          >
            Charger l'exemple
          </button>
          <button
            type="button"
            class="demo-button"
            (click)="loadSample('styled')"
            [disabled]="busy()"
          >
            Charger l'exemple stylé
          </button>
        </span>
        @if (fileName(); as name) {
          <span>Importé : {{ name }}</span>
        }
        @if (busy()) {
          <span
            >Import en cours… (sur <code>ng serve</code>, le tout premier import peut recharger la
            page : relance-le)</span
          >
        }
      </div>

      @if (error(); as message) {
        <p class="demo-error">{{ message }}</p>
      }

      @if (warnings().length > 0) {
        <ul class="demo-warnings">
          @for (warning of warnings(); track $index) {
            <li>
              <code>{{ warning.code }}</code> {{ warning.message }}
            </li>
          }
        </ul>
      }

      @if (fields().length > 0) {
        <form class="demo-variables" (submit)="apply($event)">
          <h2>Variables du document</h2>
          <p class="demo-variables__status" [class.is-ok]="unresolvedCount() === 0">
            @if (unresolvedCount() === 0) {
              Toutes les variables ont une valeur.
            } @else {
              {{ unresolvedCount() }} variable{{ unresolvedCount() > 1 ? 's' : '' }} sans valeur
            }
          </p>
          <div class="demo-variables__grid">
            @for (field of fields(); track field.name) {
              <label class="demo-field">
                <span>{{ field.label }}</span>
                <input
                  type="text"
                  [name]="field.name"
                  [value]="draftValue(field.name)"
                  (input)="onDraftInput(field.name, $event)"
                  [placeholder]="field.placeholder"
                />
              </label>
            }
          </div>
          <div class="demo-controls">
            <span class="demo-spacer"></span>
            <button type="submit" class="demo-button demo-button--primary">Appliquer</button>
          </div>
        </form>
      }

      <div class="demo-controls">
        <label>
          <input type="checkbox" [checked]="pageView()" (change)="pageView.set(checked($event))" />
          Vue page
        </label>
        @if (pageSummary(); as summary) {
          <span class="demo-layout-summary">{{ summary }}</span>
        }
      </div>

      <div class="demo-tabs" role="tablist" aria-label="Aperçu du modèle">
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="tab() === 'chips'"
          (click)="selectTab('chips')"
        >
          Puces
        </button>
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="tab() === 'resolved'"
          (click)="selectTab('resolved')"
        >
          Résolu
        </button>
      </div>

      <div [hidden]="tab() !== 'chips'">
        <!-- Toolbar « full » : le dialogue « Mise en page » (en-têtes et pieds par section, L54) n'est pas dans « standard ». -->
        <aster-editor
          toolbar="full"
          placeholder="Le modèle importé apparaîtra ici…"
          [variableValues]="values()"
          [pageView]="pageView()"
          [layout]="editedLayout()"
          [exportInTemplate]="false"
          (changed)="onChanged()"
          (variablesChanged)="onVariablesChanged($event)"
          (layoutChanged)="onLayoutChanged($event)"
        />
      </div>
      @if (tab() === 'resolved') {
        <div class="aster demo-resolved" data-theme="light">
          <div class="aster-content">
            <div class="ProseMirror" [innerHTML]="resolvedHtml()"></div>
          </div>
        </div>
      }

      @if (fileName()) {
        <section class="demo-panel demo-header-footer">
          <h2>En-tête / Pied</h2>
          <p class="demo-panel__hint">
            Modifie l'en-tête et le pied par défaut : la vue page les reflète, l'export neuf les
            réécrit, l'export dans le gabarit ne régénère que la partie modifiée. Le dialogue « Mise
            en page » de la barre d'outils édite aussi, section par section, l'en-tête et le pied de
            la section du curseur (première page, pages paires).
          </p>
          <div class="demo-header-footer__grid">
            <label class="demo-field">
              <span>En-tête</span>
              <aster-editor
                toolbar="minimal"
                ariaLabel="En-tête par défaut"
                placeholder="Aucun en-tête"
                [formControl]="headerControl"
                (changed)="onHeaderChanged($event)"
              />
            </label>
            <label class="demo-field">
              <span>Pied</span>
              <aster-editor
                toolbar="minimal"
                ariaLabel="Pied par défaut"
                placeholder="Aucun pied"
                [formControl]="footerControl"
                (changed)="onFooterChanged($event)"
              />
            </label>
          </div>
        </section>
      }

      <div class="demo-controls">
        <span>Exporter :</span>
        <button
          type="button"
          class="demo-button demo-button--primary"
          (click)="download('resolve')"
          [disabled]="!canExport()"
        >
          Télécharger résolu
        </button>
        <button
          type="button"
          class="demo-button"
          (click)="download('fields')"
          [disabled]="!canExport()"
        >
          Télécharger avec champs Word
        </button>
        <button
          type="button"
          class="demo-button"
          (click)="download('placeholders')"
          [disabled]="!canExport()"
        >
          Télécharger modèle
        </button>
        <button
          type="button"
          class="demo-button"
          (click)="downloadInTemplate()"
          [disabled]="!canExport()"
        >
          Télécharger (gabarit)
        </button>
        <span class="demo-spacer"></span>
        <button
          type="button"
          class="demo-button"
          (click)="compare()"
          [disabled]="!canExport() || comparing()"
        >
          Rapport de fidélité
        </button>
        @if (exporting()) {
          <span>Export en cours…</span>
        }
        @if (comparing()) {
          <span>Comparaison en cours…</span>
        }
      </div>

      @if (report(); as report) {
        <section class="demo-panel demo-fidelity">
          <h2>
            Rapport de fidélité
            <span class="demo-fidelity__score" [class.is-ok]="report.score >= 0.98">
              {{ scorePercent(report) }}
            </span>
          </h2>
          <p class="demo-panel__hint">
            {{ report.identicalParts.length }} partie{{
              report.identicalParts.length > 1 ? 's' : ''
            }}
            du paquet identique{{ report.identicalParts.length > 1 ? 's' : '' }} à l'octet,
            {{ report.changedParts.length }} différente{{
              report.changedParts.length > 1 ? 's' : ''
            }}.
          </p>
          <table class="demo-fidelity__table">
            <thead>
              <tr>
                <th scope="col">Groupe</th>
                <th scope="col">Propriété</th>
                <th scope="col">Conservé / total</th>
                <th scope="col">Exemples de pertes</th>
              </tr>
            </thead>
            <tbody>
              @for (property of report.properties; track property.name) {
                <tr [class.is-lost]="property.lost > 0">
                  <td>{{ property.group }}</td>
                  <td>
                    <code>{{ property.name }}</code>
                  </td>
                  <td>{{ property.kept }} / {{ property.total }}</td>
                  <td>
                    @for (example of property.examples; track $index) {
                      <div class="demo-fidelity__example">
                        {{ example.where }} : <code>{{ example.expected }}</code> →
                        <code>{{ example.actual }}</code>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (report.changedParts.length > 0) {
            <ul class="demo-fidelity__parts">
              @for (part of report.changedParts; track part.path) {
                <li>
                  <code>{{ part.path }}</code> {{ part.summary }}
                </li>
              }
            </ul>
          }
        </section>
      }

      @if (lostObjects().length > 0) {
        <section class="demo-panel demo-lost">
          <h2>Objets non représentables</h2>
          <p class="demo-panel__hint">
            Conservés tels quels dans le gabarit hors du corps, remplacés par leur texte dans le
            corps édité.
          </p>
          <ul>
            @for (lost of lostObjects(); track $index) {
              <li>
                {{ describe(lost) }}
                @if (lost.text) {
                  <em>« {{ lost.text }} »</em>
                }
              </li>
            }
          </ul>
        </section>
      }
    </section>
  `,
})
export class TemplatePage {
  /** Syntaxe canonique affichée dans l'intro ; une constante évite d'échapper `{{` dans le template. */
  protected readonly example = '{{client.nom}}';
  protected readonly over = signal(false);
  protected readonly busy = signal(false);
  protected readonly exporting = signal(false);
  protected readonly comparing = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly warnings = signal<readonly DocxImportWarning[]>([]);
  protected readonly tab = signal<PreviewTab>('chips');
  protected readonly resolvedHtml = signal('');
  /** Valeurs poussées dans l'input `variableValues` au clic sur « Appliquer ». */
  protected readonly values = signal<VariableValues | undefined>(undefined);
  /** Vue page de l'éditeur principal, liée à l'input `pageView`. */
  protected readonly pageView = signal(true);
  /**
   * Mise en page poussée dans l'input `layout` : celle de l'import (reçue par
   * `layoutChanged`) avec l'en-tête et le pied édités dans le panneau.
   */
  protected readonly editedLayout = signal<DocumentLayout | undefined>(undefined);
  protected readonly report = signal<FidelityReport | null>(null);
  /** Contenu des deux petits éditeurs du panneau « En-tête / Pied ». */
  protected readonly headerControl = new FormControl('', { nonNullable: true });
  protected readonly footerControl = new FormControl('', { nonNullable: true });

  /** Déclarations connues de l'éditeur, relues à chaque `variablesChanged` (pour les libellés). */
  private readonly declared = signal<readonly AsterVariable[]>([]);
  /** Valeurs du magasin de l'éditeur, relayées par `variablesChanged`. */
  private readonly storeValues = signal<VariableValues>({});
  /** Saisie en cours du formulaire, pas encore appliquée. */
  private readonly draft = signal<Readonly<Record<string, string>>>({});

  private readonly editorRef = viewChild(AsterEditorComponent);

  /** Un champ par variable présente dans le document, libellé depuis `editor.variables.list()`. */
  protected readonly fields = computed<readonly VariableField[]>(() => {
    const names = this.editorRef()?.variableNames() ?? [];
    const declared = this.declared();
    return names.map((name) => ({
      name,
      label: declared.find((variable) => variable.name === name)?.label ?? name,
      placeholder: `{{${name}}}`,
    }));
  });

  protected readonly unresolvedCount = computed<number>(() => {
    const values = this.storeValues();
    return this.fields().filter((field) => !values[field.name]).length;
  });

  protected readonly canExport = computed<boolean>(
    () => this.fileName() !== null && !this.busy() && !this.exporting(),
  );

  /** Objets non représentables du dernier import, exposés par le composant. */
  protected readonly lostObjects = computed<readonly DocxLostObject[]>(
    () => this.editorRef()?.lostObjects() ?? [],
  );

  /** Format, orientation et marges de la mise en page effective, en une ligne. */
  protected readonly pageSummary = computed<string | null>(() => {
    const page = this.editedLayout()?.page;
    if (!page) {
      return null;
    }
    const size =
      typeof page.size === 'string'
        ? page.size
        : page.size
          ? `${page.size.widthMm} × ${page.size.heightMm} mm`
          : 'A4';
    const margins = page.margins;
    const marginText = margins
      ? `marges ${margins.topMm ?? 25.4} / ${margins.rightMm ?? 25.4} / ${margins.bottomMm ?? 25.4} / ${margins.leftMm ?? 25.4} mm`
      : 'marges par défaut';
    return `${size}, ${page.orientation ?? 'portrait'}, ${marginText}`;
  });

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected scorePercent(report: FidelityReport): string {
    return `${(report.score * 100).toFixed(1)} %`;
  }

  protected describe(lost: DocxLostObject): string {
    return describeLost(lost);
  }

  protected draftValue(name: string): string {
    return this.draft()[name] ?? this.storeValues()[name] ?? '';
  }

  protected onDraftInput(name: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({ ...draft, [name]: value }));
  }

  /** Pousse la saisie (champs non vides) dans `variableValues` ; le magasin fusionne. */
  protected apply(event: Event): void {
    event.preventDefault();
    const next: Record<string, string> = {};
    for (const [name, value] of Object.entries(this.draft())) {
      if (value.trim() !== '') {
        next[name] = value;
      }
    }
    this.values.set(next);
  }

  protected selectTab(tab: PreviewTab): void {
    this.tab.set(tab);
    this.refreshResolved();
  }

  protected onChanged(): void {
    this.refreshResolved();
  }

  protected onVariablesChanged(values: VariableValues): void {
    this.storeValues.set(values);
    const editor = this.editorRef()?.editor();
    this.declared.set(editor ? editor.variables.list() : []);
    this.refreshResolved();
  }

  /**
   * Mise en page signalée par le composant (import, dialogue « Mise en page ») : adoptée
   * comme base de l'édition, sauf si c'est déjà la nôtre.
   */
  protected onLayoutChanged(layout: DocumentLayout): void {
    if (layout !== this.editedLayout()) {
      this.editedLayout.set(layout);
    }
  }

  protected onHeaderChanged(html: string): void {
    this.updateHeaderFooter('headers', html);
  }

  protected onFooterChanged(html: string): void {
    this.updateHeaderFooter('footers', html);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.over.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) {
      void this.importFile(file);
    }
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.importFile(file);
    }
    input.value = '';
  }

  /** Récupère une fixture servie par la démo et l'importe comme un fichier déposé. */
  protected async loadSample(which: keyof typeof SAMPLES): Promise<void> {
    const sample = SAMPLES[which];
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await fetch(sample.url);
      if (!response.ok) {
        throw new Error(`Exemple introuvable (${response.status}) : ${sample.url}`);
      }
      const blob = await response.blob();
      await this.importFile(new File([blob], sample.name, { type: DOCX_MIME }));
    } catch (cause: unknown) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.busy.set(false);
    }
  }

  protected async importFile(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      this.error.set(`« ${file.name} » n'est pas un fichier .docx.`);
      return;
    }
    const editor = this.editorRef();
    if (!editor) {
      this.error.set("L'éditeur n'est pas encore monté, réessaie.");
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    // L'import remplace la mise en page : l'input `layout` ne doit plus masquer la nouvelle.
    this.editedLayout.set(undefined);
    this.report.set(null);
    try {
      const result = await editor.importDocx(file);
      this.warnings.set(result.warnings);
      this.fileName.set(file.name);
      this.draft.set({});
      // L'hôte de la vue page affiche l'en-tête de la première section et le pied de la
      // dernière (`layout.footers` = dernière section par contrat) : le panneau édite ceux-là.
      // Page 1 : l'en-tête `first` quand la section 1 a une première page différente.
      const first = result.layout.sections?.[0];
      const page1 = first?.titlePage ? first.headers?.first : undefined;
      this.headerControl.setValue(
        page1?.html ?? first?.headers?.default?.html ?? result.layout.headers?.default?.html ?? '',
      );
      this.footerControl.setValue(result.layout.footers?.default?.html ?? '');
      // Un import sans variable n'émet pas `variablesChanged` : on relit l'état à la main.
      const instance = editor.editor();
      if (instance) {
        this.declared.set(instance.variables.list());
        this.storeValues.set(instance.variables.getValues());
      }
      this.refreshResolved();
    } catch (cause: unknown) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.busy.set(false);
    }
  }

  /** Export neuf avec les valeurs du magasin dans le mode demandé, puis téléchargement. */
  protected async download(mode: DocxVariableMode): Promise<void> {
    await this.export(
      { title: 'Modèle', variables: { mode }, layout: this.editedLayout() },
      EXPORT_NAMES[mode],
    );
  }

  /**
   * Export dans le gabarit importé : tout ce qui n'est pas le corps ressort identique, sauf
   * un en-tête ou un pied modifié dans le panneau ; les champs de fusion sont conservés.
   */
  protected async downloadInTemplate(): Promise<void> {
    const template = this.editorRef()?.importedTemplate();
    if (!template) {
      this.error.set("Aucun gabarit : importe d'abord un .docx.");
      return;
    }
    await this.export(
      { title: 'Modèle', template, variables: { mode: 'fields' }, layout: this.editedLayout() },
      TEMPLATE_EXPORT_NAME,
    );
  }

  /** Rapport de fidélité du document courant dans son gabarit. */
  protected async compare(): Promise<void> {
    const editor = this.editorRef();
    if (!editor) {
      return;
    }
    this.comparing.set(true);
    this.error.set(null);
    try {
      const report = await editor.compareWithTemplate();
      if (!report) {
        this.error.set("Aucun gabarit : importe d'abord un .docx.");
      }
      this.report.set(report);
    } catch (cause: unknown) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.comparing.set(false);
    }
  }

  private async export(
    options: Parameters<AsterEditorComponent['exportDocx']>[0],
    filename: string,
  ): Promise<void> {
    const editor = this.editorRef();
    if (!editor) {
      return;
    }
    this.exporting.set(true);
    this.error.set(null);
    try {
      const blob = await editor.exportDocx(options);
      downloadBlob(blob, filename);
    } catch (cause: unknown) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.exporting.set(false);
    }
  }

  /**
   * Remplace l'en-tête ou le pied `default` de la mise en page éditée par le HTML saisi.
   * Avec des sections : l'en-tête va dans la première (celle que l'hôte affiche), le pied
   * dans la dernière **et** au premier niveau (invariant du contrat : `layout.footers` =
   * dernière section).
   */
  private updateHeaderFooter(kind: 'headers' | 'footers', html: string): void {
    const base = this.editedLayout() ?? this.editorRef()?.layout() ?? {};
    const sections = base.sections;
    if (!sections || sections.length === 0) {
      this.editedLayout.set({ ...base, [kind]: { ...base[kind], default: { html } } });
      return;
    }
    const index = kind === 'headers' ? 0 : sections.length - 1;
    const target = sections[index];
    // En-tête : le type affiché sur la page 1 (`first` si première page différente).
    const type =
      kind === 'headers' && target?.titlePage && target.headers?.first ? 'first' : 'default';
    const next = sections.map((section, i) =>
      i === index && target
        ? { ...target, [kind]: { ...target[kind], [type]: { html } } }
        : section,
    );
    const top = kind === 'footers' ? { footers: { ...base.footers, default: { html } } } : {};
    this.editedLayout.set({ ...base, ...top, sections: next });
  }

  /** Recalcule le HTML résolu seulement quand l'onglet « Résolu » est affiché. */
  private refreshResolved(): void {
    if (this.tab() !== 'resolved') {
      return;
    }
    this.resolvedHtml.set(this.editorRef()?.getHTML({ variables: 'resolve' }) ?? '');
  }
}
