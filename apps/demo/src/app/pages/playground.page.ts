import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { AsterEditorComponent } from '@aster-editor/angular';
import type {
  AsterCounts,
  AsterEditor,
  AsterLocale,
  AsterTheme,
  AsterUiOptions,
  ToolbarPreset,
} from '@aster-editor/angular';
import { SAMPLE_CONTENT } from '../sample-content';

const THEMES: readonly AsterTheme[] = ['light', 'night'];
const LOCALES: readonly AsterLocale[] = ['fr', 'en'];
const TOOLBARS: readonly ToolbarPreset[] = ['full', 'standard', 'minimal'];

/**
 * Playground : toolbar complète, sélecteurs thème / langue / preset, lecture seule,
 * compteurs et sortie HTML ou JSON du document courant.
 */
@Component({
  selector: 'app-playground',
  imports: [AsterEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="demo-page">
      <h1>Playground</h1>
      <p class="demo-lead">
        Toolbar <code>full</code>, changement de thème, de langue et de preset à chaud.
      </p>

      <div class="demo-controls">
        <label>
          Thème
          <select (change)="theme.set(selected($event))">
            @for (item of themes; track item) {
              <option [value]="item" [selected]="item === theme()">{{ item }}</option>
            }
          </select>
        </label>
        <label>
          Langue
          <select (change)="locale.set(selected($event))">
            @for (item of locales; track item) {
              <option [value]="item" [selected]="item === locale()">{{ item }}</option>
            }
          </select>
        </label>
        <label>
          Toolbar
          <select (change)="toolbar.set(selectedPreset($event))">
            @for (item of toolbars; track item) {
              <option [value]="item" [selected]="item === toolbar()">{{ item }}</option>
            }
          </select>
        </label>
        <label>
          <input type="checkbox" [checked]="readonly()" (change)="readonly.set(checked($event))" />
          Lecture seule
        </label>
        <span class="demo-spacer"></span>
        <button type="button" class="demo-button" (click)="show('html')">HTML</button>
        <button type="button" class="demo-button" (click)="show('json')">JSON</button>
      </div>

      <aster-editor
        [config]="config"
        [toolbar]="toolbar()"
        [theme]="theme()"
        [locale]="locale()"
        [readonly]="readonly()"
        placeholder="Écris quelque chose…"
        (ready)="refreshCounts($event)"
        (changed)="onChanged()"
      />
      <p class="demo-counts">{{ counts().words }} mots · {{ counts().characters }} caractères</p>

      @if (output(); as out) {
        <pre class="demo-output" [attr.data-kind]="out.kind">{{ out.text }}</pre>
      }
    </section>
  `,
})
export class PlaygroundPage {
  protected readonly themes = THEMES;
  protected readonly locales = LOCALES;
  protected readonly toolbars = TOOLBARS;

  protected readonly theme = signal<AsterTheme>('light');
  protected readonly locale = signal<AsterLocale>('fr');
  protected readonly toolbar = signal<ToolbarPreset>('full');
  protected readonly readonly = signal(false);
  protected readonly counts = signal<AsterCounts>({ words: 0, characters: 0 });
  protected readonly output = signal<{ kind: 'html' | 'json'; text: string } | null>(null);

  /** Objet stable : un nouvel objet à chaque rendu relancerait la fusion de config. */
  protected readonly config: Partial<AsterUiOptions> = { content: SAMPLE_CONTENT };

  private readonly editorRef = viewChild.required(AsterEditorComponent);

  protected refreshCounts(editor: AsterEditor): void {
    this.counts.set(editor.getCounts());
  }

  protected onChanged(): void {
    const editor = this.editorRef().editor();
    if (editor) {
      this.refreshCounts(editor);
    }
  }

  protected show(kind: 'html' | 'json'): void {
    const editor = this.editorRef().editor();
    if (!editor) {
      return;
    }
    const text = kind === 'html' ? editor.getHTML() : JSON.stringify(editor.getJSON(), null, 2);
    this.output.set({ kind, text });
  }

  protected selected(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected selectedPreset(event: Event): ToolbarPreset {
    const value = this.selected(event);
    return TOOLBARS.find((preset) => preset === value) ?? 'standard';
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
