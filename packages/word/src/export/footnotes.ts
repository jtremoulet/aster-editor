import type { IPropertiesOptions, Paragraph } from 'docx';
import { convertChildren, type BlockScope } from './blocks';
import type { ExportContext } from './context';
import { childElements, tagOf } from './dom';
import { STYLE_IDS } from './styles';

/** Attribut de la liste de notes produite par l'import (`<ol data-footnotes>`). */
export const FOOTNOTES_ATTRIBUTE = 'data-footnotes';

/** Attribut d'un item de note (`<li data-footnote="footnote-1">`). */
export const FOOTNOTE_ATTRIBUTE = 'data-footnote';

/** Préfixes d'identifiants que l'import conserve : la clé d'appel est ce qui suit. */
const NOTE_ID_PREFIX = /^(?:footnote|endnote)-/;

/**
 * Clé d'appel d'un item : `data-footnote="footnote-3"` → `3`, sinon sa position dans
 * la liste (1 pour le premier), ce que `<sup>[1]</sup>` désigne.
 */
function noteKey(item: Element, index: number): string {
  const id = item.getAttribute(FOOTNOTE_ATTRIBUTE)?.trim() ?? '';
  const key = id.replace(NOTE_ID_PREFIX, '');
  return key === '' ? String(index + 1) : key;
}

/**
 * Collecte les notes de bas de page avant la conversion du corps : chaque `<li>` d'une
 * liste `data-footnotes` est converti en paragraphes de style `FootnoteText` et
 * enregistré dans `ctx.footnotes` sous sa clé d'appel ; la liste est retirée du DOM
 * pour ne pas réapparaître en fin de document. Les appels (`<sup data-footnote-ref>`,
 * `<sup>[n]</sup>`) sont résolus ensuite par le convertisseur inline.
 */
export async function collectFootnotes(body: Element, ctx: ExportContext): Promise<void> {
  const lists = Array.from(body.querySelectorAll(`[${FOOTNOTES_ATTRIBUTE}]`));
  const scope: BlockScope = {
    quote: false,
    list: null,
    inline: {},
    paragraphStyle: STYLE_IDS.footnoteText,
  };
  for (const list of lists) {
    const items = childElements(list).filter((item) => tagOf(item) === 'li');
    for (const [index, item] of items.entries()) {
      const key = noteKey(item, index);
      if (ctx.footnotes.has(key)) continue;
      const children = (await convertChildren(item, scope, ctx)).filter(
        (child): child is Paragraph => child instanceof ctx.docx.Paragraph,
      );
      if (children.length === 0) {
        children.push(new ctx.docx.Paragraph({ style: STYLE_IDS.footnoteText, children: [] }));
      }
      ctx.footnotes.set(key, { id: ctx.footnotes.size + 1, children });
    }
    list.parentNode?.removeChild(list);
  }
}

/** Notes collectées → option `footnotes` du `Document`, `undefined` sans note. */
export function buildFootnotes(ctx: ExportContext): IPropertiesOptions['footnotes'] | undefined {
  if (ctx.footnotes.size === 0) return undefined;
  const footnotes: Record<string, { readonly children: readonly Paragraph[] }> = {};
  for (const note of ctx.footnotes.values()) {
    footnotes[String(note.id)] = { children: note.children };
  }
  return footnotes;
}
