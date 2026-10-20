/**
 * @aster-editor/angular — surface publique.
 *
 * Composant `<aster-editor>` (CVA, signals, zoneless), `provideAster` pour la
 * configuration globale, tokens d'injection, et les types utiles aux intégrateurs
 * pour ne pas avoir à importer `core`, `ui` ou `word` directement.
 */
export { AsterEditorComponent } from './lib/aster-editor.component';
export { ASTER_CONFIG, provideAster } from './lib/provide-aster';
export { ASTER_UPLOAD_HANDLER } from './lib/tokens';
export type { PageViewInput } from './lib/page-view';
export type { DocxImportFidelity, DocxLostObject } from './lib/word';

export type {
  AsterCounts,
  AsterDocument,
  AsterEditor,
  AsterLocale,
  AsterTheme,
  AsterVariable,
  DocumentLayout,
  GetHtmlOptions,
  HeaderFooterContent,
  HeaderFooterSet,
  LinkPolicy,
  PageMargins,
  PageSetup,
  PageViewOptions,
  PasteTransformer,
  ToolbarConfig,
  ToolbarPreset,
  UploadHandler,
  VariableRenderMode,
  VariableResolver,
  VariableSource,
  VariableValues,
} from '@aster-editor/core';
export type { AsterUiOptions } from '@aster-editor/ui';
export type {
  DocxExportOptions,
  DocxExportVariableOptions,
  DocxExportWarning,
  DocxImportResult,
  DocxImportWarning,
  DocxVariableMode,
  FidelityExample,
  FidelityProperty,
  FidelityPropertyGroup,
  FidelityReport,
} from '@aster-editor/word';
