# 🎨 Théming — Aster Editor

> Anatomie DOM, classes d'état, variables `--aster-*`, thème custom complet et surcharge de la mise en forme du contenu. Tout ce qui est thémable passe par des variables ; les classes sont stables et préfixées `aster-`.

## 🧬 Anatomie DOM

Produite par `createAster` (le core seul ne crée que `.aster-content` et son `.ProseMirror`) :

```html
<div class="aster" data-theme="light">
  <div class="aster__toolbar">
    <div class="aster-toolbar" role="toolbar" aria-label="Barre de mise en forme">
      <div class="aster-toolbar__group" role="group">
        <button
          class="aster-toolbar__button"
          data-toolbar-item
          data-command="bold"
          aria-pressed="false"
        >
          <span class="aster-toolbar__icon"><svg>…</svg></span>
        </button>
      </div>
      <div class="aster-toolbar__group" role="group">
        <div class="aster-dropdown">
          <button
            class="aster-toolbar__button aster-dropdown__trigger"
            aria-haspopup="menu"
            aria-expanded="false"
          >
            <span class="aster-toolbar__text">Paragraphe</span>
            <span class="aster-dropdown__chevron"><svg>…</svg></span>
          </button>
          <div class="aster-dropdown__panel aster-menu aster-menu--heading" role="menu" hidden>
            <button
              class="aster-toolbar__button aster-menu__item aster-menu__item--h1"
              role="menuitemradio"
              aria-checked="false"
            >
              …
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="aster__content">
    <div class="aster-content">
      <div class="ProseMirror" contenteditable="true">…</div>
    </div>
  </div>
</div>
```

### Classes de structure

| Sélecteur                                                                                                                                              | Élément                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `.aster`                                                                                                                                               | Racine. Porte `data-theme` et les variables. Bordure, fond, rayon `--aster-radius-lg`. |
| `.aster__toolbar`                                                                                                                                      | Bande de toolbar (fond `--aster-surface-2`, bordure basse).                            |
| `.aster__content`                                                                                                                                      | Conteneur du contenu, `flex: 1`.                                                       |
| `.aster-toolbar`                                                                                                                                       | La toolbar elle-même (`role="toolbar"`), flex wrap.                                    |
| `.aster-toolbar__group`                                                                                                                                | Groupe d'items, séparé par une bordure droite.                                         |
| `.aster-toolbar__button`                                                                                                                               | Tout bouton (commande, déclencheur, entrée de menu, bouton de dialogue).               |
| `.aster-toolbar__icon`                                                                                                                                 | Enveloppe de l'icône SVG, 20 × 20.                                                     |
| `.aster-toolbar__text`                                                                                                                                 | Texte visible d'un bouton.                                                             |
| `.aster-dropdown`                                                                                                                                      | Conteneur d'un dropdown (`position: relative`).                                        |
| `.aster-dropdown__trigger`                                                                                                                             | Bouton déclencheur.                                                                    |
| `.aster-dropdown__chevron`                                                                                                                             | Chevron du déclencheur.                                                                |
| `.aster-dropdown__panel`                                                                                                                               | Panneau flottant (`position: absolute`, `z-index: 50`, ombre `--aster-shadow`).        |
| `.aster-menu`                                                                                                                                          | Panneau en liste verticale.                                                            |
| `.aster-menu__item`                                                                                                                                    | Entrée de menu.                                                                        |
| `.aster-menu--heading`, `.aster-menu__item--paragraph`, `.aster-menu__item--h1` … `--h6`                                                               | Menu des titres, chaque entrée rendue à sa taille.                                     |
| `.aster-menu--font`, `.aster-menu--font-size`                                                                                                          | Menus police et taille.                                                                |
| `.aster-color-picker`, `__none`, `__grid`, `__swatch`, `__preview`, `__preview--empty`                                                                 | Sélecteur de couleur.                                                                  |
| `.aster-table-picker`, `__size`, `__grid`, `__cell`, `__actions`                                                                                       | Grille d'insertion de table.                                                           |
| `.aster-dialog`, `__field`, `__label`, `__input`, `__error`, `__check`, `__checkbox`, `__actions`, `__button`, `__button--primary`, `__button--danger` | Dialogues lien et image.                                                               |
| `.aster-link-dialog`, `.aster-image-dialog`, `.aster-image-dialog__from-file`, `.aster-image-dialog__file`                                             | Spécifiques aux deux dialogues.                                                        |
| `.aster-content`                                                                                                                                       | Zone de contenu (police, taille, interligne du contenu).                               |
| `.aster-content .ProseMirror`                                                                                                                          | Le `contenteditable` : `min-height`, padding, mise en forme des blocs.                 |

