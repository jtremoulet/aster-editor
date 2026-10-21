# 🧭 Guide d'intégration — de zéro à un éditeur en prod

> Pas à pas pour embarquer Aster dans une app : montage, récupération du contenu, autosave, Markdown, upload d'images, export Word, modèles de documents, fidélité Word (import stylé, sections multiples, tabulations, bordures, vue page, export dans le gabarit, rapport de fidélité, migration 0.6), impression, sécurité, i18n, lecture seule, bundle, tests e2e. Chaque exemple est typechecké contre les sources de la session 4 (0.6.0).

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

`@aster-editor/angular` fournit `<aster-editor>` standalone, CVA, zoneless, SSR-safe : inputs signals (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config`, `wordPaste`, `ariaLabel`, `ariaLabelledBy`, `variables`, `variableValues`, `variableResolver`, `allowUnknownVariables`, `variableSuggestion`, et depuis la session 3 `importFidelity`, `exportInTemplate`, `pageView`, `layout`), outputs (`ready`, `changed`, `focused`, `blurred`, `variablesChanged`, `layoutChanged`), signals `editor()`, `variableNames()`, `importedTemplate()`, `layout()` et `lostObjects()`, méthodes `getHTML(options?)`, `resolveVariables()`, `importDocx(file)`, `exportDocx(options?)`, `compareWithTemplate()`, `provideAster(config)` pour la config globale, `ASTER_UPLOAD_HANDLER` pour l'upload. Importe `@aster-editor/ui/themes/aster.css` dans `styles.css`. Tout est dans le [README du paquet](../packages/angular/README.md), y compris le piège Vite à froid décrit plus bas ; la version Angular du chapitre « Modèles de documents » est au chapitre 6, celle de la fidélité Word au chapitre 7.7.

En deux lignes, ce que les sessions 3 et 4 changent côté Angular : `importDocx(file)` lit le `.docx` en mode **stylé** par défaut (`importFidelity: 'styled'`, qui est aussi le défaut de la lib `word` depuis la 0.6) et garde le gabarit ; `exportDocx()` réutilise ce gabarit tout seul (`exportInTemplate`, vrai par défaut), sections comprises ; `[pageView]="true"` affiche la feuille aux dimensions du document, une par section ; `compareWithTemplate()` rend le rapport de fidélité ; le composant suit l'événement `pageViewChange` du contrat.

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
- Le HTML est **sémantique et stable** : `<strong>`, `<em>`, `<u>`, `<s>`, `<sub>`, `<sup>`, `<code>`, `<mark>`, `<a>`, `<h1>`-`<h6>` (avec `id` si le sommaire a été utilisé ou si le HTML en avait), `<p>`, `<ul>`/`<ol>`/`<li>` (avec `<p>` dans chaque `li`), `<ul data-type="taskList">`, `<blockquote>`, `<pre><code>`, `<hr>` (`data-page-break` pour un saut de page), `<img>` (`width`, `height` et `data-align` éventuels, jamais de `<figure>`), `<table>` avec `thead`/`tbody`/`th`/`td` (sans `colgroup` ni `min-width`), `style="text-align: …"` sur paragraphes et titres, `<span style="color/background-color/font-family/font-size">` pour les styles de texte, `<span data-aster-variable="nom" data-label="…">{{nom}}</span>` pour les variables.
- **HTML stylé** (session 3) : un document importé en mode `styled`, ou mis en page avec les widgets de la toolbar, porte en plus des `style` inline normalisés et des attributs `data-docx-*`, sérialisés dans un ordre figé par le contrat (`api/layout.ts`) pour que `setHTML(getHTML())` reste idempotent. Sur `<p>` et `<h1>`-`<h6>` : `line-height`, `margin-top`, `margin-bottom`, `margin-left`, `margin-right`, `text-indent`, `border-top/right/bottom/left`, `background-color`, plus `data-border-between`, `data-docx-style`, `data-keep-next`, `data-page-break-before`, `data-docx-num-indent`. Sur `<span>` : `letter-spacing`, `text-transform: uppercase`, `font-variant: small-caps`, `data-docx-run-style` ; sur `<u>` et `<s>` : `text-decoration-style`. Sur `<ol>` / `<ul>` : `type`, `start`, `data-docx-num-id`, `data-bullet`. Sur `<table>` : `width`, `border-*`, `data-docx-style`, `data-align` ; sur `<td>` / `<th>` : `border-*`, `background-color`, `vertical-align`, `padding`, `colspan`, `rowspan`, `colwidth`. Depuis la session 4 (0.6.0) : `padding-<côté>` juste après une `border-<côté>` (espace texte-trait, `w:space` de Word), `border-<côté>: 0pt solid transparent` (bordure de style annulée, `nil`), `<hr data-section-break="n">` entre deux blocs de premier niveau (fin de la section `n`), et `<span data-tab="" data-stop="36pt" data-align="center" data-leader="dot"></span>` pour une tabulation (attributs optionnels, dans cet ordre). Rien de tout ça n'est interprété par l'éditeur au-delà de l'affichage : les `data-docx-*` servent à l'export dans le gabarit (chapitre 7). Ta sanitization serveur doit les laisser passer, voir le chapitre 9.

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

Sans `fetchImage`, seules les images en data URL sont embarquées, les autres remontent `image-skipped`. Les caractères de contrôle interdits par XML sont retirés, les espaces insécables conservés, `<ol start>` honoré. Depuis 0.4.0, l'export sait aussi produire l'habillage d'un vrai document Word : `header` / `footer` (texte ou HTML inline, `pageNumbers: 'x-of-y'`), `toc`, `numberedHeadings`, `headingStyles`, `page` (format, orientation, marges), `lang`, `defaultFont`, sauts de page (`data-page-break`) et notes de bas de page réelles. Depuis la session 3, `layout` (un `DocumentLayout`, en général celui de l'import) englobe `page`, `header`, `footer`, `defaultFont` et `lang`, et `template` greffe le corps dans le `.docx` d'origine : c'est le chapitre 7. Mapping complet, options et limites de l'aller-retour export → import dans le [README word](../packages/word/README.md). `downloadDocx` doit être appelé depuis un geste utilisateur (clic) et lève hors navigateur.

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

`result.variables` liste les variables du corps dans l'ordre d'apparition (avec `label` et `value` quand Word les connaît), puis celles des en-têtes et pieds. `define` les verse dans le magasin : les libellés alimentent les puces et les menus, les valeurs résolvent tout de suite les puces concernées. Les trois détections sont actives par défaut ; `pattern` remplace `{{nom}}` par ta propre syntaxe (`/\[([a-z_]+)\]/g`, groupe 1 = nom). Avec le composant Angular, `importDocx(file)` fait tout ça pour toi. Les variables sont détectées de la même façon sur les deux chemins de lecture (`fidelity: 'styled'` ou `'semantic'`, chapitre 7) : mêmes noms, mêmes libellés, mêmes valeurs.

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
- **En-têtes et pieds hors de l'éditeur** : en mode `semantic`, mammoth ne rend pas les en-têtes et pieds de page d'un `.docx` ; leurs `{{nom}}` sont remontés dans `result.variables` pour que tu les connaisses, mais leur contenu n'entre pas dans l'éditeur, redonne-les à l'export via `header` / `footer`. En mode `styled`, ils sont lus dans `result.layout.headers` / `footers` (HTML stylé), affichés en lecture seule par la vue page et conservés à l'octet par l'export dans le gabarit (chapitre 7) ; ils ne sont pas éditables dans le corps. La table des matières et la numérotation des titres restent produites à l'export et jetées à la réimportation.
- **Un nom invalide n'est pas une variable** : `{{a b}}` ou `{{nom}` restent du texte, dans l'éditeur comme à l'import. Un champ de fusion au nom non conforme est normalisé (`"Nom complet"` → `nom_complet`).
- **Les valeurs sont de la donnée** : jamais interprétées comme HTML, ni dans l'éditeur, ni dans `getHTML({ variables: 'resolve' })`, ni dans le `.docx`. Une valeur multi-ligne devient des sauts de ligne en `resolve` et des espaces dans le résultat d'un champ en `fields`.
- **`{{nom}}` chargé par `setHTML` n'est pas converti** : seul l'import `.docx`, le collage depuis Word ou Google Docs (`wordPasteTransformer`) et la saisie au clavier créent des puces. Pour un HTML stocké avant 0.4.0, passe-le une fois par `normalizeWordHtml` ou pose les `<span data-aster-variable>` toi-même.
- **Un motif personnalisé** (`pattern`) est appliqué tel quel à tout le texte, à l'import comme à l'export : sa complexité (ReDoS) relève de toi.

## 7. 📐 Fidélité Word

L'objectif de la session 3 : l'utilisateur **voit le document tel qu'il est** dès l'import, **modifie ce qu'il modifie**, et **sauvegarde dans le bon format**, c'est-à-dire un `.docx` qui ressort comme l'original partout où il n'a rien touché. Quatre briques, toutes dans `@aster-editor/word` sauf la vue page (`core` + `ui`) : l'import stylé, la vue page avec sa pagination approximative, l'export dans le gabarit, et le rapport de fidélité qui mesure le résultat. La session 4 (0.6.0) a comblé les pertes principales mesurées en session 3 : les **sections multiples** sont conservées de bout en bout, les **tabulations** sont de vrais nœuds avec leurs taquets, les **bordures** gardent leur couleur, leur espace texte-trait et leurs `nil`, les tableaux leur alignement et leurs styles conditionnels résolus ; et le défaut de `importDocx` est passé à `styled` (7.9).

### 7.1 Import stylé ou sémantique

`importDocx` a deux chemins de lecture, choisis par `options.fidelity` :

| `fidelity`   | Moteur                                 | Ce que tu obtiens                                                                                                                                                                                                                                                                                                          | `result.layout` / `template` / `lost`                                                                                         |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `'styled'`   | Lecteur OOXML d'Aster (`docx/reader/`) | HTML stylé : polices, tailles, couleurs, surlignages, soulignés stylés, casse, espacement, alignements, interlignes, espacements, retraits, bordures et fonds de paragraphe, tableaux complets, listes fidèles à `numbering.xml`, images dimensionnées, notes, `data-docx-*`, sauts de section et tabulations (session 4). | Mise en page de chaque section (`layout.sections`, la dernière recopiée au premier niveau), le `.docx` intact, objets perdus. |
| `'semantic'` | mammoth (comportement 0.4.x)           | HTML sémantique sans mise en forme : structure et emphase seulement.                                                                                                                                                                                                                                                       | `layout` vide (`{}`), `template` = les octets reçus, `lost` vide.                                                             |

> ⚠️ **Depuis la 0.6, le défaut de la lib est `styled`.** `importDocx(file)` sans option lit avec le lecteur OOXML d'Aster, comme le composant Angular, la page Import de la démo et le playground le faisaient déjà en 0.5. Pour retrouver le HTML nu de mammoth, passe `fidelity: 'semantic'` explicitement. Détail de la migration en 7.9.

```ts
const { importDocx } = await import('@aster-editor/word');
const result = await importDocx(file, { upload }); // `fidelity: 'styled'` est le défaut depuis la 0.6
editor.setHTML(result.html, false);
editor.variables.define(result.variables);
for (const warning of result.warnings) console.warn(`[${warning.code}] ${warning.message}`);
for (const lost of result.lost)
  console.warn(`objet ${lost.kind} perdu (${lost.where})`, lost.detail);
// À garder pour l'export : le .docx d'origine et sa mise en page.
const kept: { template: ArrayBuffer; layout: DocumentLayout } = {
  template: result.template,
  layout: result.layout,
};
```

Ce que le chemin stylé **conserve** (tout est relu par l'export, voir 7.4) :

| Famille    | Conservé                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run        | Police, taille, gras, italique, souligné (simple, double, pointillé, tirets, ondulé), barré (simple, double), couleur, surlignage, exposant, indice, espacement des caractères, majuscules et petites capitales, nom du style de caractère (`data-docx-run-style`). Résolus à travers `docDefaults`, le thème, les styles `basedOn` et les styles de tableau.                                                                                                  |
| Paragraphe | Alignement, interligne (multiple ou exact), espacements avant et après, retraits gauche, droite, première ligne et suspendu, bordures par côté (y compris `between`) avec leur couleur exacte, leur espace texte-trait (`padding-<côté>`, session 4) et les `nil` qui annulent une bordure de style (`0pt solid transparent`), fond, `keepWithNext`, `pageBreakBefore`, nom du style Word (`data-docx-style`), titres `Heading 1..6`.                          |
| Liste      | Format (`1`, `a`, `A`, `i`, `I`, puces avec leur caractère), niveaux, redémarrage et continuation, identifiant de numérotation du gabarit (`data-docx-num-id`), retraits venus de la numérotation marqués `data-docx-num-indent`.                                                                                                                                                                                                                              |
| Tableau    | Largeur (`%` ou `pt`), alignement du tableau (`data-align`, session 4), bordures extérieures sur `<table>`, bordures intérieures et directes sur les cellules (couleurs exactes, `nil`), **styles conditionnels** (première ligne, bandes…) résolus en propriétés directes de chaque cellule, fonds, alignement vertical, marges internes, largeurs de colonnes (`colwidth`), fusions horizontales et verticales, tableaux imbriqués, nom du style de tableau. |
| Image      | Image inline ou ancrée (DrawingML et VML, enveloppe `mc:AlternateContent`), largeur et hauteur, alignement d'ancre en `data-align`, octets passés au hook `upload` ou en data URL.                                                                                                                                                                                                                                                                             |
| Note       | Notes de bas de page et de fin, une seule séquence d'appels, même forme `data-footnotes` / `data-footnote` que le chemin sémantique.                                                                                                                                                                                                                                                                                                                           |
| Section    | **Toutes les sections** (session 4) : pour chacune, format de page (nommé ou libre), orientation, marges, distances d'en-tête et de pied, colonnes, type de saut (`start`), en-têtes et pieds `default`, `first`, `even` en HTML stylé (hérités entre sections comme Word le fait), première page différente ; police par défaut et langue du document. Dans le corps, un `<hr data-section-break="n">` marque la fin de chaque section sauf la dernière.      |
| Saut       | Saut de page explicite → `<hr data-page-break>`, saut de ligne → `<br>`, tabulation → nœud `<span data-tab>` avec la position, l'alignement et les points de suite de son taquet (session 4).                                                                                                                                                                                                                                                                  |

Ce qu'il **ne conserve pas**, écrit noir sur blanc :

- **Les styles conditionnels de tableau comme style** : résolus en propriétés directes (ce que Word rend), mais `w:tblLook` n'est pas réécrit à l'export : le tableau reste identique à l'écran et à l'ouverture, sa mise en forme ne suit plus le style dans Word (fixture 19 : 0,998).
- **L'alignement des taquets à l'écran** : le `.docx` ressort avec ses taquets `center` / `right` / `decimal`, mais la vue affiche toute tabulation comme un espace élastique aligné à gauche ; la n-ième tabulation d'un paragraphe prend le n-ième taquet (faux après un saut de ligne `<br>`), `w:defaultTabStop` n'est pas lu.
- **L'habillage des images ancrées** : une image flottante devient inline, alignée par `data-align` ; sa position exacte est perdue.
- **Les colonnes de section** : lues dans `layout.columns` / `sections[n].columns`, conservées par le gabarit, **non affichées** par la vue page. La numérotation de page par section et les bordures de page ne sont pas lues (conservées par le gabarit).
- **L'espace texte-trait d'une bordure `between`** (`spacePt`) : lu, sans sérialisation HTML, perdu.
- **Les objets non représentables** (7.6).

### 7.2 Variables sur le chemin stylé

Rien ne change par rapport au chapitre 6 : champs de fusion, contrôles de contenu et `{{nom}}` sont prétraités avant la lecture, les puces `<span data-aster-variable>` arrivent avec la mise en forme de leur run, et `result.variables` est identique sur les deux chemins (vérifié sur les fixtures 08-10 et sur le document client, 14 variables). L'export dans le gabarit respecte les trois modes (`placeholders`, `resolve`, `fields`) dans le corps, et résout aussi les variables des en-têtes et pieds du gabarit en mode `resolve`.

### 7.3 Vue page et pagination approximative

La vue page rend le `.ProseMirror` comme une feuille centrée sur un bureau, aux dimensions et marges de `layout.page`, avec les en-têtes et pieds `default` affichés en lecture seule au-dessus et au-dessous du corps. Elle s'active au montage (`pageView` dans `AsterOptions`, donc aussi dans `createAster` et dans `<aster-editor [pageView]>`) ou à chaud :

```ts
import '@aster-editor/ui/themes/page.css'; // déjà dans aster.css

const instance = createAster(host, {
  toolbar: 'standard', // le widget `pageLayout` est dans `full` ; `standard` a l'interligne et les retraits
  pageView: { layout: kept.layout, pagination: true, showHeadersFooters: true },
});

// À chaud, après un import : `setPageView`, `getLayout` et `getSectionLayout` sont au contrat
// `AsterEditor` depuis la 0.6, en méthodes optionnelles (un double de test peut ne pas les porter).
const { editor } = instance;
editor.setPageView?.({ layout: result.layout });
const current: DocumentLayout | null = editor.getLayout?.() ?? null;
const second: SectionLayout | null = editor.getSectionLayout?.(2) ?? null;
const off = editor.on('pageViewChange', ({ active, layout }) => console.log(active, layout));
editor.setPageView?.(false); // retire la feuille
off();
```

Le core pose `aster--page-view` et huit variables `--aster-page-*` (largeur, hauteur, quatre marges, distances d'en-tête et de pied) sur l'hôte, insère `div.aster-page-header` / `div.aster-page-footer` (HTML assaini par une liste blanche stricte : jamais de `<script>`, d'attribut `on*`, d'URL `javascript:` ni de `url()` dans un `style`), et `page.css` de `ui` dessine le reste. Le bouton « Mise en page » de la toolbar (widget `pageLayout`, preset `full`) édite format, orientation, marges, active ou retire la vue page et la pagination. `pageViewChange` (`{ editor, active, layout }`) est émis après chaque changement, l'état déjà à jour ; l'événement DOM `aster:page-view-change` sur `contentElement` reste là pour les plugins.

**Vue page par section** (session 4) : avec `layout.sections`, l'hôte porte les variables et l'en-tête de la **section 1** et le pied de la **dernière section que le corps ouvre** ; chaque `<hr data-section-break>` porte en style inline les variables de la section qu'il ouvre et la pagination change de feuille à ce point : coupure forcée (sauf saut `continuous`), hauteur utile de la nouvelle section, libellé « Section 2 · Letter paysage », en-tête de la section qui commence et pied de celle qui se termine dans la première coupure de chaque section. Approximation assumée : une seule largeur de feuille sur tout le document, celle de la plus large section (`--aster-page-width-max`), marges horizontales de la section 1 partout. Le dialogue « Mise en page » affiche « Section n sur N » et n'édite que la section du curseur (les autres sont conservées, jamais tronquées) ; `editor.getSectionLayout?.(n)` donne la mise en page de la section `n`.

**La pagination est approximative.** Un plugin ProseMirror mesure la hauteur rendue des blocs de premier niveau et pose, en décorations widget (jamais dans le document, jamais dans `getHTML()`), une coupure `div.aster-page-gap` avec « Page n / N » avant chaque bloc qui dépasse la zone utile (hauteur de page moins marges). Recalcul débouncé 150 ms après une modification, puis à la frame suivante ; redimensionnement observé. Ce qu'elle garantit et ce qu'elle ne garantit pas :

- Les sauts de page explicites (`<hr data-page-break>`, ou un nœud `pageBreak` d'intégrateur) forcent une coupure.
- Un tableau ou une liste **n'est jamais coupé** : il passe entier à la page suivante. Un bloc plus haut qu'une page occupe la sienne et déborde.
- Les en-têtes et pieds ne sont rendus qu'une fois par section (sur la feuille pour la première et la dernière, dans la première coupure de chaque section pour les autres), pas sur chaque page ; le pied affiché reçoit `data-page-count`.
- **Aucune exactitude avec Word** : polices de substitution, césure, interlignes « au moins », veuves et orphelines, `keepWithNext`, tableaux coupés par Word ne sont pas simulés. Le nombre de pages affiché est un ordre de grandeur, pas celui que Word imprimera. Rien de ce que la pagination calcule n'entre dans le `.docx`.
- Désactivable par `pagination: false` dans `PageViewOptions` ; hors vue page, le plugin est inerte.

### 7.4 Export dans le gabarit

`exportDocx(html, { template })` ne reconstruit pas un document : il **ouvre le `.docx` d'origine** et n'y remplace que le corps (`<w:body>`), régénéré depuis l'éditeur par la chaîne d'export habituelle, puis greffé avec remappage des identifiants de styles, de numérotation et de relations. Tout ce qui n'est pas le corps reste **identique à l'octet** : `styles.xml`, `numbering.xml`, `theme`, `fontTable`, `settings`, en-têtes, pieds, `docProps`, médias existants, et chaque `w:sectPr` (marges, colonnes, références d'en-têtes, de toutes les sections depuis la session 4). Sur les fixtures 11, 13 et 16, même `document.xml` ressort identique à l'octet après un aller-retour sans modification.

Quand l'utiliser : dès que le document vient d'un import (`result.template` est là) et que le client attend **son** document en retour, pas un document « façon Aster ». Sans gabarit, c'est l'export neuf de 0.4.x, inchangé, piloté par `layout` ou par `page` / `header` / `footer` / `defaultFont` / `lang`.

```ts
const { exportDocx, downloadDocx } = await import('@aster-editor/word');
const blob = await exportDocx(editor.getHTML(), {
  template: kept.template, // le .docx de l'import, intact
  layout: kept.layout, // ne sert qu'aux en-têtes / pieds modifiés (voir ci-dessous)
  variables: { mode: 'fields', values: editor.variables.getValues() },
  onWarning: (warning) => console.warn(`[${warning.code}] ${warning.message}`),
});
downloadDocx(blob, 'contrat');
```

Comment le corps est greffé, pour savoir ce qui ressort :

- **Styles** : un bloc ou un run qui porte `data-docx-style` / `data-docx-run-style` **réutilise** le style du gabarit (par identifiant, ou par nom localisé : `Lienhypertexte`, `Grilledutableau`) ; les propriétés directes égales au style résolu sont retirées, celles qui manquent par rapport aux `docDefaults` sont réécrites (sans cette réconciliation inverse, 159 runs du document client passaient de Calibri à Times). Un style de l'export neuf absent du gabarit (`Quote`, `Code`, `ListParagraph`) est **ajouté** à `styles.xml` ; un style introuvable partout garde ses propriétés directes avec `template-style-missing`. Les styles du gabarit ne sont jamais modifiés.
- **Listes** : une liste avec `data-docx-num-id` réutilise le `w:num` du gabarit (même compteur, mêmes puces, mêmes retraits) ; une liste neuve est ajoutée à `numbering.xml` sous un identifiant libre ; un `numId` disparu replie en numérotation neuve avec `template-numbering-fallback`.
- **Images, notes, relations** : médias ajoutés dans `word/media/` (octets déjà présents → partie réutilisée), notes ajoutées à `footnotes.xml`, relations remappées, `[Content_Types].xml` complété. Rien n'est supprimé.
- **En-têtes et pieds** : intacts à l'octet, sauf deux cas. En mode `resolve`, les variables des parties d'en-tête et de pied du gabarit (champs de fusion, contrôles, `{{nom}}`) sont remplacées par leurs valeurs. Si `layout.headers` / `layout.footers` diffèrent de ce que le lecteur relit dans le gabarit (l'utilisateur a édité l'en-tête dans ton UI), la partie est **régénérée** sous un nouveau nom et le `w:sectPr` final pointe dessus ; l'ancienne reste dans le paquet. Un type `even` greffé active `w:evenAndOddHeaders` dans `settings.xml`.
- **Sections** (session 4) : un corps à `k` sauts `<hr data-section-break>` donne `k + 1` sections. Le `w:sectPr` de chaque section est écrit dans le dernier paragraphe de son segment, **greffé depuis le gabarit** quand la section y existait (même nombre de sections : par index ; sinon par ses propriétés de page), copié tel quel avec ses références d'en-tête et de pied ; une section ajoutée dans l'éditeur est régénérée depuis `layout.sections[n]`. Un saut supprimé transmet les références d'en-tête de la section abandonnée à la suivante, comme Word, jamais sa « première page différente ». Un document à trois sections (le document client, la fixture 18) ressort avec ses trois `w:sectPr` et ses six parties d'en-tête et de pied à l'octet : c'était la principale perte mesurée en session 3.

Options **ignorées** avec un gabarit, parce qu'il les porte déjà : `page`, `pageSize`, `header`, `footer`, `defaultFont`, `lang`, `headingStyles`, et dans `layout` : `page`, `columns`, `titlePage`, `defaultFont`, `lang`. Options **appliquées** : `variables`, `toc` (avec `w:updateFields` dans `settings.xml`), `numberedHeadings` (numérotation posée en `w:numPr` direct sur chaque titre, puisque les styles du gabarit ne sont pas touchés), `title` et `creator` (`docProps/core.xml`), `layout.headers`, `layout.footers` et `layout.sections` (en-têtes et pieds de chaque section, correspondance des `w:sectPr`). La JSDoc de `template` dans `packages/word/src/export/types.ts` fait foi.

Replis et avertissements, tous sans exception levée :

| Code                          | Quand                                                                                             | Ce qui se passe                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `template-invalid`            | Le gabarit n'est pas un zip, n'a pas de partie principale, ou sa partie principale dépasse 16 Mo. | Export neuf à la place, comme sans `template`.                                                          |
| `template-numbering-fallback` | Une liste porte un `data-docx-num-id` qui n'existe plus dans `numbering.xml`.                     | Numérotation neuve ajoutée.                                                                             |
| `template-style-missing`      | Un style référencé n'existe ni dans le gabarit, ni dans l'export neuf, ou n'est pas du bon type.  | Propriétés directes seules (les styles intégrés de Word, `TOC1`, `Hyperlink`… ne sont jamais signalés). |
| `template-section-missing`    | Le gabarit n'a pas de `w:sectPr` final.                                                           | `layout.headers` / `footers` ignorés ; les sections intermédiaires du corps sont quand même écrites.    |

### 7.5 Rapport de fidélité et score

Le critère d'acceptation n'est pas une impression visuelle : `compareDocx(original, result)` compare les deux `.docx` **propriété par propriété** (texte, styles de paragraphe, format de paragraphe, format de run, listes, tableaux, images, notes, en-têtes et pieds, sections) après résolution des styles de chaque document, compare les parties annexes à l'octet, et rend un score pondéré entre 0 et 1. Une propriété ajoutée par le résultat compte comme perdue (strict, pour que les régressions se voient) ; les défauts de Word (gauche, portrait, une colonne, espacement nul) valent « absent ». Le comparateur mesure **ce que Word rend**, pas la forme XML : bordures de cellule effectives (style de tableau, formats conditionnels activés par `w:tblLook` compris, puis `w:tblBorders`, puis `w:tcBorders`, `nil` efface ; sans l'espace texte-trait `w:space`, que Word n'applique pas aux tableaux), saut de page comme frontière de bloc, champs de fusion par nom et résultat, largeurs à ±0,5 pt, taquets d'un paragraphe tabulé (position et alignement), alignement du tableau et drapeaux `w:tblLook` effectifs (session 4).

```ts
const { compareDocx } = await import('@aster-editor/word');
const report: FidelityReport = await compareDocx(kept.template, await blob.arrayBuffer());
console.log(report.score); // 1 = rien de perdu sur les propriétés comparées
for (const property of report.properties) {
  if (property.lost > 0) console.table(property.examples); // { where, expected, actual }
}
console.log(report.identicalParts, report.changedParts, report.lost, report.notes);
```

`npm run fidelity -- fixtures/docx/14-tableaux-riches.docx` fait le tour complet en ligne de commande (import `styled` → export dans le gabarit → `compareDocx`) et imprime le rapport en Markdown ; `--no-template` mesure l'export neuf, `--keep sortie.docx` garde le fichier produit, `--out rapport.md` écrit le rapport, `--threshold 0.98` fixe le code de sortie. Scores mesurés le 21/10/2026 (session 4, mesure finale après L46), aller-retour **sans modification**, parties annexes identiques à l'octet sur les dix documents :

| Document                       | Sans gabarit | Dans le gabarit | Ce qui manque encore                                                                                                    |
| ------------------------------ | -----------: | --------------: | ----------------------------------------------------------------------------------------------------------------------- |
| `11-styles-inline.docx`        |        0,986 |           **1** | rien                                                                                                                    |
| `12-paragraphes.docx`          |        0,988 |           **1** | rien (la tabulation est un `w:tab`, session 4)                                                                          |
| `13-styles-nommes.docx`        |        0,946 |           **1** | rien                                                                                                                    |
| `14-tableaux-riches.docx`      |        0,986 |           **1** | rien (centrage du tableau relu, session 4)                                                                              |
| `15-listes-numerotation.docx`  |        0,960 |           **1** | rien                                                                                                                    |
| `16-sections.docx`             |        0,875 |           **1** | rien (deux sections conservées, session 4)                                                                              |
| `17-objets-perdus.docx`        |        0,915 |           0,972 | texte d'une zone de texte réinjecté, texte d'une équation absent                                                        |
| `18-sections-triple.docx`      |        0,876 |           **1** | rien (trois sections, six en-têtes et pieds à l'octet)                                                                  |
| `19-tabulations-bordures.docx` |        0,985 |           0,998 | `w:tblLook` non réécrit : Word applique son masque par défaut au tableau à style conditionnel                           |
| `client/Modele_Demo_DER.docx`  |        0,686 |           0,995 | espaces finaux ×2, style `Lienhypertexte` et souligné ajoutés sur un lien, six bordures de cellule (traits gris → noir) |

Pour mémoire, en session 3 (20/10, L28c) : 16 → 0,756 (deux sections → une seule), client → 0,889 (trois sections → une), 14 → 0,998 (centrage perdu), 12 → 0,990 (tabulation relue comme un espace). La cible est ≥ 0,98 dans le gabarit (`compare-fixtures.spec.ts`) ; la 17 y est en `it.fails` documenté avec un plancher de non-régression, les autres assertées à la cible avec la liste exacte des pertes. Un aller-retour **avec une modification locale** (un mot changé) ne fait différer que le bloc touché dans `document.xml`, les autres parties restent intactes (`graft.spec.ts`). Tableau détaillé et dernière mesure dans [`fixtures/docx/README.md`](../fixtures/docx/README.md).

### 7.6 Objets non représentables

Formes, SmartArt, zones de texte flottantes, équations, graphiques, commentaires, révisions, objets incorporés et champs autres que fusion / numéro de page / sommaire / lien n'ont pas d'équivalent dans l'éditeur. La règle : **hors du corps** (en-têtes, pieds), ils sont conservés tels quels par le gabarit ; **dans le corps édité**, ils sont remplacés par leur texte quand ils en ont un (zone de texte, révision insérée, résultat d'un champ `DATE`), signalés dans `result.lost` (`{ kind, where, text?, detail? }`, `kind` parmi `textbox`, `shape`, `smartart`, `chart`, `equation`, `comment`, `revision`, `field`, `embedded-object`, `unknown`) et par un avertissement `object-lost`, puis perdus à l'export. Un objet n'est signalé qu'une fois. Affiche la liste à l'utilisateur avant qu'il n'exporte : c'est ce que fait la page « Modèle » de la démo.

### 7.7 Version Angular

```ts
@Component({
  selector: 'app-fidelity',
  imports: [AsterEditorComponent],
  template: `
    <input type="file" accept=".docx" (change)="onFile($event)" />
    <aster-editor
      importFidelity="styled"
      [exportInTemplate]="true"
      [pageView]="true"
      [layout]="layout()"
      (layoutChanged)="layout.set($event)"
    />
    <ul>
      @for (lost of editor().lostObjects(); track $index) {
        <li>{{ lost.kind }} ({{ lost.where }}) {{ lost.detail }}</li>
      }
    </ul>
    <button type="button" (click)="download()">Télécharger dans le gabarit</button>
    <button type="button" (click)="check()">Rapport de fidélité</button>
    <p>Score : {{ score() }}</p>
  `,
})
export class FidelityComponent {
  protected readonly editor = viewChild.required(AsterEditorComponent);
  protected readonly layout = signal<DocumentLayout | undefined>(undefined);
  protected readonly score = signal<number | null>(null);

  async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.layout.set(undefined); // l'input ne doit plus masquer la mise en page du nouvel import
    const result = await this.editor().importDocx(file); // styled, gabarit et mise en page conservés
    console.warn(result.warnings, result.lost);
  }

  async download(): Promise<void> {
    // Sans `template`, le gabarit importé est utilisé (exportInTemplate) ; sans import, export neuf.
    const blob = await this.editor().exportDocx({ variables: { mode: 'fields' } });
    const { downloadDocx } = await import('@aster-editor/word');
    downloadDocx(blob, 'contrat');
  }

  async check(): Promise<void> {
    const report = await this.editor().compareWithTemplate(); // null sans gabarit importé
    this.score.set(report?.score ?? null);
  }
}
```

La page « Modèle » de la démo (`apps/demo/src/app/pages/template.page.ts`) est l'implémentation de référence : vue page, panneau En-tête / Pied éditable (deux éditeurs Aster `minimal` dont le HTML est poussé dans `[layout]` : avec des sections, l'en-tête va dans `sections[0]`, celle que l'hôte affiche, et le pied dans la dernière section **et** au premier niveau, invariant du contrat), bouton « Rapport de fidélité » avec le tableau des propriétés perdues, liste des objets non représentables, téléchargement dans le gabarit.

### 7.8 Document client

Le document de référence de la session (`Modele_Demo_DER.docx` : 196 paragraphes, 8 tableaux, 3 sections, 20 champs de fusion dont un imbriqué, 10 révisions, un pied de page) est **hors dépôt** : `fixtures/docx/client/` est ignoré par git tant que Joris n'a pas dit s'il peut être publié. Les tests qui le lisent (`client-doc.spec.ts`, `compare-fixtures.spec.ts`, `blocks-fixtures.spec.ts`) sont en `describe.skipIf` : ils passent sans le fichier et s'activent dès qu'il est déposé. Pour mesurer ton propre document : dépose-le dans ce dossier, `npm run fidelity -- fixtures/docx/client/mon-document.docx`. Score en session 4 : **0,995** dans le gabarit, trois sections conservées à l'octet.

### 7.9 Migration 0.6 : `importDocx` lit en `styled` par défaut

Ce qui change pour un intégrateur de la lib `@aster-editor/word` appelée directement (le composant Angular, la démo et le playground lisaient déjà en `styled`) :

- `importDocx(file)` sans option produit désormais le **HTML stylé** (chapitre 3 : `style` de mise en page, `data-docx-*`, `data-section-break`, `data-tab`…), `layout` (sections comprises), `template` et `lost` renseignés, et ne charge plus mammoth. L'ancien comportement reste disponible : `importDocx(file, { fidelity: 'semantic' })`. `styleMap` n'a d'effet qu'en `semantic`.
- Si ton code passait déjà `fidelity` explicitement (ce que la 0.5 recommandait), rien ne change.
- **Côté serveur**, ta sanitization doit accepter le HTML stylé, sinon l'export dans le gabarit se dégrade sans erreur : voir la liste du chapitre 9. Un `data-*` inconnu de l'export est ignoré, jamais interprété.
- Le HTML stylé est plus volumineux que le HTML sémantique (un `style` par bloc qui diffère des défauts du document) : vérifie tes limites de taille de champ.
- Les attendus du chemin sémantique sont figés dans `fixtures/docx/expected/semantic/` (01-03, 08-10) : le comportement 0.4.x est testé tel quel, pas seulement « encore disponible ».

```ts
const styledByDefault = await importDocx(file); // 0.6 : lecteur OOXML, `layout.sections`, `template`
const legacy = await importDocx(file, { fidelity: 'semantic' }); // 0.5 : mammoth, `layout` vide
console.log(styledByDefault.layout.sections?.length ?? 1, Object.keys(legacy.layout).length); // n, 0
```

## 8. 🖨️ Imprimer

Le widget `print` (dans le preset `full`, ou `{ type: 'widget', widget: 'print' }`) ouvre une fenêtre vierge, y écrit `getHTML()` dans un document autonome (`.aster-print`, feuille embarquée noir sur blanc, `lang` de la locale) et appelle `print()` ; la fenêtre se ferme après `afterprint`. Par code : `printEditor(editor)` rend `false` si un bloqueur de popups a refusé la fenêtre. Pour imprimer la page hôte elle-même, `print.css` masque toolbar, panneaux et surlignages en `@media print`.

```ts
import { printEditor } from '@aster-editor/ui';

const instance = createAster(host, { toolbar: [[{ type: 'widget', widget: 'print' }]] });
printEditor(instance.editor);
```

## 9. 🔒 Sécurité

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

1. **Sanitize le HTML stocké** avec une lib serveur (DOMPurify côté Node, `sanitize-html`, Bleach, HtmlSanitizer…) configurée sur la liste des balises et attributs de la section 3. Autorise `style` uniquement avec `text-align`, `color`, `background-color`, `font-family`, `font-size`, et `width`, `data-align` sur `img`, `data-type`, `data-checked` sur les listes de tâches, `id` sur les titres, `data-aster-variable` et `data-label` sur `span`. **Avec l'import stylé** (le défaut depuis la 0.6), ajoute les propriétés et attributs du HTML stylé (section 3) : `line-height`, `margin-*`, `text-indent`, `border-*` (y compris la valeur `0pt solid transparent`), `padding-*` et `padding`, `background-color`, `letter-spacing`, `text-transform`, `font-variant`, `text-decoration-style`, `width`, `vertical-align` dans `style` ; `data-docx-style`, `data-docx-run-style`, `data-docx-num-id`, `data-docx-num-indent`, `data-bullet`, `data-keep-next`, `data-page-break-before`, `data-border-between`, `data-page-break`, `data-section-break` sur `hr`, `data-tab`, `data-stop`, `data-align` et `data-leader` sur `span`, `data-align` sur `table`, `data-footnotes`, `data-footnote`, `data-footnote-ref`, `type`, `start`, `colspan`, `rowspan`, `colwidth`, `height`. Les valeurs de `style` sont des longueurs (`pt`, nombre sans unité, `%`), des couleurs `#rrggbb`, `transparent` et des mots-clés : refuse tout `url(`, `expression(` et `\` dans un `style`, comme le fait l'assainisseur des en-têtes du core. Un `data-docx-*` inconnu de l'export est ignoré, jamais interprété : le garder ne coûte rien, le perdre dégrade l'export dans le gabarit (un `data-section-break` perdu fait disparaître une section, un `data-tab` perdu une tabulation).
2. **Resanitize à l'affichage** si le contenu peut venir d'une autre source que ton API, ou rends-le via l'éditeur en lecture seule (le schéma refiltre).
3. **Valide les URLs** des `href` et `src` avec la même liste blanche de protocoles.
4. **Valide les noms de variables** reçus (même règle que le core) et traite les valeurs comme du texte.
5. **CSP** : `script-src` sans `unsafe-inline`, et `img-src` restreint à ton domaine d'upload si tu n'acceptes pas les images externes (ajoute `data:` si tu gardes le repli base64, `blob:` pour les aperçus).
6. **Stocke aussi le JSON** si tu veux retraiter le contenu sans reparser du HTML.

## 10. 🌍 i18n

`fr` et `en` sont intégrés dans le core (77 clés) et dans `ui` (182 clés). La locale se passe au montage et se change à chaud :

```ts
const { editor } = createAster(host, { locale: 'en' });
editor.i18n.setLocale('fr'); // émet localeChange, la toolbar et le placeholder se retraduisent
```

Ajouter une langue : deux dictionnaires à fusionner, celui des commandes (`command.*`, `search.*`, `variable.*`, `formatPainter.*`, `paragraph.*`, `text.*` et `section.*` compris, `editor.*`, `variable.unresolved`, `pageView.page` / `pageView.of` pour le libellé « Page n sur N » de la pagination, `pageView.section` / `pageView.portrait` / `pageView.landscape` pour « Section n · A4 paysage ») et celui de l'UI (`ui.*`, dont `ui.lineSpacing.*`, `ui.paragraphSpacing.*`, `ui.borders.*`, `ui.caps.*`, `ui.underlineStyle.*`, `ui.pageLayout.*` depuis la session 3, `ui.pageLayout.section` et `sectionMixed` depuis la session 4). `en` est le repli pour toute clé manquante.

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

## 11. 👁️ Lecture seule

```ts
const instance = createAster(host, { readOnly: true, toolbar: false, content: html });

// ou à chaud
instance.editor.setReadOnly(true);
```

En lecture seule : le `contenteditable` passe à `false`, `commands.run` et `canRun` répondent `false` (la toolbar se grise d'elle-même sur `readOnlyChange`, sauf `fullscreen`, `print` et `outline` qui restent utilisables), les raccourcis sont inertes, la poignée des images, les bulles, le menu `/`, la suggestion `{{`, le double-clic des puces et le menu contextuel de table disparaissent, le contenu reste sélectionnable et copiable. `setReadOnly(false)` rend la main. Aucun `change` n'est émis dans un sens ni dans l'autre. Pour un rendu sans toolbar ni bordure, combine `toolbar: false` et un thème custom (voir [THEMING](./THEMING.md)). Les puces continuent de se rafraîchir sur `setValues` : un document en lecture seule peut servir d'aperçu vivant.

La vue source utilise ce même mécanisme : pendant qu'elle est ouverte, l'éditeur est en lecture seule et seul le bouton `source` reste actif ; `toggleSource()` est sans effet si l'éditeur était déjà en lecture seule avant.

Pour désactiver seulement certaines commandes tout en gardant l'édition : `disabledCommands: ['image.upload', 'codeBlock']` retire les commandes du registre, de la toolbar et avale leurs raccourcis. `disabledCommands: ['variable.insert']` retire du même coup le widget `variable`, la suggestion `{{` et le dialogue de puce, qui ne sont montés que si la commande existe.

## 12. 📦 Taille de bundle et imports dynamiques

- `core` + `ui` : moteur Tiptap/ProseMirror, extensions standard (recherche, variables, sommaire, mise en page, pagination compris), toolbar, icônes, `@tiptap/suggestion` et `@floating-ui/dom` pour les panneaux flottants. Cible < 250 kB minifié hors gzip.
- `word` : le normaliseur de collage est léger ; **mammoth pèse ~660 kB** et **docx ~1,3 MB non minifiés**, chargés respectivement par `importDocx` en mode `semantic` et par `exportDocx` en `await import()` au premier appel. Le lecteur OOXML du mode `styled` et le comparateur n'ont besoin que de `jszip` (déjà là pour le prétraitement XML des champs de fusion) et du `DOMParser` du navigateur : un import `styled` ne charge pas mammoth. L'export dans le gabarit charge `docx` comme l'export neuf.

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

## 13. 🧪 Tests e2e

Les tests Playwright (`e2e/`, 74 tests dans 5 specs sans Firefox, 87 avec) couvrent les parcours réels : le playground vanilla (`scripts/vanilla-playground.mjs`, port 4300, `playground.spec.ts`, `variables.spec.ts` : import d'un modèle, panneau Variables, suggestion `{{`, widget, dialogue, exports ; `fidelity.spec.ts` : import stylé, vue page, pagination, export gabarit ; `sections.spec.ts`, session 4 : import de la fixture à trois sections, feuille et coupure de section, dialogue « Mise en page » par section, `section.insertBreak` et undo, tabulations à la touche Tab, export dans le gabarit avec trois `w:sectPr` relus dans le zip) et la démo Angular (`ng serve`, port 4200, `demo.spec.ts`, page « Modèle » comprise). Projets : `playground` et `demo` sur Chromium, `playground-webkit` et `playground-firefox` (session 4) qui rejouent `fidelity.spec.ts` et `sections.spec.ts` sur le playground. Le projet Firefox est **sondé au démarrage** (`firefox --version`) et retiré s'il ne se lance pas (sur la machine de la session, erreur de configuration côte à côte Windows, `mozglue` introuvable, même après réinstallation forcée) ; `ASTER_E2E_FIREFOX=1` le force, `0` le retire. Playwright lance les deux serveurs lui-même et réutilise ceux déjà ouverts.

```bash
npx playwright install --with-deps chromium webkit firefox   # une fois
npm run e2e                                   # tout
npm run e2e -- --project=playground           # un seul projet
npm run e2e -- --project=playground-webkit    # fidélité et sections sur WebKit
npm run e2e:ui                                # mode UI
```

Le rapport HTML est dans `e2e/playwright-report/`, les captures de chaque scénario dans `e2e/output/`. Les fixtures `.docx` et HTML Word du dossier `fixtures/` servent aux deux (import et collage). En CI, un job dédié exécute la suite après lint, typecheck, tests unitaires et build.

## 14. ✅ Checklist avant prod

- [ ] `instance.destroy()` appelé au démontage.
- [ ] Hook `upload` branché, pas de base64 en base.
- [ ] Sanitization serveur du HTML stocké, liste blanche alignée sur le schéma (`width`, `height` et `data-align` sur `img`, `id` sur les titres, `data-aster-variable` et `data-label` sur `span` compris) et, puisque l'import est `styled` par défaut, sur le HTML stylé du chapitre 3 (`style` de mise en page avec `padding-*` et `0pt solid transparent`, `data-docx-*`, `data-keep-next`, `data-page-break-before`, `data-border-between`, `data-bullet`, `colwidth`, `data-section-break`, `data-tab` / `data-stop` / `data-align` / `data-leader`, `data-align` sur `table`).
- [ ] Migration 0.6 (chapitre 7.9) : `importDocx` lit en `styled` par défaut ; passe `fidelity: 'semantic'` si ton application attend le HTML nu de mammoth.
- [ ] Touche Tab : `tabKey: 'focus'` (défaut) dans un formulaire, `'insert'` seulement pour un éditeur de document plein écran où une tabulation vaut mieux qu'un changement de focus.
- [ ] `result.template` et `result.layout` conservés tant que le document est ouvert, repassés à `exportDocx({ template, layout })` ; `result.lost` montré à l'utilisateur.
- [ ] Vue page : `page.css` chargée (ou `aster.css`), pagination présentée comme approximative, jamais comme le rendu Word.
- [ ] `linkPolicy` revue (protocoles, `target`, `rel`).
- [ ] `isEmpty()` pour le « requis », `change` pour `dirty`, `createAutosave` ou debounce pour la sauvegarde, `variablesChange` pour persister les valeurs.
- [ ] Variables : HTML stocké en mode `placeholders`, valeurs à part, `allowUnknown: false` si le jeu de variables est figé, mode d'export choisi (`resolve` pour le document final, `fields` pour un publipostage).
- [ ] `importDocx` / `exportDocx` en import dynamique, mammoth et docx en chunks séparés.
- [ ] Thème importé une seule fois (`aster.css`, ou `base.css` + un thème + les feuilles des fonctionnalités utilisées, `variables.css` et `bubbles.css` comprises).
- [ ] Locale fournie, dictionnaire complet si langue ajoutée (`command.search.*`, `command.variable.*`, `ui.variable.*`, `ui.slash.*` compris).
- [ ] `insertHTML` jamais appelé avec du HTML externe non nettoyé.
