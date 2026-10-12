# 🧭 Guide d'intégration — de zéro à un éditeur en prod

> Pas à pas pour embarquer Aster dans une app : montage, récupération du contenu, autosave, Markdown, upload d'images, export Word, impression, sécurité, i18n, lecture seule, bundle, tests e2e. Chaque exemple est typechecké contre les sources 0.3.0.

## 1. 🧱 Installer et monter (vanilla)

```bash
npm install @aster-editor/core @aster-editor/ui @aster-editor/word
```

```ts
import '@aster-editor/ui/themes/aster.css';
import { createAster } from '@aster-editor/ui';
import { wordPasteTransformer } from '@aster-editor/word';

const host = document.querySelector<HTMLElement>('#editor')!;
const instance = createAster(host, {
  toolbar: 'standard',
  theme: 'light',
  locale: 'fr',
  placeholder: 'Écris ici…',
  content: '<p></p>',
  pasteTransformers: [wordPasteTransformer()],
});
const { editor } = instance;
```

Ce que ça fait : `createAster` crée `.aster[data-theme]` dans `#editor`, y pose la toolbar (`.aster__toolbar`) et le contenu (`.aster__content > .aster-content > .ProseMirror`), enregistre les chaînes UI, branche la toolbar sur les événements de l'éditeur, monte le menu contextuel de table et prépare la vue source et le plein écran (`instance.toggleSource()`, `instance.setFullscreen(true)`). Quand tu démontes la page, appelle `instance.destroy()` : il quitte plein écran et vue source, détruit menu, toolbar et éditeur, retire la racine. Les écouteurs posés par `editor.on` sont vidés à `destroy`.

Si tu n'as pas besoin de toolbar, `createAster(host, { toolbar: false })`. Si tu veux ta propre toolbar, `createEditor` du core + `createToolbar` de `ui` sur deux conteneurs à toi (voir `createToolbar` dans le [README ui](../packages/ui/README.md)). Le preset `full` ajoute un dernier groupe recherche / caractères spéciaux / impression / vue source / plein écran ; `standard` ne l'a pas, ajoute les widgets voulus à une config déclarative.

Le CSS : `aster.css` = `base.css` + `images-tables.css` + `search-source.css` + `print.css` + `light.css` + `night.css`. Pour alléger, importe `base.css`, un seul thème et les feuilles des fonctionnalités que tu utilises (détail dans [THEMING](./THEMING.md)).

## 2. 🅰️ Angular (court)

`@aster-editor/angular` fournit `<aster-editor>` standalone, CVA, zoneless, SSR-safe : inputs signals (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config`, `wordPaste`, `ariaLabel`, `ariaLabelledBy`), outputs (`ready`, `changed`, `focused`, `blurred`), `provideAster(config)` pour la config globale, `ASTER_UPLOAD_HANDLER` pour l'upload, `importDocx(file)` sur le composant, `editor()` en signal pour tout le reste (export, Markdown, autosave). Importe `@aster-editor/ui/themes/aster.css` dans `styles.css`. Tout est dans le [README du paquet](../packages/angular/README.md), y compris l'export `.docx` et le piège Vite à froid décrit plus bas.

## 3. 💾 Récupérer et stocker le contenu

Trois formats, une seule source de vérité : le document ProseMirror.

| Format   | Lecture                                  | Écriture                               | Quand l'utiliser                                                                                   |
| -------- | ---------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| HTML     | `editor.getHTML()`                       | `editor.setHTML(html, emit?)`          | Affichage direct, SEO, mails, interopérabilité. `setHTML(getHTML())` est idempotent.               |
| JSON     | `editor.getJSON()`                       | `editor.setJSON(doc, emit?)`           | Stockage structuré, diff, transformations côté serveur, pas de parsing HTML.                       |
| Markdown | `getMarkdown(editor)` (fonction du core) | `setMarkdown(editor, markdown, emit?)` | Wikis, commentaires, interop GFM. Souligné, indice, exposant et couleurs survivent en HTML inline. |

```ts
// Sauvegarde sur change, avec un debounce maison
let timer: ReturnType<typeof setTimeout> | undefined;
editor.on('change', ({ editor }) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void fetch('/api/articles/42', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: editor.getHTML(), doc: editor.getJSON() }),
    });
  }, 800);
});

