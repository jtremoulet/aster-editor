import { allNamed, childNamed, wordAttribute } from '../preprocess/xml-utils.js';
import { relationshipAttribute } from '../reader/images.js';
import { numericAttribute, twipsToPt } from '../reader/units.js';
import type {
  BlockModel,
  HeaderFooterModel,
  HeaderFooterType,
  ModelContext,
  SectionModel,
} from './model.js';

/**
 * Sections du modèle comparable : chaque `w:sectPr` du corps (fins de section dans les
 * `w:pPr`, puis le final) avec format de page, marges, colonnes, première page différente
 * et les en-têtes et pieds qu'il référence, lus avec le même lecteur de blocs que le corps.
 */

/** Lecteur de blocs injecté par `model.ts`, pour ne pas créer de cycle d'imports. */
export type BlockReader = (container: Element, ctx: ModelContext) => BlockModel[];

function attributesOf(element: Element | null, names: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!element) return out;
  for (const name of names) {
    const value = numericAttribute(element, name);
    if (value !== undefined) out[name] = twipsToPt(value);
  }
  return out;
}

async function readSection(
  sectPr: Element,
  ctx: ModelContext,
  readBlocks: BlockReader,
): Promise<SectionModel> {
  const pgSz = childNamed(sectPr, 'pgSz');
  // `w:orient` absent vaut portrait ; `w:cols` à une colonne vaut l'absence de colonnes.
  const orient = (pgSz ? wordAttribute(pgSz, 'orient') : '') || 'portrait';
  const colsElement = childNamed(sectPr, 'cols');
  const cols = colsElement && (numericAttribute(colsElement, 'num') ?? 1) >= 2 ? colsElement : null;
  const type = childNamed(sectPr, 'type');
  const rels = await ctx.pkg.rels(ctx.part);
  const headers: Partial<Record<HeaderFooterType, HeaderFooterModel>> = {};
  const footers: Partial<Record<HeaderFooterType, HeaderFooterModel>> = {};
  for (const reference of Array.from(sectPr.children)) {
    const target =
      reference.localName === 'headerReference'
        ? headers
        : reference.localName === 'footerReference'
          ? footers
          : null;
    if (!target) continue;
    const kind = wordAttribute(reference, 'type') || 'default';
    if (kind !== 'default' && kind !== 'first' && kind !== 'even') continue;
    const rel = rels.get(relationshipAttribute(reference, 'id'));
    if (!rel || rel.external) continue;
    const doc = await ctx.pkg.part(rel.target);
    if (doc) {
      target[kind] = { blocks: readBlocks(doc.documentElement, { ...ctx, part: rel.target }) };
    }
  }
  return {
    ...(type ? { type: wordAttribute(type, 'val') } : {}),
    ...(pgSz ? { pageSize: { ...attributesOf(pgSz, ['w', 'h']), orient } } : {}),
    ...(childNamed(sectPr, 'pgMar')
      ? {
          margins: attributesOf(childNamed(sectPr, 'pgMar'), [
            'top',
            'right',
            'bottom',
            'left',
            'header',
            'footer',
            'gutter',
          ]),
        }
      : {}),
    ...(cols
      ? {
          columns: {
            num: numericAttribute(cols, 'num') ?? 1,
            space: twipsToPt(numericAttribute(cols, 'space') ?? 0),
            equalWidth: wordAttribute(cols, 'equalWidth') !== '0',
          },
        }
      : {}),
    titlePage: childNamed(sectPr, 'titlePg') !== null,
    headers,
    footers,
  };
}

/** Tous les `w:sectPr` du corps dans l'ordre : fins de section dans les `w:pPr`, puis le final. */
function sectionProperties(body: Element): Element[] {
  const result: Element[] = [];
  for (const p of allNamed(body, 'p')) {
    const pPr = childNamed(p, 'pPr');
    const sectPr = pPr ? childNamed(pPr, 'sectPr') : null;
    if (sectPr) result.push(sectPr);
  }
  const last = childNamed(body, 'sectPr');
  if (last) result.push(last);
  return result;
}

/** Toutes les sections du corps, dans l'ordre du document. */
export async function readSections(
  body: Element,
  ctx: ModelContext,
  readBlocks: BlockReader,
): Promise<SectionModel[]> {
  const sections: SectionModel[] = [];
  for (const sectPr of sectionProperties(body)) {
    sections.push(await readSection(sectPr, ctx, readBlocks));
  }
  return sections;
}