### Classes et attributs d'état

| État                      | Sélecteur                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Bouton actif (enfoncé)    | `.aster-toolbar__button--active`, `.aster-toolbar__button[aria-pressed='true']`            |
| Bouton désactivé          | `.aster-toolbar__button:disabled`, `[aria-disabled='true']`                                |
| Focus clavier             | `.aster-toolbar__button:focus-visible` (anneau `--aster-focus-ring`)                       |
| Dropdown ouvert           | `.aster-dropdown--open`, déclencheur `[aria-expanded='true']`                              |
| Entrée de menu cochée     | `.aster-menu__item--checked`, `[aria-checked='true']`                                      |
| Pastille cochée           | `.aster-color-picker__swatch--checked`, `[aria-checked='true']`                            |
| Cellule survolée (grille) | `.aster-table-picker__cell--hover`                                                         |
| Champ invalide            | `.aster-dialog__input[aria-invalid='true']`, `.aster-dialog__error` (caché via `[hidden]`) |
| Éditeur focalisé          | `.aster-content .ProseMirror:focus-visible`, `.ProseMirror-focused`                        |
| Lecture seule             | `.aster-content .ProseMirror[contenteditable='false']`                                     |
| Document vide             | `.ProseMirror p.is-editor-empty:first-child::before` (placeholder via `data-placeholder`)  |
| Nœud sélectionné          | `figure.aster-image--selected` (image), cellule `.selectedCell::after`                     |
| Panneau retourné          | `.aster-dropdown__panel--flip` quand le panneau déborderait à droite du viewport           |
| Curseurs ProseMirror      | `.ProseMirror-gapcursor`, `.ProseMirror-dropcursor`, `.column-resize-handle`               |
| Commande d'un bouton      | `[data-command='bold']` (utile pour cibler un bouton précis)                               |
| Image alignée             | `.ProseMirror img[data-align='center' \| 'right']`                                         |
| Liste de tâches           | `.ProseMirror ul[data-type='taskList']`                                                    |

## 🎛️ Variables

Définies sur `.aster[data-theme='light']` (`light.css`) et `.aster[data-theme='night']` (`night.css`), avec des valeurs de repli sur `.aster` dans `base.css`. Liste complète et valeurs dans le [README ui](../packages/ui/README.md), section « Thèmes ». Rappel des familles :

- **Surfaces** : `--aster-surface`, `--aster-surface-2`, `--aster-surface-3`
- **Texte** : `--aster-text`, `--aster-text-muted`
- **Accent** : `--aster-accent`, `--aster-accent-contrast`, `--aster-accent-soft`
- **Bordures** : `--aster-border`, `--aster-border-strong`
- **Danger** : `--aster-danger`, `--aster-danger-contrast`
- **Rayons et espacements** : `--aster-radius`, `--aster-radius-lg`, `--aster-space-1` … `--aster-space-4`
- **Typographie** : `--aster-font-ui`, `--aster-font-content`, `--aster-font-mono`, `--aster-font-size-ui`, `--aster-font-size-content`, `--aster-line-height`
- **Divers** : `--aster-shadow`, `--aster-focus-ring`, `--aster-button-size`, `--aster-content-min-height`, `--aster-highlight`, `--aster-selection`

Chaque thème pose aussi `color-scheme` (`light` / `dark`) pour les contrôles natifs (cases à cocher des listes de tâches, `<input type="file">`).

## 🏢 Exemple : thème « corporate » complet

Un fichier CSS, chargé après `base.css`. Ici on repart de zéro sur toutes les variables, mais tu peux ne surcharger que quelques-unes en empilant sur `light` : `.aster[data-theme='corporate']` avec juste `--aster-accent` fonctionne, les autres valeurs viennent du repli de `base.css`.

