import type { DocumentLayout, HeaderFooterSet } from '@aster-editor/core';
import type { DocxExportWarning } from '../../export/types';
import { allNamed, childNamed } from '../preprocess/xml-utils';
import { PART_CONTENT_TYPES } from './content-types';
import type { MediaCopier } from './media';
import { REL_TYPE, RelationshipTable } from './relationships';
import type { StyleMerger } from './styles-merge';
import { directoryOf, setWordAttr, wordAttr, type PartStore } from './xml-io';

/**
 * En-têtes et pieds de page du gabarit quand `options.layout.headers` / `footers` est
 * fourni. Pour chaque type (`default`, `first`, `even`) dont le HTML diffère de ce que le
 * lecteur relit dans le gabarit, la partie générée par la chaîne d'export (lib `docx`,
 * `header-footer.ts`) est copiée dans le gabarit sous un nom libre, ses relations
 * (images, liens) et ses styles greffés comme ceux du corps, et le `w:sectPr` final
 * pointe dessus à la place de l'ancienne. Un type identique ou absent du `layout` laisse
 * la partie du gabarit intacte à l'octet ; l'ancienne partie n'est jamais supprimée. Sans
 * `w:sectPr` final dans le gabarit, rien ne peut être accroché : avertissement
 * `template-section-missing`. Un type `even` greffé est signalé à l'appelant, qui doit
 * activer `w:evenAndOddHeaders` dans `settings.xml` pour que Word l'affiche.
 */

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

type Kind = 'header' | 'footer';
type SetKey = keyof HeaderFooterSet;

const KINDS: readonly Kind[] = ['header', 'footer'];
const SET_KEYS: readonly SetKey[] = ['default', 'first', 'even'];

/** Attributs de relation que la partie générée peut porter (liens, images). */
const RELATIONSHIP_ATTRIBUTES: ReadonlySet<string> = new Set(['id', 'embed', 'link']);

export interface HeaderFooterGraftInput {
  readonly template: PartStore;
  readonly generated: PartStore;
  readonly mainPart: string;
  /** `w:sectPr` final du gabarit (déjà complété par héritage), `null` s'il n'y en a pas. */
  readonly sectPr: Element | null;
  /** `w:sectPr` final du document généré, qui référence les parties générées. */
  readonly generatedSectPr: Element | null;
  readonly relationships: RelationshipTable;
  readonly generatedRelationships: RelationshipTable;
  readonly styles: StyleMerger;
  readonly media: MediaCopier;
  readonly layout: DocumentLayout | undefined;
  /** En-têtes et pieds du gabarit tels que l'import les lit, `undefined` si non lus. */
  readonly templateHeaders: HeaderFooterSet | undefined;
  readonly templateFooters: HeaderFooterSet | undefined;
  /** `Override` à ajouter à `[Content_Types].xml` pour les parties créées. */
  readonly overrides: Map<string, string>;
  readonly warnings: DocxExportWarning[];
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

/** Vrai si le `layout` demande au moins un en-tête ou un pied. */
function wantsHeadersFooters(layout: DocumentLayout | undefined): boolean {
  return Boolean(layout?.headers || layout?.footers);
}

/** Greffe les en-têtes et pieds régénérés. */
export async function graftHeadersFooters(
  input: HeaderFooterGraftInput,
): Promise<HeaderFooterGraftResult> {
  const created: string[] = [];
  let even = false;
  if (!wantsHeadersFooters(input.layout)) return { created, even };
  if (!input.sectPr) {
    input.warnings.push({
      code: 'template-section-missing',
      message:
        'Gabarit sans w:sectPr final : les en-têtes et pieds de layout ne peuvent pas y être accrochés, ignorés',
    });
    return { created, even };
  }
  if (!input.layout || !input.generatedSectPr) return { created, even };
  for (const kind of KINDS) {
    const wanted = kind === 'header' ? input.layout.headers : input.layout.footers;
    const existing = kind === 'header' ? input.templateHeaders : input.templateFooters;
    if (!wanted) continue;
    for (const type of SET_KEYS) {
      const html = wanted[type]?.html;
      if (html === undefined) continue;
      const current = existing?.[type]?.html;
      if (current !== undefined && normalizeHtml(current) === normalizeHtml(html)) continue;
      const path = await graftOne(input, kind, type);
      if (!path) continue;
      created.push(path);
      if (type === 'even') even = true;
    }
  }
  return { created, even };
}

/** Copie la partie générée d'un type dans le gabarit et y fait pointer le `w:sectPr`. */
async function graftOne(
  input: HeaderFooterGraftInput,
  kind: Kind,
  type: SetKey,
): Promise<string | null> {
  const sectPr = input.sectPr;
  const generatedSectPr = input.generatedSectPr;
  if (!sectPr || !generatedSectPr) return null;
  const generatedReference = referenceOf(generatedSectPr, kind, type);
  const generatedId = generatedReference?.getAttributeNS(R_NS, 'id') ?? '';
  const generatedPath = input.generatedRelationships.get(generatedId)?.resolved;
  const doc = generatedPath ? await input.generated.dom(generatedPath) : null;
  // Un HTML vide ne produit pas de partie : l'ancienne reste (rien à retirer sans la supprimer).
  if (!generatedPath || !doc) return null;

  const path = freePartPath(input.template, input.mainPart, kind);
  const partRelationships = await RelationshipTable.open(input.template, path);
  const generatedPartRelationships = await RelationshipTable.open(input.generated, generatedPath);
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
        id = await input.media.copy(relationship.resolved, partRelationships);
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
      const ensured = await input.styles.ensure(styleId, expected);
      if (ensured.status === 'missing') reference.remove();
      else if (ensured.id !== styleId) setWordAttr(reference, 'val', ensured.id);
    }
  }
  for (const paragraph of allNamed(doc, 'p')) input.styles.stripParagraph(paragraph);
  input.template.create(path, doc, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  input.overrides.set(path, PART_CONTENT_TYPES[kind]);

  const id = await input.relationships.add(REL_TYPE[kind], path, false);
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
