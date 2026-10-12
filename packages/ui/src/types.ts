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
  /**
   * Bascule entre l'éditeur et la vue source HTML (`<textarea class="aster-source">`).
   * Pendant la vue source, l'éditeur est en lecture seule et la toolbar désactivée ;
   * le retour applique le HTML modifié. Sans effet si l'éditeur est déjà en lecture seule.
   */
  toggleSource(): void;
  isSourceView(): boolean;
  /** Ajoute ou retire `aster--fullscreen` sur `.aster` (position fixe plein écran). Échap quitte. */
  setFullscreen(value: boolean): void;
  isFullscreen(): boolean;
  destroy(): void;
}

/**
 * Composant monté dans la toolbar : un élément racine, resynchronisable sur les
 * événements de l'éditeur et destructible. Boutons, dropdowns et widgets le partagent,
 * ce qui permet à la toolbar de les traiter uniformément.
 */
export interface ToolbarWidget {
  readonly element: HTMLElement;
  /** Met à jour libellés, états actif/désactivé et contenu visible. */
  update(): void;
  /** Retire les écouteurs et ferme tout menu ouvert. L'élément n'est pas retiré du DOM. */
  destroy(): void;
}

/** Fabrique d'un widget spécialisé (`heading`, `table`, `link`, …) à partir de l'éditeur. */
export type WidgetFactory = (editor: AsterEditor) => ToolbarWidget;