```css
/* corporate.css */
.aster[data-theme='corporate'] {
  --aster-surface: #ffffff;
  --aster-surface-2: #f3f6f4;
  --aster-surface-3: #e4ebe7;
  --aster-text: #15201b;
  --aster-text-muted: #5b6b63;
  --aster-accent: #0b7a75;
  --aster-accent-contrast: #ffffff;
  --aster-accent-soft: rgba(11, 122, 117, 0.14);
  --aster-border: #cfd9d4;
  --aster-border-strong: #9fb0a8;
  --aster-danger: #b3261e;
  --aster-danger-contrast: #ffffff;
  --aster-radius: 3px;
  --aster-radius-lg: 4px;
  --aster-space-1: 4px;
  --aster-space-2: 8px;
  --aster-space-3: 12px;
  --aster-space-4: 16px;
  --aster-font-ui: 'Inter', system-ui, sans-serif;
  --aster-font-content: 'Inter', system-ui, sans-serif;
  --aster-font-mono: 'Fira Code', Consolas, monospace;
  --aster-font-size-ui: 13px;
  --aster-font-size-content: 15px;
  --aster-line-height: 1.55;
  --aster-shadow: 0 4px 16px rgba(21, 32, 27, 0.12);
  --aster-focus-ring: 0 0 0 2px var(--aster-surface), 0 0 0 4px var(--aster-accent);
  --aster-button-size: 30px;
  --aster-content-min-height: 320px;
  --aster-highlight: #ffe8a3;
  --aster-selection: rgba(11, 122, 117, 0.2);
  color-scheme: light;
}

/* Variante sombre du même thème, activée par le système */
@media (prefers-color-scheme: dark) {
  .aster[data-theme='corporate'] {
    --aster-surface: #121a17;
    --aster-surface-2: #192420;
    --aster-surface-3: #22302b;
    --aster-text: #e6ede9;
    --aster-text-muted: #9fb0a8;
    --aster-accent: #4fc3bc;
    --aster-accent-contrast: #06201e;
    --aster-accent-soft: rgba(79, 195, 188, 0.2);
    --aster-border: #2e3d37;
    --aster-border-strong: #4a5e56;
    --aster-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    --aster-highlight: #6b5500;
    --aster-selection: rgba(79, 195, 188, 0.3);
    color-scheme: dark;
  }
}
```

```ts
import '@aster-editor/ui/themes/base.css';
import './corporate.css';
import { createAster } from '@aster-editor/ui';

const instance = createAster(host, { theme: 'corporate' });
instance.setTheme('corporate'); // ou 'light' / 'night' si tu as aussi chargé ces thèmes
```

Vérifie le contraste AA (texte sur surface ≥ 4.5:1, accent-contrast sur accent ≥ 4.5:1) : les thèmes fournis le respectent.

## ✍️ Surcharger la mise en forme du contenu

`base.css` style le contenu via `.aster-content .ProseMirror …` avec des règles de spécificité `0,2,1` ou `0,2,2`. Pour surcharger, cible au moins aussi précisément, idéalement en préfixant par ton thème :

```css
/* Titres plus serrés et numérotés */
.aster[data-theme='corporate'] .aster-content .ProseMirror h2 {
  font-size: 1.4em;
  border-bottom: 1px solid var(--aster-border);
  padding-bottom: 0.2em;
}

/* Tables zébrées */
.aster[data-theme='corporate'] .aster-content .ProseMirror tbody tr:nth-child(even) td {
  background: var(--aster-surface-2);
}

/* Images centrées avec légende implicite */
.aster[data-theme='corporate'] .aster-content .ProseMirror img {
  margin-left: auto;
  margin-right: auto;
  box-shadow: var(--aster-shadow);
}

/* Blocs de code sans bordure */
.aster[data-theme='corporate'] .aster-content .ProseMirror pre {
  border: 0;
  background: var(--aster-surface-3);
}

/* Placeholder en italique */
.aster[data-theme='corporate'] .aster-content .ProseMirror p.is-editor-empty:first-child::before {
  font-style: italic;
}
```

Règles de `base.css` à connaître pour ne pas se battre contre elles :

- `.ProseMirror > * + *` pose `margin-top: 0.75em` entre blocs de premier niveau ; les `p` ont `margin: 0`.
- Les titres ont `margin: 1.2em 0 0.4em`, le premier enfant du document `margin-top: 0`.
- Les listes ont `padding-left: 1.6em`, les `li > p` `margin: 0`.
- Les tables sont `table-layout: fixed; width: 100%`, enveloppées dans `.tableWrapper` (scroll horizontal).
- Les images sont `display: block; max-width: 100%`, alignées via `data-align`.
- Le `mark` utilise `--aster-highlight` sauf si une couleur est posée inline (surlignage multicolore).

## 🖨️ Rendu hors éditeur

Pour afficher le HTML stocké avec la même mise en forme sans monter d'éditeur, enveloppe-le dans la même structure et charge `base.css` + ton thème :

```html
<div class="aster" data-theme="light">
  <div class="aster-content"><div class="ProseMirror">…HTML stocké…</div></div>
</div>
```

Ou monte un éditeur `readOnly: true, toolbar: false` : le schéma refiltre le HTML au passage, ce qui vaut une sanitization de plus côté client.

> ℹ️ Depuis 0.3.0, les règles des tables redimensionnables (`.tableWrapper`, `.column-resize-handle`, `.resize-cursor`) et des images (`figure.aster-image`) vivent dans `images-tables.css`, importé par `aster.css`. `base.css` seul ne suffit plus pour ces fonctionnalités.
