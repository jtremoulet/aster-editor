import { graftIntoTemplate } from '../docx/writer/graft';
import { openTemplate, type TemplateContext } from '../docx/writer/template';
import { defaultXmlCodec } from '../docx/writer/xml-io';
import { loadDocx } from './docx-module';
import { resolveParser } from './dom';
import { buildDocx } from './html-to-docx';
import { jsonToHtml } from './json-to-html';
import type { DocxExportInput, DocxExportOptions, DocxExportWarning } from './types';
import { resolveVariableSettings } from './variables';

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
 *
 * Avec `options.template`, le corps est greffé dans le gabarit : tout ce qui n'est pas le
 * corps (styles, numérotation, thème, en-têtes, pieds, sections, propriétés) ressort
 * identique à l'octet. Un gabarit illisible replie sur l'export neuf (`template-invalid`).
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
  const warnings: DocxExportWarning[] = [];
  let template: TemplateContext | null = null;
  const codec = options.template === undefined ? null : defaultXmlCodec();
  if (options.template !== undefined && codec) {
    template = await openTemplate(options.template, codec, warnings, {
      readHeadersFooters: Boolean(options.layout?.headers || options.layout?.footers),
    });
  }
  const built = await buildDocx(
    dom,
    docx,
    options,
    template
      ? {
          template: true,
          styleIds: template.styleIds,
          numbering: template.numbering,
          ...(template.contentWidthPx !== undefined
            ? { contentWidthPx: template.contentWidthPx }
            : {}),
        }
      : { template: false },
  );
  warnings.push(...built.warnings);
  // `toArrayBuffer` plutôt que `toBlob` : JSZip produit l'ArrayBuffer partout (Node, jsdom,
  // navigateur), et `Blob` est global dans les trois. Le résultat est donc identique en test et en prod.
  let buffer = await docx.Packer.toArrayBuffer(built.document);
  if (template && codec) {
    // Les `numId` ne sont attribués qu'à l'empaquetage : on les relit sur le document.
    const concreteNumbering = new Map<string, string>();
    for (const concrete of built.document.Numbering.ConcreteNumbering) {
      concreteNumbering.set(String(concrete.numId), concrete.reference);
    }
    try {
      buffer = await graftIntoTemplate(
        {
          generated: buffer,
          template,
          lists: built.lists,
          concreteNumbering,
          variables: resolveVariableSettings(options.variables),
          layout: options.layout,
          toc: Boolean(options.toc),
          ...(options.title !== undefined ? { title: options.title } : {}),
          ...(options.creator !== undefined ? { creator: options.creator } : {}),
          codec,
        },
        warnings,
      );
    } catch (error) {
      warnings.push({
        code: 'template-invalid',
        message: `Greffe dans le gabarit impossible, export neuf à la place : ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  if (options.onWarning) for (const warning of warnings) options.onWarning(warning);
  return new Blob([buffer], { type: DOCX_MIME_TYPE });
}
