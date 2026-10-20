import { getActivePageView } from '@aster-editor/core';
import type { AsterEditor, DocumentLayout, PageViewOptions } from '@aster-editor/core';
import { pageViewApiOf } from '@aster-editor/ui';

/**
 * Vue page du composant. Le core expose `setPageView` / `getLayout` hors contrat
 * (`api/editor.ts` ne les déclare pas encore) : on passe par `pageViewApiOf` de `ui`, qui
 * les détecte à l'exécution, et par `getActivePageView` du core pour relire les options
 * en vigueur (le dialogue « Mise en page » de la toolbar peut les avoir changées).
 */

/** Valeur de l'input `pageView` du composant, identique à `AsterUiOptions.pageView`. */
export type PageViewInput = boolean | PageViewOptions | undefined;

/**
 * Options de vue page à donner à `createAster` ou à `setPageView` : l'input (ou la
 * configuration) complété par la mise en page effective du composant, qui prime sur
 * `pageView.layout` quand elle existe. `undefined` et `false` passent tels quels.
 */
export function resolvePageViewOptions(
  pageView: PageViewInput,
  layout: DocumentLayout | null,
): PageViewInput {
  if (pageView === undefined || pageView === false) {
    return pageView;
  }
  const base: PageViewOptions = pageView === true ? {} : pageView;
  return layout ? { ...base, layout } : base;
}

/** Active ou retire la vue page sur un éditeur monté ; sans effet si le core ne l'expose pas. */
export function setPageView(editor: AsterEditor, options: PageViewInput): void {
  const api = pageViewApiOf(editor);
  if (!api) {
    return;
  }
  if (options === undefined || options === false) {
    api.setPageView(false);
  } else {
    api.setPageView(options === true ? {} : options);
  }
}

/**
 * Mise en page de la vue page active, `null` si elle est inactive ou si le core ne l'expose
 * pas. L'activité est lue via `getActivePageView` : pendant la notification de retrait
 * (`setPageView` retire l'ancienne vue avant de poser la nouvelle), l'ancienne mise en page
 * est encore lisible par `getLayout` mais la vue n'est plus active, et doit être ignorée.
 */
export function readPageViewLayout(editor: AsterEditor): DocumentLayout | null {
  const active = getActivePageView(editor.contentElement);
  if (!active) {
    return null;
  }
  // Pendant la notification d'activation, `getLayout` ne connaît pas encore la nouvelle vue
  // (le core l'affecte au retour de `applyPageView`) : les options actives, elles, sont déjà
  // posées et portent la même référence de mise en page.
  return active.layout ?? pageViewApiOf(editor)?.getLayout() ?? null;
}

/**
 * Applique une mise en page à la vue page **si elle est active**, en conservant ses autres
 * options (pagination, affichage des en-têtes). Rien si la vue page est inactive ou si
 * elle montre déjà cette mise en page (même référence : c'est le cas juste après que le
 * dialogue « Mise en page » l'a posée). Rend vrai si la vue a été remontée.
 */
export function applyLayoutToPageView(editor: AsterEditor, layout: DocumentLayout): boolean {
  const api = pageViewApiOf(editor);
  const active = getActivePageView(editor.contentElement);
  if (!api || !active || api.getLayout() === layout) {
    return false;
  }
  api.setPageView({ ...active, layout });
  return true;
}
