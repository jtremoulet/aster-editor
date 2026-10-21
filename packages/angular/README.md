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

| Input                   | Type                          | Défaut effectif | À chaud                                                                 |
| ----------------------- | ----------------------------- | --------------- | ----------------------------------------------------------------------- |
| `toolbar`               | `ToolbarConfig`               | `'standard'`    | Remonte l'éditeur : contenu conservé, historique perdu                  |
| `theme`                 | `AsterTheme`                  | `'light'`       | Oui                                                                     |
| `locale`                | `AsterLocale`                 | `'fr'`          | Oui, toolbar comprise                                                   |
| `placeholder`           | `string \| undefined`         | chaîne i18n     | Oui                                                                     |
| `readonly`              | `boolean`                     | `false`         | Oui, cumulé avec le `disabled` du formulaire                            |
| `config`                | `Partial<AsterUiOptions>`     | `{}`            | Seules les clés ci-dessus sont relues ; le reste au montage             |
| `wordPaste`             | `boolean`                     | `true`          | Oui                                                                     |
| `ariaLabel`             | `string \| undefined`         | aucun           | Oui : `aria-label` sur le contenteditable                               |
| `ariaLabelledBy`        | `string \| undefined`         | aucun           | Oui : `aria-labelledby` sur le contenteditable                          |
| `variables`             | `readonly AsterVariable[]`    | aucune          | Oui : `editor.variables.define(...)`, fusion par nom                    |
| `variableValues`        | `VariableValues`              | aucune          | Oui : `editor.variables.setValues(...)`, fusion par nom                 |
| `variableResolver`      | `VariableResolver`            | aucun           | Non, lu au montage                                                      |
| `allowUnknownVariables` | `boolean`                     | `true`          | Non, lu au montage                                                      |
| `variableSuggestion`    | `boolean`                     | `true`          | Non, lu au montage                                                      |
| `importFidelity`        | `'styled' \| 'semantic'`      | `'styled'`      | Lu à chaque `importDocx` ; non transmis quand absent (défaut de la lib) |
| `exportInTemplate`      | `boolean`                     | `true`          | Lu à chaque `exportDocx`                                                |
| `pageView`              | `boolean \| PageViewOptions`  | `false`         | Oui : la vue page est remontée                                          |
| `layout`                | `DocumentLayout \| undefined` | aucune          | Oui : vue page et export, voir « Fidélité Word »                        |

Un contenteditable ne s'associe pas à un `<label for>` : nomme la zone de saisie avec
`ariaLabel`, ou `ariaLabelledBy` pointant sur l'`id` de ton libellé visible. Les deux sont
appliqués sur `editor.contentElement` (le `.ProseMirror`), retirés quand la valeur est vide,
et survivent à un remontage.

Le remontage déclenché par `toolbar` recrée l'instance `createAster` : le HTML courant est
réinjecté comme contenu initial, `autofocus` est neutralisé et le focus est restauré en fin de
document s'il était dans l'éditeur, `ready` est réémis avec la nouvelle instance. Un
`importDocx` en cours pendant un remontage ou une destruction rend son résultat sans écrire
dans l'éditeur.