// Rechargement silencieux : pas de `change`, hors historique, historique vidé
editor.setHTML(savedHtml, false);
```

Points d'attention :

- **Document vide** : `getHTML()` d'un document vide renvoie `<p></p>`, pas une chaîne vide. Pour un validateur « requis », teste `editor.isEmpty()`.
- **`selectionChange`** est émis même après `setHTML(…, false)` : ne t'en sers pas pour calculer `dirty`, utilise `change`. `change` n'est émis ni par `setReadOnly` ni par `setHTML(…, false)`.
- **`setHTML(…, false)` vide l'historique** : c'est voulu, un `undo` après une resynchronisation silencieuse ne doit pas rejouer l'ancien document. Avec `emit = true` (défaut), le remplacement est une étape annulable.
- **Texte brut** : `editor.getText()` (un seul `\n` entre blocs, cellules et items compris) et `editor.getCounts()` (`{ words, characters }`) pour un compteur ou un extrait.
- **`getHTML()` est mis en cache** par transaction : l'appeler à chaque frappe ne coûte rien de plus.
- Le HTML est **sémantique et stable** : `<strong>`, `<em>`, `<u>`, `<s>`, `<sub>`, `<sup>`, `<code>`, `<mark>`, `<a>`, `<h1>`-`<h6>`, `<p>`, `<ul>`/`<ol>`/`<li>` (avec `<p>` dans chaque `li`), `<ul data-type="taskList">`, `<blockquote>`, `<pre><code>`, `<hr>`, `<img>` (`width` et `data-align` éventuels, jamais de `<figure>`), `<table>` avec `thead`/`tbody`/`th`/`td` (sans `colgroup` ni `min-width`), `style="text-align: …"` sur paragraphes et titres, `<span style="color/background-color/font-family/font-size">` pour les styles de texte.

### Autosave

Plutôt qu'un debounce maison, `createAutosave` du core gère le minuteur, l'état « sale » et les échecs :

```ts
import { createAutosave } from '@aster-editor/core';

const autosave = createAutosave(editor, {
  interval: 2000, // ms d'inactivité avant sauvegarde (debounce: true par défaut)
  onSave: async (html) => {
    const response = await fetch('/api/articles/42', { method: 'PUT', body: html });
    if (!response.ok) throw new Error(`HTTP ${response.status}`); // reste « sale », réessayé
  },
  onError: (error) => notify(`Sauvegarde échouée : ${String(error)}`),
});
window.addEventListener('beforeunload', () => {
  void autosave.flush();
});
```

`autosave.isDirty()` pour un indicateur, `autosave.flush()` avant de quitter la page, `autosave.destroy()` est appelé tout seul à `editor.destroy()`. Un rechargement par `setHTML(…, false)` ne salit pas : seul un `change` compte. Mode `debounce: false` pour une vérification à intervalle fixe.

### Markdown

```ts
import { getMarkdown, setMarkdown } from '@aster-editor/core';

const markdown = getMarkdown(editor);
setMarkdown(editor, markdown, false);
```

GFM : titres, listes imbriquées et tâches, citations, blocs de code, règles, tables, liens, images, gras, italique, barré, surligné, code. `htmlToMarkdown` / `markdownToHtml` sont exportés pour travailler hors éditeur (côté Node, passe un parseur à `htmlToMarkdown`). Le HTML inline du Markdown est limité à une liste blanche (`<u>`, `<sub>`, `<sup>`, `<br>`, `<span style>`), le reste est échappé.

## 4. 🖼️ Brancher l'upload d'images sur un backend

Sans hook `upload`, chaque image collée, déposée ou choisie dans le dialogue est insérée en data URL base64 : ça marche tout de suite, mais ça gonfle le HTML stocké. En prod, fournis un hook :

```ts
import type { UploadHandler } from '@aster-editor/core';

