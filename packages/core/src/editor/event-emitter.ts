import type { AsterEventName, AsterEvents, Unsubscribe } from '../api/index.js';

/**
 * Émetteur d'événements typé sur `AsterEvents`. Volontairement minimal : pas de
 * wildcard, pas d'ordre garanti entre handlers d'un même événement, mais une
 * désinscription sûre pendant l'émission (on itère sur une copie).
 */
export interface AsterEventEmitter {
  on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe;
  off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void;
  emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void;
  /** Retire tous les handlers : appelé à la destruction pour éviter toute fuite. */
  clear(): void;
}

type AnyHandler = (...args: never[]) => void;

/**
 * Crée un émetteur. Un handler qui lève une exception n'empêche pas les suivants
 * d'être appelés : l'erreur est remontée après la boucle pour ne pas casser
 * l'éditeur sur un bug d'intégrateur.
 */
export function createEventEmitter(): AsterEventEmitter {
  const handlers = new Map<AsterEventName, Set<AnyHandler>>();

  const off: AsterEventEmitter['off'] = (event, handler) => {
    handlers.get(event)?.delete(handler as AnyHandler);
  };

  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler as AnyHandler);
      return () => off(event, handler);
    },
    off,
    emit(event, ...payload) {
      const set = handlers.get(event);
      if (!set || set.size === 0) {
        return;
      }
      let firstError: unknown;
      for (const handler of [...set]) {
        try {
          (handler as unknown as (...args: Parameters<AsterEvents[typeof event]>) => void)(
            ...payload,
          );
        } catch (error) {
          firstError ??= error;
        }
      }
      if (firstError !== undefined) {
        throw firstError;
      }
    },
    clear() {
      handlers.clear();
    },
  };
}