| Output             | Payload          | Quand                                                                                                                                                                                                             |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`            | `AsterEditor`    | Éditeur monté. Réémis après un remontage (`toolbar`)                                                                                                                                                              |
| `changed`          | `string`         | Document modifié, HTML de `getHTML()`. Pas sur `writeValue`                                                                                                                                                       |
| `focused`          | `void`           | Focus du contenu                                                                                                                                                                                                  |
| `blurred`          | `void`           | Focus perdu vers l'extérieur de l'éditeur (pas vers la toolbar) ; marque le contrôle `touched`                                                                                                                    |
| `variablesChanged` | `VariableValues` | Valeurs ou déclarations de variables changées (`setValues`, `define`, `resolve`, import)                                                                                                                          |
| `layoutChanged`    | `DocumentLayout` | Mise en page effective changée : import, input `layout`, dialogue « Mise en page » (suivi par l'événement `pageViewChange` du contrat depuis la session 4) ; `sections[]` compris pour un document multi-sections |

API publique du composant :

- `editor` : `Signal<AsterEditor | null>`, l'éditeur du core (`getHTML`, `getJSON`, `getCounts`,
  `commands.run(...)`, `tiptap`…), `null` avant le montage et après la destruction.
- `variableNames` : `Signal<readonly string[]>`, noms des variables présentes dans le document,
  relus sur `change` et `variablesChange`.
- `importedTemplate` : `Signal<ArrayBuffer | null>`, le `.docx` du dernier import, intact.
- `layout` : `Signal<DocumentLayout | null>`, mise en page effective (input `layout`, sinon
  import ou dialogue « Mise en page »), avec `sections[]` quand le document en a plusieurs.
- `lostObjects` : `Signal<readonly DocxLostObject[]>`, objets Word non représentables du dernier
  import.
- `getHTML(options?)` : HTML du document, `{ variables: 'resolve' }` substitue les valeurs.
- `resolveVariables()` : appelle le résolveur pour les variables sans valeur, rend les valeurs.
- `importDocx(file: File): Promise<DocxImportResult>` : voir plus bas.
- `exportDocx(options?: DocxExportOptions): Promise<Blob>` : voir « Variables et modèles » et
  « Fidélité Word ».
- `compareWithTemplate(): Promise<FidelityReport | null>` : voir « Fidélité Word ».

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
`DocxExportVariableOptions`, `DocxExportWarning`, `DocxVariableMode`, et pour la fidélité Word :
`DocumentLayout`, `PageSetup`, `PageMargins`, `HeaderFooterSet`, `HeaderFooterContent`,
`PageViewOptions`, `PageViewInput`, `DocxImportFidelity`, `DocxLostObject`, `FidelityReport`,
`FidelityProperty`, `FidelityPropertyGroup`, `FidelityExample`. `SectionLayout` et les types de
section viennent de `@aster-editor/core`.

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
    console.warn(warnings); // [{ code: 'reader', message: '…' }] (`mammoth` en mode semantic)
  }
}
```

`importDocx` charge `@aster-editor/word` par `import()` : le lecteur reste dans un chunk séparé
et n'est téléchargé qu'au premier import. Le contenu est remplacé avec émission de `change`, un
formulaire lié voit donc la nouvelle valeur. Le handler d'upload de l'éditeur est réutilisé pour
les images embarquées. Appelé avant le montage, il rejette avec une erreur explicite. Par défaut
l'import est **stylé** (`importFidelity: 'styled'`, qui est aussi le défaut de la lib
`@aster-editor/word` depuis la 0.6 : le composant ne force plus rien et ne transmet `fidelity`
que si tu le donnes) : polices, tailles, couleurs, interlignes, bordures, tableaux, listes,
sections et tabulations sont conservés, et le composant garde le gabarit et la mise en page du
document, voir « Fidélité Word ». `importFidelity: 'semantic'` retrouve le HTML propre de mammoth
(comportement 0.4.x, défaut de la lib en 0.5), sans mise en page.

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

## 📐 Fidélité Word

Objectif : un `.docx` importé **ressort comme l'original** partout où l'utilisateur n'a rien
touché. Le composant enchaîne les quatre briques de `@aster-editor/word` sans que l'application
ait à les connaître.

### Import stylé et mise en page

`importDocx` (mode `styled` par défaut) conserve trois choses dans des signals :

- `importedTemplate()` : le `.docx` d'origine, intact (`ArrayBuffer`) ;
- `layout()` : la mise en page lue (`DocumentLayout` : format, orientation, marges, colonnes,
  police par défaut, langue, en-têtes et pieds en HTML stylé, et depuis la session 4
  `sections[]`, une `SectionLayout` par section de Word, la dernière recopiée au premier
  niveau) ; le corps porte un `<hr data-section-break="n">` à chaque changement de section ;
- `lostObjects()` : les objets Word que l'éditeur ne sait pas représenter (zones de texte, formes,
  équations, commentaires, révisions…), avec leur position (`body`, `header`…).

### Vue page

```html
<aster-editor [pageView]="true" (layoutChanged)="layout = $event" />
```

