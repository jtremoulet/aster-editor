import type { HeaderFooterSet } from '@aster-editor/core';
import type { DocxExportWarning } from '../../export/types.js';
import { allNamed, childNamed } from '../preprocess/xml-utils.js';
import { PART_CONTENT_TYPES } from './content-types.js';
import type { MediaCopier } from './media.js';
import { REL_TYPE, RelationshipTable } from './relationships.js';
import type { StyleMerger } from './styles-merge.js';
import { directoryOf, setWordAttr, wordAttr, type PartStore } from './xml-io.js';

/**
 * En-têtes et pieds de page du gabarit quand `layout.headers` / `footers` (ou ceux d'une
 * section, `layout.sections[n]`) sont fournis. Pour chaque type (`default`, `first`,
 * `even`) dont le HTML diffère de ce que le lecteur relit dans le gabarit, la partie
 * générée par la chaîne d'export (lib `docx`, `header-footer.ts`) est copiée dans le
 * gabarit sous un nom libre, ses relations (images, liens) et ses styles greffés comme
 * ceux du corps, et le `w:sectPr` visé pointe dessus à la place de l'ancienne. Un type
 * identique ou absent du `layout` laisse la partie du gabarit intacte à l'octet ;
 * l'ancienne partie n'est jamais supprimée. Une section régénérée (absente du gabarit)
 * reçoit toutes les parties que son `w:sectPr` généré référence. Un type `even` greffé
 * est signalé à l'appelant, qui doit activer `w:evenAndOddHeaders` dans `settings.xml`
 * pour que Word l'affiche.
 */

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

type Kind = 'header' | 'footer';
type SetKey = keyof HeaderFooterSet;

const KINDS: readonly Kind[] = ['header', 'footer'];
const SET_KEYS: readonly SetKey[] = ['default', 'first', 'even'];

/** Attributs de relation que la partie générée peut porter (liens, images). */
const RELATIONSHIP_ATTRIBUTES: ReadonlySet<string> = new Set(['id', 'embed', 'link']);

/** Ce que la greffe d'en-têtes partage entre toutes les sections d'un même export. */
export interface HeaderFooterGraftContext {
  readonly template: PartStore;
  readonly generated: PartStore;
  readonly mainPart: string;
  readonly relationships: RelationshipTable;
  readonly generatedRelationships: RelationshipTable;
  readonly styles: StyleMerger;
  readonly media: MediaCopier;
  /** `Override` à ajouter à `[Content_Types].xml` pour les parties créées. */
  readonly overrides: Map<string, string>;
  readonly warnings: DocxExportWarning[];
}

/** En-têtes et pieds voulus (`layout`) ou existants (relus dans le gabarit) d'une section. */
export interface HeaderFooterSets {
  readonly headers?: HeaderFooterSet | undefined;
  readonly footers?: HeaderFooterSet | undefined;
}

export interface HeaderFooterGraftInput {
  /** `w:sectPr` du gabarit (final ou de section) qui recevra les références. */
  readonly sectPr: Element;
  /** `w:sectPr` généré de la même section, qui référence les parties générées. */
  readonly generatedSectPr: Element | null;
  /** Ce que le `layout` demande pour cette section. */
  readonly wanted: HeaderFooterSets;
  /** Ce que le gabarit a déjà pour cette section (effectif), `undefined` si non lu. */
  readonly existing: HeaderFooterSets | undefined;
}

/** Issue de la greffe : parties créées, et si l'une d'elles est de type `even`. */
export interface HeaderFooterGraftResult {
  readonly created: readonly string[];
  readonly even: boolean;
}

/** HTML comparable : blancs réduits, blancs collés aux balises retirés. */
function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
}

/** `w:headerReference` / `w:footerReference` de ce type dans un `w:sectPr`. */
function referenceOf(sectPr: Element, kind: Kind, type: SetKey): Element | null {
  return (
    Array.from(sectPr.children).find(
      (child) =>
        child.localName === `${kind}Reference` && (wordAttr(child, 'type') || 'default') === type,
    ) ?? null
  );
}

/** Chemin libre `word/header<n>.xml` / `word/footer<n>.xml` dans le gabarit. */
function freePartPath(store: PartStore, mainPart: string, kind: Kind): string {
  const directory = directoryOf(mainPart);
  for (let index = 1; ; index += 1) {
    const candidate = `${directory}${kind}${String(index)}.xml`;
    if (!store.has(candidate)) return candidate;
  }
}

/** Vrai si un jeu demande au moins un en-tête ou un pied. */
export function wantsHeadersFooters(sets: HeaderFooterSets | undefined): boolean {
  return Boolean(sets?.headers || sets?.footers);
}

/**
 * Greffe sur `sectPr` les en-têtes et pieds de `wanted` qui diffèrent d'`existing`
 * (type par type) ; sans `generatedSectPr`, rien ne peut être copié.
 */
