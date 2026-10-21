import type { IPropertiesOptions, Paragraph } from 'docx';
import { convertChildren, type BlockScope } from './blocks.js';
import { warn, type ExportContext } from './context.js';
import { childElements, tagOf } from './dom.js';
import { STYLE_IDS } from './styles.js';

/** Attribut de la liste de notes produite par l'import (`<ol data-footnotes>`). */
export const FOOTNOTES_ATTRIBUTE = 'data-footnotes';

/** Attribut d'un item de note (`<li data-footnote="footnote-1">`). */
export const FOOTNOTE_ATTRIBUTE = 'data-footnote';

/** Préfixes d'identifiants que l'import conserve : la clé d'appel est ce qui suit. */
const NOTE_ID_PREFIX = /^(?:footnote|endnote)-/;

/**
 * Clé d'appel d'un item : `data-footnote="footnote-3"` → `3`, sinon sa position dans
 * la liste (1 pour le premier), ce que `<sup>[1]</sup>` désigne. Une clé positionnelle
 * déjà prise par une note explicite (`footnote-2` suivi d'un item nu en seconde
 * position) glisse à la première clé libre plutôt que d'écraser ou d'être perdue ; une
 * clé explicite dupliquée rend `null` : la première note gagne, avec avertissement.
 */
function noteKey(item: Element, index: number, ctx: ExportContext): string | null {
  const id = item.getAttribute(FOOTNOTE_ATTRIBUTE)?.trim() ?? '';
  const explicit = id.replace(NOTE_ID_PREFIX, '');
  if (explicit !== '') {
    if (!ctx.footnotes.has(explicit)) return explicit;
    warn(ctx, 'footnote-duplicate', `Note ${explicit} déclarée deux fois, la seconde est ignorée`);
    return null;
  }
  let position = index + 1;
  while (ctx.footnotes.has(String(position))) position += 1;
  return String(position);
}

/**
 * Collecte les notes de bas de page avant la conversion du corps : chaque `<li>` d'une
 * liste `data-footnotes` est converti en paragraphes de style `FootnoteText` et
 * enregistré dans `ctx.footnotes` sous sa clé d'appel ; la liste est retirée du DOM
 * pour ne pas réapparaître en fin de document. Les appels (`<sup data-footnote-ref>`,
 * `<sup>[n]</sup>`) sont résolus ensuite par le convertisseur inline. Une note ne peut
 * pas en appeler une autre (`notesAllowed: false`) : Word refuse un
 * `w:footnoteReference` dans `footnotes.xml`.
 */
export async function collectFootnotes(body: Element, ctx: ExportContext): Promise<void> {
  const lists = Array.from(body.querySelectorAll(`[${FOOTNOTES_ATTRIBUTE}]`));
  const scope: BlockScope = {
    quote: false,
    list: null,
    inline: {},
    paragraphStyle: STYLE_IDS.footnoteText,
    notesAllowed: false,
  };
  for (const list of lists) {
    const items = childElements(list).filter((item) => tagOf(item) === 'li');
    for (const [index, item] of items.entries()) {
      const key = noteKey(item, index, ctx);
      if (key === null) continue;
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
