/**
 * @aster-editor/word — point d'entrée public.
 *
 * - `docx/` : `importDocx`, conversion .docx → HTML sémantique via mammoth (import dynamique)
 *   et post-traitements DOM ;
 * - `paste/` : `normalizeWordHtml`, détecteurs et les neuf passes du collage Word ;
 * - `google/` : `normalizeGoogleDocsHtml`, pipeline court pour Google Docs ;
 * - `extension/` : `wordPasteTransformer`, branchement sur `pasteTransformers` du core ;
 * - `export/` : `exportDocx`, `downloadDocx`, `jsonToHtml`, HTML → .docx via `docx`.
 */
export type {
  DocxImportOptions,
  DocxImportResult,
  DocxImportWarning,
  DocxImportWarningCode,
  DocxInput,
  HtmlParser,
} from './docx/types';
export { importDocx } from './docx/import-docx';
export type { DocxVariableOptions, VariableDetection } from './docx/types';
export type { PasteVariableOptions } from './paste/types';
export type { WordPasteOptions, ListLevelFormat } from './paste/types';
export { isWordHtml, isGoogleDocsHtml } from './paste/detectors';
export { normalizeWordHtml } from './paste/normalize-word-html';
export { normalizeGoogleDocsHtml } from './google/normalize-google-docs-html';
export { wordPasteTransformer } from './extension/word-paste';
export type {
  DocxExportInput,
  DocxExportOptions,
  DocxExportWarning,
  DocxExportWarningCode,
  DocxImageFetcher,
  DocxPageSize,
  DocxWarning,
} from './export/types';
export type {
  DocxDefaultFont,
  DocxExportVariableOptions,
  DocxFooterOptions,
  DocxHeaderAlign,
  DocxHeaderOptions,
  DocxHeadingStyle,
  DocxHeadingStyles,
  DocxNumberedHeadingsOptions,
  DocxPageMargins,
  DocxPageOptions,
  DocxPageOrientation,
  DocxTocOptions,
  DocxVariableMode,
} from './export/types';
export { exportDocx, DOCX_MIME_TYPE } from './export/export-docx';
export { downloadDocx } from './export/download-docx';
export { jsonToHtml } from './export/json-to-html';
