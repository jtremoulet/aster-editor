# 📄 @aster-editor/word

> Import et export `.docx`, nettoyage du collage depuis Word et Google Docs pour Aster Editor. Produit du HTML sémantique que le schéma ProseMirror accepte tel quel, et un fichier Word depuis ce même HTML.

## 📦 Installation

```bash
npm install @aster-editor/word
```

Peer dependency : `@aster-editor/core`. Dépendance embarquée : `mammoth` (BSD-2), chargé en **import dynamique** uniquement quand `importDocx` est appelé.

## 📥 `importDocx`

```ts
function importDocx(
  input: File | ArrayBuffer | ArrayBufferView,
  options?: DocxImportOptions,
): Promise<DocxImportResult>;
```

Convertit un `.docx` en HTML prêt pour `editor.setHTML` ou `editor.insertHTML`. L'entrée (`DocxInput`) est un `File`, un `ArrayBuffer` ou une vue typée (`Uint8Array`, `Buffer` Node) dont seule la fenêtre `byteOffset`/`byteLength` est lue. Ne lève jamais pour un document Word valide : ce qui n'est pas converti fidèlement remonte dans `warnings`. Rejette une erreur nommée `DocxImportError` (message préfixé `invalid-docx:`) si l'entrée n'est pas de l'un de ces types (`null`, chaîne, objet quelconque), n'est pas une archive zip, ne peut pas être lue (`arrayBuffer()` qui rejette) ou si mammoth ne peut pas la décoder.

### Options (`DocxImportOptions`)

| Champ       | Type                | Défaut            | Rôle                                                                                                                                                        |
| ----------- | ------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload`    | `UploadHandler`     | —                 | Hook `(file: File) => Promise<string>` appelé pour chaque image embarquée. Sans hook : data URL base64.                                                     |
| `footnotes` | `boolean`           | `true`            | Conserver les notes de bas de page et de fin en liste finale. `false` les supprime avec un avertissement.                                                   |
| `styleMap`  | `readonly string[]` | `[]`              | Règles mammoth additionnelles (`p[style-name='X'] => h2:fresh`), ajoutées **après** celles d'Aster, qui restent prioritaires. Lignes vides et `#` ignorées. |
| `parse`     | `HtmlParser`        | `new DOMParser()` | Parseur HTML injectable (`{ parseFromString(html, 'text/html'): Document }`) pour SSR ou tests.                                                             |

### Résultat (`DocxImportResult`)

| Champ      | Type                           | Rôle                                         |
| ---------- | ------------------------------ | -------------------------------------------- |
| `html`     | `string`                       | HTML sémantique, `body.innerHTML`.           |
| `warnings` | `readonly DocxImportWarning[]` | `{ code, message }`, vide si tout est passé. |

### Codes d'avertissement (`DocxImportWarningCode`)

| Code                  | Sens                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `mammoth`             | Message mammoth remonté tel quel (`warning: Unrecognised paragraph style…`, image illisible).           |
| `image-upload-failed` | Le hook `upload` a rejeté ou résolu autre chose qu'une chaîne non vide ; l'image est repliée en base64. |
| `footnotes-dropped`   | Des notes existaient et `footnotes: false` les a supprimées.                                            |
| `unsupported-style`   | Réservé aux post-traitements : élément non converti fidèlement.                                         |

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
- Paragraphes vides supprimés.

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

Les deux normaliseurs sont aussi une barrière : balises actives supprimées avec leur contenu (`script`, `iframe`, `object`, `embed`, `form`, `template`, `noscript`, `frame`, `svg`, `math`, `meta`, `style`), tout attribut `on*` jeté, liens limités aux schémas `http`, `https`, `mailto`, `tel` (les autres sont déballés en texte), images limitées à `http(s)`, `data`, `blob`, `file` et relatif, valeur de `color` validée avant conservation. Le core applique ensuite sa propre politique de liens à l'insertion.

### Options (`WordPasteOptions`)

| Champ           | Type                         | Défaut      | Rôle                                                                                        |
| --------------- | ---------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `keepColors`    | `boolean`                    | `false`     | Conserver `color` explicite. Jamais le noir / `windowtext` par défaut, jamais dans un lien. |
| `keepAlignment` | `boolean`                    | `true`      | Conserver `text-align` (`center`, `right`, `justify` ; `left` est le défaut et tombe).      |
| `parse`         | `(html: string) => Document` | `DOMParser` | Parseur injectable pour tests ou environnement sans DOM.                                    |

### Les 8 passes Word, dans l'ordre

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

Le pipeline Google Docs est plus court : passes 1, 2, puis déballage du `<b style="font-weight:normal" id="docs-internal-guid-…">`, réimbrication des sous-listes (`<ul><li>a</li><ul>…</ul></ul>` → dans le `li`), remontée du `list-style-type` des `<li>` (`lower-alpha`, `upper-alpha`, `lower-roman`, `upper-roman`) en attribut `type` du `<ol>`, passe 5, déballage du `<div>` nu que Google pose autour de chaque table, puis passes 6 à 8.

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