`pageView` (`true`, ou `{ layout, pagination, showHeadersFooters }`) rend une feuille aux
dimensions et marges de `layout()`, avec les en-têtes et pieds `default` en lecture seule
au-dessus et au-dessous du corps et une pagination **approximative** (coupures « Page n sur N »
posées en décorations, jamais dans le HTML) ; importe `@aster-editor/ui/themes/page.css` (inclus
dans `aster.css`). Avec plusieurs sections (session 4), l'hôte affiche l'en-tête de la
**première** section et le pied de la **dernière** que le corps ouvre, chaque saut change de
feuille (format, marges) et la première coupure d'une section porte son libellé
(« Section 2 · Letter paysage »), son en-tête et le pied de la précédente. Après un import, la
mise en page lue est appliquée à la vue page active. Le bouton « Mise en page » de la toolbar
(widget `pageLayout`, preset `full` ; `standard` n'a que l'interligne et les retraits) peut
l'activer, la modifier ou la retirer, section du curseur par section : le composant suit
l'événement `pageViewChange` du contrat (session 4, L45b ; l'événement DOM
`aster:page-view-change` reste aux intégrateurs vanilla), relit la mise en page, `layout()` suit et
`layoutChanged` est émis. Une vue posée sans mise en page (`[pageView]="true"`) ne pousse pas de
`{}` dans `layout()` : seule une mise en page explicite (dialogue, input, import) est adoptée. La
vue page survit à un remontage (`toolbar`). `config.pageView` est honoré, l'input dédié prime.

L'input `layout` impose une mise en page : il prime sur celle de l'import et sur celle du
dialogue, se répercute sur la vue page active et sur `exportDocx`. Comme il masque ce que le
dialogue pose ensuite, tiens-le à jour depuis `layoutChanged` (`[layout]="layout()"` +
`(layoutChanged)="layout.set($event)"`) : c'est ce que fait la page « Modèle » de la démo pour
ses éditeurs d'en-tête et de pied.

### Export dans le gabarit

```ts
const blob = await this.editor().exportDocx({ variables: { mode: 'fields' } });
```

Sans `options.template`, `exportDocx` réutilise `importedTemplate()` dès qu'il existe
(`exportInTemplate`, vrai par défaut) : styles, numérotation, thème, polices, en-têtes, pieds,
sections (chaque `w:sectPr` greffé depuis le gabarit, session 4) et propriétés du document
ressortent **identiques à l'octet**, seul le corps est régénéré depuis l'éditeur. La mise en page
effective (`layout()`) est transmise elle aussi : avec un gabarit, elle sert à régénérer un
en-tête ou un pied dont le HTML a changé (au premier niveau ou dans une `sections[n]`) et à
retrouver le `w:sectPr` de chaque section (le reste vient du gabarit) ; sans gabarit, elle pilote
l'export neuf (format, marges, en-têtes, pieds, police par défaut, une section Word par segment
du corps). `exportInTemplate: false` force l'export neuf, un `options.template` explicite reste
honoré.

### Rapport de fidélité

```ts
const report = await this.editor().compareWithTemplate();
if (report) console.log(report.score, report.properties, report.changedParts);
```

