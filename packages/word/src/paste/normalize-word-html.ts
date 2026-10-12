import type { WordPasteOptions } from './types';

/** Vrai si le HTML provient du presse-papier de Microsoft Word. Stub, lot L2. */
export function isWordHtml(_html: string): boolean {
  return false;
}

/** Nettoie le HTML Word en HTML sémantique. Stub, lot L2. */
export function normalizeWordHtml(html: string, _options: WordPasteOptions = {}): string {
  return html;
}
