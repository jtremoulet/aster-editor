/**
 * @aster-editor/word — point d'entrée public.
 *
 * Phase 0 : stubs. Le lot L2 fournit `paste/`, `google/` et `extension/`,
 * le lot L3 fournit `docx/`.
 */
export type {
  DocxImportOptions,
  DocxImportResult,
  DocxImportWarning,
  DocxImportWarningCode,
  HtmlParser,
} from './docx/types';
export { importDocx } from './docx/import-docx';
export type { WordPasteOptions, ListLevelFormat } from './paste/types';
export { isWordHtml, isGoogleDocsHtml } from './paste/detectors';
export { normalizeWordHtml } from './paste/normalize-word-html';
export { normalizeGoogleDocsHtml } from './google/normalize-google-docs-html';
export { wordPasteTransformer } from './extension/word-paste';
