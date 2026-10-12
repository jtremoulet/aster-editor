# 📜 Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versionnage : [SemVer](https://semver.org/lang/fr/).
Une seule version pour tout le monorepo.

## [Unreleased]

## [0.1.0] - 2026-10-12

Première version utilisable en vanilla : moteur, toolbar, import Word. Pas encore de wrapper Angular.

### Added

- **core** : `createEditor` sur Tiptap 3, registre de 49 commandes standard typées, i18n fr/en, événements, politique de liens sécurisée, upload d'images avec repli base64, pipeline de transformateurs de collage, raccourcis clavier.
- **word** : `importDocx` via mammoth (style map Aster, post-traitements, notes de bas de page, hook upload) et `normalizeWordHtml` / `normalizeGoogleDocsHtml` en 8 passes pures, `wordPasteTransformer`.
- **ui** : `createToolbar` avec presets `full` / `standard` / `minimal`, composants accessibles (dropdown, dialogues lien et image, sélecteurs couleur, police, titres, grille de table), 65 icônes SVG, thèmes `light` et `night`, `createAster`.
- **angular** : squelette de lib ng-packagr, composant à venir en 0.2.0.
- Monorepo npm workspaces, TypeScript 6.0, Vitest 5, Angular 22, CI GitHub Actions, playground vanilla (`npm run playground`), fixtures .docx et HTML de collage.
- Documents de cadrage : cahier des charges, architecture, stratégie de tests, roadmap de la nuit, template de brief agent, journal, REX.
