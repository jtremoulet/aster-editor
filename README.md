# ✳️ Aster Editor

> Éditeur de texte riche **MIT** sur Tiptap 3 / ProseMirror, framework-agnostic, avec import Word de qualité et wrapper Angular natif.
> Tu l'embarques tel quel chez tes clients, sans licence commerciale, et tu le styles par variables CSS.
> Le moteur et la toolbar sont en TypeScript vanilla ; Angular est le premier wrapper, React et Vue suivront.

## 🧭 Pourquoi Aster

- **MIT de bout en bout** : Tiptap, ProseMirror et mammoth sont MIT ou BSD. Pas de GPL, pas de fonction premium.
- **Import Word qui tient la route** : `.docx` via mammoth avec style map et post-traitements, collage depuis Word et Google Docs nettoyé en 8 passes pures. Titres, listes imbriquées, tables avec en-têtes, images, notes de bas de page.
- **Framework-agnostic** : `createAster(host, options)` monte un éditeur complet dans n'importe quel `HTMLElement`. Aucun framework dans `core`, `ui` et `word`.
- **Angular natif** : composant standalone `<aster-editor>` avec `ControlValueAccessor`, inputs signals, zoneless. En cours d'écriture, voir le statut plus bas.
- **Sécurisé par construction** : le schéma ProseMirror jette tout ce qu'il ne connaît pas, les liens `javascript:` sont rejetés par liste blanche de protocoles, les SVG uploadés sont refusés.

## 📦 Paquets

| Paquet                  | Rôle                                                                                                     | README                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `@aster-editor/core`    | Moteur : `createEditor`, registre de 48 commandes standard typées, i18n fr/en, événements, sérialisation | [`packages/core`](./packages/core/README.md)       |
| `@aster-editor/word`    | `importDocx`, `normalizeWordHtml`, `normalizeGoogleDocsHtml`, `wordPasteTransformer`                     | [`packages/word`](./packages/word/README.md)       |
| `@aster-editor/ui`      | `createAster`, `createToolbar`, composants vanilla accessibles, icônes SVG, thèmes `light` et `night`    | [`packages/ui`](./packages/ui/README.md)           |
| `@aster-editor/angular` | `<aster-editor>` standalone + CVA, `provideAster()`, import `.docx` dynamique                            | [`packages/angular`](./packages/angular/README.md) |

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

Pour un `.docx` :

```ts
import { importDocx } from '@aster-editor/word';

const result = await importDocx(file); // File ou ArrayBuffer
editor.setHTML(result.html);
console.warn(result.warnings);
```

## 🅰️ Quick start Angular

> 🚧 **En cours** : le wrapper est en cours d'écriture, l'API ci-dessous est celle prévue. Fais foi le [README du paquet](./packages/angular/README.md) quand il est publié.

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AsterEditorComponent } from '@aster-editor/angular';

@Component({
  selector: 'app-article-form',
  imports: [AsterEditorComponent, ReactiveFormsModule],
  template: `<aster-editor [formControl]="body" toolbar="full" theme="night" locale="fr" />`,
})
export class ArticleFormComponent {
  body = new FormControl('<p>Bonjour</p>');
}
```

Inputs prévus : `toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config` (le reste des `AsterUiOptions`), `wordPaste`. Outputs : `ready`, `changed`, `focused`, `blurred`. Méthodes : `editor()`, `importDocx(file)`. Config globale via `provideAster(config)` et token `ASTER_UPLOAD_HANDLER`. Le thème s'importe dans `styles.css` : `@import '@aster-editor/ui/themes/aster.css';`.

## 📚 Documentation

- [Guide d'intégration](./docs/GUIDE_INTEGRATION.md) : de zéro à la prod, stockage, upload, sécurité, i18n, lecture seule, bundle.
- [Référence de l'API core](./docs/API_CORE.md) : chaque type du contrat, champ par champ.
- [Théming](./docs/THEMING.md) : anatomie DOM, variables `--aster-*`, thème custom.
- [Cahier des charges](./docs/CAHIER_DES_CHARGES.md), [Architecture](./docs/ARCHITECTURE.md), [Stratégie de tests](./docs/STRATEGIE_TESTS.md).

## 📍 Statut du projet

Version **0.1.0**, V1 en cours.

**Ce qui marche aujourd'hui (vanilla)**

- Édition complète : marks, titres H1-H6, listes à puces, numérotées et de tâches imbriquées, citation, bloc de code, séparateur, alignement, liens sécurisés, images (fichier, URL, collage, glisser-déposer, hook `upload`), tables (grille d'insertion, lignes, colonnes, fusion, en-têtes), couleurs, police, taille, undo/redo.
- `getHTML()` / `setHTML()` idempotents, `getJSON()` / `setJSON()`, `getText()`, `getCounts()`, événements typés, lecture seule, i18n fr/en à chaud.
- Import `.docx` avec rapport d'avertissements, collage Word et Google Docs nettoyés.
- Toolbar accessible (rôles ARIA, navigation clavier, roving tabindex), presets `full` / `standard` / `minimal`, thèmes `light` et `night`.

**Ce qui vient**

- Wrapper Angular `@aster-editor/angular` et app démo (0.2.0).
- Recherche / remplacement, vue source HTML, plein écran, export `.docx`.
- Redimensionnement d'image à la souris, autosave.
- Wrappers React et Vue (après la V1).

## 🛠️ Développement

```bash
npm install            # racine, installe tous les workspaces (Node ≥ 24)
npm run check          # lint + typecheck + tests, à lancer avant tout commit
npm run build          # build de tous les paquets
npm run demo           # app démo Angular sur http://localhost:4200
npm run playground     # playground vanilla (esbuild) sur http://localhost:4300
npm run test -w packages/word   # tests d'un seul paquet
```

Branche de travail `develop`, commits conventionnels avec scope paquet (`feat(core):`, `fix(word):`), une seule version SemVer pour le monorepo. Voir [`CLAUDE.md`](./CLAUDE.md) pour les conventions.

## ⚖️ Licence

MIT © Joris Tremoulet
