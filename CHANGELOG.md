# 📜 Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versionnage : [SemVer](https://semver.org/lang/fr/).
Une seule version pour tout le monorepo.

## [Unreleased]

## [0.2.0] - 2026-10-12

Testable dans Angular 22 : composant `<aster-editor>`, app démo, images et tables avancées.

### Added

- **angular** : `AsterEditorComponent` standalone, zoneless, `ControlValueAccessor` complet (reactive forms et `ngModel`), inputs signals `toolbar` / `theme` / `locale` / `placeholder` / `readonly` / `config` / `wordPaste`, outputs `ready` / `changed` / `focused` / `blurred`, `importDocx()` avec chargement différé de `@aster-editor/word`, `provideAster()`, tokens `ASTER_CONFIG` et `ASTER_UPLOAD_HANDLER`. 19 tests.
- **demo** : app Angular 22 avec 4 pages (playground, reactive form, import Word, lecture seule), bundle initial 269 kB, mammoth en chunk séparé.
- **core** : images redimensionnables à la souris (NodeView `figure.aster-image`), alignables, éditables au double-clic (`aster:image-edit`), colonnes de table redimensionnables avec HTML stable.
- **ui** : dialogue image en mode édition (alt, titre, largeur, alignement), menu contextuel de table monté par `createAster`, feuille `images-tables.css`.
- Docs : README racine et par paquet, `docs/GUIDE_INTEGRATION.md`, `docs/THEMING.md`, `docs/API_CORE.md`.

### Fixed

- **ui** : bouton Lien toujours grisé (`canRun` testé avec un href vide).
- Config : `noPropertyAccessFromIndexSignature` aligné entre le tsconfig Angular et la base ; dépendances CommonJS de mammoth déclarées pour le build démo.

## [0.1.0] - 2026-10-12

Première version utilisable en vanilla : moteur, toolbar, import Word. Pas encore de wrapper Angular.

### Added

- **core** : `createEditor` sur Tiptap 3, registre de 48 commandes standard typées, i18n fr/en, événements, politique de liens sécurisée, upload d'images avec repli base64, pipeline de transformateurs de collage, raccourcis clavier.
- **word** : `importDocx` via mammoth (style map Aster, post-traitements, notes de bas de page, hook upload) et `normalizeWordHtml` / `normalizeGoogleDocsHtml` en 8 passes pures, `wordPasteTransformer`.
- **ui** : `createToolbar` avec presets `full` / `standard` / `minimal`, composants accessibles (dropdown, dialogues lien et image, sélecteurs couleur, police, titres, grille de table), 58 icônes SVG, thèmes `light` et `night`, `createAster`.
- **angular** : squelette de lib ng-packagr, composant à venir en 0.2.0.
- Monorepo npm workspaces, TypeScript 6.0, Vitest 5, Angular 22, CI GitHub Actions, playground vanilla (`npm run playground`), fixtures .docx et HTML de collage.
- Documents de cadrage : cahier des charges, architecture, stratégie de tests, roadmap de la nuit, template de brief agent, journal, REX.
