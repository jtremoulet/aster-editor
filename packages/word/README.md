# 📄 @aster-editor/word

> Import et export `.docx`, nettoyage du collage depuis Word et Google Docs pour Aster Editor. Produit du HTML sémantique que le schéma ProseMirror accepte tel quel, et un fichier Word depuis ce même HTML.

## 📦 Installation

```bash
npm install @aster-editor/word
```

Peer dependency : `@aster-editor/core`. Dépendance embarquée : `mammoth` (BSD-2), chargé en **import dynamique** uniquement quand `importDocx` est appelé.

## 📥 `importDocx`

```ts
type DocxInput = File | ArrayBuffer | ArrayBufferView;
function importDocx(input: DocxInput, options?: DocxImportOptions): Promise<DocxImportResult>;
```

Convertit un `.docx` en HTML prêt pour `editor.setHTML` ou `editor.insertHTML`. L'entrée (`DocxInput`) est un `File`, un `ArrayBuffer` ou une vue typée (`Uint8Array`, `Buffer` Node) dont seule la fenêtre `byteOffset`/`byteLength` est lue. Ne lève jamais pour un document Word valide : ce qui n'est pas converti fidèlement remonte dans `warnings`. Rejette une erreur nommée `DocxImportError` (message préfixé `invalid-docx:`) si l'entrée n'est pas de l'un de ces types (`null`, chaîne, objet quelconque), n'est pas une archive zip, ne peut pas être lue (`arrayBuffer()` qui rejette) ou si mammoth ne peut pas la décoder.

### Options (`DocxImportOptions`)

