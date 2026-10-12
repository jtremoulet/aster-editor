import type { PostprocessPass } from './types';

/** Vrai pour `0`, `0px`, `auto`, vide : une dimension sans valeur exploitable. */
function isNullDimension(value: string | null): boolean {
  if (value === null) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' || trimmed === 'auto' || /^0+(\.0+)?(px|pt|em|%)?$/.test(trimmed);
}

/**
 * Rend chaque `<img>` acceptable par l'extension image de Tiptap : `alt` toujours
 * présent (vide si Word n'en avait pas), dimensions nulles retirées pour laisser le
 * rendu naturel.
 */
export const normalizeImages: PostprocessPass = (doc) => {
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
    for (const attr of ['width', 'height']) {
      if (isNullDimension(img.getAttribute(attr))) img.removeAttribute(attr);
    }
  }
};
