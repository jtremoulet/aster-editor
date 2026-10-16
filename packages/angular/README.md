# ✳️ @aster-editor/angular

> Composant Angular standalone pour [Aster Editor](../../README.md) : `<aster-editor>` avec
> reactive forms, signals, zoneless, nom accessible, et import / export Word à la demande.

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
(cliquer la toolbar, un menu ou un dialogue ne compte pas), `disabled` met l'éditeur en lecture
seule **sans émettre `change`** (`setDisabledState` ne salit jamais le contrôle). `writeValue`
est idempotent : il n'émet rien, n'entre pas dans l'historique d'annulation, vide l'historique
antérieur (un `Ctrl+Z` qui suit ne rejoue pas l'ancien document) et ignore une valeur identique
au contenu courant (la sélection ne bouge pas). Une valeur reçue avant le montage devient le
contenu initial.

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

| Input                   | Type                       | Défaut effectif | À chaud                                                     |
| ----------------------- | -------------------------- | --------------- | ----------------------------------------------------------- |
| `toolbar`               | `ToolbarConfig`            | `'standard'`    | Remonte l'éditeur : contenu conservé, historique perdu      |
| `theme`                 | `AsterTheme`               | `'light'`       | Oui                                                         |
| `locale`                | `AsterLocale`              | `'fr'`          | Oui, toolbar comprise                                       |
| `placeholder`           | `string \| undefined`      | chaîne i18n     | Oui                                                         |
| `readonly`              | `boolean`                  | `false`         | Oui, cumulé avec le `disabled` du formulaire                |
| `config`                | `Partial<AsterUiOptions>`  | `{}`            | Seules les clés ci-dessus sont relues ; le reste au montage |
| `wordPaste`             | `boolean`                  | `true`          | Oui                                                         |
| `ariaLabel`             | `string \| undefined`      | aucun           | Oui : `aria-label` sur le contenteditable                   |
| `ariaLabelledBy`        | `string \| undefined`      | aucun           | Oui : `aria-labelledby` sur le contenteditable              |
| `variables`             | `readonly AsterVariable[]` | aucune          | Oui : `editor.variables.define(...)`, fusion par nom        |
| `variableValues`        | `VariableValues`           | aucune          | Oui : `editor.variables.setValues(...)`, fusion par nom     |
| `variableResolver`      | `VariableResolver`         | aucun           | Non, lu au montage                                          |
| `allowUnknownVariables` | `boolean`                  | `true`          | Non, lu au montage                                          |
| `variableSuggestion`    | `boolean`                  | `true`          | Non, lu au montage                                          |

Un contenteditable ne s'associe pas à un `<label for>` : nomme la zone de saisie avec
`ariaLabel`, ou `ariaLabelledBy` pointant sur l'`id` de ton libellé visible. Les deux sont
appliqués sur `editor.contentElement` (le `.ProseMirror`), retirés quand la valeur est vide,
et survivent à un remontage.

Le remontage déclenché par `toolbar` recrée l'instance `createAster` : le HTML courant est
réinjecté comme contenu initial, `autofocus` est neutralisé et le focus est restauré en fin de
document s'il était dans l'éditeur, `ready` est réémis avec la nouvelle instance. Un
`importDocx` en cours pendant un remontage ou une destruction rend son résultat sans écrire
dans l'éditeur.

| Output             | Payload          | Quand                                                                                          |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------------- |
| `ready`            | `AsterEditor`    | Éditeur monté. Réémis après un remontage (`toolbar`)                                           |
| `changed`          | `string`         | Document modifié, HTML de `getHTML()`. Pas sur `writeValue`                                    |
| `focused`          | `void`           | Focus du contenu                                                                               |
| `blurred`          | `void`           | Focus perdu vers l'extérieur de l'éditeur (pas vers la toolbar) ; marque le contrôle `touched` |
| `variablesChanged` | `VariableValues` | Valeurs ou déclarations de variables changées (`setValues`, `define`, `resolve`, import)       |

API publique du composant :

- `editor` : `Signal<AsterEditor | null>`, l'éditeur du core (`getHTML`, `getJSON`, `getCounts`,
  `commands.run(...)`, `tiptap`…), `null` avant le montage et après la destruction.
- `variableNames` : `Signal<readonly string[]>`, noms des variables présentes dans le document,
  relus sur `change` et `variablesChange`.
