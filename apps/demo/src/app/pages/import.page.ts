import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { AsterEditorComponent } from '@aster-editor/angular';
import type { DocxImportWarning } from '@aster-editor/angular';

/**
 * Import Word : dépôt ou sélection d'un `.docx`, import via `importDocx` du composant
 * (module Word chargé à la demande), avertissements, et rappel du collage nettoyé.
 */
@Component({
  selector: 'app-import',
  imports: [AsterEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="demo-page">
      <h1>Import Word</h1>
      <p class="demo-lead">
        Dépose un <code>.docx</code> : titres, listes imbriquées, tables et images sont convertis en
        HTML sémantique.
      </p>

      <div
        class="demo-dropzone"
        [class.is-over]="over()"
        (dragover)="onDragOver($event)"
        (dragleave)="over.set(false)"
        (drop)="onDrop($event)"
      >
        <strong>Glisse un fichier .docx ici</strong>
        <span>ou</span>
        <input type="file" accept=".docx" (change)="onFileChange($event)" [disabled]="busy()" />
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

      <aster-editor toolbar="standard" placeholder="Le document importé apparaîtra ici…" />

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
  protected readonly over = signal(false);
  protected readonly busy = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly warnings = signal<readonly DocxImportWarning[]>([]);

  private readonly editorRef = viewChild.required(AsterEditorComponent);

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
