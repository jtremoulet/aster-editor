# 🧭 Guide d'intégration — de zéro à un éditeur en prod

> Pas à pas pour embarquer Aster dans une app : montage, récupération du contenu, autosave, Markdown, upload d'images, export Word, modèles de documents, impression, sécurité, i18n, lecture seule, bundle, tests e2e. Chaque exemple est typechecké contre les sources 0.4.0.

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

Ce que ça fait : `createAster` crée `.aster[data-theme]` dans `#editor`, y pose la toolbar (`.aster__toolbar`) et le contenu (`.aster__content > .aster-content > .ProseMirror`), enregistre les chaînes UI, branche la toolbar sur les événements de l'éditeur, monte le menu contextuel de table, le dialogue de puce et la suggestion `{{` des variables, les bulles de lien et d'image, le menu `/`, et prépare la vue source et le plein écran (`instance.toggleSource()`, `instance.setFullscreen(true)`). Chacun de ces extras se désactive par option (`variableSuggestion`, `linkBubble`, `imageBubble`, `slashMenu` à `false`). Quand tu démontes la page, appelle `instance.destroy()` : il quitte plein écran et vue source, détruit tout ce qu'il a monté et l'éditeur, retire la racine. Les écouteurs posés par `editor.on` sont vidés à `destroy`.

Si tu n'as pas besoin de toolbar, `createAster(host, { toolbar: false })`. Si tu veux ta propre toolbar, `createEditor` du core + `createToolbar` de `ui` sur deux conteneurs à toi (voir `createToolbar` dans le [README ui](../packages/ui/README.md)). Le preset `full` ajoute le sommaire, le widget de variables, le pinceau et un dernier groupe recherche / caractères spéciaux / impression / vue source / plein écran ; `standard` garde le widget de variables mais pas le reste, ajoute les widgets voulus à une config déclarative.

Le CSS : `aster.css` = `base.css` + `images-tables.css` + `search-source.css` + `print.css` + `variables.css` + `bubbles.css` + `light.css` + `night.css`. Pour alléger, importe `base.css`, un seul thème et les feuilles des fonctionnalités que tu utilises (détail dans [THEMING](./THEMING.md)).

## 2. 🅰️ Angular (court)

