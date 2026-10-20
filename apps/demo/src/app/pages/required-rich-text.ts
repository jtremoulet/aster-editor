import type { AbstractControl, ValidationErrors } from '@angular/forms';

/** Éléments qui portent un contenu sans texte : un document qui n'a que ça n'est pas vide. */
const CONTENT_WITHOUT_TEXT = 'img, table, hr';

/**
 * Vrai si le HTML n'a ni texte (espaces et espaces insécables compris) ni contenu
 * non textuel (image, table, filet). Le HTML est parsé par `DOMParser` plutôt que par
 * des regex : `<p>&nbsp;</p>`, `<p><br></p>` ou `<p> </p>` sont vides, une image seule
 * ne l'est pas.
 */
export function isBlankRichText(html: string | null | undefined): boolean {
  if (!html) {
    return true;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body.textContent ?? '';
  return text.trim() === '' && doc.querySelector(CONTENT_WITHOUT_TEXT) === null;
}

/**
 * Validateur « texte riche requis » : refuse `''`, `<p></p>` (document vide d'Aster) et
 * tout HTML sans texte ni média. `Validators.required` ne suffit pas, un document vide
 * n'est pas une chaîne vide.
 */
export function requiredRichText(control: AbstractControl<string | null>): ValidationErrors | null {
  return isBlankRichText(control.value) ? { requiredRichText: true } : null;
}
