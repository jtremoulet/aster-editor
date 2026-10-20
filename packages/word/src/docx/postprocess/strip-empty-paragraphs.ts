import { hasTag, isElement, isEmptyBlock } from './dom-utils';
import type { PostprocessPass } from './types';

/**
 * Vrai si ce `<p>` vide est le seul bloc qui rend sa cellule ou son item valide pour le
 * schéma Tiptap : `td`/`th` exigent au moins un bloc, `li` exige un paragraphe en tête.
 * Dans un `li`, un `<p>` vide en tête n'est superflu que si le bloc suivant est aussi un
 * `<p>` ; devant une sous-liste il reste obligatoire.
 */
function isRequiredBlock(p: Element): boolean {
  const parent = p.parentElement;
  if (!parent || !hasTag(parent, 'td', 'th', 'li')) {
    return false;
  }
  if (parent.children.length <= 1) {
    return true;
  }
  if (!hasTag(parent, 'li')) {
    return false;
  }
  return p.previousElementSibling === null && !isElement(p.nextElementSibling, 'p');
}

/**
 * Supprime les `<p>` vides, y compris dans les cellules et les `<li>` tant qu'il y
 * reste un autre bloc (W-13). Word en produit beaucoup pour espacer visuellement.
 * Ne s'applique qu'en `emptyParagraphs: 'drop'` : par défaut (`keep`) les lignes vides
 * de l'auteur sont des `<p></p>` que l'éditeur conserve, sinon un aller-retour
 * export → import perdait chaque saut de ligne.
 */
export const stripEmptyParagraphs: PostprocessPass = (doc, ctx) => {
  if (ctx.options.emptyParagraphs === 'keep') {
    return;
  }
  for (const p of Array.from(doc.querySelectorAll('p'))) {
    if (isEmptyBlock(p) && !isRequiredBlock(p)) {
      p.parentNode?.removeChild(p);
    }
  }
};
