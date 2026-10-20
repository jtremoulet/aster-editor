# 📎 Fixtures HTML de collage

> HTML tel que le presse-papier le fournit depuis Word 365, Word 2016 et Google Docs. Chaque fichier a son HTML attendu dans `expected/`.

| Fichier                       | Provenance                                   | Contenu                                                                                                            |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `word-365-list-nested.html`   | Structure Word 365 reconstituée (phase 0)    | Puces imbriquées 2 niveaux, paragraphe intermédiaire, numéros `1.`/`a)`                                            |
| `word-365-table.html`         | Structure Word 365 reconstituée (phase 0)    | Table 3 colonnes, en-tête en gras, `colspan=2`                                                                     |
| `word-2016-headings.html`     | Structure Word 2016 reconstituée (phase 0)   | `MsoTitle`, h1/h2, `MsoQuote`, span rouge, centré, lien, sub/sup/s/u, `mso-spacerun`                               |
| `google-docs-basic.html`      | Structure Google Docs reconstituée (phase 0) | Titre, gras/italique/souligné en spans, liste imbriquée, lien                                                      |
| `word-365-list-3-levels.html` | Lot L2                                       | 3 niveaux, romain au niveau 3, saut de niveau, reprise de numérotation, nouvelle instance `lfo`                    |
| `word-365-list-no-style.html` | Lot L2                                       | Sans `<style>` : détection puce/numéro au texte du marqueur                                                        |
| `word-365-variables.html`     | Lot L15 (session 2)                          | `{{nom}}` dans un paragraphe, dans un `<b>`, coupé sur deux spans, dans deux `<td>`, `{{ tva }}`, accolades seules |

Pour ajouter une capture réelle : dans Word, copier, puis dans la console du navigateur `document.addEventListener('paste', e => console.log(e.clipboardData.getData('text/html')))`, coller, et enregistrer la sortie ici.
