import type {
  ToolbarConfig,
  ToolbarGroup,
  ToolbarPreset,
  ToolbarWidgetItem,
} from '@aster-editor/core';

const widget = (name: string): ToolbarWidgetItem => ({ type: 'widget', widget: name });

/** Toolbar complète : tout le jeu standard, du plus fréquent au plus rare. */
export const FULL_PRESET: readonly ToolbarGroup[] = [
  ['undo', 'redo'],
  [widget('heading')],
  ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'code', 'highlight'],
  [widget('fontFamily'), widget('fontSize')],
  [widget('textColor'), widget('backgroundColor')],
  ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'],
  ['bulletList', 'orderedList', 'taskList', 'outdent', 'indent'],
  [widget('link'), widget('image'), widget('table')],
  ['blockquote', 'codeBlock', 'horizontalRule'],
  ['clearFormatting'],
];

/** Toolbar standard : sans couleurs, police, taille ni indice/exposant. */
export const STANDARD_PRESET: readonly ToolbarGroup[] = [
  ['undo', 'redo'],
  [widget('heading')],
  ['bold', 'italic', 'underline', 'strike', 'code', 'highlight'],
  ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'],
  ['bulletList', 'orderedList', 'taskList', 'outdent', 'indent'],
  [widget('link'), widget('image'), widget('table')],
  ['blockquote', 'codeBlock', 'horizontalRule'],
  ['clearFormatting'],
];

/** Toolbar minimale : gras, italique, souligné, listes, lien. */
export const MINIMAL_PRESET: readonly ToolbarGroup[] = [
  ['bold', 'italic', 'underline'],
  ['bulletList', 'orderedList'],
  [widget('link')],
];

/** Presets par nom, pour `createToolbar`. */
export const TOOLBAR_PRESETS: Readonly<Record<ToolbarPreset, readonly ToolbarGroup[]>> = {
  full: FULL_PRESET,
  standard: STANDARD_PRESET,
  minimal: MINIMAL_PRESET,
};

/**
 * Résout une config de toolbar en liste de groupes : nom de preset → groupes du preset,
 * tableau → tel quel, `false` → aucun groupe. Un nom de preset inconnu tombe sur
 * `standard` avec un avertissement plutôt qu'une exception.
 */
export function resolveToolbarConfig(config: ToolbarConfig): readonly ToolbarGroup[] {
  if (config === false) return [];
  if (typeof config === 'string') {
    const preset = TOOLBAR_PRESETS[config];
    if (preset) return preset;
    console.warn(`[aster-ui] unknown toolbar preset "${String(config)}", using "standard"`);
    return STANDARD_PRESET;
  }
  return config;
}
