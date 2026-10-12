# 📄 @aster-editor/word

> Import `.docx` et nettoyage du collage depuis Word et Google Docs pour Aster Editor. Produit du HTML sémantique que le schéma ProseMirror accepte tel quel.

## 📦 Installation

```bash
npm install @aster-editor/word
```

Peer dependency : `@aster-editor/core`. Dépendance embarquée : `mammoth` (BSD-2), chargé en **import dynamique** uniquement quand `importDocx` est appelé.

## 📥 `importDocx`

```ts
function importDocx(
  input: File | ArrayBuffer,
  options?: DocxImportOptions,
): Promise<DocxImportResult>;
```

Convertit un `.docx` en HTML prêt pour `editor.setHTML` ou `editor.insertHTML`. Ne lève jamais pour un document Word valide : ce qui n'est pas converti fidèlement remonte dans `warnings`. Rejette une erreur nommée `DocxImportError` (message préfixé `invalid-docx:`) si l'entrée n'est pas une archive zip ou si mammoth ne peut pas la lire.

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

| Code                  | Sens                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `mammoth`             | Message mammoth remonté tel quel (`warning: Unrecognised paragraph style…`, image illisible). |
| `image-upload-failed` | Le hook `upload` a rejeté ; l'image est repliée en base64.                                    |
| `footnotes-dropped`   | Des notes existaient et `footnotes: false` les a supprimées.                                  |
| `unsupported-style`   | Réservé aux post-traitements : élément non converti fidèlement.                               |

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

Avec un `ArrayBuffer` (fetch, Node, test) : `await importDocx(await response.arrayBuffer())`.

## 🧹 `normalizeWordHtml` et `normalizeGoogleDocsHtml`

```ts
function normalizeWordHtml(html: string, options?: WordPasteOptions): string;
function normalizeGoogleDocsHtml(html: string, options?: WordPasteOptions): string;
function isWordHtml(html: string): boolean;
function isGoogleDocsHtml(html: string): boolean;
```

Fonctions **pures** : elles parsent le HTML dans un `Document` neuf, ne touchent jamais au `document` global et renvoient `body.innerHTML` nettoyé. Chaîne vide → chaîne vide. Le fragment réellement copié est isolé entre `<!--StartFragment-->` et `<!--EndFragment-->` quand les marqueurs existent.

### Options (`WordPasteOptions`)

| Champ           | Type                         | Défaut      | Rôle                                                                                        |
| --------------- | ---------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `keepColors`    | `boolean`                    | `false`     | Conserver `color` explicite. Jamais le noir / `windowtext` par défaut, jamais dans un lien. |
| `keepAlignment` | `boolean`                    | `true`      | Conserver `text-align` (`center`, `right`, `justify` ; `left` est le défaut et tombe).      |
| `parse`         | `(html: string) => Document` | `DOMParser` | Parseur injectable pour tests ou environnement sans DOM.                                    |

### Les 8 passes Word, dans l'ordre

