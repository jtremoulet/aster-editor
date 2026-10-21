import type { HeaderFooterContent, HeaderFooterSet } from '@aster-editor/core';
import { childNamed } from '../preprocess/xml-utils.js';
import { wordAttribute } from '../preprocess/xml-utils.js';
import { relationshipAttribute } from './images.js';
import { deriveContext } from './index.js';
import type { ConverterContext } from './types.js';
import { booleanAttribute } from './units.js';

export interface HeadersFootersResult {
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
  readonly titlePage?: boolean;
}

type SetKey = keyof HeaderFooterSet;

const SET_KEYS: ReadonlySet<string> = new Set(['default', 'first', 'even']);

/**
 * Parties d'en-tête et de pied déjà converties, par chemin de partie et rôle
 * (`header:word/header1.xml`) : une partie référencée par plusieurs sections (forme
 * docx-js / LibreOffice, qui répètent la référence au lieu d'hériter) n'est convertie
 * qu'une fois, et les sections partagent le même objet (R42-04).
 */
export type HeaderFooterCache = Map<string, HeaderFooterContent>;

/**
 * Lit les en-têtes et pieds référencés par un `w:sectPr` (`w:headerReference` /
 * `w:footerReference`, types `default`, `first`, `even`), convertit chaque partie avec
 * les mêmes convertisseurs que le corps dans un contexte dérivé (`part` = la partie
 * d'en-tête, `where` = `header` ou `footer`, hors tableau) et pose `titlePage` depuis
 * `w:titlePg`. Les champs `PAGE` / `NUMPAGES` sont rendus par le convertisseur de runs
 * en texte de résultat (souvent vide dans un document généré). `cache` (optionnel)
 * mémoïse les parties converties entre plusieurs appels.
 */
export async function readHeadersFooters(
  sectPr: Element | null,
  ctx: ConverterContext,
  cache: HeaderFooterCache = new Map(),
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
    const key = `${where}:${rel.target}`;
    const known = cache.get(key);
    if (known) {
      sets[where][type as SetKey] = known;
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
    const content: HeaderFooterContent = { html: ctx.convert.render(blocks, derived) };
    cache.set(key, content);
    sets[where][type as SetKey] = content;
  }

  const result: { -readonly [K in keyof HeadersFootersResult]: HeadersFootersResult[K] } = {};
  if (Object.keys(sets.header).length > 0) result.headers = sets.header;
  if (Object.keys(sets.footer).length > 0) result.footers = sets.footer;
  if (booleanAttribute(childNamed(sectPr, 'titlePg'))) result.titlePage = true;
  return result;
}

/**
 * En-têtes et pieds **effectifs** de chaque section, dans l'ordre : Word fait hériter une
 * section des références de la précédente quand elle n'en déclare pas, type par type
 * (`default`, `first`, `even`). Chaque entrée reçoit le jeu hérité complété par ses propres
 * références. Chaque partie n'est convertie qu'une fois, qu'elle soit héritée ou
 * référencée à nouveau par une section suivante (cache par partie, R42-04) : deux sections
 * qui montrent le même en-tête partagent le même objet `HeaderFooterContent`.
 * `titlePage` n'hérite pas (ECMA-376 §17.10.6 : `w:titlePg` absent = pas de première page
 * différente) : il vaut celui que la section déclare elle-même.
 */
export async function readEffectiveHeadersFooters(
  sectPrs: readonly Element[],
  ctx: ConverterContext,
): Promise<HeadersFootersResult[]> {
  const result: HeadersFootersResult[] = [];
  const cache: HeaderFooterCache = new Map();
  let headers: HeaderFooterSet | undefined;
  let footers: HeaderFooterSet | undefined;
  for (const sectPr of sectPrs) {
    const own = await readHeadersFooters(sectPr, ctx, cache);
    if (own.headers) headers = { ...headers, ...own.headers };
    if (own.footers) footers = { ...footers, ...own.footers };
    result.push({
      ...(headers ? { headers } : {}),
      ...(footers ? { footers } : {}),
      ...(own.titlePage ? { titlePage: true } : {}),
    });
  }
  return result;
}
