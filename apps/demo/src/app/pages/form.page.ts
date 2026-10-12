import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsterEditorComponent } from '@aster-editor/angular';
import { map, startWith } from 'rxjs';
import { requiredRichText } from './required-rich-text';

interface ArticleForm {
  title: FormControl<string>;
  body: FormControl<string>;
}

interface FormSnapshot {
  body: string;
  dirty: boolean;
  touched: boolean;
  /** `touched` du seul contrôle `body` : l'erreur du corps ne doit pas dépendre du titre. */
  bodyTouched: boolean;
  valid: boolean;
  disabled: boolean;
}

const PREVIEW_LENGTH = 160;

/**
 * Reactive form : `<aster-editor formControlName="body">` dans un `FormGroup`, avec état
 * live (valeur, dirty, touched, valid), désactivation et validateur maison.
 */
@Component({
  selector: 'app-form',
  imports: [AsterEditorComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="demo-page">
      <h1>Reactive form</h1>
      <p class="demo-lead">
        La valeur du contrôle est le HTML de l'éditeur. <code>dirty</code> à la frappe,
        <code>touched</code> au blur, <code>disabled</code> respecté.
      </p>

      <form class="demo-form" [formGroup]="form" (ngSubmit)="submit()">
        <label class="demo-field">
          <span>Titre</span>
          <input type="text" formControlName="title" placeholder="Titre de l'article" />
        </label>

        <div class="demo-field">
          <span id="body-label">Corps</span>
          <aster-editor
            formControlName="body"
            ariaLabelledBy="body-label"
            placeholder="Rédige le corps de l'article…"
          />
          @if (bodyError()) {
            <span class="demo-error">Le corps ne peut pas être vide.</span>
          }
        </div>

        <div class="demo-controls">
          <label>
            <input type="checkbox" [checked]="snapshot().disabled" (change)="toggleDisabled()" />
            Désactiver l'éditeur
          </label>
          <span class="demo-spacer"></span>
          <button type="button" class="demo-button" (click)="reset()">Réinitialiser</button>
          <button type="submit" class="demo-button demo-button--primary">Envoyer</button>
        </div>
      </form>

      <h2>État du formulaire</h2>
      <ul class="demo-status">
        <li [class.is-on]="snapshot().dirty">dirty</li>
        <li [class.is-on]="snapshot().touched">touched</li>
        <li [class.is-on]="snapshot().valid">valid</li>
        <li [class.is-on]="snapshot().disabled">body disabled</li>
      </ul>
      <p class="demo-preview">value.body = {{ preview() }}</p>

      @if (payload(); as json) {
        <h2>Payload envoyé</h2>
        <pre class="demo-output">{{ json }}</pre>
      }
    </section>
  `,
})
export class FormPage {
  protected readonly form = new FormGroup<ArticleForm>({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    body: new FormControl('', { nonNullable: true, validators: [requiredRichText] }),
  });

  /**
   * Les reactive forms ne sont pas des signaux : on dérive un instantané de `form.events`
   * (valeur, pristine, touched, status) pour que le template OnPush se mette à jour.
   */
  protected readonly snapshot = toSignal(
    this.form.events.pipe(
      startWith(null),
      map((): FormSnapshot => this.read()),
    ),
    { requireSync: true },
  );

  protected readonly preview = computed(() => {
    const body = this.snapshot().body;
    return body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH)}…` : body;
  });

  protected readonly bodyError = computed(() => {
    const { bodyTouched, disabled } = this.snapshot();
    return bodyTouched && !disabled && this.form.controls.body.invalid;
  });

  protected readonly payload = signal<string | null>(null);

  protected toggleDisabled(): void {
    const body = this.form.controls.body;
    if (body.disabled) {
      body.enable();
    } else {
      body.disable();
    }
  }

  protected reset(): void {
    this.form.reset();
    this.payload.set(null);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    this.payload.set(JSON.stringify(this.form.getRawValue(), null, 2));
  }

  private read(): FormSnapshot {
    return {
      body: this.form.controls.body.value,
      dirty: this.form.dirty,
      touched: this.form.touched,
      bodyTouched: this.form.controls.body.touched,
      valid: this.form.valid,
      disabled: this.form.controls.body.disabled,
    };
  }
}
