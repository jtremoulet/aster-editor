# ✳️ Aster Editor

> Éditeur de texte riche **MIT** sur Tiptap 3 / ProseMirror, framework-agnostic, avec import et export Word de qualité et wrapper Angular natif.
> Tu l'embarques tel quel chez tes clients, sans licence commerciale, et tu le styles par variables CSS.
> Le moteur et la toolbar sont en TypeScript vanilla ; Angular est le premier wrapper, React et Vue suivront.

## 🧭 Pourquoi Aster

- **MIT de bout en bout** : Tiptap, ProseMirror, mammoth et docx sont MIT ou BSD. Pas de GPL, pas de fonction premium.
- **Word dans les deux sens** : `.docx` → HTML via mammoth avec style map et post-traitements, HTML → `.docx` avec numérotation, images, tables et métadonnées, collage depuis Word et Google Docs nettoyé en 8 passes pures. Titres, listes imbriquées, tables avec en-têtes, images, notes de bas de page.
- **Framework-agnostic** : `createAster(host, options)` monte un éditeur complet dans n'importe quel `HTMLElement`. Aucun framework dans `core`, `ui` et `word`.
- **Angular natif** : composant standalone `<aster-editor>` avec `ControlValueAccessor`, inputs signals, zoneless, SSR-safe.
- **Sécurisé par construction** : le schéma ProseMirror jette tout ce qu'il ne connaît pas, liens et images passent par une liste blanche de protocoles (`javascript:` et `data:text/html` rejetés, `data:image/` et `blob:` tolérés pour les images), les SVG uploadés sont refusés, les balises actives du HTML Word sont supprimées au collage.

## 📦 Paquets

| Paquet                  | Rôle                                                                                                                                                                           | README                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `@aster-editor/core`    | Moteur : `createEditor`, registre de 48 commandes standard typées + 6 commandes `search.*`, recherche / remplacement, i18n fr/en, événements, HTML / JSON / Markdown, autosave | [`packages/core`](./packages/core/README.md)       |
| `@aster-editor/word`    | `importDocx`, `exportDocx` / `downloadDocx`, `normalizeWordHtml`, `normalizeGoogleDocsHtml`, `wordPasteTransformer`                                                            | [`packages/word`](./packages/word/README.md)       |
| `@aster-editor/ui`      | `createAster`, `createToolbar`, 13 widgets (recherche, vue source, plein écran, caractères spéciaux, impression…), 66 icônes SVG, thèmes `light` et `night`                    | [`packages/ui`](./packages/ui/README.md)           |
| `@aster-editor/angular` | `<aster-editor>` standalone + CVA, `provideAster()`, `ASTER_UPLOAD_HANDLER`, import `.docx` et collage Word chargés à la demande                                               | [`packages/angular`](./packages/angular/README.md) |

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

Inputs : `toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config` (le reste des `AsterUiOptions`), `wordPaste`, `ariaLabel`, `ariaLabelledBy`. Outputs : `ready`, `changed`, `focused`, `blurred`. API : `editor()` (signal), `importDocx(file)`. Config globale via `provideAster(config)` et token `ASTER_UPLOAD_HANDLER`. Le thème s'importe dans `styles.css` : `@import '@aster-editor/ui/themes/aster.css';`. Détails dans le [README du paquet](./packages/angular/README.md).

## 📚 Documentation

- [Guide d'intégration](./docs/GUIDE_INTEGRATION.md) : de zéro à la prod, stockage, autosave, Markdown, upload, export Word, impression, sécurité, i18n, lecture seule, bundle, e2e.
- [Référence de l'API core](./docs/API_CORE.md) : chaque type du contrat, champ par champ.
- [Théming](./docs/THEMING.md) : anatomie DOM, variables `--aster-*`, feuilles CSS, thème custom.
- [Cahier des charges](./docs/CAHIER_DES_CHARGES.md), [Architecture](./docs/ARCHITECTURE.md), [Stratégie de tests](./docs/STRATEGIE_TESTS.md).

## 📍 Statut du projet

Version **0.3.0** : la V1 du cahier des charges est livrée (must, should et could), avec cinq lots de correctifs issus de revues adverses. Le détail par version est dans le [`CHANGELOG.md`](./CHANGELOG.md).

**Ce qui est livré**

- **Édition** : marks (gras, italique, souligné, barré, indice, exposant, code, surlignage multicolore), titres H1-H6, listes à puces, numérotées et de tâches imbriquées, citation, bloc de code, séparateur, alignement, couleurs, police, taille, effacer la mise en forme, undo/redo, raccourcis clavier.
- **Liens et images** : liens sécurisés par liste blanche, images par fichier, URL, collage, glisser-déposer ou hook `upload`, redimensionnables à la souris, alignables, éditables au double-clic.
- **Tables** : grille d'insertion, lignes, colonnes, fusion, en-têtes, colonnes redimensionnables, menu contextuel au clic droit, HTML de sortie stable.
- **Recherche / remplacement** (`Mod-f`), **vue source HTML**, **plein écran**, **caractères spéciaux et emojis**, **impression**.
- **Contenu** : `getHTML()` / `setHTML()` idempotents, `getJSON()` / `setJSON()`, `getText()`, `getCounts()`, Markdown aller-retour (`getMarkdown` / `setMarkdown`), autosave (`createAutosave`), événements typés, lecture seule, i18n fr/en à chaud.
- **Word** : import `.docx` avec rapport d'avertissements, export `.docx` (numérotation par liste, images, tables, métadonnées, assainissement XML), collage Word et Google Docs nettoyé et durci.
- **UI** : toolbar accessible (rôles ARIA, navigation clavier, roving tabindex), presets `full` / `standard` / `minimal`, 13 widgets, thèmes `light` et `night` avec test de contraste WCAG AA.
- **Angular 22** : composant `<aster-editor>` CVA zoneless, `provideAster`, `ASTER_UPLOAD_HANDLER`, nom accessible, app démo à quatre pages.
- **Qualité** : 882 tests unitaires (core 363, word 281, ui 188, angular 30, démo 20) et 21 tests e2e Playwright (16 sur le playground vanilla, 5 sur la démo Angular), CI GitHub Actions avec job e2e dédié.

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
