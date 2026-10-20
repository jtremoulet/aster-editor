import { getActivePageView } from '@aster-editor/core';
import type { AsterEditor, DocumentLayout, PageViewOptions, Unsubscribe } from '@aster-editor/core';
import { pageViewApiOf } from '@aster-editor/ui';

/**
 * Vue page du composant. `setPageView` / `getLayout` sont entrés au contrat en L45b, mais
 * optionnels (un double de test peut ne pas les porter) : on passe encore par
 * `pageViewApiOf` de `ui`, qui les détecte à l'exécution (simplification reportée, L45
 * point 8), et par `getActivePageView` du core pour relire les options en vigueur (le
 * dialogue « Mise en page » de la toolbar peut les avoir changées). Les changements sont
 * suivis via l'événement `pageViewChange` du contrat (`onPageViewChange`).
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
 * Mise en page de la vue page active au montage, `null` si elle est inactive ou si le core
 * ne l'expose pas : celle des options actives (même référence que `pageView.layout`), sinon
 * celle que le core a résolue (`{}` pour une vue posée sans mise en page), que le composant
 * adopte comme base du dialogue « Mise en page ».
 */
export function readPageViewLayout(editor: AsterEditor): DocumentLayout | null {
  const active = getActivePageView(editor.contentElement);
  if (!active) {
    return null;
  }
  return active.layout ?? pageViewApiOf(editor)?.getLayout() ?? null;
}

/**
 * Suit les changements de vue page par l'événement `pageViewChange` du contrat (L45b), et
 * non plus par l'événement DOM `aster:page-view-change`, qui reste aux intégrateurs vanilla.
 * `handler` reçoit la mise en page à adopter : celle des **options** de la vue active, pas
 * `payload.layout` — une vue posée sans mise en page (`setPageView(true)`, input `pageView`
 * sans `layout`) ne pousse pas de `{}` au composant, exactement comme la relecture sur
 * l'événement DOM (où `getLayout` ne connaissait pas encore la nouvelle vue) ; seule une
 * mise en page explicitement donnée (dialogue, input) est adoptée. `null` quand la vue est
 * retirée, ce que le composant ignore aussi.
 */
export function onPageViewChange(
  editor: AsterEditor,
  handler: (layout: DocumentLayout | null) => void,
): Unsubscribe {
  return editor.on('pageViewChange', ({ active }) => {
    handler(active ? (getActivePageView(editor.contentElement)?.layout ?? null) : null);
  });
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
