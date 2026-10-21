/**
 * @aster-editor/word — point d'entrée public.
 *
 * - `docx/` : `importDocx`, conversion .docx → HTML sémantique via mammoth (import dynamique)
 *   et post-traitements DOM ;
 * - `paste/` : `normalizeWordHtml`, détecteurs et les neuf passes du collage Word ;
 * - `google/` : `normalizeGoogleDocsHtml`, pipeline court pour Google Docs ;
 * - `extension/` : `wordPasteTransformer`, branchement sur `pasteTransformers` du core ;
 * - `export/` : `exportDocx`, `downloadDocx`, `jsonToHtml`, HTML → .docx via `docx` ;
 * - `docx/compare/` : `compareDocx`, rapport de fidélité original → résultat.
 */
export type {
  DocxImportOptions,
  DocxImportResult,
  DocxLostKind,
  DocxLostObject,
  DocxLostWhere,
  DocxImportWarning,
  DocxImportWarningCode,
  DocxInput,
  HtmlParser,
} from './docx/types.js';
export { importDocx } from './docx/import-docx.js';
export type { DocxVariableOptions, VariableDetection } from './docx/types.js';
export type { PasteVariableOptions } from './paste/types.js';
export type { WordPasteOptions, ListLevelFormat } from './paste/types.js';
export { isWordHtml, isGoogleDocsHtml } from './paste/detectors.js';
export { normalizeWordHtml } from './paste/normalize-word-html.js';
export { normalizeGoogleDocsHtml } from './google/normalize-google-docs-html.js';
export { wordPasteTransformer } from './extension/word-paste.js';
export type {
  DocxExportInput,
  DocxExportOptions,
  DocxExportWarning,
  DocxExportWarningCode,
  DocxImageFetcher,
  DocxPageSize,
  DocxWarning,
} from './export/types.js';
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
} from './export/types.js';
export { exportDocx, DOCX_MIME_TYPE } from './export/export-docx.js';
export { compareDocx } from './docx/compare/compare-docx.js';
export type {
  CompareDocx,
  CompareDocxOptions,
  FidelityExample,
  FidelityProperty,
  FidelityPropertyGroup,
  FidelityReport,
} from './docx/compare/types.js';
export { downloadDocx } from './export/download-docx.js';
export { jsonToHtml } from './export/json-to-html.js';
