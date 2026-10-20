/** Échappement d'un texte pour le HTML généré par le lecteur. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Échappement d'une valeur d'attribut (mêmes règles, les guillemets comptent). */
export const escapeAttr = escapeHtml;

/**
 * Sérialise une liste de déclarations CSS en attribut `style`, dans l'ordre donné, sans
 * espace superflu : `line-height: 1.15; margin-top: 6pt`. Les valeurs vides sont ignorées.
 */
export function styleAttr(
  declarations: readonly (readonly [string, string | undefined])[],
): string {
  const parts: string[] = [];
  for (const [name, value] of declarations) {
    if (value !== undefined && value !== '') parts.push(`${name}: ${value}`);
  }
  return parts.length === 0 ? '' : ` style="${escapeAttr(parts.join('; '))}"`;
}

/** Nombre en points formaté sans zéro inutile (`6pt`, `1.5pt`), deux décimales maximum. */
export function pt(value: number): string {
  return `${Math.round(value * 100) / 100}pt`;
}
