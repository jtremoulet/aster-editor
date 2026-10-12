# 🧭 Guide d'intégration — de zéro à un éditeur en prod

> Pas à pas pour embarquer Aster dans une app : montage, récupération du contenu, upload d'images, sécurité, i18n, lecture seule, bundle. Chaque exemple compile contre l'API 0.1.0.

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

Ce que ça fait : `createAster` crée `.aster[data-theme]` dans `#editor`, y pose la toolbar (`.aster__toolbar`) et le contenu (`.aster__content > .aster-content > .ProseMirror`), enregistre les chaînes UI, branche la toolbar sur les événements de l'éditeur. Quand tu démontes la page, appelle `instance.destroy()` : il détruit la toolbar, l'éditeur et retire la racine. Les écouteurs posés par `editor.on` sont vidés à `destroy`.

Si tu n'as pas besoin de toolbar, `createAster(host, { toolbar: false })`. Si tu veux ta propre toolbar, `createEditor` du core + `createToolbar` de `ui` sur deux conteneurs à toi (voir `createToolbar` dans le [README ui](../packages/ui/README.md)).

Le CSS : `aster.css` = `base.css` (structure, composants, mise en forme du contenu) + `light.css` + `night.css`. Pour alléger, importe `base.css` et un seul thème.

## 2. 🅰️ Angular (court)

> 🚧 Le wrapper `@aster-editor/angular` est en cours d'écriture. L'API prévue est décrite dans le [README racine](../README.md) (section « Quick start Angular ») ; fais foi le [README du paquet](../packages/angular/README.md) une fois publié.

En résumé : `<aster-editor [formControl]="body" toolbar="full" />` standalone, CVA, inputs signals (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config`, `wordPaste`), outputs (`ready`, `changed`, `focused`, `blurred`), `provideAster(config)` pour la config globale, `ASTER_UPLOAD_HANDLER` pour l'upload, `importDocx(file)` sur le composant. Importe `@aster-editor/ui/themes/aster.css` dans `styles.css`.

En attendant, le vanilla fonctionne dans un composant Angular : crée l'éditeur dans `afterNextRender`, détruis-le dans `DestroyRef.onDestroy`.

## 3. 💾 Récupérer et stocker le contenu

Deux formats, un seul source de vérité : le document ProseMirror.

| Format | Lecture            | Écriture               | Quand l'utiliser                                                                     |
| ------ | ------------------ | ---------------------- | ------------------------------------------------------------------------------------ |
| HTML   | `editor.getHTML()` | `editor.setHTML(html)` | Affichage direct, SEO, mails, interopérabilité. `setHTML(getHTML())` est idempotent. |
| JSON   | `editor.getJSON()` | `editor.setJSON(doc)`  | Stockage structuré, diff, transformations côté serveur, pas de parsing HTML.         |

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

// Rechargement sans émettre `change`
editor.setHTML(savedHtml, false);
```

Points d'attention :

- **Document vide** : `getHTML()` d'un document vide renvoie `<p></p>`, pas une chaîne vide. Pour un validateur « requis », teste `editor.isEmpty()`.
- **`selectionChange`** est émis même après `setHTML(…, false)` : ne t'en sers pas pour calculer `dirty`, utilise `change`.
- **Texte brut** : `editor.getText()` (blocs séparés par `\n`) et `editor.getCounts()` (`{ words, characters }`) pour un compteur ou un extrait.
- Le HTML est **sémantique et stable** : `<strong>`, `<em>`, `<u>`, `<s>`, `<sub>`, `<sup>`, `<code>`, `<mark>`, `<a>`, `<h1>`-`<h6>`, `<p>`, `<ul>`/`<ol>`/`<li>` (avec `<p>` dans chaque `li`), `<ul data-type="taskList">`, `<blockquote>`, `<pre><code>`, `<hr>`, `<img>` (`data-align` éventuel), `<table>` avec `thead`/`tbody`/`th`/`td`, `style="text-align: …"` sur paragraphes et titres, `<span style="color/background-color/font-family/font-size">` pour les styles de texte.

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

- Le hook reçoit un `File` (`image/*` sauf SVG, refusé comme vecteur de script) et doit renvoyer l'URL finale. Elle est validée par la politique de liens (`http`, `https`, `mailto`, `tel` par défaut, plus `data:` et `blob:` pour les images).
- Un rejet du hook émet `uploadDone` avec `error` et **n'insère pas** l'image. Pas de repli base64 côté éditeur (contrairement à `importDocx`, qui replie).
- L'insertion après l'upload vérifie que l'éditeur est toujours vivant : détruire la page pendant un upload ne lève pas.
- `importDocx(file, { upload })` utilise le même hook pour les images embarquées dans le `.docx`, avec repli base64 et avertissement `image-upload-failed` en cas d'échec.

Côté serveur : vérifie le type MIME réel (magic bytes), limite la taille, renomme le fichier, sers-le depuis un domaine ou un chemin dédié.

## 5. 🔒 Sécurité

### Ce que le schéma filtre

Tout HTML entrant (`setHTML`, `insertHTML`, collage, import Word) passe par le schéma ProseMirror : **seuls les nœuds et marks connus survivent**. Les `<script>`, `<iframe>`, `<object>`, handlers `on*`, attributs inconnus et styles non déclarés sont jetés à la lecture. Les balises inconnues sont déballées, leur texte est gardé.

### Politique de liens

Liste blanche de protocoles (`http`, `https`, `mailto`, `tel`), appliquée au parsing, aux commandes et à l'autolink. Un `<a href="javascript:alert(1)">` collé devient du texte simple. Le `rel` est forcé (`noopener noreferrer` par défaut) sur tout lien `target="_blank"`. Les caractères de contrôle et invisibles glissés dans le schéma (`java\tscript:`) sont neutralisés avant analyse.

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

Les images suivent les mêmes règles, `data:` et `blob:` tolérés. Les uploads SVG sont refusés.

### Ce que tu dois quand même faire côté serveur

Le filtrage client est une protection d'usage, pas une frontière de confiance : un client malveillant peut envoyer n'importe quoi à ton API en contournant l'éditeur.

1. **Sanitize le HTML stocké** avec une lib serveur (DOMPurify côté Node, `sanitize-html`, Bleach, HtmlSanitizer…) configurée sur la liste des balises et attributs ci-dessus. Autorise `style` uniquement avec `text-align`, `color`, `background-color`, `font-family`, `font-size`, et `data-align`, `data-type`, `data-checked` sur les éléments concernés.
2. **Resanitize à l'affichage** si le contenu peut venir d'une autre source que ton API, ou rends-le via l'éditeur en lecture seule (le schéma refiltre).
3. **Valide les URLs** des `href` et `src` avec la même liste blanche de protocoles.
4. **CSP** : `script-src` sans `unsafe-inline`, et `img-src` restreint à ton domaine d'upload si tu n'acceptes pas les images externes (ajoute `data:` si tu gardes le repli base64).
5. **Stocke aussi le JSON** si tu veux retraiter le contenu sans reparser du HTML.

## 6. 🌍 i18n

`fr` et `en` sont intégrés dans le core et dans `ui`. La locale se passe au montage et se change à chaud :

```ts
const { editor } = createAster(host, { locale: 'en' });
editor.i18n.setLocale('fr'); // émet localeChange, la toolbar et le placeholder se retraduisent
```

Ajouter une langue : deux dictionnaires à fusionner, celui des commandes (`command.*`, `editor.*`) et celui de l'UI (`ui.*`). `en` est le repli pour toute clé manquante.

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
  'editor.placeholder': 'Escribe algo…',
  'ui.toolbar.label': 'Barra de formato',
  'ui.link.title': 'Enlace',
});
```

Pour un placeholder fixe indépendant de la locale, passe `placeholder` dans les options. Les listes de clés complètes sont dans les README [core](../packages/core/README.md) (section « i18n ») et [ui](../packages/ui/README.md) (section « i18n UI »).

## 7. 👁️ Lecture seule

```ts
const instance = createAster(host, { readOnly: true, toolbar: false, content: html });