- `getHTML(options?)` : HTML du document, `{ variables: 'resolve' }` substitue les valeurs.
- `resolveVariables()` : appelle le résolveur pour les variables sans valeur, rend les valeurs.
- `importDocx(file: File): Promise<DocxImportResult>` : voir plus bas.
- `exportDocx(options?: DocxExportOptions): Promise<Blob>` : voir « Variables et modèles ».

La vue source, le plein écran et le menu contextuel de table de `@aster-editor/ui` sont montés
par `createAster` et donc disponibles dans le composant : via les widgets `source` /
`fullscreen` d'une toolbar déclarative ou du preset `full`, ou au clavier (`Mod-f` ouvre le
panneau de recherche si le widget `search` est monté, `Échap` quitte le plein écran). Le composant n'expose pas `AsterInstance` : pour
piloter ces fonctions par code, passe par les contrôleurs partagés de `ui`
(`getSourceView(editor)`, `getFullscreen(editor)`) avec l'éditeur du signal.

Types réexportés pour ne pas dépendre de `core`, `ui` ou `word` : `AsterEditor`,
`AsterDocument`, `AsterCounts`, `AsterLocale`, `AsterTheme`, `LinkPolicy`,
`PasteTransformer`, `ToolbarConfig`, `ToolbarPreset`, `UploadHandler`, `AsterVariable`,
`VariableValues`, `VariableResolver`, `VariableSource`, `VariableRenderMode`, `GetHtmlOptions`,
`AsterUiOptions`, `DocxImportResult`, `DocxImportWarning`, `DocxExportOptions`,
`DocxExportVariableOptions`, `DocxExportWarning`, `DocxVariableMode`.

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
les images embarquées. Appelé avant le montage, il rejette avec une erreur explicite.

> ⚠️ **Vite à froid** : sur `ng serve`, le tout premier `importDocx` d'une session déclenche
> l'optimisation de `mammoth` par Vite et **recharge la page** en plein import, sans erreur.
> C'est un comportement du serveur de dev, pas du build : relance l'import. Le test e2e de la
> démo fait de même (`toPass` avec nouvelle sélection du fichier).

## 📤 Export .docx

Même recette que l'import, avec `exportDocx` et `downloadDocx` chargés à la demande (la lib
`docx` reste dans son chunk) :

```ts
@Component({
  selector: 'app-export',
  imports: [AsterEditorComponent],
  template: `
    <aster-editor />
    <button type="button" (click)="exportWord()">Exporter .docx</button>
  `,
})
export class ExportComponent {
  private readonly editor = viewChild.required(AsterEditorComponent);

  async exportWord(): Promise<void> {
    const editor = this.editor().editor();
    if (!editor) return;
    const { exportDocx, downloadDocx } = await import('@aster-editor/word');
    const blob = await exportDocx(editor.getHTML(), { title: 'Article' });
    downloadDocx(blob, 'article');
  }
}
```

Options, mapping HTML → Word et limites dans le [README word](../word/README.md).

## 🧩 Variables et modèles

Les variables (champs de fusion `{{client.nom}}`) sont des puces du document, gérées par
`editor.variables` du core. Le composant les expose sans toucher à `config` :

