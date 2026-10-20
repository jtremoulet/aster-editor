import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';
import type { AsterEditor } from '../api';
import {
  PaginationController,
  initPaginationDecorations,
  mapPaginationDecorations,
  paginationControllerOf,
  paginationPluginKey,
} from './pagination-controller';
import { EMPTY_PAGINATION, type PaginationResult } from './pagination-layout';

/**
 * Extension `pagination` (session 3, L30) et son API publique. Le travail est réparti en
 * trois fichiers (F30, R30-13) : `pagination-layout.ts` (calcul pur), `pagination-measure.ts`
 * (hauteur utile et mesure du DOM) et `pagination-controller.ts` (vue du plugin, décorations).
 * Tout est réexporté d'ici : les imports de `index.ts` et des intégrateurs ne changent pas.
 */

export {
  PAGE_COUNT_ATTRIBUTE,
  PAGE_COUNT_CSS_VARIABLE,
  PAGE_GAP_FILL_CSS_VARIABLE,
  PAGE_GAP_NUMBER_CLASS,
  PAGE_NUMBER_ATTRIBUTE,
  PAGINATION_DEBOUNCE_MS,
  isPaginationEnabled,
  paginationPluginKey,
  type PaginatedPageViewOptions,
  type PaginationDecorations,
} from './pagination-controller';
export {
  PAGE_GAP_CLASS,
  measureBlocks,
  measurePagination,
  usablePageHeightPx,
  type MeasuredBlocks,
} from './pagination-measure';

/** Nom de l'extension. */
export const PAGINATION_EXTENSION_NAME = 'pagination';

/** Options de l'extension `Pagination`. */
export interface PaginationOptions {
  /** Éditeur Aster propriétaire : i18n du libellé de page. `null` : libellé « Page n / N ». */
  readonly aster: AsterEditor | null;
}

/** Contrôleur de l'éditeur, `null` sans extension `Pagination` ou éditeur détruit. */
function controllerOf(editor: AsterEditor): PaginationController | null {
  if (editor.isDestroyed()) {
    return null;
  }
  return paginationControllerOf(editor.tiptap.view);
}

/** Dernière pagination calculée (coupures et nombre de pages) ; une page hors vue page. */
export function getPaginationResult(editor: AsterEditor): PaginationResult {
  return controllerOf(editor)?.result ?? EMPTY_PAGINATION;
}

/**
 * Mesure et pose les coupures tout de suite, sans attendre le débounce ni la frame : pour
 * les tests et pour un intégrateur qui vient de changer la feuille de style. Résultat
 * vide hors vue page ou avec `pagination: false`.
 */
export function paginateNow(editor: AsterEditor): PaginationResult {
  return controllerOf(editor)?.measureNow() ?? EMPTY_PAGINATION;
}

/**
 * Extension `pagination` : pagination **approximative** de la vue page. Mesure la hauteur
 * rendue des blocs de premier niveau et pose, en décorations widget (jamais dans le
 * document), une coupure `div.aster-page-gap` avant chaque bloc qui ouvre une page. Les
 * sauts de page explicites forcent la coupure ; tableaux et listes passent entiers à la
 * page suivante. Inactive hors vue page ou avec `pagination: false`. Aucune promesse
 * d'exactitude Word : la feuille `ui/themes/page.css` dessine, le core ne fait que mesurer.
 */
export const Pagination = Extension.create<PaginationOptions>({
  name: PAGINATION_EXTENSION_NAME,

  addOptions() {
    return { aster: null };
  },

  addProseMirrorPlugins() {
    const aster = this.options.aster;
    let controller: PaginationController | null = null;
    return [
      new Plugin({
        key: paginationPluginKey,
        state: {
          init: initPaginationDecorations,
          apply: mapPaginationDecorations,
        },
        view: (view) => {
          controller = new PaginationController(view, aster);
          return controller;
        },
        props: {
          decorations: (state) => controller?.decorationsFor(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});