// ou à chaud
instance.editor.setReadOnly(true);
```

En lecture seule : le `contenteditable` passe à `false`, `commands.run` et `canRun` répondent `false` (la toolbar se grise d'elle-même sur `readOnlyChange`), les raccourcis sont inertes, le contenu reste sélectionnable et copiable. `setReadOnly(false)` rend la main. Pour un rendu sans toolbar ni bordure, combine `toolbar: false` et un thème custom (voir [THEMING](./THEMING.md)).

Pour désactiver seulement certaines commandes tout en gardant l'édition : `disabledCommands: ['image.upload', 'codeBlock']` retire les commandes du registre, de la toolbar et avale leurs raccourcis.

## 8. 📦 Taille de bundle et import dynamique de `word`

- `core` + `ui` : moteur Tiptap/ProseMirror, extensions standard, toolbar, icônes. Cible < 250 kB minifié hors gzip.
- `word` : le normaliseur de collage est léger ; **mammoth pèse ~660 kB non minifié** et n'est chargé que par `importDocx`, en `await import('mammoth')`.

Pour que mammoth reste hors du bundle initial :

1. Garde `wordPasteTransformer()` en import statique si tu veux le collage propre dès le chargement : il ne tire pas mammoth.
2. Charge `importDocx` à la demande, au moment où l'utilisateur choisit un fichier :

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

3. Vérifie dans ton bundler que `mammoth` sort en chunk séparé (esbuild, Vite, Rollup, Angular CLI le font pour un `import()` ; webpack aussi avec `chunks: 'async'`). Avec Angular CLI, un budget `initial` à 1 MB casse si mammoth n'est pas splitté : c'est le signal.
4. Tous les paquets sont ESM `sideEffects: false` (hors CSS) : le tree-shaking retire les commandes et composants que tu n'importes pas via `createAster`, mais pas les extensions Tiptap du jeu standard, qui sont toujours montées.

## 9. ✅ Checklist avant prod

- [ ] `instance.destroy()` appelé au démontage.
- [ ] Hook `upload` branché, pas de base64 en base.
- [ ] Sanitization serveur du HTML stocké, liste blanche alignée sur le schéma.
- [ ] `linkPolicy` revue (protocoles, `target`, `rel`).
- [ ] `isEmpty()` pour le « requis », `change` pour `dirty`.
- [ ] `importDocx` en import dynamique, mammoth en chunk séparé.
- [ ] Thème importé une seule fois (`aster.css` ou `base.css` + un thème).
- [ ] Locale fournie, dictionnaire complet si langue ajoutée.
