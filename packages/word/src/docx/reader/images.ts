import type { DocxPackage, ImageConverter, ReaderOptions } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L25. Ignore les dessins avec un avertissement
 * `image-skipped`, pour que le reste du document se lise.
 */
export function createImageConverter(_pkg: DocxPackage, _options: ReaderOptions): ImageConverter {
  return {
    async drawing(_drawing, ctx) {
      ctx.warnings.push({
        code: 'image-skipped',
        message:
          'Image ignorée : conversion des dessins non disponible (lecteur stylé en phase 0).',
      });
      return '';
    },
  };
}
