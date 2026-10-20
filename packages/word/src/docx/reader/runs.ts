import { wordAttribute } from '../preprocess/xml-utils';
import { escapeHtml } from './html';
import type { ConverterContext, ResolvedParagraphProps } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L24. Concatène le texte des `w:t`, rend les
 * `w:br` en `<br>` et les tabulations en espace, ignore tout formatage. Les dessins et
 * appels de note passent déjà par le contexte pour que L25 soit branché dès maintenant.
 */
export async function convertRuns(
  paragraph: Element,
  ctx: ConverterContext,
  _props: ResolvedParagraphProps,
): Promise<string> {
  const parts: string[] = [];
  const walk = async (node: Node): Promise<void> => {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    switch (element.localName) {
      case 't':
        parts.push(escapeHtml(element.textContent ?? ''));
        return;
      case 'tab':
        parts.push(' ');
        return;
      case 'br':
        parts.push('<br>');
        return;
      case 'drawing':
        parts.push(await ctx.images.drawing(element, ctx));
        return;
      case 'footnoteReference':
      case 'endnoteReference': {
        const id = wordAttribute(element, 'id');
        if (id) {
          parts.push(
            ctx.notes.reference(
              id,
              element.localName === 'footnoteReference' ? 'footnote' : 'endnote',
              ctx,
            ),
          );
        }
        return;
      }
      case 'pPr':
      case 'rPr':
        return;
      default:
        for (const child of Array.from(element.childNodes)) await walk(child);
    }
  };
  for (const child of Array.from(paragraph.childNodes)) await walk(child);
  return parts.join('');
}