| Champ       | Type                  | Défaut            | Rôle                                                                                                                                                        |
| ----------- | --------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload`    | `UploadHandler`       | —                 | Hook `(file: File) => Promise<string>` appelé pour chaque image embarquée. Sans hook : data URL base64.                                                     |
| `footnotes` | `boolean`             | `true`            | Conserver les notes de bas de page et de fin en liste finale. `false` les supprime avec un avertissement.                                                   |
| `styleMap`  | `readonly string[]`   | `[]`              | Règles mammoth additionnelles (`p[style-name='X'] => h2:fresh`), ajoutées **après** celles d'Aster, qui restent prioritaires. Lignes vides et `#` ignorées. |
| `parse`     | `HtmlParser`          | `new DOMParser()` | Parseur HTML injectable (`{ parseFromString(html, 'text/html'): Document }`) pour SSR ou tests.                                                             |
| `variables` | `DocxVariableOptions` | tout actif        | `{ detect?, pattern? }` : sources de variables reconnues et motif alternatif à `{{nom}}`. Voir [Variables](#variables).                                     |

### Résultat (`DocxImportResult`)

| Champ       | Type                           | Rôle                                                                                               |
| ----------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `html`      | `string`                       | HTML sémantique, `body.innerHTML`.                                                                 |
| `warnings`  | `readonly DocxImportWarning[]` | `{ code, message }`, vide si tout est passé.                                                       |
| `variables` | `readonly AsterVariable[]`     | Variables trouvées (`name`, `label?`, `value?`), ordre d'apparition. Voir [Variables](#variables). |

### Codes d'avertissement (`DocxImportWarningCode`)

| Code                          | Sens                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mammoth`                     | Message mammoth remonté tel quel (`warning: Unrecognised paragraph style…`, image illisible).                                                                                         |
| `image-upload-failed`         | Le hook `upload` a rejeté ou résolu autre chose qu'une chaîne non vide ; l'image est repliée en base64.                                                                               |
| `footnotes-dropped`           | Des notes existaient et `footnotes: false` les a supprimées.                                                                                                                          |
| `unsupported-style`           | Réservé aux post-traitements : élément non converti fidèlement.                                                                                                                       |
| `variables-preprocess-failed` | Le prétraitement des champs de fusion et contrôles de contenu a échoué (XML illisible, pas de `DOMParser` XML) ; le document est importé sans, les `{{nom}}` saisis restent détectés. |

### Ce que l'import produit

- **Titres** : `Title`/`Titre` et `Heading 1..6`/`Titre 1..6` (noms localisés et identifiants internes `Heading1`, `Titre1`) → `h1..h6`.
- **Listes** : numérotation native Word (`w:numPr`) → `ul`/`ol` imbriqués ; le texte de chaque `li` est enveloppé dans un `<p>` (schéma Tiptap `listItem = paragraph block*`), les sous-listes orphelines sont rattachées au `li` précédent.
- **Marks** : gras, italique, `Strong`/`Fort` → `strong`, `Emphasis`/`Accentuation` → `em`, souligné → `u`, barré → `s`, surlignage → `mark`, style `Code` → `code`.
- **Citations** : `Quote`, `Intense Quote`, `Citation`, `Citation intense` → `blockquote`, fusionnées quand elles se suivent.
- **Code** : styles `Code`, `HTML Preformatted` → `pre`, lignes consécutives dans un seul bloc.
- **Tables** : `thead` + `th` si Word a marqué la ligne d'en-tête ou si toute la première ligne est en gras, `tbody` pour le reste, `colspan`/`rowspan` conservés, `<p>` unique des cellules déballé.
- **Images** : `src` = URL du hook ou data URL, `alt` toujours présent (vide si absent), `width`/`height` nuls retirés.
- **Notes** : liste `<ol data-footnotes>` en fin de document, appels `[1]` en texte simple, identifiants dans `data-footnote`. Note : le schéma Tiptap ne conserve pas `data-footnote` après `setHTML`.
- **Liens** : `<a href>` natifs mammoth, puis filtrés par la politique de liens du core à l'insertion.
- **Variables** : `<span data-aster-variable="nom" data-label="…">{{nom}}</span>`, voir ci-dessous.
- Paragraphes vides supprimés.

### Variables

Trois sources sont reconnues et ramenées à la même puce `<span data-aster-variable="nom">{{nom}}</span>`, que le core transforme en variable à l'insertion :

| Source (`detect`) | Dans Word                                                                                                                                                                                                                                             | Ce qu'on garde                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `braces`          | `{{nom}}` tapé dans le texte, espaces intérieurs tolérés (`{{ nom }}`), y compris dans un titre, une liste, une cellule, une marque, ou coupé sur deux runs.                                                                                          | Le nom. Accolades seules et `{{` incomplet restent du texte ; `<pre>` et `<code>` ne sont jamais analysés.                                                                           |
| `mergeFields`     | Champs de fusion `MERGEFIELD nom`, forme simple (`w:fldSimple`) ou complexe (`w:fldChar begin … end`, instruction répartie sur plusieurs runs). Un nom entre guillemets (`"Nom complet"`) est normalisé : minuscules, accents retirés, espaces → `_`. | Le nom et la mise en forme du run. Le résultat affiché par Word (`«Nom»`, échantillon de publipostage) est jeté. Les autres champs (`HYPERLINK`, `PAGE`, `TOC`, `IF`…) sont intacts. |
| `contentControls` | Contrôles de contenu `w:sdt` avec `w:tag` (nom) et `w:alias` (libellé) ; sans tag, l'alias normalisé sert de nom ; sans ni l'un ni l'autre, ou pour une table des matières, un groupe, une ligne de table, le contrôle est laissé tel quel.           | Le nom, le libellé (`data-label`, `label`) et **la valeur saisie** (`value`), sauf si le contrôle affiche encore son texte de remplissage (`w:showingPlcHdr`).                       |

Les champs et contrôles sont réécrits dans le XML du `.docx` **avant** mammoth (`document.xml`, en-têtes, pieds de page, notes), car mammoth perd les premiers et traverse les seconds. Le prétraitement ne lève jamais : en cas d'échec, le document est importé sans et un avertissement `variables-preprocess-failed` est émis. `result.variables` liste les variables du HTML dans l'ordre d'apparition, puis celles trouvées dans les en-têtes et pieds de page (que mammoth ne rend pas) ; donne-la au core avec `editor.variables.define(result.variables)`.

```ts
const { html, variables } = await importDocx(file, {
  variables: { detect: ['braces', 'contentControls'], pattern: /\[([a-z_]+)\]/g },
});
editor.setHTML(html);
editor.variables.define(variables); // libellés et valeurs connues
```

`pattern` remplace la syntaxe `{{nom}}` du texte libre par un motif dont le **groupe 1 est le nom** (validé par la règle du core : lettres, chiffres, `_`, `.`, `-`). Les runs `{{nom}}` produits par le prétraitement restent reconnus, mais seulement pour les noms qu'il a collectés. Un motif à backtracking exponentiel est à la charge de l'intégrateur. `detect: []` désactive tout.

### Exemple avec `<input type="file">`

```ts
import { createAster } from '@aster-editor/ui';
import { importDocx } from '@aster-editor/word';

const { editor } = createAster(document.querySelector<HTMLElement>('#editor')!);
const input = document.querySelector<HTMLInputElement>('#docx')!;

input.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const { html, warnings } = await importDocx(file, {
      upload: async (image) => {
        const body = new FormData();
        body.append('file', image);
        const response = await fetch('/api/uploads', { method: 'POST', body });
        const { url } = (await response.json()) as { url: string };
        return url;
      },
    });
    editor.setHTML(html);
    for (const warning of warnings) console.warn(`[${warning.code}] ${warning.message}`);
  } catch (error) {
    console.error('Fichier .docx illisible', error);
  }
});
```

Avec un `ArrayBuffer` (fetch, test) : `await importDocx(await response.arrayBuffer())`. Côté Node ou SSR, un `Buffer` passe tel quel : `await importDocx(await readFile('rapport.docx'))`.

## 🧹 `normalizeWordHtml` et `normalizeGoogleDocsHtml`

```ts
function normalizeWordHtml(html: string, options?: WordPasteOptions): string;
function normalizeGoogleDocsHtml(html: string, options?: WordPasteOptions): string;
function isWordHtml(html: string): boolean;
function isGoogleDocsHtml(html: string): boolean;
```

Fonctions **pures** : elles parsent le HTML dans un `Document` neuf, ne touchent jamais au `document` global et renvoient `body.innerHTML` nettoyé. Chaîne vide → chaîne vide. Le fragment réellement copié est isolé entre `<!--StartFragment-->` et `<!--EndFragment-->` quand les marqueurs existent ; si `EndFragment` manque (presse-papier tronqué), la balise ouverte et jamais fermée en fin de chaîne est retirée plutôt que rendue en texte.

Les deux normaliseurs sont aussi une barrière : balises actives supprimées avec leur contenu (`script`, `iframe`, `object`, `embed`, `form`, `template`, `noscript`, `frame`, `frameset`, `svg`, `math`, `meta`, `style`), tout attribut `on*` jeté, liens limités aux schémas `http`, `https`, `mailto`, `tel` (les autres sont déballés en texte), images limitées à `http(s)`, `data`, `blob`, `file` et relatif, valeur de `color` validée avant conservation. Le core applique ensuite sa propre politique de liens et d'images à l'insertion (`file:` et `data:` non-image y sont rejetés). Cette barrière est figée par une suite de tests dédiée (`paste/security.spec.ts`) qui couvre aussi les deux regex quadratiques corrigées en 0.3.0 (`isWordHtml`, `parseListFormats` : un collage de 2 Mo se détecte en moins d'une milliseconde) et les fragments tronqués au milieu d'un vecteur.

### Options (`WordPasteOptions`)

| Champ           | Type                         | Défaut      | Rôle                                                                                                                        |
| --------------- | ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `keepColors`    | `boolean`                    | `false`     | Conserver `color` explicite. Jamais le noir / `windowtext` par défaut, jamais dans un lien.                                 |
| `keepAlignment` | `boolean`                    | `true`      | Conserver `text-align` (`center`, `right`, `justify` ; `left` est le défaut et tombe).                                      |
| `parse`         | `(html: string) => Document` | `DOMParser` | Parseur injectable pour tests ou environnement sans DOM.                                                                    |
| `variables`     | `boolean \| { pattern? }`    | `true`      | `{{nom}}` collé → puce `<span data-aster-variable>`. `false` désactive, `{ pattern }` remplace la syntaxe (groupe 1 = nom). |

### Les 9 passes Word, dans l'ordre

| #   | Passe                      | Ce qu'elle fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `stripConditionalComments` | Avant parsing : jette `<!--[if gte mso 9]>…<![endif]-->` (XML de réglages, VML) et les marqueurs `<![if !supportLists]>`. Après parsing : supprime tous les nœuds commentaire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | `stripOfficeNamespaces`    | Supprime avec leur contenu `<xml>`, `<style>`, `<script>`, `<meta>`, `<link>`, `<title>`, `<head>` et les balises actives `<template>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<noscript>`, `<frame>`, `<frameset>`, `<svg>`, `<math>` ; déballe les balises préfixées `<o:p>`, `<w:*>`, `<v:*>`, `<m:*>` en gardant leur texte.                                                                                                                                                                                                                                                                                                                                                           |
| 3   | `rebuildLists`             | Lit `mso-list:lX levelN lfoM` sur les paragraphes et, dans le `<style>`, `@list lX:levelN { mso-level-number-format; mso-level-start-at }` puis les overrides d'instance `@list lX:levelN lfoM {…}` qui priment ; reconstruit `<ul>`/`<ol>` imbriqués, pose `type` (`a`, `A`, `i`, `I`) et `start` (lu dans le marqueur, sinon `mso-level-start-at`). Sans feuille de style, décide via le texte du marqueur : `1.`, `1.1.` décimal ; `c.`, `d.`, `l.`, `m.` isolés alpha ; `i.`, `v.`, `x.` isolés romains sauf si le marqueur suivant est `j.`, `w.`, `y.` ; deux lettres romaines ou plus (`ii.`, `iv.`) romain. Chaque instance `lfo` est une liste distincte.                                |
| 4   | `normalizeHeadings`        | `MsoTitle` → `h1`, `MsoHeading1..6` → `h1..h6` (plafonné à 6), `MsoQuote` / `MsoIntenseQuote` → `blockquote` fusionnés.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5   | `cleanInlineStyles`        | Jette `mso-*`, polices, tailles, interlignes, marges, fonds, `class`, `lang` ; traduit `font-weight:bold` → `strong`, `font-style:italic` → `em`, `underline` → `u`, `line-through` → `s`, `vertical-align` → `sub`/`sup`, `mso-highlight` → `mark` ; renomme `b`/`i`/`strike`/`del`/`ins` ; ne garde que `href`/`title`/`target`/`rel` sur `a`, `src`/`alt`/`title`/`width`/`height` sur `img`, `start`/`type` sur `ol` ; déballe les `<a>` sans `href` ou d'un schéma autre que `http`, `https`, `mailto`, `tel`, supprime les `<img>` à `src` actif ; avec `keepColors`, ne garde `color` que si la valeur est un hexa, un nom CSS ou un `rgb()`/`hsl()` ; déballe les `span` et `font` vides. |
| 6   | `normalizeTables`          | Retire `border`, `cellspacing`, `width`, `valign`, styles ; garde `colspan`/`rowspan` > 1 ; première ligne toute en gras → `<thead><th>` (le `mso-yfti-firstrow:yes` de Word n'est pas un indice : il marque la première ligne de toute table) ; déballe le `<p>` unique des cellules sauf s'il porte encore un attribut (alignement). Une table à une ligne n'a pas d'en-tête.                                                                                                                                                                                                                                                                                                                   |
| 7   | `collapseEmptyParagraphs`  | Supprime `<p>&nbsp;</p>`, `<p><br></p>`, les `<br>` en fin de bloc et les `<br>` orphelins. Garde un `<p></p>` si tout se vide.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8   | `normalizeWhitespace`      | `&nbsp;` entre mots → espace, suites d'espaces réduites, trim en début et fin de bloc (seulement pour un texte réellement en bord de bloc : l'espace entre un texte et une image inline reste), espaces de bord sortis des marks (`<em>a</em><u> b</u>` → `<em>a</em> <u>b</u>`), blancs d'indentation entre blocs supprimés. `<pre>` intact.                                                                                                                                                                                                                                                                                                                                                     |
| 9   | `wrapVariables`            | `{{nom}}` dans les nœuds texte (hors `<pre>`, `<code>`) → `<span data-aster-variable="nom">{{nom}}</span>`, après fusion des textes adjacents pour recoller un `{{` coupé sur deux spans. Espaces intérieurs tolérés, accolades seules ignorées, nom validé par la règle du core. Option `variables` (`false`, ou `{ pattern }`).                                                                                                                                                                                                                                                                                                                                                                 |

Le pipeline Google Docs est plus court : passes 1, 2, puis déballage du `<b style="font-weight:normal" id="docs-internal-guid-…">`, réimbrication des sous-listes (`<ul><li>a</li><ul>…</ul></ul>` → dans le `li`), remontée du `list-style-type` des `<li>` (`lower-alpha`, `upper-alpha`, `lower-roman`, `upper-roman`) en attribut `type` du `<ol>`, passe 5, déballage du `<div>` nu que Google pose autour de chaque table, puis passes 6 à 9.

```ts
import { isWordHtml, normalizeWordHtml } from '@aster-editor/word';

const html = event.clipboardData?.getData('text/html') ?? '';
if (isWordHtml(html)) {
  const clean = normalizeWordHtml(html, { keepColors: true });
  editor.insertHTML(clean);
}
```

Détection : `isWordHtml` cherche `urn:schemas-microsoft-com:office:word`, `class="Mso…"`, `mso-*:`, `<o:p>` ou le `ProgId Word.Document` ; `isGoogleDocsHtml` cherche `id="docs-internal-guid-`. Travail sur la chaîne, sans parser.

## 🔌 `wordPasteTransformer`

```ts
function wordPasteTransformer(options?: WordPasteOptions): PasteTransformer;
```

Fabrique le transformateur à passer dans `pasteTransformers` : détecte Word puis Google Docs, applique le normaliseur adapté, laisse tout autre HTML intact. En cas d'erreur interne, journalise un `console.warn` et rend le HTML d'origine : un collage ne casse jamais l'éditeur.

```ts
import { createEditor } from '@aster-editor/core';
import { wordPasteTransformer } from '@aster-editor/word';

const editor = createEditor({
  element,
  pasteTransformers: [wordPasteTransformer({ keepAlignment: false })],
});
```

Avec `createAster` de `@aster-editor/ui`, même option : `createAster(host, { pasteTransformers: [wordPasteTransformer()] })`.

## 📤 Export .docx

```ts
function exportDocx(input: string | AsterDocument, options?: DocxExportOptions): Promise<Blob>;
function downloadDocx(blob: Blob, filename?: string): void;
function jsonToHtml(document: AsterDocument): string;
```

Convertit le HTML d'Aster (`editor.getHTML()`) ou un document JSON ProseMirror (`editor.getJSON()`) en fichier Word. Rend un `Blob` de type `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, prêt pour `downloadDocx` ou un upload. Ne lève jamais pour du HTML valide : ce qui n'a pas d'équivalent Word remonte via `options.onWarning`. La lib `docx` (MIT, ~1,3 MB non minifié) est chargée en **import dynamique** au premier appel, comme mammoth pour l'import : elle n'entre dans le bundle initial que si ton bundler ne fait pas de code-splitting.

Le JSON passe par `jsonToHtml`, sérialiseur minimal limité au schéma d'Aster (StarterKit, tables, images, alignement, surlignage, indice/exposant, `textStyle`, tâches). Pour un schéma étendu par tes propres extensions, donne plutôt `editor.getHTML()` à `exportDocx`.

### Options (`DocxExportOptions`)

| Champ              | Type                                                      | Défaut            | Rôle                                                                                                                                       |
| ------------------ | --------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `parse`            | `HtmlParser`                                              | `new DOMParser()` | Parseur HTML injectable, jamais le `document` global (SSR, tests).                                                                         |
| `fetchImage`       | `(src: string) => Promise<ArrayBuffer\|null>`             | —                 | Récupère les octets d'une image `http(s)://`. Sans hook, seules les data URL sont embarquées, les autres sont ignorées avec avertissement. |
| `title`            | `string`                                                  | —                 | Titre inscrit dans les propriétés du document.                                                                                             |
| `creator`          | `string`                                                  | —                 | Auteur inscrit dans les propriétés du document.                                                                                            |
| `pageSize`         | `'A4' \| 'LETTER'`                                        | `'A4'`            | Format de page, marges de 2,54 cm. `page.size` prime.                                                                                      |
| `page`             | `DocxPageOptions`                                         | —                 | `size`, `orientation` (`portrait`/`landscape`), `margins` en mm (`top`, `right`, `bottom`, `left`, 25,4 mm par défaut).                    |
| `lang`             | `string`                                                  | —                 | Langue du document (`w:lang`, ex. `fr-FR`) pour le correcteur de Word.                                                                     |
| `defaultFont`      | `{ family?, sizePt? }`                                    | —                 | Police et taille du texte courant (`docDefaults`).                                                                                         |
| `variables`        | `DocxExportVariableOptions`                               | `placeholders`    | Rendu des variables : `mode` (`placeholders`/`resolve`/`fields`), `values`, `pattern`. Voir [Variables à l'export](#variables-à-lexport).  |
| `header`           | `string \| DocxHeaderOptions`                             | —                 | En-tête : `text` brut ou `html` inline (gras, liens, variables), `align`.                                                                  |
| `footer`           | `string \| DocxFooterOptions`                             | —                 | Pied de page : idem, plus `pageNumbers: true` (`PAGE`) ou `'x-of-y'` (`PAGE / NUMPAGES`).                                                  |
| `toc`              | `boolean \| { title?, levels? }`                          | —                 | Table des matières en tête du corps, 3 niveaux par défaut. Word propose de la mettre à jour à l'ouverture.                                 |
| `numberedHeadings` | `boolean \| { levels?, format? }`                         | —                 | Numérotation `1.`, `1.1.`… (`decimal`) ou `1`, `1.1` (`legal`) liée aux styles `Heading 1..n`, 3 niveaux par défaut.                       |
| `headingStyles`    | `{ h1?: { color?, sizePt?, bold?, italics?, font? }, … }` | —                 | Surcharges des styles de titres ; sans option, les titres restent ceux de Word.                                                            |
| `onWarning`        | `(warning: DocxExportWarning) => void`                    | —                 | Reçoit chaque avertissement au fil de la conversion.                                                                                       |

### Codes d'avertissement (`DocxExportWarningCode`)

| Code                  | Sens                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `image-skipped`       | Image ignorée : URL distante sans `fetchImage`, hook en échec ou `null`, data URL illisible, format non raster (SVG, WebP). |
| `unsupported-element` | `iframe`, `video`, `audio`, `canvas`, `svg`, `form`… sans équivalent Word, ignorés.                                         |
| `variable-unresolved` | Mode `resolve` : variable sans valeur dans `values`, laissée en `{{nom}}`.                                                  |
| `footnote-missing`    | `<sup data-footnote-ref="n">` sans note `n` dans la liste `data-footnotes`, laissé en exposant.                             |

`DocxWarning<Code>` est le type générique commun : `DocxImportWarning` et `DocxExportWarning` en sont deux spécialisations structurellement compatibles.

### Mapping HTML → Word

| HTML                                                                               | Word                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `h1`..`h6`                                                                         | Styles `Heading 1`..`Heading 6`                                                                                                                                                                                                                                            |
| `p`, `text-align`                                                                  | Paragraphe, alignement `center`/`right`/`justify` (`left` est le défaut)                                                                                                                                                                                                   |
| `strong`/`b`, `em`/`i`, `u`, `s`                                                   | Gras, italique, souligné, barré (aussi lus depuis `font-weight`, `font-style`, `text-decoration`)                                                                                                                                                                          |
| `sub`, `sup`                                                                       | Indice, exposant                                                                                                                                                                                                                                                           |
| `code`, `kbd`, `samp`                                                              | Style de caractère `Code`, police Consolas                                                                                                                                                                                                                                 |
| `mark`, `background-color`                                                         | Surlignage jaune                                                                                                                                                                                                                                                           |
| `span style="color / font-family / font-size"`                                     | Couleur (`#hex`, `rgb()` en nombres ou `%`, `hsl()`, noms courants), police, taille (`px`, `pt`, `em`, `rem`, `%` et mots-clés `small`, `large`… relatifs à 11 pt)                                                                                                         |
| `a href`                                                                           | Lien externe (`http`, `https`, `mailto`, `tel`, `ftp` ; autres schémas → texte simple). Espaces, `\|` et non-ASCII sont percent-encodés dans la cible, les `%xx` existants conservés.                                                                                      |
| `ul`, `ol`, `ol type="a/A/i/I"`, `ol start`                                        | Numérotation Word sur 9 niveaux : puces, décimal, lettres, romains. Chaque liste (racine ou imbriquée) a sa propre numérotation et repart à 1, ou au `start` de l'`<ol>`. Le premier bloc d'un `li` porte la puce.                                                         |
| `blockquote`                                                                       | Style de paragraphe `Quote` (italique, indenté)                                                                                                                                                                                                                            |
| `pre`                                                                              | Une ligne = un paragraphe de style `HTML Preformatted` (Consolas)                                                                                                                                                                                                          |
| `hr`                                                                               | Paragraphe vide à bordure basse                                                                                                                                                                                                                                            |
| `br`                                                                               | Saut de ligne. Les `<br>` terminaux d'un paragraphe qui a d'autre contenu sont ignorés, comme en HTML (`<p><br></p>` garde le sien).                                                                                                                                       |
| `img`                                                                              | Image inline PNG/JPEG/GIF/BMP, dimensions lues dans `width`/`height` ou l'en-tête du fichier, plafonnées à la largeur de page                                                                                                                                              |
| `table`, `thead`, `th`, `colspan`, `rowspan`                                       | Table 100 % avec bordures, lignes d'en-tête marquées (`thead` ou ligne entièrement en `th`) et en gras, fusions horizontales et verticales                                                                                                                                 |
| `div`, `section`, `article`…                                                       | Traversés ; les inline nus deviennent des paragraphes                                                                                                                                                                                                                      |
| `td colwidth`, `style="width"`, `col`                                              | Largeurs de colonnes en DXA (1 px = 15 twips) : grille `w:tblGrid` + `w:tcW` par cellule et disposition fixe quand toutes les colonnes sont connues (réduites à l'échelle si la table déborde de la page) ; sinon table à 100 % et largeur sur les seules cellules connues |
| `div data-page-break`, `hr data-page-break`                                        | Saut de page (`w:br w:type="page"`)                                                                                                                                                                                                                                        |
| `p style="page-break-before: always"` / `break-before: page` / `p data-page-break` | Paragraphe avec `w:pageBreakBefore` (titres compris)                                                                                                                                                                                                                       |
| `span data-aster-variable`, `{{nom}}`                                              | Variable : texte, valeur ou champ `MERGEFIELD` selon `options.variables.mode`. Voir [Variables à l'export](#variables-à-lexport)                                                                                                                                           |
| `sup data-footnote-ref="n"`, `sup>[n]` + `ol data-footnotes > li data-footnote`    | Vraie note de bas de page Word (`footnotes.xml`, style `Footnote Text`), appel `w:footnoteReference`, liste retirée du corps                                                                                                                                               |

Les styles `Quote`, `HTML Preformatted` et `Code` portent les noms que la style map d'`importDocx` reconnaît : un aller-retour `exportDocx` → `importDocx` restitue titres, marques, lien, listes imbriquées, citation, bloc de code, image et table. Les alignements, couleurs et polices ne survivent pas à l'import (mammoth les jette volontairement).

Le texte est assaini avant d'entrer dans le XML : les caractères de contrôle que XML 1.0 interdit (U+0000-U+0008, U+000B, U+000C, U+000E-U+001F) et les non-caractères U+FFFE/U+FFFF sont retirés des runs, des `alt`/`title` d'image, des `href` et des propriétés `title`/`creator`. Sans ça, Word refuse d'ouvrir le fichier. Tabulations, sauts de ligne, espaces insécables et Unicode étendu sont conservés tels quels ; seuls les blancs HTML (espace, tabulation, LF, CR, FF) sont réduits selon les règles du HTML.

### Variables à l'export

Convention du core : `<span data-aster-variable="nom" data-label="Nom">{{nom}}</span>`. Un `{{nom}}` en texte brut (sans span) est aussi reconnu en modes `fields` et `resolve`, via `variables.pattern` (groupe 1 = nom ; par défaut `{{nom}}`, nom en lettres, chiffres, `_`, `.`, `-`, blancs tolérés). Les blocs `<pre>` et marques `<code>` ne sont jamais analysés.

| `variables.mode`        | Rendu dans Word                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placeholders` (défaut) | Texte `{{nom}}` tel quel, marques conservées.                                                                                                                                                                                                               |
| `resolve`               | Valeur de `values[nom]`, marques du span et de son contexte conservées. Sans valeur : `{{nom}}` + avertissement `variable-unresolved`.                                                                                                                      |
| `fields`                | Champ de fusion `w:fldSimple w:instr=" MERGEFIELD nom "`. Résultat du champ : la valeur connue, sinon `«nom»`. `importDocx` relit ces champs en variables. `fldSimple` ne porte pas de propriétés de run : les marques du span ne survivent pas en ce mode. |

```ts
await exportDocx(editor.getHTML(), {
  variables: { mode: 'fields', values: { nom: 'ACME' } },
});
```

### En-têtes, pieds de page, table des matières, notes

- **En-tête / pied** : `header: 'Confidentiel'` ou `{ html: '<strong>Nebula</strong> {{client}}', align: 'right' }`. Le HTML passe par le convertisseur du corps (marques, liens, variables, plusieurs paragraphes) ; `align` s'applique aux paragraphes sans `text-align` propre. `footer.pageNumbers: 'x-of-y'` ajoute un dernier paragraphe `PAGE / NUMPAGES`, centré sauf `align`. Une option vide n'émet rien.
- **Table des matières** : `toc: { title: 'Sommaire', levels: 2 }` insère le titre (style `TOC Heading`, hors des niveaux de titre) et le champ `TOC \h \o "1-2"`, **prérempli** avec les titres du document (entrées cliquables). Les numéros de page sont calculés par Word : le fichier porte `w:updateFields`, Word demande à l'ouverture « Ce document contient des champs… mettre à jour ? » — répondre Oui. LibreOffice met le champ à jour sans demander.
- **Notes de bas de page** : le format produit par `importDocx` (`<sup>[1]</sup>` + `<ol data-footnotes><li data-footnote="footnote-1">`) redevient de vraies notes Word ; `<sup data-footnote-ref="1">` est aussi accepté, et un `<li>` sans `data-footnote` est désigné par sa position. L'aller-retour `exportDocx` → `importDocx` restitue le même HTML.
- **Numérotation des titres** : `numberedHeadings: true` lie une numérotation à `Heading 1..3` (`w:pStyle` dans `numbering.xml`, `w:numPr` dans le style) : Word numérote les titres existants et ceux ajoutés ensuite, la table des matières reprend les numéros. `format: 'legal'` supprime le point final (`1`, `1.1`).
- **Mise en page** : `page: { orientation: 'landscape', margins: { top: 20, bottom: 20, left: 15, right: 15 } }`. Les images et les tables sont plafonnées à la largeur utile résultante.

#### Limites connues de l'export

- **Liste dans une citation** : exportée fidèlement (paragraphes de style `Quote` numérotés, lisibles dans Word), mais **dégradée à la réimportation** par mammoth, qui suit le style et jette la numérotation : `<blockquote><ul><li>a</li></ul></blockquote>` revient en `<blockquote><p>a</p></blockquote>`.
- **`li` multi-paragraphes avec sous-liste** : export Word standard (seul le premier paragraphe porte la puce, les suivants sont indentés). À la **réimportation**, mammoth sort les paragraphes non numérotés de la liste et la coupe en listes sœurs : `<ul><li><p>a</p><p>b</p><ul><li><p>c</p></li></ul></li></ul>` revient en `<ul><li><p>a</p></li></ul><p>b</p><ul><li><p></p><ul><li><p>c</p></li></ul></li></ul>`.
- **`<ol start>`** : écrit dans `numbering.xml` (`w:start` et `startOverride`), honoré par Word, mais **non relu par mammoth** : l'aller-retour rend un `<ol>` sans `start`.
- **Bloc dans un inline** (`<span><div>…</div></span>`) : le bloc ne peut plus devenir un paragraphe, son texte est isolé par des sauts de ligne dans le paragraphe courant.
- **Champs de fusion sans marques** : en mode `fields`, `w:fldSimple` n'accepte pas de propriétés de run, un `<strong><span data-aster-variable>` perd son gras. Utilise `resolve` quand la mise en forme compte plus que le champ.
- **Table des matières à mettre à jour** : les numéros de page ne sont jamais écrits par l'export, Word les calcule à l'ouverture après confirmation.
- **Numérotation des titres non relue** : `importDocx` (mammoth) jette les numéros automatiques, un aller-retour rend des titres sans `1.`.
- **En-têtes, pieds et notes à la réimportation** : mammoth ignore les en-têtes et pieds de page ; les notes reviennent via `data-footnotes` comme pour tout .docx.
- **Largeurs de colonnes** : le `colwidth` Tiptap est en pixels d'écran (1 px = 15 twips) ; une table plus large que la zone de texte est réduite proportionnellement. Les largeurs en `%` sont ignorées.

Les trois premières dégradations sont figées par des tests d'aller-retour (`export/lists.spec.ts`, cas X-3, M-1 et M-2 des revues) et la quatrième par `export/html-to-docx.spec.ts` (M-5), pour qu'une régression soit visible.

### Exemple avec un bouton

```ts
import { createAster } from '@aster-editor/ui';
import { downloadDocx, exportDocx } from '@aster-editor/word';

const { editor } = createAster(document.querySelector<HTMLElement>('#editor')!);

document.querySelector('#export')?.addEventListener('click', async () => {
  const blob = await exportDocx(editor.getHTML(), {
    title: 'Compte rendu',
    creator: 'Aster',
    fetchImage: async (src) => {
      const response = await fetch(src);
      return response.ok ? response.arrayBuffer() : null;
    },
    onWarning: (warning) => console.warn(`[${warning.code}] ${warning.message}`),
  });
  downloadDocx(blob, 'compte-rendu');
});
```

`downloadDocx` crée un `<a download rel="noopener">` éphémère et révoque l'URL objet juste après le clic ; le nom reçoit `.docx` s'il ne l'a pas et ses caractères interdits (`\ / : * ? " < > |`) sont remplacés par `-`, `document.docx` par défaut. À appeler depuis un gestionnaire d'événement utilisateur. Hors navigateur (SSR, Node), la fonction lève : envoie plutôt les octets, `Buffer.from(await blob.arrayBuffer())`.

Un `exportDocx` sans `DOMParser` global ni `options.parse` lève aussi une erreur explicite, et une entrée qui n'est ni chaîne ni objet est refusée avant tout chargement de `docx`.

## ⚠️ Limites connues

- **Pas de fidélité de mise en page** : colonnes, en-têtes et pieds de page, sauts de page, polices exactes, tailles et interlignes sont volontairement jetés. L'objectif est de préserver l'intention (structure, emphase), pas le rendu au pixel.
- **Images collées depuis Word sous Windows** : le presse-papier référence des fichiers locaux (`file:///C:/Users/…/clip_image001.png`). Le navigateur ne peut pas les lire, la politique de liens du core rejette `file:` et l'image est perdue. Passe par l'import `.docx` ou par un glisser-déposer du fichier image.
- **Formes, zones de texte, SmartArt, équations** : contenu VML/DrawingML non converti. Le texte des zones de texte peut survivre, pas la mise en page.
- **Numérotation reprise** : une liste Word qui « continue » une liste précédente arrive avec `start`, mais la reprise exacte dépend de ce que Word a sérialisé.
- **Notes de bas de page** : conservées dans `html` via `data-footnotes` / `data-footnote`, mais le schéma Tiptap ne garde pas ces attributs après `setHTML` ; seule la liste finale et les appels `[1]` restent.
- **Styles custom** : un style de paragraphe inconnu remonte en avertissement `mammoth` et devient un `<p>`. Ajoute une règle dans `styleMap` pour le mapper.
- **Google Docs** : les `li` gardent leur `<p>` ; les couleurs et tailles posées par Google sont jetées comme pour Word.
- **Aller-retour export → import** : une liste dans une citation, un `li` multi-paragraphes avec sous-liste et `<ol start>` sont exportés fidèlement pour Word mais dégradés par mammoth à la réimportation. Détail et HTML obtenu dans [Limites connues de l'export](#limites-connues-de-lexport).

## ⚖️ Poids de mammoth et de docx, import dynamique

mammoth pèse environ **660 kB non minifié**, la lib `docx` environ **1,3 MB**. `importDocx` charge mammoth via `await import('mammoth')` au premier appel et `exportDocx` fait de même pour `docx` : ni l'un ni l'autre n'entre dans le bundle initial si ton bundler suit le code-splitting (esbuild, Vite, Angular CLI le font). Pour aller plus loin, importe aussi le paquet à la demande :

```ts
async function loadDocx(file: File): Promise<string> {
  const { importDocx } = await import('@aster-editor/word');
  return (await importDocx(file)).html;
}
```

`wordPasteTransformer`, `normalizeWordHtml`, `normalizeGoogleDocsHtml`, `jsonToHtml` et `downloadDocx` n'ont **aucune dépendance** à mammoth ni à `docx` : les importer statiquement ne coûte que leur propre code. Sur `ng serve`, le tout premier `importDocx` ou `exportDocx` d'une session peut recharger la page : l'optimiseur de dépendances de Vite découvre mammoth ou `docx` à ce moment-là (voir le [guide d'intégration](../../docs/GUIDE_INTEGRATION.md)).

## 🧾 Exports

`importDocx`, `exportDocx`, `downloadDocx`, `jsonToHtml`, `DOCX_MIME_TYPE`, `normalizeWordHtml`, `normalizeGoogleDocsHtml`, `isWordHtml`, `isGoogleDocsHtml`, `wordPasteTransformer`, et les types `DocxInput`, `DocxImportOptions`, `DocxImportResult`, `DocxImportWarning`, `DocxImportWarningCode`, `DocxExportInput`, `DocxExportOptions`, `DocxExportWarning`, `DocxExportWarningCode`, `DocxImageFetcher`, `DocxPageSize`, `DocxWarning`, `HtmlParser`, `WordPasteOptions`, `ListLevelFormat`, `DocxVariableOptions`, `VariableDetection`, `PasteVariableOptions`.