`@aster-editor/angular` fournit `<aster-editor>` standalone, CVA, zoneless, SSR-safe : inputs signals (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config`, `wordPaste`, `ariaLabel`, `ariaLabelledBy`, `variables`, `variableValues`, `variableResolver`, `allowUnknownVariables`, `variableSuggestion`), outputs (`ready`, `changed`, `focused`, `blurred`, `variablesChanged`), signals `editor()` et `variableNames()`, méthodes `getHTML(options?)`, `resolveVariables()`, `importDocx(file)`, `exportDocx(options?)`, `provideAster(config)` pour la config globale, `ASTER_UPLOAD_HANDLER` pour l'upload. Importe `@aster-editor/ui/themes/aster.css` dans `styles.css`. Tout est dans le [README du paquet](../packages/angular/README.md), y compris le piège Vite à froid décrit plus bas ; la version Angular du chapitre « Modèles de documents » est au chapitre 6.

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
- **Texte brut** : `editor.getText()` (un seul `\n` entre blocs, cellules et items compris, valeur ou `{{nom}}` pour une variable) et `editor.getCounts()` (`{ words, characters }`) pour un compteur ou un extrait.
- **`getHTML()` est mis en cache** par transaction : l'appeler à chaque frappe ne coûte rien de plus.
- **Variables** : stocke le HTML avec ses puces (`getHTML()`, mode `placeholders`) et les valeurs à part (`editor.variables.getValues()`) ; `getHTML({ variables: 'resolve' })` est un rendu, pas un format de stockage (voir chapitre 6).
- Le HTML est **sémantique et stable** : `<strong>`, `<em>`, `<u>`, `<s>`, `<sub>`, `<sup>`, `<code>`, `<mark>`, `<a>`, `<h1>`-`<h6>` (avec `id` si le sommaire a été utilisé ou si le HTML en avait), `<p>`, `<ul>`/`<ol>`/`<li>` (avec `<p>` dans chaque `li`), `<ul data-type="taskList">`, `<blockquote>`, `<pre><code>`, `<hr>`, `<img>` (`width` et `data-align` éventuels, jamais de `<figure>`), `<table>` avec `thead`/`tbody`/`th`/`td` (sans `colgroup` ni `min-width`), `style="text-align: …"` sur paragraphes et titres, `<span style="color/background-color/font-family/font-size">` pour les styles de texte, `<span data-aster-variable="nom" data-label="…">{{nom}}</span>` pour les variables.

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

`autosave.isDirty()` pour un indicateur, `autosave.flush()` avant de quitter la page, `autosave.destroy()` est appelé tout seul à `editor.destroy()`. Un rechargement par `setHTML(…, false)` ne salit pas : seul un `change` compte. Mode `debounce: false` pour une vérification à intervalle fixe. Un changement de valeur de variable (`setValues`) ne modifie pas le document, donc ne déclenche pas l'autosave : persiste les valeurs sur `variablesChange`.

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
- Une fois insérée, l'image se redimensionne à la poignée (attribut `width`), s'aligne et se redimensionne depuis sa bulle (25 / 50 / 100 % du contenu), et s'édite au double-clic ou via « Modifier » dans la bulle (dialogue image en mode édition, commande `image.setAttributes`).

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

Sans `fetchImage`, seules les images en data URL sont embarquées, les autres remontent `image-skipped`. Les caractères de contrôle interdits par XML sont retirés, les espaces insécables conservés, `<ol start>` honoré. Depuis 0.4.0, l'export sait aussi produire l'habillage d'un vrai document Word : `header` / `footer` (texte ou HTML inline, `pageNumbers: 'x-of-y'`), `toc`, `numberedHeadings`, `headingStyles`, `page` (format, orientation, marges), `lang`, `defaultFont`, sauts de page (`data-page-break`) et notes de bas de page réelles. Mapping complet, options et limites de l'aller-retour export → import dans le [README word](../packages/word/README.md). `downloadDocx` doit être appelé depuis un geste utilisateur (clic) et lève hors navigateur.

## 6. 🧩 Modèles de documents : du .docx client au document final

Le cas d'usage : ton client fournit un modèle Word (contrat, courrier, devis) avec des zones à remplir, ton application le charge, propose un formulaire, et produit le document final. Aster couvre le tour complet.

### 6.1 Préparer le modèle (côté client)

Trois syntaxes sont reconnues à l'import, et ramenées à la même puce :

| Dans Word                                                                                  | Détection (`variables.detect`) | Ce que l'import récupère                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `{{client.nom}}` tapé dans le texte (titres, listes, cellules compris)                     | `braces`                       | Le nom. Aussi dans les en-têtes et pieds de page, remonté sans puce (mammoth ne les rend pas).                             |
| Champs de fusion `MERGEFIELD` (Insertion → QuickPart → Champ, ou un publipostage existant) | `mergeFields`                  | Le nom (normalisé s'il ne respecte pas la règle des noms) et le résultat affiché comme valeur connue.                      |
| Contrôles de contenu (Développeur → Contrôles, avec une balise et un titre)                | `contentControls`              | Le nom (`w:tag`), le libellé (`w:alias`) et la valeur saisie, sauf si le contrôle affiche encore son texte de remplissage. |

Règle des noms : lettres, chiffres, `_`, `.`, `-`, sensible à la casse. Le point sert de séparateur de domaine par convention (`client.nom`, `client.adresse`), il n'a pas de sens pour le core. Les fixtures `fixtures/docx/08-variables-braces.docx`, `09-variables-mergefields.docx` et `10-variables-content-controls.docx` sont trois modèles d'exemple.

### 6.2 Importer et déclarer

```ts
const { html, variables, warnings } = await importDocx(file, {
  variables: { detect: ['braces', 'mergeFields', 'contentControls'] },
});
editor.setHTML(html, false);
editor.variables.define(variables);
for (const warning of warnings) console.warn(`[${warning.code}] ${warning.message}`);
```

`result.variables` liste les variables du corps dans l'ordre d'apparition (avec `label` et `value` quand Word les connaît), puis celles des en-têtes et pieds. `define` les verse dans le magasin : les libellés alimentent les puces et les menus, les valeurs résolvent tout de suite les puces concernées. Les trois détections sont actives par défaut ; `pattern` remplace `{{nom}}` par ta propre syntaxe (`/\[([a-z_]+)\]/g`, groupe 1 = nom). Avec le composant Angular, `importDocx(file)` fait tout ça pour toi.

### 6.3 Générer le formulaire

Les champs à proposer sont `editor.variables.getNames()` (les variables **présentes** dans le document, pas seulement déclarées) ; les libellés viennent de `list()`. Le formulaire pousse ses valeurs avec `setValues`, qui fusionne et émet `variablesChange` :

```ts
const declared = new Map(editor.variables.list().map((variable) => [variable.name, variable]));
for (const name of editor.variables.getNames()) {
  const definition: AsterVariable | undefined = declared.get(name);
  const label = document.createElement('label');
  label.textContent = definition?.label ?? name;
  const input = document.createElement('input');
  input.name = name;
  input.value = editor.variables.getValues()[name] ?? '';
  input.placeholder = `{{${name}}}`;
  label.append(input);
  form.append(label);
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const values: Record<string, string | undefined> = {};
  for (const [name, value] of new FormData(form)) {
    values[name] = typeof value === 'string' && value !== '' ? value : undefined;
  }
  editor.variables.setValues(values);
});
```

`undefined` efface une valeur : la puce repasse en « non résolue » (bordure pointillée, libellé en italique). Pour des valeurs qui viennent d'un service, déclare un résolveur (`options.variables.resolve`) et appelle `editor.variables.resolve()` : il n'est interrogé que pour les variables présentes sans valeur, et `hasUnresolved()` te dit s'il en reste.

Dans l'éditeur lui-même, l'utilisateur peut aussi insérer une variable depuis le widget `variable` de la toolbar, taper `{{` pour ouvrir la suggestion (ou `{{nom}}` d'une traite), passer par le menu `/` → « Variable… », et éditer libellé et valeur d'une puce au double-clic. Pour verrouiller le jeu de variables d'un modèle, `allowUnknown: false` (ou `allowUnknownVariables` côté Angular) : seules les variables déclarées sont proposées et insérables.

### 6.4 Aperçu résolu

```ts
const refresh = (): void => {
  preview.innerHTML = editor.getHTML({ variables: 'resolve' });
};
editor.on('change', refresh);
editor.on('variablesChange', refresh);
refresh();
```

`getHTML({ variables: 'resolve' })` substitue les valeurs **en texte** (une valeur contenant `<b>` est échappée) et laisse `{{nom}}` pour les variables sans valeur. Enveloppe l'aperçu dans `.aster > .aster-content > .ProseMirror` pour retrouver la mise en forme du contenu (voir [THEMING](./THEMING.md), « Rendu hors éditeur »). Côté serveur ou sur un HTML stocké, `resolveVariablesHtml(html, values)` fait la même chose sans éditeur :

```ts
// Côté Node sans DOMParser global : injecte un parseur (linkedom, jsdom…)
const finalHtml = resolveVariablesHtml(storedHtml, values, {
  parse: (html) => new DOMParser().parseFromString(html, 'text/html').body,
});
```

### 6.5 Exporter dans les trois modes

| `variables.mode`        | Tu obtiens                                                                                                                   | Pour                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `placeholders` (défaut) | Le modèle tel quel, `{{nom}}` en texte avec ses marques.                                                                     | Rendre au client un modèle retouché dans Aster, réimportable à l'identique.                                           |
| `resolve`               | Le document final : valeurs substituées, marques du span conservées (gras, couleur…), sauts de ligne de la valeur respectés. | Le contrat signé, le courrier envoyé. Une variable sans valeur reste `{{nom}}` + avertissement `variable-unresolved`. |
| `fields`                | De vrais champs de fusion Word `MERGEFIELD nom`, la valeur connue comme résultat de champ, sinon `«nom»`.                    | Un publipostage Word, ou un modèle que le client continuera de remplir dans Word.                                     |

```ts
if (mode === 'resolve' && editor.variables.hasUnresolved()) {
  await editor.variables.resolve(); // dernier recours : le résolveur
}
const common: DocxExportOptions = {
  title: 'Contrat',
  lang: 'fr-FR',
  header: { html: '<strong>Nebula</strong> — {{client.nom}}', align: 'right' },
  footer: { text: 'Document généré par Aster', pageNumbers: 'x-of-y' },
  toc: { title: 'Sommaire', levels: 2 },
  numberedHeadings: true,
  onWarning: (warning) => {
    if (warning.code === 'variable-unresolved') notify(warning.message);
  },
};
const blob = await exportDocx(editor.getHTML(), {
  ...common,
  variables: { mode, values: editor.variables.getValues() },
});
downloadDocx(blob, mode === 'placeholders' ? 'modele' : `contrat-${mode}`);
```

Les variables des en-têtes et pieds de page (`header.html`, `footer.html`) suivent le même mode que le corps. Avec le composant Angular, `exportDocx(options)` transmet les valeurs du magasin tout seul quand `options.variables.values` n'est pas fourni.

### 6.6 Version Angular

La page « Modèle » de la démo (`apps/demo/src/app/pages/template.page.ts`) est l'implémentation de référence : dépôt ou chargement d'un exemple, formulaire généré depuis `variableNames()`, aperçu puces / résolu, trois boutons d'export. En résumé :

```ts
@Component({
  selector: 'app-contract',
  imports: [AsterEditorComponent],
  template: `
    <input type="file" accept=".docx" (change)="onFile($event)" />
    <aster-editor [variableValues]="values()" (variablesChanged)="store.set($event)" />
    @for (name of editor().variableNames(); track name) {
      <label>
        {{ name }}
        <input [name]="name" [value]="store()[name] ?? ''" (input)="edit(name, $event)" />
      </label>
    }
    <button type="button" (click)="apply()">Appliquer</button>
    <p>{{ unresolved() }} variable(s) sans valeur</p>
    <button type="button" (click)="download('resolve')">Télécharger résolu</button>
  `,
})
export class ContractComponent {
  protected readonly editor = viewChild.required(AsterEditorComponent);
  protected readonly values = signal<VariableValues | undefined>(undefined);
  protected readonly store = signal<VariableValues>({});
  protected readonly unresolved = computed(
    () =>
      this.editor()
        .variableNames()
        .filter((name) => !this.store()[name]).length,
  );
  private draft: Record<string, string> = {};

  async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await this.editor().importDocx(file); // déclare les variables trouvées
  }

  edit(name: string, event: Event): void {
    this.draft = { ...this.draft, [name]: (event.target as HTMLInputElement).value };
  }

  apply(): void {
    this.values.set({ ...this.draft }); // → editor.variables.setValues, puis variablesChanged
  }

  async download(mode: DocxVariableMode): Promise<void> {
    const blob = await this.editor().exportDocx({ title: 'Contrat', variables: { mode } });
    const { downloadDocx } = await import('@aster-editor/word');
    downloadDocx(blob, mode === 'resolve' ? 'contrat' : 'modele');
  }
}
```

### 6.7 Limites à connaître

- **Marques perdues en mode `fields`** : un champ `w:fldSimple` ne porte pas de propriétés de run, un `<strong><span data-aster-variable>` perd son gras. Si la mise en forme de la valeur compte plus que le champ, exporte en `resolve`.
- **En-têtes et pieds perdus à l'import** : mammoth ne rend pas les en-têtes et pieds de page d'un `.docx`. Leurs `{{nom}}` sont remontés dans `result.variables` pour que tu les connaisses, mais leur contenu n'entre pas dans l'éditeur ; redonne-les à l'export via `header` / `footer`. Idem pour la table des matières et la numérotation des titres : produites à l'export, jetées à la réimportation.
- **Un nom invalide n'est pas une variable** : `{{a b}}` ou `{{nom}` restent du texte, dans l'éditeur comme à l'import. Un champ de fusion au nom non conforme est normalisé (`"Nom complet"` → `nom_complet`).
- **Les valeurs sont de la donnée** : jamais interprétées comme HTML, ni dans l'éditeur, ni dans `getHTML({ variables: 'resolve' })`, ni dans le `.docx`. Une valeur multi-ligne devient des sauts de ligne en `resolve` et des espaces dans le résultat d'un champ en `fields`.
- **`{{nom}}` chargé par `setHTML` n'est pas converti** : seul l'import `.docx`, le collage depuis Word ou Google Docs (`wordPasteTransformer`) et la saisie au clavier créent des puces. Pour un HTML stocké avant 0.4.0, passe-le une fois par `normalizeWordHtml` ou pose les `<span data-aster-variable>` toi-même.
- **Un motif personnalisé** (`pattern`) est appliqué tel quel à tout le texte, à l'import comme à l'export : sa complexité (ReDoS) relève de toi.

## 7. 🖨️ Imprimer

Le widget `print` (dans le preset `full`, ou `{ type: 'widget', widget: 'print' }`) ouvre une fenêtre vierge, y écrit `getHTML()` dans un document autonome (`.aster-print`, feuille embarquée noir sur blanc, `lang` de la locale) et appelle `print()` ; la fenêtre se ferme après `afterprint`. Par code : `printEditor(editor)` rend `false` si un bloqueur de popups a refusé la fenêtre. Pour imprimer la page hôte elle-même, `print.css` masque toolbar, panneaux et surlignages en `@media print`.

```ts
import { printEditor } from '@aster-editor/ui';

const instance = createAster(host, { toolbar: [[{ type: 'widget', widget: 'print' }]] });
printEditor(instance.editor);
```

## 8. 🔒 Sécurité

### Ce que le schéma filtre

Tout HTML entrant (`setHTML`, `insertHTML`, collage, import Word, Markdown) passe par le schéma ProseMirror : **seuls les nœuds et marks connus survivent**. Les `<script>`, `<iframe>`, `<object>`, handlers `on*`, attributs inconnus et styles non déclarés sont jetés à la lecture. Les balises inconnues sont déballées, leur texte est gardé. Un `<span data-aster-variable>` au nom invalide n'est pas reconnu comme variable.

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

### Valeurs de variables

Une valeur de variable est insérée comme **nœud texte** partout : dans la puce (NodeView), dans `getHTML({ variables: 'resolve' })` et `resolveVariablesHtml` (`createTextNode`, jamais `innerHTML`), et dans le `.docx` (texte assaini pour XML). Une valeur qui contient `<script>` est affichée telle quelle, échappée. Le nom d'une variable est validé par le core (`isValidVariableName`) à l'insertion, au parsing et à l'export.

### `insertHTML` est brut

`editor.insertHTML(html)` n'applique **ni** les `pasteTransformers` **ni** le normaliseur Word : seule la politique de liens et d'images filtre. Pour insérer du HTML venu d'ailleurs, passe-le d'abord par `normalizeWordHtml` ou ton propre nettoyage.

### Ce que tu dois quand même faire côté serveur

Le filtrage client est une protection d'usage, pas une frontière de confiance : un client malveillant peut envoyer n'importe quoi à ton API en contournant l'éditeur.

1. **Sanitize le HTML stocké** avec une lib serveur (DOMPurify côté Node, `sanitize-html`, Bleach, HtmlSanitizer…) configurée sur la liste des balises et attributs de la section 3. Autorise `style` uniquement avec `text-align`, `color`, `background-color`, `font-family`, `font-size`, et `width`, `data-align` sur `img`, `data-type`, `data-checked` sur les listes de tâches, `id` sur les titres, `data-aster-variable` et `data-label` sur `span`.
2. **Resanitize à l'affichage** si le contenu peut venir d'une autre source que ton API, ou rends-le via l'éditeur en lecture seule (le schéma refiltre).
3. **Valide les URLs** des `href` et `src` avec la même liste blanche de protocoles.
4. **Valide les noms de variables** reçus (même règle que le core) et traite les valeurs comme du texte.
5. **CSP** : `script-src` sans `unsafe-inline`, et `img-src` restreint à ton domaine d'upload si tu n'acceptes pas les images externes (ajoute `data:` si tu gardes le repli base64, `blob:` pour les aperçus).
6. **Stocke aussi le JSON** si tu veux retraiter le contenu sans reparser du HTML.

## 9. 🌍 i18n

`fr` et `en` sont intégrés dans le core (63 clés) et dans `ui` (110 clés). La locale se passe au montage et se change à chaud :

```ts
const { editor } = createAster(host, { locale: 'en' });
editor.i18n.setLocale('fr'); // émet localeChange, la toolbar et le placeholder se retraduisent
```

Ajouter une langue : deux dictionnaires à fusionner, celui des commandes (`command.*`, `search.*`, `variable.*` et `formatPainter.*` compris, `editor.*`, `variable.unresolved`) et celui de l'UI (`ui.*`). `en` est le repli pour toute clé manquante.

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

Pour un placeholder fixe indépendant de la locale, passe `placeholder` dans les options. Les listes de clés complètes sont dans les README [core](../packages/core/README.md) (section « i18n ») et [ui](../packages/ui/README.md) (section « i18n UI »). Les puces et le dialogue de variables se retraduisent à chaud, saisie conservée.

## 10. 👁️ Lecture seule

```ts
const instance = createAster(host, { readOnly: true, toolbar: false, content: html });

// ou à chaud
instance.editor.setReadOnly(true);
```

En lecture seule : le `contenteditable` passe à `false`, `commands.run` et `canRun` répondent `false` (la toolbar se grise d'elle-même sur `readOnlyChange`, sauf `fullscreen`, `print` et `outline` qui restent utilisables), les raccourcis sont inertes, la poignée des images, les bulles, le menu `/`, la suggestion `{{`, le double-clic des puces et le menu contextuel de table disparaissent, le contenu reste sélectionnable et copiable. `setReadOnly(false)` rend la main. Aucun `change` n'est émis dans un sens ni dans l'autre. Pour un rendu sans toolbar ni bordure, combine `toolbar: false` et un thème custom (voir [THEMING](./THEMING.md)). Les puces continuent de se rafraîchir sur `setValues` : un document en lecture seule peut servir d'aperçu vivant.

La vue source utilise ce même mécanisme : pendant qu'elle est ouverte, l'éditeur est en lecture seule et seul le bouton `source` reste actif ; `toggleSource()` est sans effet si l'éditeur était déjà en lecture seule avant.

Pour désactiver seulement certaines commandes tout en gardant l'édition : `disabledCommands: ['image.upload', 'codeBlock']` retire les commandes du registre, de la toolbar et avale leurs raccourcis. `disabledCommands: ['variable.insert']` retire du même coup le widget `variable`, la suggestion `{{` et le dialogue de puce, qui ne sont montés que si la commande existe.

## 11. 📦 Taille de bundle et imports dynamiques

- `core` + `ui` : moteur Tiptap/ProseMirror, extensions standard (recherche, variables, sommaire compris), toolbar, icônes, `@tiptap/suggestion` et `@floating-ui/dom` pour les panneaux flottants. Cible < 250 kB minifié hors gzip.
- `word` : le normaliseur de collage est léger ; **mammoth pèse ~660 kB** et **docx ~1,3 MB non minifiés**, chargés respectivement par `importDocx` et `exportDocx` en `await import()` au premier appel. `jszip` (dépendance de mammoth, déclarée explicitement) sert au prétraitement XML des champs de fusion avant mammoth.

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

## 12. 🧪 Tests e2e

Les tests Playwright (`e2e/`) couvrent les parcours réels dans Chromium : le playground vanilla (`scripts/vanilla-playground.mjs`, port 4300, `playground.spec.ts` et `variables.spec.ts` : import d'un modèle, panneau Variables, suggestion `{{`, widget, dialogue, exports) et la démo Angular (`ng serve`, port 4200, `demo.spec.ts`, page « Modèle » comprise). Playwright lance les deux serveurs lui-même et réutilise ceux déjà ouverts.

```bash
npx playwright install --with-deps chromium   # une fois
npm run e2e                                   # tout
npm run e2e -- --project=playground           # un seul projet
npm run e2e:ui                                # mode UI
```

Le rapport HTML est dans `e2e/playwright-report/`, les captures de chaque scénario dans `e2e/output/`. Les fixtures `.docx` et HTML Word du dossier `fixtures/` servent aux deux (import et collage). En CI, un job dédié exécute la suite après lint, typecheck, tests unitaires et build.

## 13. ✅ Checklist avant prod

- [ ] `instance.destroy()` appelé au démontage.
- [ ] Hook `upload` branché, pas de base64 en base.
- [ ] Sanitization serveur du HTML stocké, liste blanche alignée sur le schéma (`width` et `data-align` sur `img`, `id` sur les titres, `data-aster-variable` et `data-label` sur `span` compris).
- [ ] `linkPolicy` revue (protocoles, `target`, `rel`).
- [ ] `isEmpty()` pour le « requis », `change` pour `dirty`, `createAutosave` ou debounce pour la sauvegarde, `variablesChange` pour persister les valeurs.
- [ ] Variables : HTML stocké en mode `placeholders`, valeurs à part, `allowUnknown: false` si le jeu de variables est figé, mode d'export choisi (`resolve` pour le document final, `fields` pour un publipostage).
- [ ] `importDocx` / `exportDocx` en import dynamique, mammoth et docx en chunks séparés.
- [ ] Thème importé une seule fois (`aster.css`, ou `base.css` + un thème + les feuilles des fonctionnalités utilisées, `variables.css` et `bubbles.css` comprises).
- [ ] Locale fournie, dictionnaire complet si langue ajoutée (`command.search.*`, `command.variable.*`, `ui.variable.*`, `ui.slash.*` compris).
- [ ] `insertHTML` jamais appelé avec du HTML externe non nettoyé.
