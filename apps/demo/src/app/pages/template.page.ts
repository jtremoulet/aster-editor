import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { AsterEditorComponent } from '@aster-editor/angular';
import type {
  AsterVariable,
  DocxImportWarning,
  DocxVariableMode,
  VariableValues,
} from '@aster-editor/angular';

/** Un champ du formulaire généré : nom de variable, libellé affiché et placeholder `{{nom}}`. */
interface VariableField {
  readonly name: string;
  readonly label: string;
  readonly placeholder: string;
}

type PreviewTab = 'chips' | 'resolved';

/** Fixture servie depuis `apps/demo/public/samples/`, copiée depuis `fixtures/docx/`. */
const SAMPLE_URL = 'samples/08-variables-braces.docx';
const SAMPLE_NAME = '08-variables-braces.docx';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Nom de fichier téléchargé selon le mode d'export des variables. */
const EXPORT_NAMES: Readonly<Record<DocxVariableMode, string>> = {
  resolve: 'modele-resolu.docx',
  fields: 'modele-champs-word.docx',
  placeholders: 'modele.docx',
};

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

/**
 * Modèle : import d'un `.docx` à variables (`{{client.nom}}`, champs de fusion), formulaire
 * généré depuis `variableNames()`, aperçu puces / résolu, export dans les trois modes.
 */
@Component({
  selector: 'app-template',
  imports: [AsterEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="demo-page">
      <h1>Modèle</h1>
      <p class="demo-lead">
        Importe un modèle Word à variables (<code>{{ example }}</code
        >, champs de fusion), remplis les valeurs, puis exporte le document résolu ou avec champs
        Word.
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
        <button type="button" class="demo-button" (click)="loadSample()" [disabled]="busy()">
          Charger l'exemple
        </button>
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
        <aster-editor
          toolbar="standard"
          placeholder="Le modèle importé apparaîtra ici…"
          [variableValues]="values()"
          (changed)="onChanged()"
          (variablesChanged)="onVariablesChanged($event)"
        />
      </div>
      @if (tab() === 'resolved') {
        <div class="aster demo-resolved" data-theme="light">
          <div class="aster-content">
            <div class="ProseMirror" [innerHTML]="resolvedHtml()"></div>
          </div>
        </div>
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
        @if (exporting()) {
          <span>Export en cours…</span>
        }
      </div>
    </section>
  `,
})
export class TemplatePage {
  /** Syntaxe canonique affichée dans l'intro ; une constante évite d'échapper `{{` dans le template. */
  protected readonly example = '{{client.nom}}';
  protected readonly over = signal(false);
  protected readonly busy = signal(false);
  protected readonly exporting = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly warnings = signal<readonly DocxImportWarning[]>([]);
  protected readonly tab = signal<PreviewTab>('chips');
  protected readonly resolvedHtml = signal('');
  /** Valeurs poussées dans l'input `variableValues` au clic sur « Appliquer ». */
  protected readonly values = signal<VariableValues | undefined>(undefined);

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

  /** Récupère la fixture servie par la démo et l'importe comme un fichier déposé. */
  protected async loadSample(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await fetch(SAMPLE_URL);
      if (!response.ok) {
        throw new Error(`Exemple introuvable (${response.status}) : ${SAMPLE_URL}`);
      }
      const blob = await response.blob();
      await this.importFile(new File([blob], SAMPLE_NAME, { type: DOCX_MIME }));
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
    try {
      const result = await editor.importDocx(file);
      this.warnings.set(result.warnings);
      this.fileName.set(file.name);
      this.draft.set({});
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

  /** Exporte le document avec les valeurs du magasin dans le mode demandé, puis le télécharge. */
  protected async download(mode: DocxVariableMode): Promise<void> {
    const editor = this.editorRef();
    if (!editor) {
      return;
    }
    this.exporting.set(true);
    this.error.set(null);
    try {
      const blob = await editor.exportDocx({ title: 'Modèle', variables: { mode } });
      downloadBlob(blob, EXPORT_NAMES[mode]);
    } catch (cause: unknown) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.exporting.set(false);
    }
  }

  /** Recalcule le HTML résolu seulement quand l'onglet « Résolu » est affiché. */
  private refreshResolved(): void {
    if (this.tab() !== 'resolved') {
      return;
    }
    this.resolvedHtml.set(this.editorRef()?.getHTML({ variables: 'resolve' }) ?? '');
  }
}
