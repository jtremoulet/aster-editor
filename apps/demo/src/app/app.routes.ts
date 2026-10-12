import type { Routes } from '@angular/router';

/** Une page par cas d'usage, chargée à la demande. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/playground.page').then((m) => m.PlaygroundPage),
  },
  {
    path: 'form',
    loadComponent: () => import('./pages/form.page').then((m) => m.FormPage),
  },
  {
    path: 'import',
    loadComponent: () => import('./pages/import.page').then((m) => m.ImportPage),
  },
  {
    path: 'readonly',
    loadComponent: () => import('./pages/readonly.page').then((m) => m.ReadonlyPage),
  },
  { path: '**', redirectTo: '' },
];
