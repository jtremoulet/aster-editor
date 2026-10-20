import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { AsterEditorComponent } from '@aster-editor/angular';
import type { DocxImportFidelity, DocxImportWarning, PageSetup } from '@aster-editor/angular';

const FIDELITIES: readonly DocxImportFidelity[] = ['styled', 'semantic'];

/** Fixture stylée servie depuis `apps/demo/public/samples/`, copiée depuis `fixtures/docx/`. */
const STYLED_SAMPLE_URL = 'samples/13-styles-nommes.docx';
const STYLED_SAMPLE_NAME = '13-styles-nommes.docx';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Lignes « libellé : valeur » décrivant `layout.page` (format, orientation, marges). */
interface PageLine {
  readonly label: string;
  readonly value: string;
}

/** Marge affichée : valeur lue ou défaut Word (25,4 mm). */
function marginMm(value: number | undefined): string {
  return `${value ?? 25.4} mm`;
}

/** Décrit la page lue par l'import ; vide en mode `semantic` (pas de mise en page). */
function describePage(page: PageSetup | undefined): readonly PageLine[] {
  if (!page) {
    return [];
  }
  const size =
    typeof page.size === 'string'
      ? page.size
      : page.size
        ? `${page.size.widthMm} × ${page.size.heightMm} mm`
        : 'A4 (défaut)';
  const margins = page.margins ?? {};
  return [
    { label: 'Format', value: size },
    { label: 'Orientation', value: page.orientation ?? 'portrait' },
    { label: 'Marge haute', value: marginMm(margins.topMm) },
    { label: 'Marge droite', value: marginMm(margins.rightMm) },
    { label: 'Marge basse', value: marginMm(margins.bottomMm) },
    { label: 'Marge gauche', value: marginMm(margins.leftMm) },
  ];
}

/**
 * Import Word : dépôt ou sélection d'un `.docx`, import via `importDocx` du composant
 * (module Word chargé à la demande), choix du chemin de lecture (`styled` / `semantic`),
 * avertissements, mise en page lue, et rappel du collage nettoyé.
 */
@Component({
  selector: 'app-import',
  imports: [AsterEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="demo-page">
      <h1>Import Word</h1>
      <p class="demo-lead">
        Dépose un <code>.docx</code> : en mode <code>styled</code>, polices, tailles, couleurs,
        interlignes, bordures, tableaux et listes sont conservés ; en mode <code>semantic</code>,
        mammoth produit un HTML propre sans mise en forme.
      </p>

      <div class="demo-controls">
        <label>
          Fidélité
          <select aria-label="Chemin de lecture du .docx" (change)="fidelity.set(selected($event))">
            @for (item of fidelities; track item) {
              <option [value]="item" [selected]="item === fidelity()">{{ item }}</option>
            }
          </select>
        </label>
        <span class="demo-spacer"></span>
        <button type="button" class="demo-button" (click)="loadStyledSample()" [disabled]="busy()">
          Charger l'exemple stylé
        </button>
      </div>

      <div
        class="demo-dropzone"
        [class.is-over]="over()"
        (dragover)="onDragOver($event)"
        (dragleave)="over.set(false)"
        (drop)="onDrop($event)"
      >
        <strong>Glisse un fichier .docx ici</strong>
        <span>ou</span>
        <input
          type="file"
          accept=".docx"
          aria-label="Choisir un fichier .docx à importer"
          (change)="onFileChange($event)"
          [disabled]="busy()"
        />
        @if (fileName(); as name) {
          <span>Importé : {{ name }}</span>
        }
        @if (busy()) {
          <span>Import en cours…</span>
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

      @if (pageLines().length > 0) {
        <dl class="demo-layout">
          @for (line of pageLines(); track line.label) {
            <div class="demo-layout__item">
              <dt>{{ line.label }}</dt>
              <dd>{{ line.value }}</dd>
            </div>
          }
        </dl>
      }

      <aster-editor
        toolbar="standard"
        placeholder="Le document importé apparaîtra ici…"
        [importFidelity]="fidelity()"
      />

      <aside class="demo-notice">
        <h2>Coller depuis Word</h2>
        <p>
          Pas besoin d'importer le fichier : copie un passage dans Word ou Google Docs et colle-le
          dans l'éditeur. Le HTML du presse-papier est nettoyé automatiquement (styles
          <code>mso-*</code>, listes reconstruites, tables allégées) grâce à l'input
          <code>wordPaste</code>, actif par défaut.
        </p>
      </aside>
    </section>
  `,
})
export class ImportPage {
  protected readonly fidelities = FIDELITIES;
  protected readonly fidelity = signal<DocxImportFidelity>('styled');
  protected readonly over = signal(false);
  protected readonly busy = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly warnings = signal<readonly DocxImportWarning[]>([]);

  private readonly editorRef = viewChild.required(AsterEditorComponent);

  /** Mise en page lue par le dernier import (`layout().page` du composant). */
  protected readonly pageLines = computed<readonly PageLine[]>(() =>
    describePage(this.editorRef().layout()?.page),
  );

  protected selected(event: Event): DocxImportFidelity {
    const value = (event.target as HTMLSelectElement).value;
    return value === 'semantic' ? 'semantic' : 'styled';
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

  /** Récupère la fixture stylée servie par la démo et l'importe comme un fichier déposé. */
  protected async loadStyledSample(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await fetch(STYLED_SAMPLE_URL);
      if (!response.ok) {
        throw new Error(`Exemple introuvable (${response.status}) : ${STYLED_SAMPLE_URL}`);
      }
      const blob = await response.blob();
      await this.importFile(new File([blob], STYLED_SAMPLE_NAME, { type: DOCX_MIME }));
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
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.editorRef().importDocx(file);
      this.warnings.set(result.warnings);
      this.fileName.set(file.name);
    } catch (cause: unknown) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.busy.set(false);
    }
  }
}
