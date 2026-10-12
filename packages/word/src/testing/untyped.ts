/**
 * Fixture volontairement mal typée pour les tests de robustesse : simule un appelant
 * JavaScript qui passe `undefined`, `null` ou un objet quelconque à une API typée.
 * Centralise le seul `as` que ces tests ont besoin d'écrire, à la place d'un
 * `as unknown as T` répété dans chaque spec.
 */
export function untyped<T>(value: unknown): T {
  return value as T;
}
