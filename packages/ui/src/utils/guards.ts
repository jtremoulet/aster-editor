/**
 * Gardes de forme pour lire les attributs renvoyés par `tiptap.getAttributes(name)`,
 * typés `Record<string, any>` côté Tiptap : plutôt qu'un cast, chaque champ est lu et
 * vérifié individuellement, un attribut absent ou d'un autre type devient `null`.
 */

/** Vrai si `value` est un objet non nul (dictionnaire ou instance), jamais un tableau. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Champ chaîne d'un dictionnaire, `null` s'il est absent ou d'un autre type. */
export function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

/** Champ nombre ou chaîne (largeur d'image), `null` s'il est absent ou d'un autre type. */
export function readNumberOrString(
  record: Record<string, unknown>,
  key: string,
): number | string | null {
  const value = record[key];
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}
