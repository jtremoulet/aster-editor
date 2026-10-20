import type { Routes } from '@angular/router';

/** Une page par cas d'usage, chargée à la demande, avec son titre de document. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Playground · Aster',
    loadComponent: () => import('./pages/playground.page').then((m) => m.PlaygroundPage),
  },
  {
    path: 'form',
    title: 'Reactive form · Aster',
    loadComponent: () => import('./pages/form.page').then((m) => m.FormPage),
  },
  {
    path: 'import',
    title: 'Import Word · Aster',
    loadComponent: () => import('./pages/import.page').then((m) => m.ImportPage),
  },
  {
    path: 'readonly',
    title: 'Lecture seule · Aster',
    loadComponent: () => import('./pages/readonly.page').then((m) => m.ReadonlyPage),
  },
  {
    path: 'template',
    title: 'Modèle · Aster',
    loadComponent: () => import('./pages/template.page').then((m) => m.TemplatePage),
  },
  { path: '**', redirectTo: '' },
];
