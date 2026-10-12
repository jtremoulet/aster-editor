import type { WordPasteOptions } from '../paste/types';

/** Vrai si le HTML provient du presse-papier de Google Docs. Stub, lot L2. */
export function isGoogleDocsHtml(_html: string): boolean {
  return false;
}

/** Nettoie le HTML Google Docs. Stub, lot L2. */
export function normalizeGoogleDocsHtml(html: string, _options: WordPasteOptions = {}): string {
  return html;
}
