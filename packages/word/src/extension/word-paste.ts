import type { PasteTransformer } from '@aster-editor/core';
import type { WordPasteOptions } from '../paste/types';

/**
 * Fabrique le transformateur de collage à passer dans `AsterOptions.pasteTransformers`.
 * Détecte Word et Google Docs, applique le normaliseur adapté, laisse passer le reste.
 * Stub, lot L2.
 */
export function wordPasteTransformer(_options: WordPasteOptions = {}): PasteTransformer {
  return (html) => html;
}
