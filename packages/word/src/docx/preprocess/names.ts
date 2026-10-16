/**
 * Règles de nommage des variables, partagées par le prétraitement du .docx, le
 * post-traitement HTML et la passe de collage. Aucune dépendance DOM : ce module est pur.
 */

/** Nom de variable valide, même règle que `AsterVariable.name` dans le core. Sensible à la casse. */
export const VARIABLE_NAME_PATTERN = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u;

/**
 * Syntaxe canonique `{{nom}}`, espaces intérieurs tolérés (`{{ nom }}`). Linéaire : `\s*`
 * et la classe du nom sont disjoints, l'échec d'une tentative ne relance aucun
 * backtracking au-delà du `{{` d'ouverture.
 */
export const DEFAULT_VARIABLE_PATTERN = /\{\{\s*([\p{L}\p{N}_][\p{L}\p{N}_.-]*)\s*\}\}/gu;

/** Vrai si la chaîne est un nom de variable acceptable tel quel. */
export function isVariableName(value: string): boolean {
  return VARIABLE_NAME_PATTERN.test(value);
}

/**
 * Dérive un nom de variable d'un libellé libre (alias de contrôle de contenu, nom de
 * champ entre guillemets) : minuscules, accents retirés, espaces → `_`, tout autre
 * caractère interdit supprimé. `null` s'il ne reste rien d'utilisable.
 */
export function normalizeVariableName(raw: string): string | null {
  const flattened = raw
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_.-]+/gu, '')
    .replace(/^[.-]+/u, '');
  return flattened.length > 0 && isVariableName(flattened) ? flattened : null;
}

/** Nom tel quel s'il est valide, sinon sa forme normalisée, sinon `null`. */
export function toVariableName(raw: string): string | null {
  const trimmed = raw.trim();
  return isVariableName(trimmed) ? trimmed : normalizeVariableName(trimmed);
}