const upload: UploadHandler = async (file) => {
  const body = new FormData();
  body.append('file', file, file.name);
  const response = await fetch('/api/uploads', {
    method: 'POST',
    body,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`Upload failed: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { url: string };
  return payload.url;
};

const instance = createAster(host, { upload });

instance.editor.on('uploadStart', ({ file }) => showSpinner(file.name));
instance.editor.on('uploadDone', ({ file, error }) => {
  hideSpinner(file.name);
  if (error) notify(`Échec de l'envoi de ${file.name}`);
});
```

Comportement :

- Le hook reçoit un `File` (`image/*` sauf SVG, refusé comme vecteur de script) et doit renvoyer une chaîne non vide : l'URL finale. Elle est validée par la politique de liens (`http`, `https`, `mailto`, `tel` par défaut), plus `blob:` et `data:image/…` pour les images.
- Un rejet du hook (ou une valeur qui n'est pas une chaîne) émet `uploadDone` avec `error` et **n'insère pas** l'image. Pas de repli base64 côté éditeur (contrairement à `importDocx`, qui replie).
- L'insertion après l'upload vérifie que l'éditeur est toujours vivant : détruire la page pendant un upload ne lève pas.
- `importDocx(file, { upload })` utilise le même hook pour les images embarquées dans le `.docx`, avec repli base64 et avertissement `image-upload-failed` en cas d'échec.
- Une fois insérée, l'image se redimensionne à la poignée (attribut `width`), s'aligne et s'édite au double-clic (dialogue image en mode édition, commande `image.setAttributes`).

Côté serveur : vérifie le type MIME réel (magic bytes), limite la taille, renomme le fichier, sers-le depuis un domaine ou un chemin dédié.

## 5. 📤 Exporter en .docx

`exportDocx` prend `editor.getHTML()` (ou `editor.getJSON()`) et rend un `Blob` Word ; `downloadDocx` le télécharge. La lib `docx` (~1,3 MB non minifié) est chargée en import dynamique au premier appel, et tu peux charger le paquet lui-même à la demande :

```ts
const { exportDocx, downloadDocx } = await import('@aster-editor/word');
const blob = await exportDocx(editor.getHTML(), {
  title: 'Article',
  fetchImage: async (src) => {
    const response = await fetch(src, { credentials: 'same-origin' });
    return response.ok ? response.arrayBuffer() : null;
  },
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
downloadDocx(blob, 'article');
```

Sans `fetchImage`, seules les images en data URL sont embarquées, les autres remontent `image-skipped`. Les caractères de contrôle interdits par XML sont retirés, les espaces insécables conservés, `<ol start>` honoré. Mapping complet, options (`creator`, `pageSize`, `parse`) et limites de l'aller-retour export → import dans le [README word](../packages/word/README.md). `downloadDocx` doit être appelé depuis un geste utilisateur (clic) et lève hors navigateur.

## 6. 🖨️ Imprimer

Le widget `print` (dans le preset `full`, ou `{ type: 'widget', widget: 'print' }`) ouvre une fenêtre vierge, y écrit `getHTML()` dans un document autonome (`.aster-print`, feuille embarquée noir sur blanc, `lang` de la locale) et appelle `print()` ; la fenêtre se ferme après `afterprint`. Par code : `printEditor(editor)` rend `false` si un bloqueur de popups a refusé la fenêtre. Pour imprimer la page hôte elle-même, `print.css` masque toolbar, panneaux et surlignages en `@media print`.

```ts
import { printEditor } from '@aster-editor/ui';

const instance = createAster(host, { toolbar: [[{ type: 'widget', widget: 'print' }]] });
printEditor(instance.editor);
```

## 7. 🔒 Sécurité

### Ce que le schéma filtre

Tout HTML entrant (`setHTML`, `insertHTML`, collage, import Word, Markdown) passe par le schéma ProseMirror : **seuls les nœuds et marks connus survivent**. Les `<script>`, `<iframe>`, `<object>`, handlers `on*`, attributs inconnus et styles non déclarés sont jetés à la lecture. Les balises inconnues sont déballées, leur texte est gardé.

### Politique de liens et d'images

Liste blanche de protocoles (`http`, `https`, `mailto`, `tel`), appliquée au parsing, aux commandes et à l'autolink. Un `<a href="javascript:alert(1)">` collé devient du texte simple. Le `rel` est forcé (`noopener noreferrer` par défaut) sur tout lien `target="_blank"`. Les entités HTML (`&#115;`, `&colon;`), caractères de contrôle et invisibles Unicode glissés dans le schéma (`java\tscript:`, U+00AD, U+2060) sont neutralisés avant analyse.

```ts
createAster(host, {
  linkPolicy: {
    allowedProtocols: ['https', 'mailto'],
    defaultTarget: '_self',
    rel: 'noopener',
    autolink: false,
  },
});
```

Les images suivent les mêmes règles, avec deux tolérances : `blob:` (aperçu local) et `data:image/…` (repli d'upload). `data:text/html` et tout autre type MIME sont rejetés ; un `<img>` interdit disparaît au parsing (`setHTML`, collage), `image.insert` le refuse. Les uploads SVG sont refusés.

### Collage depuis Word

`wordPasteTransformer` est aussi une barrière, avant le schéma : balises actives supprimées avec leur contenu (`script`, `iframe`, `object`, `embed`, `form`, `template`, `noscript`, `frame`, `svg`, `math`, `meta`, `style`), attributs `on*` jetés, liens d'un schéma hostile ou relatifs déballés en texte, couleurs validées. Deux regex quadratiques y ont été corrigées en 0.3.0 : un collage de 2 Mo prenait 137 s, il se détecte désormais en moins d'une milliseconde. Garde le transformateur même si tu ne vises pas Word : il ne coûte rien sur du HTML ordinaire.

### `insertHTML` est brut

`editor.insertHTML(html)` n'applique **ni** les `pasteTransformers` **ni** le normaliseur Word : seule la politique de liens et d'images filtre. Pour insérer du HTML venu d'ailleurs, passe-le d'abord par `normalizeWordHtml` ou ton propre nettoyage.

### Ce que tu dois quand même faire côté serveur

Le filtrage client est une protection d'usage, pas une frontière de confiance : un client malveillant peut envoyer n'importe quoi à ton API en contournant l'éditeur.

1. **Sanitize le HTML stocké** avec une lib serveur (DOMPurify côté Node, `sanitize-html`, Bleach, HtmlSanitizer…) configurée sur la liste des balises et attributs de la section 3. Autorise `style` uniquement avec `text-align`, `color`, `background-color`, `font-family`, `font-size`, et `width`, `data-align` sur `img`, `data-type`, `data-checked` sur les listes de tâches.
2. **Resanitize à l'affichage** si le contenu peut venir d'une autre source que ton API, ou rends-le via l'éditeur en lecture seule (le schéma refiltre).
3. **Valide les URLs** des `href` et `src` avec la même liste blanche de protocoles.
4. **CSP** : `script-src` sans `unsafe-inline`, et `img-src` restreint à ton domaine d'upload si tu n'acceptes pas les images externes (ajoute `data:` si tu gardes le repli base64, `blob:` pour les aperçus).
5. **Stocke aussi le JSON** si tu veux retraiter le contenu sans reparser du HTML.

## 8. 🌍 i18n

`fr` et `en` sont intégrés dans le core (58 clés) et dans `ui` (76 clés). La locale se passe au montage et se change à chaud :

```ts
const { editor } = createAster(host, { locale: 'en' });
editor.i18n.setLocale('fr'); // émet localeChange, la toolbar et le placeholder se retraduisent
```

Ajouter une langue : deux dictionnaires à fusionner, celui des commandes (`command.*`, `search.*` compris, `editor.*`) et celui de l'UI (`ui.*`). `en` est le repli pour toute clé manquante.

```ts
import { en } from '@aster-editor/core';
import { createAster, uiEn } from '@aster-editor/ui';

const { editor } = createAster(host, { locale: 'es' });
editor.i18n.addTranslations('es', {
  ...en,
  ...uiEn,
  'command.bold': 'Negrita',
  'command.italic': 'Cursiva',
  'command.link.set': 'Insertar enlace',
  'command.search.open': 'Buscar',
  'editor.placeholder': 'Escribe algo…',
  'ui.toolbar.label': 'Barra de formato',
  'ui.link.title': 'Enlace',
  'ui.search.title': 'Buscar y reemplazar',
});
```

Pour un placeholder fixe indépendant de la locale, passe `placeholder` dans les options. Les listes de clés complètes sont dans les README [core](../packages/core/README.md) (section « i18n ») et [ui](../packages/ui/README.md) (section « i18n UI »).

## 9. 👁️ Lecture seule

```ts
const instance = createAster(host, { readOnly: true, toolbar: false, content: html });

// ou à chaud
instance.editor.setReadOnly(true);
```

En lecture seule : le `contenteditable` passe à `false`, `commands.run` et `canRun` répondent `false` (la toolbar se grise d'elle-même sur `readOnlyChange`, sauf `fullscreen` et `print` qui restent utilisables), les raccourcis sont inertes, la poignée des images et le menu contextuel de table disparaissent, le contenu reste sélectionnable et copiable. `setReadOnly(false)` rend la main. Aucun `change` n'est émis dans un sens ni dans l'autre. Pour un rendu sans toolbar ni bordure, combine `toolbar: false` et un thème custom (voir [THEMING](./THEMING.md)).

La vue source utilise ce même mécanisme : pendant qu'elle est ouverte, l'éditeur est en lecture seule et seul le bouton `source` reste actif ; `toggleSource()` est sans effet si l'éditeur était déjà en lecture seule avant.

Pour désactiver seulement certaines commandes tout en gardant l'édition : `disabledCommands: ['image.upload', 'codeBlock']` retire les commandes du registre, de la toolbar et avale leurs raccourcis.

## 10. 📦 Taille de bundle et imports dynamiques

- `core` + `ui` : moteur Tiptap/ProseMirror, extensions standard (recherche comprise), toolbar, icônes. Cible < 250 kB minifié hors gzip.
- `word` : le normaliseur de collage est léger ; **mammoth pèse ~660 kB** et **docx ~1,3 MB non minifiés**, chargés respectivement par `importDocx` et `exportDocx` en `await import()` au premier appel.

Pour que mammoth et docx restent hors du bundle initial :

1. Garde `wordPasteTransformer()` en import statique si tu veux le collage propre dès le chargement : il ne tire ni mammoth ni docx.
2. Charge `importDocx` et `exportDocx` à la demande, au moment où l'utilisateur agit :

```ts
input.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  const { importDocx } = await import('@aster-editor/word');
  const { html, warnings } = await importDocx(file);
  editor.setHTML(html);
  console.table(warnings);
});
```

3. Vérifie dans ton bundler que `mammoth` et `docx` sortent en chunks séparés (esbuild, Vite, Rollup, Angular CLI le font pour un `import()` ; webpack aussi avec `chunks: 'async'`). Avec Angular CLI, un budget `initial` à 1 MB casse si mammoth n'est pas splitté : c'est le signal.
4. Tous les paquets sont ESM `sideEffects: false` (hors CSS) : le tree-shaking retire les commandes et composants que tu n'importes pas via `createAster`, mais pas les extensions Tiptap du jeu standard, qui sont toujours montées.

> ⚠️ **Vite à froid sur `ng serve`** : le tout premier `importDocx` d'une session de dev déclenche l'optimisation de dépendances de Vite pour `mammoth` et **recharge la page** en plein import, sans message d'erreur. C'est un comportement du serveur de dev (jamais du build de prod) : relance simplement l'import. Le test e2e de la démo le contourne en resélectionnant le fichier jusqu'à ce que l'import aboutisse.

## 11. 🧪 Tests e2e

Vingt et un tests Playwright (`e2e/`) couvrent les parcours réels dans Chromium : 16 sur le playground vanilla (`scripts/vanilla-playground.mjs`, port 4300) et 5 sur la démo Angular (`ng serve`, port 4200). Playwright lance les deux serveurs lui-même et réutilise ceux déjà ouverts.

```bash
npx playwright install --with-deps chromium   # une fois
npm run e2e                                   # tout
npm run e2e -- --project=playground           # un seul projet
npm run e2e:ui                                # mode UI
```

Le rapport HTML est dans `e2e/playwright-report/`, les captures de chaque scénario dans `e2e/output/`. Les fixtures `.docx` et HTML Word du dossier `fixtures/` servent aux deux (import et collage). En CI, un job dédié exécute la suite après lint, typecheck, tests unitaires et build.

## 12. ✅ Checklist avant prod

- [ ] `instance.destroy()` appelé au démontage.
- [ ] Hook `upload` branché, pas de base64 en base.
- [ ] Sanitization serveur du HTML stocké, liste blanche alignée sur le schéma (`width` et `data-align` sur `img` compris).
- [ ] `linkPolicy` revue (protocoles, `target`, `rel`).
- [ ] `isEmpty()` pour le « requis », `change` pour `dirty`, `createAutosave` ou debounce pour la sauvegarde.
- [ ] `importDocx` / `exportDocx` en import dynamique, mammoth et docx en chunks séparés.
- [ ] Thème importé une seule fois (`aster.css`, ou `base.css` + un thème + les feuilles des fonctionnalités utilisées).
- [ ] Locale fournie, dictionnaire complet si langue ajoutée (`command.search.*` et `ui.search.*` compris).
- [ ] `insertHTML` jamais appelé avec du HTML externe non nettoyé.
