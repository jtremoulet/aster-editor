# ✳️ Aster Editor

> Éditeur de texte riche **MIT** sur Tiptap 3 / ProseMirror, framework-agnostic, avec import et export Word de qualité, **modèles de documents et champs de fusion**, et wrapper Angular natif.
> Tu l'embarques tel quel chez tes clients, sans licence commerciale, et tu le styles par variables CSS.
> Le moteur et la toolbar sont en TypeScript vanilla ; Angular est le premier wrapper, React et Vue suivront.

## 🧭 Pourquoi Aster

- **MIT de bout en bout** : Tiptap, ProseMirror, mammoth et docx sont MIT ou BSD. Pas de GPL, pas de fonction premium.
- **Word dans les deux sens** : `.docx` → HTML via mammoth avec style map, prétraitement XML des champs et post-traitements ; HTML → `.docx` avec numérotation, images, tables, en-têtes et pieds de page, numéros de page, table des matières, notes de bas de page réelles, titres numérotés, mise en page et métadonnées ; collage depuis Word et Google Docs nettoyé en 9 passes pures.
- **Modèles de documents** : les `{{variables}}`, champs de fusion `MERGEFIELD` et contrôles de contenu d'un `.docx` client deviennent des puces dans l'éditeur ; tu remplis les valeurs par formulaire ou résolveur, tu obtiens le HTML résolu et un `.docx` final résolu, ou avec de vrais champs de fusion Word.
- **Framework-agnostic** : `createAster(host, options)` monte un éditeur complet dans n'importe quel `HTMLElement`. Aucun framework dans `core`, `ui` et `word`.
- **Angular natif** : composant standalone `<aster-editor>` avec `ControlValueAccessor`, inputs signals, zoneless, SSR-safe.
- **Sécurisé par construction** : le schéma ProseMirror jette tout ce qu'il ne connaît pas, liens et images passent par une liste blanche de protocoles (`javascript:` et `data:text/html` rejetés, `data:image/` et `blob:` tolérés pour les images), les SVG uploadés sont refusés, les balises actives du HTML Word sont supprimées au collage, les valeurs de variables sont insérées en texte, jamais en HTML.

## 📦 Paquets

| Paquet                  | Rôle                                                                                                                                                                                                                                             | README                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `@aster-editor/core`    | Moteur : `createEditor`, registre de 50 commandes standard typées + 6 `search.*` + 2 `formatPainter.*`, variables de document (`editor.variables`), recherche / remplacement, sommaire, i18n fr/en, événements, HTML / JSON / Markdown, autosave | [`packages/core`](./packages/core/README.md)       |
| `@aster-editor/word`    | `importDocx` (variables comprises), `exportDocx` / `downloadDocx` (trois modes de variables, fidélité Word), `normalizeWordHtml`, `normalizeGoogleDocsHtml`, `wordPasteTransformer`                                                              | [`packages/word`](./packages/word/README.md)       |
| `@aster-editor/ui`      | `createAster`, `createToolbar`, 16 widgets (variables, sommaire, pinceau, recherche, vue source, plein écran…), suggestion `{{`, bulles de lien et d'image, menu `/`, 77 icônes SVG, thèmes `light` et `night`                                   | [`packages/ui`](./packages/ui/README.md)           |
| `@aster-editor/angular` | `<aster-editor>` standalone + CVA, inputs de variables, `getHTML(options)`, `importDocx` / `exportDocx` chargés à la demande, `provideAster()`, `ASTER_UPLOAD_HANDLER`                                                                           | [`packages/angular`](./packages/angular/README.md) |

Dépendances entre paquets, dans ce sens uniquement : `angular → ui → core`, `word → core`, `angular → word` (optionnel).

## 🚀 Quick start vanilla

```bash
npm install @aster-editor/core @aster-editor/ui @aster-editor/word
```

```ts
import '@aster-editor/ui/themes/aster.css';
import { createAster } from '@aster-editor/ui';
import { wordPasteTransformer } from '@aster-editor/word';

const host = document.querySelector<HTMLElement>('#editor')!;
const { editor } = createAster(host, {
  toolbar: 'full',
  theme: 'light',
  locale: 'fr',
  content: '<p>Bonjour</p>',
  pasteTransformers: [wordPasteTransformer()],
});
editor.on('change', ({ editor }) => console.log(editor.getHTML()));
```