| Input / output          | Rôle                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `variables`             | Déclarations (`name`, `label`, `description`, `value`) proposées dans le menu d'insertion                                 |
| `variableValues`        | Valeurs par nom. À chaud, fusionnées dans le magasin (`setValues`)                                                        |
| `variableResolver`      | `(name, editor) => string \| undefined \| Promise<…>`, appelé par `resolveVariables()`                                    |
| `allowUnknownVariables` | `false` pour refuser l'insertion d'un nom non déclaré (vrai par défaut : un `.docx` importé peut contenir n'importe quoi) |
| `variableSuggestion`    | Menu déclenché par `{{` dans le contenu (vrai par défaut)                                                                 |
| `variablesChanged`      | Output `VariableValues`, émis sur `variablesChange` du core                                                               |
| `variableNames`         | `Signal<readonly string[]>`, noms présents dans le document                                                               |

Ces inputs priment sur `config.variables` clé par clé ; un input laissé à `undefined` ne masque
rien. Un remontage (`toolbar`) conserve déclarations et valeurs.

`importDocx` déclare les variables trouvées dans le `.docx` (`{{nom}}`, champs `MERGEFIELD`,
contrôles de contenu avec leur libellé et leur valeur) via `editor.variables.define`, puis
réapplique `variableValues` sur les noms que Word avait valorisés : ton état reste la source de
vérité. `exportDocx` charge `@aster-editor/word` à la demande, exporte `getHTML()` et transmet les
valeurs du magasin quand `options.variables.values` n'est pas fourni :

- `variables.mode: 'resolve'` : valeurs substituées, `{{nom}}` conservé (et avertissement
  `variable-unresolved` via `onWarning`) pour une variable sans valeur ;
- `'fields'` : champs de fusion Word, la valeur connue comme résultat de champ ;
- `'placeholders'` (défaut) : le modèle tel quel.

Exemple complet, formulaire généré depuis `variableNames` et export :

```ts
@Component({
  imports: [AsterEditorComponent],
  template: `
    <input type="file" accept=".docx" (change)="onFile($event)" />
    <aster-editor
      [variables]="declared"
      [variableValues]="values()"
      (variablesChanged)="store.set($event)"
    />
    <form (submit)="apply($event)">
      @for (name of editor().variableNames(); track name) {
        <label>
          {{ name }}
          <input [name]="name" [value]="store()[name] ?? ''" (input)="edit(name, $event)" />
        </label>
      }
      <button type="submit">Appliquer</button>
    </form>
    <p>{{ unresolved() }} variable(s) sans valeur</p>
    <button type="button" (click)="download('resolve')">Télécharger résolu</button>
    <button type="button" (click)="download('fields')">Avec champs Word</button>
  `,
})
export class TemplateComponent {
  protected readonly editor = viewChild.required(AsterEditorComponent);
  protected readonly declared: readonly AsterVariable[] = [{ name: 'client.nom', label: 'Client' }];
  protected readonly values = signal<VariableValues | undefined>(undefined);
  protected readonly store = signal<VariableValues>({});
  protected readonly unresolved = computed(
    () =>
      this.editor()
        .variableNames()
        .filter((name) => !this.store()[name]).length,
  );
  private draft: Record<string, string> = {};

  async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await this.editor().importDocx(file); // déclare les variables trouvées
  }

  edit(name: string, event: Event): void {
    this.draft = { ...this.draft, [name]: (event.target as HTMLInputElement).value };
  }

  apply(event: Event): void {
    event.preventDefault();
    this.values.set({ ...this.draft }); // → editor.variables.setValues, puis variablesChanged
  }

  async download(mode: DocxVariableMode): Promise<void> {
    const blob = await this.editor().exportDocx({ variables: { mode } });
    const { downloadDocx } = await import('@aster-editor/word');
    downloadDocx(blob, mode === 'resolve' ? 'contrat' : 'modele');
  }
}
```

Pour un aperçu résolu sans export, `editor().getHTML({ variables: 'resolve' })` rend le HTML
avec les valeurs substituées en texte brut ; `resolveVariables()` appelle d'abord le résolveur
pour les variables manquantes.

## 📋 Collage depuis Word

Avec `wordPaste` (vrai par défaut), le composant charge `@aster-editor/word` au montage (jamais
côté serveur) et branche `wordPasteTransformer()` en tête des `pasteTransformers` : le HTML de
Word et de Google Docs est nettoyé avant d'atteindre l'éditeur, tes propres transformateurs
reçoivent du HTML propre. Si le paquet `word` n'est pas installé, un avertissement est journalisé
et le collage reste brut. Passer `wordPaste` à `false` laisse le module chargé mais inactif.

## 🧭 App démo

`apps/demo` (`npm run demo`, http://localhost:4200) montre cinq pages chargées à la demande,
chacune avec son titre de document : `/` playground (preset, thème, langue, lecture seule,
compteurs, sortie HTML / JSON), `/form` reactive form avec validateur « requis » sur le contenu
riche, `/import` dépôt de `.docx` avec avertissements, `/readonly` rendu figé en thème `night`,
`/template` modèle à variables (exemple `08-variables-braces.docx` servi depuis
`public/samples/`, formulaire généré, aperçu puces / résolu, export dans les trois modes).

## 🧪 Tests

```bash
npx ng test aster-angular --watch=false   # 39 tests du composant et de provideAster
npx ng test demo --watch=false            # 23 tests des pages de la démo
npm run e2e -- --project=demo             # 5 tests Playwright sur la démo (ng serve lancé par Playwright)
```

TestBed + Vitest, environnement jsdom. Monte le composant, appelle `fixture.detectChanges()`
puis `await fixture.whenStable()` pour laisser `afterNextRender` créer l'éditeur.
