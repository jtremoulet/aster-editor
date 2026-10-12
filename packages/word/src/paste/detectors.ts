/**
 * Détecteurs d'origine du HTML collé. Ils travaillent sur le texte brut, sans parser :
 * c'est rapide, et ça permet de décider avant de payer le coût d'un `DOMParser`.
 */

/** Indices laissés par Word dans son HTML de presse-papier (365, 2016, 2013…). */
const WORD_HINTS: readonly RegExp[] = [
  /urn:schemas-microsoft-com:office:word/i,
  /class=["']?Mso[A-Za-z]/,
  /\bmso-[a-z-]+\s*:/i,
  /<o:p\b/i,
  /<meta[^>]+name=["']?ProgId["']?[^>]+content=["']?Word\.Document/i,
];

/** Indice laissé par Google Docs : un `<b>` enveloppant avec un GUID interne. */
const GOOGLE_DOCS_HINT = /id=["']?docs-internal-guid-/i;

/**
 * Vrai si le HTML provient du presse-papier de Microsoft Word. Un seul indice suffit :
 * Word est verbeux, un collage réel en porte toujours plusieurs. Du HTML de navigateur
 * ordinaire n'en porte aucun.
 */
export function isWordHtml(html: string): boolean {
  if (typeof html !== 'string' || html.length === 0) {
    return false;
  }
  return WORD_HINTS.some((hint) => hint.test(html));
}

/**
 * Vrai si le HTML provient du presse-papier de Google Docs. Google ne pose aucun
 * namespace Office, seul le GUID interne du `<b>` enveloppant est fiable.
 */
export function isGoogleDocsHtml(html: string): boolean {
  if (typeof html !== 'string' || html.length === 0) {
    return false;
  }
  return GOOGLE_DOCS_HINT.test(html);
}