Pour un `.docx`, dans les deux sens :

```ts
import { downloadDocx, exportDocx, importDocx } from '@aster-editor/word';

const result = await importDocx(file); // File, ArrayBuffer ou Uint8Array
editor.setHTML(result.html);
console.warn(result.warnings);

const blob = await exportDocx(editor.getHTML(), { title: 'Mon document' });
downloadDocx(blob, 'mon-document');
```

## 🧩 Quick start variables (modèles de documents)

```ts
const { editor } = createAster(host, {
  toolbar: 'full',
  pasteTransformers: [wordPasteTransformer()],
  variables: {
    variables: [
      { name: 'client.nom', label: 'Client' },
      { name: 'date', label: 'Date', description: 'Date de signature' },
    ],
    values: { date: '16/10/2026' },
  },
});

const { html, variables } = await importDocx(file); // {{nom}}, MERGEFIELD, contrôles de contenu
editor.setHTML(html);
editor.variables.define(variables); // libellés et valeurs lus dans le .docx

editor.variables.getNames(); // noms présents dans le document
editor.variables.setValues({ 'client.nom': 'ACME' }); // les puces se rafraîchissent
editor.on('variablesChange', ({ values }) => console.log(values));

editor.getHTML(); // puces : <span data-aster-variable="client.nom">{{client.nom}}</span>
editor.getHTML({ variables: 'resolve' }); // valeurs substituées en texte

const blob = await exportDocx(editor.getHTML(), {
  variables: { mode: 'fields', values: editor.variables.getValues() },
});
downloadDocx(blob, 'contrat');
```

Dans l'éditeur : taper `{{` ouvre un menu de suggestion, `{{nom}}` crée une puce, le widget `variable` de la toolbar liste les variables, un double-clic sur une puce ouvre son dialogue. Le tour complet (import d'un modèle client, formulaire, aperçu, export dans les trois modes et limites) est dans le [guide d'intégration](./docs/GUIDE_INTEGRATION.md).

## 🅰️ Quick start Angular

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AsterEditorComponent } from '@aster-editor/angular';

