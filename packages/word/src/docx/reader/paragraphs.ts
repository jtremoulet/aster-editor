import { childNamed } from '../preprocess/xml-utils';
import { convertRuns } from './runs';
import type { ConverterContext, ParagraphBlock } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L24. Rend `<p>` ou `<hN>` selon le niveau de
 * titre résolu, sans attribut de mise en page ni `data-docx-style`.
 */
export async function convertParagraph(
  paragraph: Element,
  ctx: ConverterContext,
): Promise<ParagraphBlock> {
  const props = ctx.styles.paragraph(childNamed(paragraph, 'pPr'));
  const inline = await convertRuns(paragraph, ctx, props);
  const tag = props.headingLevel ? `h${props.headingLevel}` : 'p';
  return {
    kind: 'paragraph',
    html: `<${tag}>${inline}</${tag}>`,
    numbering: props.numbering,
    isEmpty: inline.trim() === '',
  };
}
