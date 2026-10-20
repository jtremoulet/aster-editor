import type { Block, ConverterContext, DocxPackage, NumberingResolver } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L25. Aucune définition de numérotation, et le
 * rendu concatène les blocs sans regrouper les paragraphes numérotés en `<ol>`/`<ul>`.
 */

/** Signature figée : L25 lit `numbering.xml` via `pkg.related(pkg.mainPart, '/numbering')`. */
export async function createNumberingResolver(_pkg: DocxPackage): Promise<NumberingResolver> {
  return { definition: () => null };
}

/**
 * Rend une suite de blocs en HTML. L25 regroupe ici les paragraphes à `numbering` en
 * listes imbriquées (`<ol type start data-docx-num-id>`, `<ul data-bullet>`), et
 * applique `options.emptyParagraphs`.
 */
export function renderBlocks(blocks: readonly Block[], ctx: ConverterContext): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind === 'paragraph' && block.isEmpty && ctx.options.emptyParagraphs === 'drop') {
      continue;
    }
    out.push(block.html);
  }
  return out.join('');
}