`compareWithTemplate()` exporte le document courant dans son gabarit (valeurs du magasin de
variables, mise en page effective, comme `exportDocx({ template })`) puis le compare à
l'original propriété par propriété (`compareDocx` de `word`, chargé à la demande) : score
pondéré entre 0 et 1, propriétés conservées / perdues par groupe (`text`, `paragraph-style`,
`paragraph-format`, `run-format`, `list`, `table`, `image`, `note`, `header-footer`, `section`,
`package-part`) avec jusqu'à cinq exemples, parties du paquet identiques ou non, objets perdus,
notes. `null` sans gabarit importé. Un aller-retour sans modification vise un score ≥ 0,98 ;
c'est le critère d'acceptation, pas une impression visuelle. Scores mesurés sur les fixtures et
le document client dans [`fixtures/docx/README.md`](../../fixtures/docx/README.md) (session 4 :
1 pour les fixtures 11 à 16, 18 et 19, 0,972 pour la 17 ; 0,995 pour le document
client, dont les trois sections ressortent à l'octet).

### Limites

- **Pas de pagination exacte** : la vue page donne le format, les marges, les en-têtes et pieds,
  les sauts de page explicites, et une pagination **approximative** (coupures visuelles, numéros
  de page, tableaux et listes jamais coupés) qui ne garantit pas le même nombre de pages que Word.
- **Objets non représentables** : conservés tels quels dans le gabarit quand ils sont hors du
  corps (en-têtes, pieds), remplacés par leur texte et listés dans `lostObjects()` quand ils sont
  dans le corps édité.
- **Sections multiples** (session 4) : conservées à l'import (`layout().sections`, un
  `<hr data-section-break>` par changement de section dans le corps), en vue page (une feuille
  par section, une seule largeur de feuille : celle de la plus large) et à l'export dans le
  gabarit (chaque `w:sectPr` greffé à l'octet). Ce qui reste approximatif : les colonnes ne sont
  pas affichées, la numérotation de page par section et les bordures de page ne sont pas lues.
- Avec un gabarit, les options `page`, `pageSize`, `header`, `footer`, `defaultFont`, `lang`,
  `headingStyles` de l'export sont ignorées, ainsi que `layout.page`, `layout.columns`,
  `layout.titlePage`, `layout.defaultFont` et `layout.lang` : le gabarit les porte (JSDoc de
  `template` dans `packages/word/src/export/types.ts`). `variables`, `toc`, `numberedHeadings`,
  `title`, `creator`, `layout.headers`, `layout.footers` et `layout.sections` s'appliquent.
- Seuls les en-têtes et pieds `default` sont affichés par la vue page ; `first` et `even` sont
  conservés dans le gabarit et dans `layout()`. Un en-tête ou pied édité via `[layout]` est
  régénéré par l'export neuf et perd ce que celui-ci ne sait pas écrire (tableaux complexes,
  images ancrées, champs autres que `PAGE` / `NUMPAGES` / fusion). Avec des sections, édite
  `sections[0].headers` (l'en-tête que l'hôte affiche) et le pied de la dernière section
  **recopié au premier niveau** (`layout.footers`, invariant du contrat) : éditer `layout.headers`
  seul n'a aucun effet visible, c'est l'en-tête de la dernière section. C'est ce que fait le
  panneau En-tête / Pied de la page « Modèle » de la démo depuis la session 4.
- Le chemin `semantic` ne renseigne ni `layout()` (objet vide) ni `lostObjects()` ; le gabarit
  (`importedTemplate()`) est conservé sur les deux chemins.

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
riche, `/import` dépôt de `.docx` avec sélecteur `styled` / `semantic`, mise en page lue et
avertissements (exemple `13-styles-nommes.docx`), `/readonly` rendu figé en thème `night`,
`/template` modèle à variables (exemples `08-variables-braces.docx` et `16-sections.docx` servis
depuis `public/samples/`, formulaire généré, aperçu puces / résolu, vue page, en-tête de la
première section et pied de la dernière éditables, export dans les trois modes ou dans le
gabarit, rapport de fidélité, objets non représentables). La touche Tab de la démo garde le
comportement `focus` du core (le formulaire de `/form` reste navigable au clavier) ; le playground
vanilla, lui, monte l'éditeur avec `tabKey: 'insert'`.

## 🧪 Tests

```bash
npx ng test aster-angular --watch=false   # 53 tests du composant et de provideAster (importFidelity, exportInTemplate, pageView, layout, pageViewChange, sections, compareWithTemplate compris)
npx ng test demo --watch=false            # 30 tests des pages de la démo (Import : sélecteur styled / semantic ; Modèle : vue page, en-tête et pied par section, rapport de fidélité, objets perdus)
npm run e2e -- --project=demo             # 19 tests Playwright sur la démo, pages Modèle et sections comprises (ng serve lancé par Playwright)
```

TestBed + Vitest, environnement jsdom. Monte le composant, appelle `fixture.detectChanges()`
puis `await fixture.whenStable()` pour laisser `afterNextRender` créer l'éditeur.