export async function graftHeadersFooters(
  ctx: HeaderFooterGraftContext,
  input: HeaderFooterGraftInput,
): Promise<HeaderFooterGraftResult> {
  const created: string[] = [];
  let even = false;
  if (!wantsHeadersFooters(input.wanted) || !input.generatedSectPr) return { created, even };
  for (const kind of KINDS) {
    const wanted = kind === 'header' ? input.wanted.headers : input.wanted.footers;
    const existing = kind === 'header' ? input.existing?.headers : input.existing?.footers;
    if (!wanted) continue;
    for (const type of SET_KEYS) {
      const html = wanted[type]?.html;
      if (html === undefined) continue;
      const current = existing?.[type]?.html;
      if (current !== undefined && normalizeHtml(current) === normalizeHtml(html)) continue;
      const path = await graftOne(ctx, input.sectPr, input.generatedSectPr, kind, type);
      if (!path) continue;
      created.push(path);
      if (type === 'even') even = true;
    }
  }
  return { created, even };
}

/**
 * Greffe toutes les parties que `generatedSectPr` référence : pour une section régénérée
 * (clone du `w:sectPr` généré), chaque référence est rebranchée sur sa copie dans le
 * gabarit. Une référence dont la partie générée manque est retirée du clone.
 */
export async function graftAllHeadersFooters(
  ctx: HeaderFooterGraftContext,
  sectPr: Element,
  generatedSectPr: Element,
): Promise<HeaderFooterGraftResult> {
  const created: string[] = [];
  let even = false;
  for (const kind of KINDS) {
    for (const type of SET_KEYS) {
      if (!referenceOf(generatedSectPr, kind, type)) continue;
      const path = await graftOne(ctx, sectPr, generatedSectPr, kind, type);
      if (!path) {
        referenceOf(sectPr, kind, type)?.remove();
        continue;
      }
      created.push(path);
      if (type === 'even') even = true;
    }
  }
  return { created, even };
}

/** Copie la partie générée d'un type dans le gabarit et y fait pointer `sectPr`. */
async function graftOne(
  ctx: HeaderFooterGraftContext,
  sectPr: Element,
  generatedSectPr: Element,
  kind: Kind,
  type: SetKey,
): Promise<string | null> {
  const generatedReference = referenceOf(generatedSectPr, kind, type);
  const generatedId = generatedReference?.getAttributeNS(R_NS, 'id') ?? '';
  const generatedPath = ctx.generatedRelationships.get(generatedId)?.resolved;
  const doc = generatedPath ? await ctx.generated.dom(generatedPath) : null;
  // Un HTML vide ne produit pas de partie : l'ancienne reste (rien à retirer sans la supprimer).
  if (!generatedPath || !doc) return null;

  const path = freePartPath(ctx.template, ctx.mainPart, kind);
  const partRelationships = await RelationshipTable.open(ctx.template, path);
  const generatedPartRelationships = await RelationshipTable.open(ctx.generated, generatedPath);
  for (const element of allNamed(doc, '*')) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI !== R_NS || !RELATIONSHIP_ATTRIBUTES.has(attribute.localName)) {
        continue;
      }
      const relationship = generatedPartRelationships.get(attribute.value);
      if (!relationship) continue;
      let id: string | null = null;
      if (relationship.external) {
        id = await partRelationships.ensure(relationship.type, relationship.target, true);
      } else if (relationship.type === REL_TYPE.image) {
        id = await ctx.media.copy(relationship.resolved, partRelationships);
      }
      if (id !== null) attribute.value = id;
    }
  }
  for (const [name, expected] of [
    ['pStyle', 'paragraph'],
    ['rStyle', 'character'],
  ] as const) {
    for (const reference of allNamed(doc, name)) {
      const styleId = wordAttr(reference, 'val');
      if (!styleId) continue;
      const ensured = await ctx.styles.ensure(styleId, expected);
      if (ensured.status === 'missing') reference.remove();
      else if (ensured.id !== styleId) setWordAttr(reference, 'val', ensured.id);
    }
  }
  for (const paragraph of allNamed(doc, 'p')) ctx.styles.stripParagraph(paragraph);
  ctx.template.create(path, doc, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  ctx.overrides.set(path, PART_CONTENT_TYPES[kind]);

  const id = await ctx.relationships.add(REL_TYPE[kind], path, false);
  const reference = referenceOf(sectPr, kind, type);
  if (reference) {
    reference.setAttributeNS(R_NS, 'r:id', id);
  } else {
    const element = sectPr.ownerDocument.createElementNS(
      sectPr.namespaceURI,
      `${sectPr.prefix ? `${sectPr.prefix}:` : ''}${kind}Reference`,
    );
    setWordAttr(element, 'type', type);
    element.setAttributeNS(R_NS, 'r:id', id);
    // Ordre du schéma : les `headerReference` d'abord, puis les `footerReference`, puis le reste.
    const anchor = Array.from(sectPr.children).find(
      (child) =>
        child.localName !== 'headerReference' &&
        (kind === 'header' || child.localName !== 'footerReference'),
    );
    sectPr.insertBefore(element, anchor ?? null);
  }
  if (type === 'first' && !childNamed(sectPr, 'titlePg')) {
    const titlePage = sectPr.ownerDocument.createElementNS(
      sectPr.namespaceURI,
      `${sectPr.prefix ? `${sectPr.prefix}:` : ''}titlePg`,
    );
    const after = Array.from(sectPr.children).find((child) =>
      ['textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'].includes(
        child.localName,
      ),
    );
    sectPr.insertBefore(titlePage, after ?? null);
  }
  return path;
}
