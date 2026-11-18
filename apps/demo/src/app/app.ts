import { ChangeDetectionStrategy, Component } from '@angular/core';
import { VERSION } from '@aster-editor/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Coquille de la démo : barre de navigation et sortie de routeur. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  /** Version du monorepo, affichée discrètement à côté du nom. */
  protected readonly version = VERSION;
  protected readonly links = [
    { path: '/', label: 'Playground', exact: true },
    { path: '/form', label: 'Reactive form', exact: false },
    { path: '/import', label: 'Import Word', exact: false },
    { path: '/readonly', label: 'Lecture seule', exact: false },
    { path: '/template', label: 'Modèle', exact: false },
  ] as const;
}
