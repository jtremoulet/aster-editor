import type { DocxImportOptions, DocxImportResult } from './types';

/**
 * Convertit un .docx en HTML Aster via mammoth. Stub de phase 0, implémenté par le lot L3.
 */
export async function importDocx(
  _input: File | ArrayBuffer,
  _options: DocxImportOptions = {},
): Promise<DocxImportResult> {
  return Promise.reject(new Error('importDocx: implémentation en attente du lot L3'));
}
