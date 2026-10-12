import type { AsterEditor } from '../api';
import { htmlToMarkdown, type HtmlParser } from './html-to-markdown';
import { escapeHtml, markdownToHtml, parseInline } from './markdown-to-html';

export { htmlToMarkdown, markdownToHtml, escapeHtml, parseInline, type HtmlParser };

/**
 * Markdown du document courant. Fonction compagnon plutôt que méthode : le contrat
 * `AsterEditor` est figé, et passer par `getHTML()` garantit la même normalisation
 * que l'export HTML.
 */
export function getMarkdown(editor: AsterEditor): string {
  return htmlToMarkdown(editor.getHTML());
}

/**
 * Remplace le document par du Markdown. `emit` à `false` n'émet pas `change`, comme
 * `setHTML` : utile pour un `writeValue` côté formulaire.
 */
export function setMarkdown(editor: AsterEditor, markdown: string, emit = true): void {
  editor.setHTML(markdownToHtml(markdown), emit);
}
