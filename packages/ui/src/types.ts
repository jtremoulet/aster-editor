import type {
  AsterEditor,
  AsterOptions,
  AsterTheme,
  PageViewOptions,
  ToolbarConfig,
} from '@aster-editor/core';

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
  /**
   * Menu de suggestion déclenché par `{{` dans le contenu (variables du magasin, création
   * si autorisée). Vrai par défaut, dès que le core expose `variable.insert`.
   */
  variableSuggestion?: boolean;
  /**
   * Bulle contextuelle sous un lien (URL, modifier, supprimer). Vrai par défaut, dès
   * que le core expose `link.set`.
   */
  linkBubble?: boolean;
  /**
   * Bulle contextuelle au-dessus d'une image sélectionnée (alignement, largeur,
   * modifier, supprimer). Vrai par défaut, dès que le core expose `image.setAttributes`.
   */
  imageBubble?: boolean;
  /**
   * Menu de blocs déclenché par `/` en début de bloc (titres, listes, tableau, image…).
   * Vrai par défaut.
   */
  slashMenu?: boolean;
  /**
   * Vue page (session 3) : transmise telle quelle au core (`AsterOptions.pageView`), qui
   * pose `aster--page-view` et les variables `--aster-page-*` sur l'hôte ; `themes/page.css`
   * rend alors la feuille, les marges et les en-têtes / pieds. Faux par défaut.
   */
  pageView?: boolean | PageViewOptions;
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