| Champ        | Type                                          | Défaut            | Rôle                                                                                                                                       |
| ------------ | --------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `parse`      | `HtmlParser`                                  | `new DOMParser()` | Parseur HTML injectable, jamais le `document` global (SSR, tests).                                                                         |
| `fetchImage` | `(src: string) => Promise<ArrayBuffer\|null>` | —                 | Récupère les octets d'une image `http(s)://`. Sans hook, seules les data URL sont embarquées, les autres sont ignorées avec avertissement. |
| `title`      | `string`                                      | —                 | Titre inscrit dans les propriétés du document.                                                                                             |
| `creator`    | `string`                                      | —                 | Auteur inscrit dans les propriétés du document.                                                                                            |
| `pageSize`   | `'A4' \| 'LETTER'`                            | `'A4'`            | Format de page, marges de 2,54 cm.                                                                                                         |
| `onWarning`  | `(warning: DocxExportWarning) => void`        | —                 | Reçoit chaque avertissement au fil de la conversion.                                                                                       |

### Codes d'avertissement (`DocxExportWarningCode`)

| Code                  | Sens                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `image-skipped`       | Image ignorée : URL distante sans `fetchImage`, hook en échec ou `null`, data URL illisible, format non raster (SVG, WebP). |
| `unsupported-element` | `iframe`, `video`, `audio`, `canvas`, `svg`, `form`… sans équivalent Word, ignorés.                                         |

`DocxWarning<Code>` est le type générique commun : `DocxImportWarning` et `DocxExportWarning` en sont deux spécialisations structurellement compatibles.

### Mapping HTML → Word

| HTML                                           | Word                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `h1`..`h6`                                     | Styles `Heading 1`..`Heading 6`                                                                                                                                                                                    |
| `p`, `text-align`                              | Paragraphe, alignement `center`/`right`/`justify` (`left` est le défaut)                                                                                                                                           |
| `strong`/`b`, `em`/`i`, `u`, `s`               | Gras, italique, souligné, barré (aussi lus depuis `font-weight`, `font-style`, `text-decoration`)                                                                                                                  |
| `sub`, `sup`                                   | Indice, exposant                                                                                                                                                                                                   |
| `code`, `kbd`, `samp`                          | Style de caractère `Code`, police Consolas                                                                                                                                                                         |
| `mark`, `background-color`                     | Surlignage jaune                                                                                                                                                                                                   |
| `span style="color / font-family / font-size"` | Couleur (`#hex`, `rgb()` en nombres ou `%`, `hsl()`, noms courants), police, taille (`px`, `pt`, `em`, `rem`, `%` et mots-clés `small`, `large`… relatifs à 11 pt)                                                 |
| `a href`                                       | Lien externe (`http`, `https`, `mailto`, `tel`, `ftp` ; autres schémas → texte simple). Espaces, `\|` et non-ASCII sont percent-encodés dans la cible, les `%xx` existants conservés.                              |
| `ul`, `ol`, `ol type="a/A/i/I"`, `ol start`    | Numérotation Word sur 9 niveaux : puces, décimal, lettres, romains. Chaque liste (racine ou imbriquée) a sa propre numérotation et repart à 1, ou au `start` de l'`<ol>`. Le premier bloc d'un `li` porte la puce. |
| `blockquote`                                   | Style de paragraphe `Quote` (italique, indenté)                                                                                                                                                                    |
| `pre`                                          | Une ligne = un paragraphe de style `HTML Preformatted` (Consolas)                                                                                                                                                  |
| `hr`                                           | Paragraphe vide à bordure basse                                                                                                                                                                                    |
| `br`                                           | Saut de ligne. Les `<br>` terminaux d'un paragraphe qui a d'autre contenu sont ignorés, comme en HTML (`<p><br></p>` garde le sien).                                                                               |
| `img`                                          | Image inline PNG/JPEG/GIF/BMP, dimensions lues dans `width`/`height` ou l'en-tête du fichier, plafonnées à la largeur de page                                                                                      |
| `table`, `thead`, `th`, `colspan`, `rowspan`   | Table 100 % avec bordures, lignes d'en-tête marquées (`thead` ou ligne entièrement en `th`) et en gras, fusions horizontales et verticales                                                                         |
| `div`, `section`, `article`…                   | Traversés ; les inline nus deviennent des paragraphes                                                                                                                                                              |

Les styles `Quote`, `HTML Preformatted` et `Code` portent les noms que la style map d'`importDocx` reconnaît : un aller-retour `exportDocx` → `importDocx` restitue titres, marques, lien, listes imbriquées, citation, bloc de code, image et table. Les alignements, couleurs et polices ne survivent pas à l'import (mammoth les jette volontairement).

Le texte est assaini avant d'entrer dans le XML : les caractères de contrôle que XML 1.0 interdit (U+0000-U+0008, U+000B, U+000C, U+000E-U+001F) et les non-caractères U+FFFE/U+FFFF sont retirés des runs, des `alt`/`title` d'image, des `href` et des propriétés `title`/`creator`. Sans ça, Word refuse d'ouvrir le fichier. Tabulations, sauts de ligne, espaces insécables et Unicode étendu sont conservés tels quels ; seuls les blancs HTML (espace, tabulation, LF, CR, FF) sont réduits selon les règles du HTML.

