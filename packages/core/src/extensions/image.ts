import type { Node } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';

/** Alignements d'image reconnus, sérialisés en `data-align`. */
export const IMAGE_ALIGNMENTS = ['left', 'center', 'right'] as const;

/**
 * Extension Image d'Aster : celle de Tiptap plus un attribut `align`, demandé par
 * `image.setAttributes`. On le stocke en `data-align` plutôt qu'en style inline :
 * c'est au thème CSS de `ui` de décider du rendu (float, marges, etc.).
 */
export function createImageExtension(): Node {
  return Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        align: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const value = element.getAttribute('data-align');
            return value && (IMAGE_ALIGNMENTS as readonly string[]).includes(value) ? value : null;
          },
          renderHTML: (attributes: Record<string, unknown>) =>
            typeof attributes.align === 'string' ? { 'data-align': attributes.align } : {},
        },
      };
    },
  }).configure({
    inline: false,
    allowBase64: true,
  });
}
