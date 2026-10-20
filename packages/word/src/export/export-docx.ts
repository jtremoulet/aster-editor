import { loadDocx } from './docx-module';
import { resolveParser } from './dom';
import { buildDocx } from './html-to-docx';
import { jsonToHtml } from './json-to-html';
import type { DocxExportInput, DocxExportOptions } from './types';

/** Type MIME d'un document Word .docx. */
export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** HTML de l'entrée : tel quel pour une chaîne, sérialisé pour un JSON ProseMirror. */
function toHtml(input: DocxExportInput): string {
  if (typeof input === 'string') return input;
  if (input !== null && typeof input === 'object') return jsonToHtml(input);
  throw new Error('exportDocx: l’entrée doit être une chaîne HTML ou un document JSON ProseMirror');
}

/**
 * Convertit du HTML Aster (ou un document JSON ProseMirror) en fichier Word .docx.
 * Rend un `Blob` prêt pour `downloadDocx` ou un upload. Ne lève jamais pour du HTML
 * valide : images inaccessibles et éléments sans équivalent remontent via
 * `options.onWarning`. La lib `docx` est chargée en import dynamique au premier appel.
 */
export async function exportDocx(
  input: DocxExportInput,
  options: DocxExportOptions = {},
): Promise<Blob> {
  const html = toHtml(input);
  const parser = resolveParser(options.parse);
  const docx = await loadDocx();
  const dom = parser.parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
  const { document, warnings } = await buildDocx(dom, docx, options);
  if (options.onWarning) for (const warning of warnings) options.onWarning(warning);
  // `toArrayBuffer` plutôt que `toBlob` : JSZip produit l'ArrayBuffer partout (Node, jsdom,
  // navigateur), et `Blob` est global dans les trois. Le résultat est donc identique en test et en prod.
  const buffer = await docx.Packer.toArrayBuffer(document);
  return new Blob([buffer], { type: DOCX_MIME_TYPE });
}
