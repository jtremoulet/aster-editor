import type { AbstractControl, ValidationErrors } from '@angular/forms';

/** Vrai si le HTML ne contient aucun texte une fois les balises retirées. */
export function isBlankRichText(html: string | null | undefined): boolean {
  if (!html) {
    return true;
  }
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim() === ''
  );
}

/**
 * Validateur « texte riche requis » : refuse `''`, `<p></p>` (document vide d'Aster) et
 * tout HTML sans texte. `Validators.required` ne suffit pas, un document vide n'est pas
 * une chaîne vide.
 */
export function requiredRichText(control: AbstractControl<string | null>): ValidationErrors | null {
  return isBlankRichText(control.value) ? { requiredRichText: true } : null;
}
