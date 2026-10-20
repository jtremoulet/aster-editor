import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AsterEditorComponent } from '@aster-editor/angular';
import type { AsterUiOptions } from '@aster-editor/angular';
import { SAMPLE_CONTENT } from '../sample-content';

/** Lecture seule : le même rendu que l'éditeur, sans toolbar et sans édition. */
@Component({
  selector: 'app-readonly',
  imports: [AsterEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="demo-page">
      <h1>Lecture seule</h1>
      <p class="demo-lead">
        <code>[readonly]="true"</code> et <code>[toolbar]="false"</code> : pratique pour afficher un
        contenu avec exactement le même rendu que lors de sa saisie.
      </p>
      <aster-editor [config]="config" [readonly]="true" [toolbar]="false" theme="night" />
    </section>
  `,
})
export class ReadonlyPage {
  protected readonly config: Partial<AsterUiOptions> = { content: SAMPLE_CONTENT };
}
