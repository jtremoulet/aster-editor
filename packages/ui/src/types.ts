import type { AsterEditor, AsterOptions, AsterTheme, ToolbarConfig } from '@aster-editor/core';

/** Toolbar montée, pilotable depuis l'extérieur. */
export interface Toolbar {
  readonly element: HTMLElement;
  /** Resynchronise les états actif/désactivé. Appelé automatiquement sur `selectionChange`. */
  update(): void;
  destroy(): void;
}

/** Options de `createAster` : celles du core sans `element`, plus l'UI. */
export interface AsterUiOptions extends Omit<AsterOptions, 'element'> {
  toolbar?: ToolbarConfig;
  theme?: AsterTheme;
}

/** Résultat de `createAster` : éditeur + toolbar montés dans un hôte avec le thème appliqué. */
export interface AsterInstance {
  readonly editor: AsterEditor;
  readonly toolbar: Toolbar | null;
  /** Élément racine `.aster[data-theme]` créé dans l'hôte. */
  readonly element: HTMLElement;
  setTheme(theme: AsterTheme): void;
  destroy(): void;
}