| #   | Passe                      | Ce qu'elle fait                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `stripConditionalComments` | Avant parsing : jette `<!--[if gte mso 9]>…<![endif]-->` (XML de réglages, VML) et les marqueurs `<![if !supportLists]>`. Après parsing : supprime tous les nœuds commentaire.                                                                                                                                                                                                                                                                                 |
| 2   | `stripOfficeNamespaces`    | Supprime `<xml>`, `<style>`, `<script>`, `<meta>`, `<link>`, `<title>`, `<head>` ; déballe les balises préfixées `<o:p>`, `<w:*>`, `<v:*>`, `<m:*>` en gardant leur texte.                                                                                                                                                                                                                                                                                     |
| 3   | `rebuildLists`             | Lit `mso-list:lX levelN lfoM` sur les paragraphes et `@list lX:levelN { mso-level-number-format }` dans le `<style>`, reconstruit `<ul>`/`<ol>` imbriqués, pose `type` (`a`, `A`, `i`, `I`) et `start`. Sans feuille de style, décide puce / numéro via le texte du marqueur. Chaque instance `lfo` est une liste distincte.                                                                                                                                   |
| 4   | `normalizeHeadings`        | `MsoTitle` → `h1`, `MsoHeading1..6` → `h1..h6` (plafonné à 6), `MsoQuote` / `MsoIntenseQuote` → `blockquote` fusionnés.                                                                                                                                                                                                                                                                                                                                        |
| 5   | `cleanInlineStyles`        | Jette `mso-*`, polices, tailles, interlignes, marges, fonds, `class`, `lang` ; traduit `font-weight:bold` → `strong`, `font-style:italic` → `em`, `underline` → `u`, `line-through` → `s`, `vertical-align` → `sub`/`sup`, `mso-highlight` → `mark` ; renomme `b`/`i`/`strike`/`del`/`ins` ; ne garde que `href`/`title`/`target`/`rel` sur `a`, `src`/`alt`/`title`/`width`/`height` sur `img`, `start`/`type` sur `ol` ; déballe les `span` et `font` vides. |
| 6   | `normalizeTables`          | Retire `border`, `cellspacing`, `width`, `valign`, styles ; garde `colspan`/`rowspan` > 1 ; `mso-yfti-firstrow:yes` ou première ligne toute en gras → `<thead><th>` ; déballe le `<p>` unique des cellules. Une table à une ligne n'a pas d'en-tête.                                                                                                                                                                                                           |
| 7   | `collapseEmptyParagraphs`  | Supprime `<p>&nbsp;</p>`, `<p><br></p>`, les `<br>` en fin de bloc et les `<br>` orphelins. Garde un `<p></p>` si tout se vide.                                                                                                                                                                                                                                                                                                                                |
| 8   | `normalizeWhitespace`      | `&nbsp;` entre mots → espace, suites d'espaces réduites, trim en début et fin de bloc, espaces de bord sortis des marks (`<em>a</em><u> b</u>` → `<em>a</em> <u>b</u>`), blancs d'indentation entre blocs supprimés. `<pre>` intact.                                                                                                                                                                                                                           |

Le pipeline Google Docs est plus court : passes 1, 2, puis déballage du `<b style="font-weight:normal" id="docs-internal-guid-…">`, réimbrication des sous-listes (`<ul><li>a</li><ul>…</ul></ul>` → dans le `li`), puis passes 5 à 8.

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

## ⚠️ Limites connues

- **Pas de fidélité de mise en page** : colonnes, en-têtes et pieds de page, sauts de page, polices exactes, tailles et interlignes sont volontairement jetés. L'objectif est de préserver l'intention (structure, emphase), pas le rendu au pixel.
- **Images collées depuis Word sous Windows** : le presse-papier référence des fichiers locaux (`file:///C:/Users/…/clip_image001.png`). Le navigateur ne peut pas les lire, la politique de liens du core rejette `file:` et l'image est perdue. Passe par l'import `.docx` ou par un glisser-déposer du fichier image.
- **Formes, zones de texte, SmartArt, équations** : contenu VML/DrawingML non converti. Le texte des zones de texte peut survivre, pas la mise en page.
- **Numérotation reprise** : une liste Word qui « continue » une liste précédente arrive avec `start`, mais la reprise exacte dépend de ce que Word a sérialisé.
- **Notes de bas de page** : conservées dans `html` via `data-footnotes` / `data-footnote`, mais le schéma Tiptap ne garde pas ces attributs après `setHTML` ; seule la liste finale et les appels `[1]` restent.
- **Styles custom** : un style de paragraphe inconnu remonte en avertissement `mammoth` et devient un `<p>`. Ajoute une règle dans `styleMap` pour le mapper.
- **Google Docs** : les `li` gardent leur `<p>` ; les couleurs et tailles posées par Google sont jetées comme pour Word.

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

`importDocx`, `normalizeWordHtml`, `normalizeGoogleDocsHtml`, `isWordHtml`, `isGoogleDocsHtml`, `wordPasteTransformer`, et les types `DocxImportOptions`, `DocxImportResult`, `DocxImportWarning`, `DocxImportWarningCode`, `HtmlParser`, `WordPasteOptions`, `ListLevelFormat`.