@Component({
  selector: 'app-article-form',
  imports: [AsterEditorComponent, ReactiveFormsModule],
  template: `<aster-editor
    [formControl]="body"
    toolbar="full"
    theme="night"
    locale="fr"
    ariaLabel="Corps de l'article"
  />`,
})
export class ArticleFormComponent {
  body = new FormControl('<p>Bonjour</p>');
}
```

Inputs : `toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config` (le reste des `AsterUiOptions`), `wordPaste`, `ariaLabel`, `ariaLabelledBy`, `variables`, `variableValues`, `variableResolver`, `allowUnknownVariables`, `variableSuggestion`. Outputs : `ready`, `changed`, `focused`, `blurred`, `variablesChanged`. API : `editor()` et `variableNames()` (signals), `getHTML(options?)`, `resolveVariables()`, `importDocx(file)`, `exportDocx(options?)`. Config globale via `provideAster(config)` et token `ASTER_UPLOAD_HANDLER`. Le thème s'importe dans `styles.css` : `@import '@aster-editor/ui/themes/aster.css';`. Détails dans le [README du paquet](./packages/angular/README.md).

## 📚 Documentation

- [Guide d'intégration](./docs/GUIDE_INTEGRATION.md) : de zéro à la prod, stockage, autosave, Markdown, upload, export Word, modèles de documents, impression, sécurité, i18n, lecture seule, bundle, e2e.
- [Référence de l'API core](./docs/API_CORE.md) : chaque type du contrat, champ par champ, variables comprises.
- [Théming](./docs/THEMING.md) : anatomie DOM, variables `--aster-*`, feuilles CSS, puces et panneaux, thème custom.
- [Cahier des charges](./docs/CAHIER_DES_CHARGES.md), [Architecture](./docs/ARCHITECTURE.md), [Stratégie de tests](./docs/STRATEGIE_TESTS.md).

## 📍 Statut du projet

Version **0.4.0** : la V1 du cahier des charges (0.3.0) plus la session 2, consacrée aux modèles de documents, à la fidélité Word à l'export et à la parité d'usage avec les éditeurs du marché, avec cinq revues adverses et leurs correctifs. Le détail par version est dans le [`CHANGELOG.md`](./CHANGELOG.md).

**Ce qui est livré**

- **Édition** : marks (gras, italique, souligné, barré, indice, exposant, code, surlignage multicolore), titres H1-H6, listes à puces, numérotées et de tâches imbriquées, citation, bloc de code, séparateur, alignement, couleurs, police, taille, effacer la mise en forme, reproduction de mise en forme (pinceau, `Mod-Shift-c` / `Mod-Shift-v`), undo/redo, raccourcis clavier.
- **Liens et images** : liens sécurisés par liste blanche, bulle de lien (URL, modifier, supprimer), images par fichier, URL, collage, glisser-déposer ou hook `upload`, redimensionnables à la souris, bulle d'image (alignement, largeurs 25 / 50 / 100 %), éditables au double-clic.
- **Tables** : grille d'insertion, lignes, colonnes, fusion, en-têtes, colonnes redimensionnables, menu contextuel au clic droit, HTML de sortie stable.
- **Variables de document** : puces `{{nom}}` avec libellé et valeur, états résolue / non résolue, magasin `editor.variables` (déclarations, valeurs, résolveur asynchrone, événement `variablesChange`), commandes `variable.insert` / `variable.remove`, règle de saisie, suggestion `{{`, widget de toolbar, dialogue de puce, `getHTML({ variables: 'resolve' })` et `resolveVariablesHtml()` pur.
- **Navigation** : menu `/` (blocs, listes, tableau, image, lien, variable), sommaire des titres avec ancres `id` stables, **recherche / remplacement** (`Mod-f`), **vue source HTML**, **plein écran**, **caractères spéciaux et emojis**, **impression**.
- **Contenu** : `getHTML()` / `setHTML()` idempotents, `getJSON()` / `setJSON()`, `getText()`, `getCounts()`, Markdown aller-retour (`getMarkdown` / `setMarkdown`), autosave (`createAutosave`), événements typés, lecture seule, i18n fr/en à chaud.
- **Word** : import `.docx` avec rapport d'avertissements et détection des variables (`{{nom}}`, champs de fusion, contrôles de contenu, en-têtes et pieds inclus) ; export `.docx` avec variables en trois modes (`placeholders`, `resolve`, `fields`), en-têtes et pieds de page, numéros de page, sauts de page, table des matières, notes de bas de page réelles, titres numérotés, largeurs de colonnes, format, orientation, marges, langue, police et styles de titres ; collage Word et Google Docs nettoyé et durci, `{{nom}}` collé reconnu.
- **UI** : toolbar accessible (rôles ARIA, navigation clavier, roving tabindex), presets `full` / `standard` / `minimal`, 16 widgets, panneaux flottants accessibles (`listbox`, `aria-activedescendant`), thèmes `light` et `night` avec test de contraste WCAG AA.
- **Angular 22** : composant `<aster-editor>` CVA zoneless, inputs et output de variables, `exportDocx` à la demande, `provideAster`, `ASTER_UPLOAD_HANDLER`, nom accessible, app démo à cinq pages dont « Modèle ».
- **Qualité** : 1 254 tests unitaires (core 449, word 454, ui 289, angular 39, démo 23), tests e2e Playwright sur le playground vanilla et la démo Angular (variables comprises), CI GitHub Actions avec job e2e dédié, échantillon `.docx` toutes options avec checklist d'ouverture dans Word (`samples/`).

**Ce qui vient**

- Publication npm sous l'org `@aster-editor`.
- Wrappers React et Vue.

## 🛠️ Développement

```bash
npm install            # racine, installe tous les workspaces (Node ≥ 24)
npm run check          # lint + typecheck + tests, à lancer avant tout commit
npm run build          # build de tous les paquets (tsc puis ng-packagr)
npm run demo           # app démo Angular sur http://localhost:4200
npm run demo:build     # build de prod de la démo
npm run playground     # playground vanilla (esbuild) sur http://localhost:4300
npm run e2e            # tests Playwright (lance playground et démo si besoin)
npm run e2e:ui         # idem en mode UI
npm run fixtures       # régénère les .docx de test
npm run test -w packages/word   # tests d'un seul paquet
```

Branche de travail `develop`, commits conventionnels avec scope paquet (`feat(core):`, `fix(word):`), une seule version SemVer pour le monorepo. Voir [`CLAUDE.md`](./CLAUDE.md) pour les conventions.

## ⚖️ Licence

MIT © Joris Tremoulet
