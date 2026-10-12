import type { AsterEditor, Unsubscribe } from '../api';

/** Options de `createAutosave`. */
export interface AutosaveOptions {
  /**
   * Délai en millisecondes : durée d'inactivité avant sauvegarde en mode `debounce`,
   * période de la vérification sinon. 2000 par défaut.
   */
  interval?: number;
  /** Reçoit le HTML à persister. Une promesse rejetée laisse le document « sale ». */
  onSave: (html: string) => Promise<void> | void;
  /**
   * `true` (défaut) : sauvegarde après `interval` ms sans modification. `false` :
   * vérification à intervalle fixe, sauvegarde si le contenu a changé entre-temps.
   */
  debounce?: boolean;
  /** Appelé quand une sauvegarde déclenchée par le minuteur échoue. Rien par défaut. */
  onError?: (error: unknown) => void;
}

/** Contrôleur de sauvegarde automatique. */
export interface Autosave {
  /** Sauvegarde immédiatement si le document a changé. Rejette si `onSave` échoue. */
  flush(): Promise<void>;
  /** Arrête les minuteurs et se désabonne. Ne sauvegarde pas : appelle `flush` avant. */
  destroy(): void;
  /** Vrai si des modifications n'ont pas encore été sauvegardées. */
  isDirty(): boolean;
}

/** Délai par défaut. */
export const AUTOSAVE_DEFAULT_INTERVAL = 2000;

/**
 * Sauvegarde automatique d'un éditeur, en fonction compagnon : `AsterOptions` est figé.
 *
 * Le contenu initial sert de référence : seul un `change` suivi d'un HTML différent du
 * dernier HTML sauvegardé déclenche `onSave`. Un échec de sauvegarde remet le document
 * en « sale » pour que le prochain minuteur réessaie. Une modification arrivée pendant
 * une sauvegarde en cours est reprise au cycle suivant. Détruit avec l'éditeur.
 */
export function createAutosave(editor: AsterEditor, options: AutosaveOptions): Autosave {
  const interval = options.interval ?? AUTOSAVE_DEFAULT_INTERVAL;
  const debounce = options.debounce ?? true;
  let lastSaved = editor.getHTML();
  let dirty = false;
  let destroyed = false;
  let timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null = null;
  let pending: Promise<void> | null = null;

  const clearTimer = (): void => {
    if (timer === null) return;
    if (debounce) clearTimeout(timer);
    else clearInterval(timer);
    timer = null;
  };

  const save = (): Promise<void> => {
    if (pending) return pending;
    if (destroyed || !dirty) return Promise.resolve();
    const html = editor.getHTML();
    dirty = false;
    if (html === lastSaved) return Promise.resolve();
    pending = Promise.resolve()
      .then(() => options.onSave(html))
      .then(
        () => {
          lastSaved = html;
        },
        (error: unknown) => {
          dirty = true;
          throw error;
        },
      )
      .finally(() => {
        pending = null;
      });
    return pending;
  };

  const scheduledSave = (): void => {
    save().catch((error: unknown) => options.onError?.(error));
  };

  const onChange = (): void => {
    if (destroyed) return;
    dirty = true;
    if (!debounce) return;
    clearTimer();
    timer = setTimeout(scheduledSave, interval);
  };

  if (!debounce) {
    timer = setInterval(() => {
      if (dirty) scheduledSave();
    }, interval);
  }

  const subscriptions: Unsubscribe[] = [editor.on('change', onChange)];

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    clearTimer();
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.length = 0;
  };
  subscriptions.push(editor.on('destroy', destroy));

  return {
    flush: () => {
      // En mode debounce le minuteur en attente devient inutile ; en mode intervalle la
      // vérification périodique continue.
      if (debounce) clearTimer();
      return save();
    },
    destroy,
    isDirty: () => dirty,
  };
}
