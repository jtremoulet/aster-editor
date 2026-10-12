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

export type {
  AsterCounts,
  AsterDocument,
  AsterEditor,
  AsterLocale,
  AsterTheme,
  LinkPolicy,
  PasteTransformer,
  ToolbarConfig,
  ToolbarPreset,
  UploadHandler,
} from '@aster-editor/core';
export type { AsterUiOptions } from '@aster-editor/ui';
export type { DocxImportResult, DocxImportWarning } from '@aster-editor/word';
