/**
 * Contenu initial des pages de démo : un document qui exerce titres, marques, liste
 * imbriquée, table et lien, pour voir d'un coup d'œil le rendu de chaque thème.
 */
export const SAMPLE_CONTENT = `
<h1>Bienvenue dans Aster Editor</h1>
<p>Un éditeur de texte riche <strong>MIT</strong>, construit sur <em>Tiptap 3</em>, pensé pour
être posé dans un formulaire Angular en trois lignes. Ce document d'exemple montre ce que
l'éditeur sait <u>produire</u> et <s>reprendre</s> tel quel.</p>
<h2>Ce que tu peux essayer</h2>
<ul>
  <li><p>Mettre en forme : gras, italique, <code>code</code>, couleurs, alignement</p></li>
  <li><p>Structurer le texte</p>
    <ul>
      <li><p>titres de niveau 1 à 6</p></li>
      <li><p>listes à puces, numérotées, imbriquées</p></li>
      <li><p>citations et règles horizontales</p></li>
    </ul>
  </li>
  <li><p>Insérer une table, un lien, une image</p></li>
</ul>
<h3>Une table</h3>
<table>
  <tbody>
    <tr><th><p>Paquet</p></th><th><p>Rôle</p></th></tr>
    <tr><td><p>@aster-editor/core</p></td><td><p>moteur, commandes, i18n</p></td></tr>
    <tr><td><p>@aster-editor/ui</p></td><td><p>toolbar et thèmes</p></td></tr>
    <tr><td><p>@aster-editor/angular</p></td><td><p>composant et reactive forms</p></td></tr>
  </tbody>
</table>
<blockquote><p>Le HTML produit est sémantique et stable : <code>setHTML(getHTML())</code> est idempotent.</p></blockquote>
<p>Documentation : <a href="https://tiptap.dev">tiptap.dev</a>.</p>
`;
