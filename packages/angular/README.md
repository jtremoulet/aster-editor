# ✳️ @aster-editor/angular

> Composant Angular standalone pour [Aster Editor](../../README.md) : `<aster-editor>` avec
> reactive forms, signals, zoneless, et import Word à la demande.

## 📦 Installation

```bash
npm install @aster-editor/angular @aster-editor/ui @aster-editor/core
# optionnel, pour le collage Word nettoyé et l'import .docx
npm install @aster-editor/word
```

Peer deps : `@angular/core`, `@angular/common`, `@angular/forms` ≥ 20. Angular 22 est la cible,
l'app peut être zoneless.

Importe les thèmes CSS une fois, par exemple dans `styles.css` :

```css
/* structure + thèmes light et night */
@import '@aster-editor/ui/themes/aster.css';

/* ou, pour alléger : structure + un seul thème */
@import '@aster-editor/ui/themes/base.css';
@import '@aster-editor/ui/themes/light.css';
```

## 🚀 Exemple minimal

```ts
import { Component } from '@angular/core';
import { AsterEditorComponent } from '@aster-editor/angular';

@Component({
  selector: 'app-note',
  imports: [AsterEditorComponent],
  template: `<aster-editor
    toolbar="standard"
    placeholder="Écris ici…"
    (changed)="html = $event"
  />`,
})
export class NoteComponent {
  html = '';
}
```

L'éditeur est monté dans `afterNextRender` (aucun accès DOM côté serveur) et détruit avec le
composant.

## 📝 Reactive form

Le composant implémente `ControlValueAccessor` : la valeur du contrôle est le HTML sémantique de
`getHTML()`. `dirty` passe à vrai à la frappe, `touched` au blur vers l'extérieur de l'éditeur
(cliquer la toolbar ne compte pas), `disabled` met l'éditeur en lecture seule. `writeValue`
n'émet rien, n'entre pas dans l'historique d'annulation, et ignore une valeur identique au
contenu courant (la sélection ne bouge pas).

