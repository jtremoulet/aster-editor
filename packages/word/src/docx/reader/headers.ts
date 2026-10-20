import type { HeaderFooterContent, HeaderFooterSet } from '@aster-editor/core';
import { childNamed } from '../preprocess/xml-utils';
import { wordAttribute } from '../preprocess/xml-utils';
import { relationshipAttribute } from './images';
import { deriveContext } from './index';
import type { ConverterContext } from './types';
import { booleanAttribute } from './units-blocks';

export interface HeadersFootersResult {
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
  readonly titlePage?: boolean;
}

type SetKey = keyof HeaderFooterSet;

const SET_KEYS: ReadonlySet<string> = new Set(['default', 'first', 'even']);

/**
 * Lit les en-têtes et pieds référencés par un `w:sectPr` (`w:headerReference` /
 * `w:footerReference`, types `default`, `first`, `even`), convertit chaque partie avec
 * les mêmes convertisseurs que le corps dans un contexte dérivé (`part` = la partie
 * d'en-tête, `where` = `header` ou `footer`, hors tableau) et pose `titlePage` depuis
 * `w:titlePg`. Les champs `PAGE` / `NUMPAGES` sont rendus par le convertisseur de runs
 * en texte de résultat (souvent vide dans un document généré).
 */
export async function readHeadersFooters(
  sectPr: Element | null,
  ctx: ConverterContext,
): Promise<HeadersFootersResult> {
  if (!sectPr) return {};
  const rels = await ctx.pkg.rels(ctx.part);
  const sets: Record<'header' | 'footer', Partial<Record<SetKey, HeaderFooterContent>>> = {
    header: {},
    footer: {},
  };

  for (const reference of Array.from(sectPr.children)) {
    const where =
      reference.localName === 'headerReference'
        ? 'header'
        : reference.localName === 'footerReference'
          ? 'footer'
          : null;
    if (!where) continue;
    const type = wordAttribute(reference, 'type') || 'default';
    if (!SET_KEYS.has(type)) continue;
    const id = relationshipAttribute(reference, 'id');
    const rel = rels.get(id);
    if (!rel || rel.external) {
      ctx.warnings.push({
        code: 'reader',
        message: `${where === 'header' ? 'En-tête' : 'Pied'} ${type} : relation ${id || '?'} introuvable.`,
      });
      continue;
    }
    const doc = await ctx.pkg.part(rel.target);
    if (!doc) {
      ctx.warnings.push({
        code: 'reader',
        message: `${where === 'header' ? 'En-tête' : 'Pied'} ${type} : partie ${rel.target} absente ou illisible.`,
      });
      continue;
    }
    const derived = deriveContext(ctx, { part: rel.target, where, tableStyle: null });
    const blocks = await ctx.convert.blocks(doc.documentElement, derived);
    sets[where][type as SetKey] = { html: ctx.convert.render(blocks, derived) };
  }

  const result: { -readonly [K in keyof HeadersFootersResult]: HeadersFootersResult[K] } = {};
  if (Object.keys(sets.header).length > 0) result.headers = sets.header;
  if (Object.keys(sets.footer).length > 0) result.footers = sets.footer;
  if (booleanAttribute(childNamed(sectPr, 'titlePg'))) result.titlePage = true;
  return result;
}
