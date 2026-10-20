import type { PostprocessContext, PostprocessPass } from '../postprocess/types';
import type { DocxImportWarning } from '../types';

/** Parse un fragment HTML dans un `Document` jsdom isolé, sans toucher au `document` global. */
export function parseFragment(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
}

/** Applique une passe sur un fragment et retourne le HTML résultant plus les avertissements. */
export function runPass(
  pass: PostprocessPass,
  html: string,
  options: Partial<PostprocessContext['options']> = {},
): { html: string; warnings: DocxImportWarning[] } {
  const doc = parseFragment(html);
  const warnings: DocxImportWarning[] = [];
  pass(doc, { options: { footnotes: true, ...options }, warnings });
  return { html: doc.body.innerHTML, warnings };
}

/**
 * Normalise du HTML pour une comparaison insensible à l'indentation : espaces entre
 * balises supprimés, espaces internes réduits, `<img … />` ramené à `<img …>`, attributs
 * sur plusieurs lignes recollés.
 */
export function normalizeHtml(html: string): string {
  return html
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/>/g, '>')
    .replace(
      /<(\w+)\s+([^>]*?)\s*>/g,
      (_match, tag: string, attrs: string) => `<${tag} ${attrs.replace(/\s+/g, ' ')}>`,
    )
    .replace(/>\s+</g, '><')
    .replace(/>\s+/g, '>')
    .replace(/\s+</g, '<')
    .trim();
}