```ts
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AsterEditorComponent } from '@aster-editor/angular';

@Component({
  selector: 'app-article-form',
  imports: [AsterEditorComponent, ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()">
      <input formControlName="title" />
      <aster-editor formControlName="body" toolbar="full" />
      <button type="submit" [disabled]="form.invalid">Enregistrer</button>
    </form>
  `,
})
export class ArticleFormComponent {
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    body: new FormControl('', { nonNullable: true }),
  });

  save(): void {
    console.log(this.form.getRawValue()); // { title: '…', body: '<p>…</p>' }
  }
}
```

> Un document vide vaut `<p></p>`, pas `''` : pour un champ requis, écris un validateur qui
> retire les balises avant de tester la vacuité (voir `apps/demo/src/app/pages/required-rich-text.ts`).

## 🎛️ Inputs et outputs

| Input            | Type                      | Défaut effectif | À chaud                                                     |
| ---------------- | ------------------------- | --------------- | ----------------------------------------------------------- |
| `toolbar`        | `ToolbarConfig`           | `'standard'`    | Remonte l'éditeur : contenu conservé, historique perdu      |
| `theme`          | `AsterTheme`              | `'light'`       | Oui                                                         |
| `locale`         | `AsterLocale`             | `'fr'`          | Oui, toolbar comprise                                       |
| `placeholder`    | `string \| undefined`     | chaîne i18n     | Oui                                                         |
| `readonly`       | `boolean`                 | `false`         | Oui, cumulé avec le `disabled` du formulaire                |
| `config`         | `Partial<AsterUiOptions>` | `{}`            | Seules les clés ci-dessus sont relues ; le reste au montage |
| `wordPaste`      | `boolean`                 | `true`          | Oui                                                         |
| `ariaLabel`      | `string \| undefined`     | aucun           | Oui : `aria-label` sur le contenteditable                   |
| `ariaLabelledBy` | `string \| undefined`     | aucun           | Oui : `aria-labelledby` sur le contenteditable              |

Un contenteditable ne s'associe pas à un `<label for>` : nomme la zone de saisie avec
`ariaLabel`, ou `ariaLabelledBy` pointant sur l'`id` de ton libellé visible.

| Output    | Payload       | Quand                                                                                          |
| --------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `ready`   | `AsterEditor` | Éditeur monté. Réémis après un remontage (`toolbar`)                                           |
| `changed` | `string`      | Document modifié, HTML de `getHTML()`. Pas sur `writeValue`                                    |
| `focused` | `void`        | Focus du contenu                                                                               |
| `blurred` | `void`        | Focus perdu vers l'extérieur de l'éditeur (pas vers la toolbar) ; marque le contrôle `touched` |

API publique du composant :

- `editor` : `Signal<AsterEditor | null>`, l'éditeur du core (`getHTML`, `getJSON`, `getCounts`,
  `commands.run(...)`, `tiptap`…), `null` avant le montage.
- `importDocx(file: File): Promise<DocxImportResult>` : voir plus bas.

Un input dédié laissé à `undefined` n'écrase pas la valeur venue de `config` ou de
`provideAster`. Passe des objets **stables** dans `config` (champ de classe, pas un littéral dans
le template) : une nouvelle référence à chaque rendu relance la fusion, et une `toolbar`
déclarative recréée à chaque rendu remonterait l'éditeur.

## ⚙️ provideAster

Configuration globale d'une application ou d'une route, fusionnée sous l'input `config` qui
est lui-même sous les inputs dédiés :

```ts
import { ApplicationConfig } from '@angular/core';
import { provideAster } from '@aster-editor/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAster({
      locale: 'en',
      theme: 'night',
      linkPolicy: { defaultTarget: '_blank' },
      disabledCommands: ['fontFamily'],
    }),
  ],
};
```

Le token sous-jacent est `ASTER_CONFIG` (`InjectionToken<Partial<AsterUiOptions>>`).

## 🖼️ Upload d'images : ASTER_UPLOAD_HANDLER

Sans handler, les images collées, déposées ou importées sont insérées en data URL base64.
Pour passer par ton API :

```ts
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ASTER_UPLOAD_HANDLER, UploadHandler } from '@aster-editor/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: ASTER_UPLOAD_HANDLER,
      useFactory: (): UploadHandler => {
        const http = inject(HttpClient);
        return async (file) => {
          const body = new FormData();
          body.append('file', file);
          const { url } = await firstValueFrom(http.post<{ url: string }>('/api/upload', body));
          return url;
        };
      },
    },
  ],
};
```

Priorité : `config.upload` > `provideAster({ upload })` > `ASTER_UPLOAD_HANDLER`.

## 📄 Import .docx

```ts
@Component({
  imports: [AsterEditorComponent],
  template: `
    <input type="file" accept=".docx" (change)="onFile($event)" />
    <aster-editor />
  `,
})
export class ImportComponent {
  private readonly editor = viewChild.required(AsterEditorComponent);

  async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { warnings } = await this.editor().importDocx(file);
    console.warn(warnings); // [{ code: 'mammoth', message: '…' }]
  }
}
```

`importDocx` charge `@aster-editor/word` par `import()` : mammoth reste dans un chunk séparé et
n'est téléchargé qu'au premier import. Le contenu est remplacé avec émission de `change`, un
formulaire lié voit donc la nouvelle valeur. Le handler d'upload de l'éditeur est réutilisé pour
les images embarquées.

## 📋 Collage depuis Word

Avec `wordPaste` (vrai par défaut), le composant charge `@aster-editor/word` au montage et branche
`wordPasteTransformer()` en tête des `pasteTransformers` : le HTML de Word et de Google Docs est
nettoyé avant d'atteindre l'éditeur, tes propres transformateurs reçoivent du HTML propre. Si le
paquet `word` n'est pas installé, un avertissement est journalisé et le collage reste brut.

## 🧪 Tests

```bash
npx ng test aster-angular --watch=false
```

TestBed + Vitest, environnement jsdom. Monte le composant, appelle `fixture.detectChanges()`
puis `await fixture.whenStable()` pour laisser `afterNextRender` créer l'éditeur.
