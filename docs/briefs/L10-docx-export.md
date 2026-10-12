# Brief — Lot L10 : export .docx (`word`)

> Rédigé à 23:58. Cible 1h30. Fonctionnalité « should » n° 8 du cahier des charges.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`, 0.2.0. Lire `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/STRATEGIE_TESTS.md`, `packages/word/README.md`, `packages/word/src/index.ts`, `packages/word/src/docx/**` (import, pour la symétrie), `packages/core/src/api/document.ts` (`AsterDocument` = JSON ProseMirror), et `scripts/generate-fixtures.ts` (exemple d'usage complet de la lib `docx`). La lib `docx` 9.x (MIT) est installée à la racine en devDependency : **elle doit passer en `dependencies` de `packages/word`** → c'est l'orchestrateur qui le fait, tu la consommes comme si elle y était (`import { … } from 'docx'`), en **import dynamique** dans la fonction publique (elle pèse lourd, comme mammoth).

## Lot

`exportDocx(input: string | AsterDocument, options?: DocxExportOptions): Promise<Blob>` dans `packages/word/src/export/` :
- Entrée HTML (string) ou JSON ProseMirror. Parsing du HTML via `DOMParser` injectable (`options.parse`), jamais de `document` global. Pour le JSON, convertir d'abord en HTML via un sérialiseur minimal interne (ou accepter uniquement HTML et documenter que le JSON passe par `editor.getHTML()` : choisis la voie la plus simple et robuste, documente-la).
- Mapping : `h1`-`h6` → `HeadingLevel`, `p` → `Paragraph` avec alignement (`text-align`), `strong`/`b` → `bold`, `em`/`i` → `italics`, `u` → `underline`, `s` → `strike`, `sub`/`sup`, `code` → police Consolas, `mark` → `highlight`, `a` → `ExternalHyperlink`, `ul`/`ol` imbriquées → `numbering` (puces et décimal, `type="a"` → `LevelFormat.LOWER_LETTER`, 3 niveaux min), `blockquote` → paragraphe indenté italique, `pre` → paragraphes Consolas, `hr` → paragraphe avec bordure basse, `br` → `break`, `img` → `ImageRun` (data URL base64 décodée ; URL http → ignorée avec avertissement sauf si `options.fetchImage` fourni), `table`/`thead`/`tbody`/`tr`/`th`/`td` → `Table` avec `columnSpan`/`rowSpan`, en-têtes en gras, largeur 100 %, `span style="color"` → `color`, `font-family`/`font-size` si présents.
- `DocxExportOptions` : `parse?`, `fetchImage?: (src) => Promise<ArrayBuffer | null>`, `title?`, `creator?`, `pageSize?: 'A4' | 'LETTER'`.
- Résultat : `Blob` de type `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Helper `downloadDocx(blob, filename)` (crée un `<a download>`), séparé et sans test DOM lourd.
- Avertissements : même type `DocxImportWarning` renommé en `DocxWarning` si tu veux factoriser (additif, garde l'ancien nom exporté en alias).
- **Test d'aller-retour** : `exportDocx(html)` → `importDocx(blob.arrayBuffer())` → HTML structurellement équivalent (titres, listes, table, marques, lien) sur un document complet. C'est le test clé.
- Exports dans `packages/word/src/index.ts` (lignes additives).

## Périmètre

✅ `packages/word/src/export/**`, lignes d'export de `packages/word/src/index.ts`, `packages/word/README.md` (section « Export .docx » ajoutée). ❌ tout le reste. Aucune dépendance ajoutée par toi.

## Points d'attention

TS strict, zéro `any`, JSDoc FR, outil Write, pas de `\u00a0`. Tests : `cd packages/word && npx vitest run --coverage`, seuil 85 % du paquet maintenu. Lire `node_modules/docx/dist/index.d.ts` pour l'API réelle (`Document`, `Packer.toBlob`/`toBuffer`, `Paragraph`, `TextRun`, `Table`, `ImageRun`, `ExternalHyperlink`, `LevelFormat`, `AlignmentType`). En test Node, `Packer.toBuffer` ; en navigateur, `Packer.toBlob`. `Blob` existe sous jsdom.

## Ordre de sacrifice

Images http via `fetchImage`, puis `pre`/`hr`, puis JSON en entrée.

## Rapport attendu

Structure imposée `## Rapport Lot L10`.
