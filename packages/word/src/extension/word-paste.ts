import type { PasteTransformer } from '@aster-editor/core';
import { normalizeGoogleDocsHtml } from '../google/normalize-google-docs-html.js';
import { isGoogleDocsHtml, isWordHtml } from '../paste/detectors.js';
import { normalizeWordHtml } from '../paste/normalize-word-html.js';
import type { WordPasteOptions } from '../paste/types.js';

/**
 * Fabrique le transformateur de collage à passer dans `AsterOptions.pasteTransformers`.
 * Détecte Word puis Google Docs, applique le normaliseur adapté, laisse passer tout
 * autre HTML tel quel. Un collage ne doit jamais casser l'éditeur : en cas d'erreur
 * interne, on journalise et on rend le HTML d'origine, Tiptap fera au mieux.
 */
export function wordPasteTransformer(options: WordPasteOptions = {}): PasteTransformer {
  return (html) => {
    try {
      if (isWordHtml(html)) {
        return normalizeWordHtml(html, options);
      }
      if (isGoogleDocsHtml(html)) {
        return normalizeGoogleDocsHtml(html, options);
      }
      return html;
    } catch (error: unknown) {
      console.warn('[aster-editor/word] normalisation du collage échouée, HTML brut inséré', error);
      return html;
    }
  };
}