#### Limites connues de l'export

- **Liste dans une citation** : exportée fidèlement (paragraphes de style `Quote` numérotés, lisibles dans Word), mais **dégradée à la réimportation** par mammoth, qui suit le style et jette la numérotation : `<blockquote><ul><li>a</li></ul></blockquote>` revient en `<blockquote><p>a</p></blockquote>`.
- **`li` multi-paragraphes avec sous-liste** : export Word standard (seul le premier paragraphe porte la puce, les suivants sont indentés). À la **réimportation**, mammoth sort les paragraphes non numérotés de la liste et la coupe en listes sœurs : `<ul><li><p>a</p><p>b</p><ul><li><p>c</p></li></ul></li></ul>` revient en `<ul><li><p>a</p></li></ul><p>b</p><ul><li><p></p><ul><li><p>c</p></li></ul></li></ul>`.
- **`<ol start>`** : écrit dans `numbering.xml` (`w:start` et `startOverride`), honoré par Word, mais **non relu par mammoth** : l'aller-retour rend un `<ol>` sans `start`.
- **Bloc dans un inline** (`<span><div>…</div></span>`) : le bloc ne peut plus devenir un paragraphe, son texte est isolé par des sauts de ligne dans le paragraphe courant.

Ces trois dégradations sont figées par des tests d'aller-retour (`lists.spec.ts`) pour qu'une régression soit visible.

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

`downloadDocx` crée un `<a download>` éphémère et révoque l'URL objet après le clic ; à appeler depuis un gestionnaire d'événement utilisateur. Hors navigateur (SSR, Node), envoie plutôt les octets : `Buffer.from(await blob.arrayBuffer())`.

## ⚠️ Limites connues

- **Pas de fidélité de mise en page** : colonnes, en-têtes et pieds de page, sauts de page, polices exactes, tailles et interlignes sont volontairement jetés. L'objectif est de préserver l'intention (structure, emphase), pas le rendu au pixel.
- **Images collées depuis Word sous Windows** : le presse-papier référence des fichiers locaux (`file:///C:/Users/…/clip_image001.png`). Le navigateur ne peut pas les lire, la politique de liens du core rejette `file:` et l'image est perdue. Passe par l'import `.docx` ou par un glisser-déposer du fichier image.
- **Formes, zones de texte, SmartArt, équations** : contenu VML/DrawingML non converti. Le texte des zones de texte peut survivre, pas la mise en page.
- **Numérotation reprise** : une liste Word qui « continue » une liste précédente arrive avec `start`, mais la reprise exacte dépend de ce que Word a sérialisé.
- **Notes de bas de page** : conservées dans `html` via `data-footnotes` / `data-footnote`, mais le schéma Tiptap ne garde pas ces attributs après `setHTML` ; seule la liste finale et les appels `[1]` restent.
- **Styles custom** : un style de paragraphe inconnu remonte en avertissement `mammoth` et devient un `<p>`. Ajoute une règle dans `styleMap` pour le mapper.
- **Google Docs** : les `li` gardent leur `<p>` ; les couleurs et tailles posées par Google sont jetées comme pour Word.
- **Aller-retour export → import** : une liste dans une citation, un `li` multi-paragraphes avec sous-liste et `<ol start>` sont exportés fidèlement pour Word mais dégradés par mammoth à la réimportation. Détail et HTML obtenu dans [Limites connues de l'export](#limites-connues-de-lexport).

## ⚖️ Poids de mammoth et import dynamique

mammoth pèse environ **660 kB non minifié**. `importDocx` le charge via `await import('mammoth')` au premier appel : il n'entre dans le bundle initial que si ton bundler suit le code-splitting (esbuild, Vite, Angular CLI le font). Pour aller plus loin, importe aussi le paquet à la demande :

```ts
async function loadDocx(file: File): Promise<string> {
  const { importDocx } = await import('@aster-editor/word');
  return (await importDocx(file)).html;
}
```

`wordPasteTransformer`, `normalizeWordHtml` et `normalizeGoogleDocsHtml` n'ont **aucune dépendance** à mammoth : les importer statiquement ne coûte que le code du normaliseur.

## 🧾 Exports

`importDocx`, `exportDocx`, `downloadDocx`, `jsonToHtml`, `DOCX_MIME_TYPE`, `normalizeWordHtml`, `normalizeGoogleDocsHtml`, `isWordHtml`, `isGoogleDocsHtml`, `wordPasteTransformer`, et les types `DocxInput`, `DocxImportOptions`, `DocxImportResult`, `DocxImportWarning`, `DocxImportWarningCode`, `DocxExportInput`, `DocxExportOptions`, `DocxExportWarning`, `DocxExportWarningCode`, `DocxImageFetcher`, `DocxPageSize`, `DocxWarning`, `HtmlParser`, `WordPasteOptions`, `ListLevelFormat`.
