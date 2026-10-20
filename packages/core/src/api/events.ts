import type { AsterEditor } from './editor';
import type { AsterLocale } from './i18n';
import type { DocumentLayout } from './layout';
import type { VariableValues } from './variables';

/**
 * Événements émis par un `AsterEditor`. Les handlers reçoivent toujours l'éditeur
 * pour éviter les fermetures sur une instance détruite.
 */
export interface AsterEvents {
  /**
   * L'éditeur est monté et prêt à recevoir des commandes. Émis une seule fois, dans une
   * microtâche après `createEditor`, pour qu'un `on('ready')` posé juste après la création
   * soit bien appelé.
   */
  ready: (payload: { editor: AsterEditor }) => void;
  /** Le document a changé. Non émis pour un simple déplacement de sélection. */
  change: (payload: { editor: AsterEditor }) => void;
  /** La sélection a bougé, ou le document a changé. La toolbar se resynchronise dessus. */
  selectionChange: (payload: { editor: AsterEditor }) => void;
  focus: (payload: { editor: AsterEditor; event: FocusEvent }) => void;
  blur: (payload: { editor: AsterEditor; event: FocusEvent }) => void;
  readOnlyChange: (payload: { editor: AsterEditor; readOnly: boolean }) => void;
  /** Les valeurs ou les déclarations de variables ont changé (`VariableStore.setValues` / `define`). */
  variablesChange: (payload: { editor: AsterEditor; values: VariableValues }) => void;
  localeChange: (payload: { editor: AsterEditor; locale: AsterLocale }) => void;
  /**
   * La vue page a été activée, remplacée ou retirée par `setPageView` (session 4, L45b).
   * `layout` est la mise en page en vigueur (`getLayout()`), `null` quand la vue est retirée.
   * Émis **après** la mise à jour de l'état, donc `getLayout()` répond déjà la nouvelle
   * mise en page dans le handler ; l'événement DOM `aster:page-view-change` sur
   * `contentElement` reste émis (plugins du core, intégrateurs vanilla), mais lui part
   * pendant le montage et le retrait. Non émis quand l'appel ne change rien (`false` sans
   * vue active) ni quand une mise en page hostile a laissé la vue précédente en place.
   */
  pageViewChange: (payload: {
    editor: AsterEditor;
    active: boolean;
    layout: DocumentLayout | null;
  }) => void;
  /**
   * Une image est en cours d'upload via le hook `upload`. Permet à l'UI d'afficher
   * un état d'attente. `done` est émis après succès ou échec.
   */
  uploadStart: (payload: { editor: AsterEditor; file: File }) => void;
  uploadDone: (payload: { editor: AsterEditor; file: File; src?: string; error?: unknown }) => void;
  /** Émis juste avant la destruction. Après cet événement, toute méthode de l'éditeur est indéfinie. */
  destroy: (payload: { editor: AsterEditor }) => void;
}

export type AsterEventName = keyof AsterEvents;

/** Fonction de désabonnement renvoyée par `on`. */
export type Unsubscribe = () => void;
