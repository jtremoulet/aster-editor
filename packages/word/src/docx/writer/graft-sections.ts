import type { DocumentLayout, SectionLayout } from '@aster-editor/core';
import { sectionHeaderFooterSets, sectionLayoutOf } from '../../export/section-layout';
import { childNamed, childrenNamed } from '../preprocess/xml-utils';
import type { HeadersFootersResult } from '../reader/headers';
import { readSectionProperties } from '../reader/sections';
import {
  graftAllHeadersFooters,
  graftHeadersFooters,
  wantsHeadersFooters,
  type HeaderFooterGraftContext,
  type HeaderFooterGraftResult,
} from './header-footer-graft';
import { PPR_ORDER } from './style-reconcile';
import { createSibling, insertOrdered, wordAttr } from './xml-io';

/**
 * Sections du corps greffé (session 4). Un corps à `k` sauts donne `k + 1` sections : le
 * `w:sectPr` des sections 1..k est écrit dans le `w:pPr` du dernier paragraphe de chaque
 * segment (créé vide s'il le faut, ou si le gabarit portait le sien dans un paragraphe
 * vide), le `w:sectPr` final reste celui du gabarit. Chaque `w:sectPr` est **greffé depuis
 * le gabarit** quand la section y existait : même nombre de sections → correspondance par
 * index, sinon par les propriétés de page (`layout.sections[n]`) ; copié tel quel avec ses
 * références d'en-tête et de pied (les parties existent déjà). Sinon il est régénéré depuis
 * le `w:sectPr` généré par la lib `docx` (`layout.sections[n]`), ses en-têtes et pieds
 * copiés dans le gabarit. Les références des sections du gabarit **abandonnées** sont
 * transmises à la section suivante conservée, comme Word les faisait hériter ; pas
 * `w:titlePg`, que Word n'hérite pas (R43-06). « Quelle `SectionLayout` pour quel
 * segment » suit la règle partagée avec l'export neuf (`export/section-layout.ts`,
 * segments numérotés par position, R43-01 / R43-04).
 */

/** Tous les `w:sectPr` du corps dans l'ordre : ceux des `w:pPr` (fins de section) puis le final. */
export function allSectPrs(body: Element): Element[] {
  const result: Element[] = [];
  for (const paragraph of childrenNamed(body, 'p')) {
    const pPr = childNamed(paragraph, 'pPr');
    const sectPr = pPr ? childNamed(pPr, 'sectPr') : null;
    if (sectPr) result.push(sectPr);
  }
  const last = childNamed(body, 'sectPr');
  if (last) result.push(last);
  return result;
}

/** Éléments du `w:sectPr` qui doivent précéder tout le reste (ordre du schéma). */
const SECTION_REFERENCES = ['headerReference', 'footerReference'] as const;

export interface SectionGraftInput {
  readonly templateBody: Element;
  /** Blocs générés, déjà remappés (relations, styles), dans le document généré. */
  readonly blocks: readonly Element[];
  readonly generatedBody: Element;
  readonly layout: DocumentLayout | undefined;
  /** En-têtes et pieds effectifs de la dernière section du gabarit, `undefined` si non lus. */
  readonly templateHeadersFooters: HeadersFootersResult | undefined;
  /** En-têtes et pieds effectifs de chaque `w:sectPr` du gabarit, dans l'ordre, si lus. */
  readonly templateSections: readonly HeadersFootersResult[] | undefined;
  readonly headerFooter: HeaderFooterGraftContext;
}

export interface SectionGraftResult {
  /** Vrai si un en-tête ou un pied de pages paires a été greffé (`w:evenAndOddHeaders`). */
  readonly even: boolean;
  /** Nombre de sections du corps greffé. */
  readonly count: number;
}

/** Un segment du corps généré : ses blocs et le `w:sectPr` que la lib `docx` lui a donné. */
interface Segment {
  readonly blocks: Element[];
  readonly generatedSectPr: Element | null;
}

/** Vrai pour un paragraphe sans autre enfant que ses propriétés. */
function isEmptyParagraph(paragraph: Element): boolean {
  return Array.from(paragraph.children).every((child) => child.localName === 'pPr');
}

/**
 * Découpe les blocs générés aux paragraphes porteurs d'un `w:sectPr` (fin de section de la
 * lib `docx`). Le `w:sectPr` est détaché ; un porteur vide (créé par la lib) disparaît, un
 * porteur avec du contenu reste le dernier bloc de son segment.
 */
function splitGenerated(blocks: readonly Element[], generatedBody: Element): Segment[] {
  const segments: Segment[] = [];
  let current: Element[] = [];
  for (const block of blocks) {
    const pPr = block.localName === 'p' ? childNamed(block, 'pPr') : null;
    const sectPr = pPr ? childNamed(pPr, 'sectPr') : null;
    if (!pPr || !sectPr) {
      current.push(block);
      continue;
    }
    sectPr.remove();
    if (pPr.children.length === 0) pPr.remove();
    if (!isEmptyParagraph(block)) current.push(block);
    segments.push({ blocks: current, generatedSectPr: sectPr });
    current = [];
  }
  segments.push({ blocks: current, generatedSectPr: childNamed(generatedBody, 'sectPr') });
  return segments;
}

/** Valeur JSON à clés triées, pour comparer deux mises en page sans dépendre de l'ordre des clés. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : item,
  );
}

/**
 * Signature comparable d'une section (du gabarit, lue par le lecteur, ou du contrat) :
 * page, colonnes et type de saut, `nextPage` par défaut (valeur du schéma).
 */
function sectionSignature(section: Pick<SectionLayout, 'page' | 'columns' | 'start'>): string {
  return canonical({
    page: section.page,
    columns: section.columns,
    start: section.start ?? 'nextPage',
  });
}

/**
 * Section du gabarit (index dans `templateSectPrs`) pour chaque segment : par index quand
 * les nombres coïncident, sinon par les propriétés de `layout.sections[n]`, dans l'ordre
 * (une section du gabarit n'est reprise qu'une fois, jamais avant une déjà reprise). Le
 * dernier segment prend toujours le `w:sectPr` final du gabarit s'il existe.
 */
function matchSections(
  segments: readonly Segment[],
  templateSectPrs: readonly Element[],
  hasFinal: boolean,
  layout: DocumentLayout | undefined,
): Array<number | null> {
  const used: Array<number | null> = segments.map(() => null);
  const last = segments.length - 1;
  if (hasFinal) used[last] = templateSectPrs.length - 1;
  if (templateSectPrs.length === segments.length) {
    return segments.map((_segment, index) => index);
  }
  const intermediates = hasFinal ? templateSectPrs.length - 1 : templateSectPrs.length;
  const signatures = templateSectPrs
    .slice(0, intermediates)
    .map((sectPr) => sectionSignature(readSectionProperties(sectPr)));
  let next = 0;
  for (let index = 0; index < last; index += 1) {
    const section = sectionLayoutOf(layout, index, segments.length);
    if (!section) continue;
    const wanted = sectionSignature(section);
    const found = signatures.findIndex(
      (signature, candidate) => candidate >= next && signature === wanted,
    );
    if (found < 0) continue;
    used[index] = found;
    next = found + 1;
  }
  return used;
}

/**
 * Références d'en-tête et de pied en attente d'héritage. `w:titlePg` n'en fait pas partie :
 * Word n'hérite que les références d'une section à l'autre, une référence `first` héritée
 * reste inerte sans `w:titlePg` propre à la section (R43-06).
 */
interface Pending {
  readonly references: Map<string, Element>;
}

function referenceKey(element: Element): string {
  return `${element.localName}:${wordAttr(element, 'type') || 'default'}`;
}

/** Accumule les références d'un `w:sectPr` abandonné, les plus récentes recouvrant les anciennes. */
function collectPending(sectPr: Element, pending: Pending): void {
  for (const child of Array.from(sectPr.children)) {
    if (child.localName === 'headerReference' || child.localName === 'footerReference') {
      pending.references.set(referenceKey(child), child);
    }
  }
}

/**
 * Complète un `w:sectPr` conservé des références que les sections abandonnées avant lui
 * lui transmettaient par héritage : insérées en tête, en-têtes avant pieds (ordre du
 * schéma). Vide ensuite l'attente.
 */
function completeFromPending(sectPr: Element, pending: Pending): void {
  const own = new Set(
    Array.from(sectPr.children)
      .filter(
        (child) => child.localName === 'headerReference' || child.localName === 'footerReference',
      )
      .map(referenceKey),
  );
  for (const name of [...SECTION_REFERENCES].reverse()) {
    for (const [key, element] of Array.from(pending.references).reverse()) {
      if (!key.startsWith(`${name}:`) || own.has(key)) continue;
      sectPr.insertBefore(sectPr.ownerDocument.importNode(element, true), sectPr.firstChild);
    }
  }
  pending.references.clear();
}

/** Pose un `w:sectPr` dans le `w:pPr` d'un paragraphe (créé en tête s'il manque). */
function attachToParagraph(paragraph: Element, sectPr: Element): void {
  let pPr = childNamed(paragraph, 'pPr');
  if (!pPr) {
    pPr = createSibling(paragraph, 'pPr');
    paragraph.insertBefore(pPr, paragraph.firstChild);
  }
  insertOrdered(pPr, sectPr, PPR_ORDER);
}

/** Greffe les sections : vide le corps du gabarit, y place les segments et leurs `w:sectPr`. */
export async function graftSections(input: SectionGraftInput): Promise<SectionGraftResult> {
  const { templateBody, layout, headerFooter } = input;
  const doc = templateBody.ownerDocument;
  const segments = splitGenerated(input.blocks, input.generatedBody);
  const templateSectPrs = allSectPrs(templateBody);
  const templateFinal = childNamed(templateBody, 'sectPr');
  // Un `w:sectPr` du gabarit porté par un paragraphe vide : la section greffée en recrée un.
  const emptyCarrier = templateSectPrs.map((sectPr) => {
    const paragraph = sectPr.parentElement?.parentElement;
    return paragraph?.localName === 'p' && isEmptyParagraph(paragraph);
  });
  const used = matchSections(segments, templateSectPrs, templateFinal !== null, layout);

  for (const child of Array.from(templateBody.childNodes)) templateBody.removeChild(child);
  const pending: Pending = { references: new Map() };
  let nextTemplate = 0;
  let even = false;
  const record = (result: HeaderFooterGraftResult): void => {
    even = even || result.even;
  };
  const last = segments.length - 1;
  for (const [index, segment] of segments.entries()) {
    const imported = segment.blocks.map((block) => doc.importNode(block, true));
    for (const block of imported) templateBody.appendChild(block);
    const templateIndex = used[index] ?? null;
    // Les sections du gabarit sautées avant celle-ci transmettent leurs références.
    const upTo = templateIndex ?? (index === last ? templateSectPrs.length : nextTemplate);
    for (let j = nextTemplate; j < upTo; j += 1) {
      const dropped = templateSectPrs[j];
      if (dropped) collectPending(dropped, pending);
    }
    if (templateIndex !== null) nextTemplate = templateIndex + 1;

    if (index === last) {
      // Même règle que l'export neuf : `sections[dernier]` quand la liste a autant d'entrées
      // que de segments, sinon les champs de premier niveau du `layout` (R43-01).
      const wanted = sectionHeaderFooterSets(layout, index, segments.length);
      if (!templateFinal) {
        if (wantsHeadersFooters(wanted)) {
          headerFooter.warnings.push({
            code: 'template-section-missing',
            message:
              'Gabarit sans w:sectPr final : les en-têtes et pieds de layout ne peuvent pas y être accrochés, ignorés',
          });
        }
        break;
      }
      completeFromPending(templateFinal, pending);
      templateBody.appendChild(templateFinal);
      record(
        await graftHeadersFooters(headerFooter, {
          sectPr: templateFinal,
          generatedSectPr: segment.generatedSectPr,
          wanted,
          existing: input.templateHeadersFooters,
        }),
      );
      break;
    }

    const section = sectionLayoutOf(layout, index, segments.length);
    let sectPr: Element;
    if (templateIndex !== null) {
      const source = templateSectPrs[templateIndex];
      if (!source) continue;
      sectPr = doc.importNode(source, true);
      completeFromPending(sectPr, pending);
      const wanted = { headers: section?.headers, footers: section?.footers };
      if (wantsHeadersFooters(wanted)) {
        record(
          await graftHeadersFooters(headerFooter, {
            sectPr,
            generatedSectPr: segment.generatedSectPr,
            wanted,
            existing: input.templateSections?.[templateIndex],
          }),
        );
      }
    } else if (segment.generatedSectPr) {
      sectPr = doc.importNode(segment.generatedSectPr, true);
      record(await graftAllHeadersFooters(headerFooter, sectPr, segment.generatedSectPr));
    } else {
      continue;
    }

    const lastBlock = imported[imported.length - 1];
    const paragraph = lastBlock?.localName === 'p' ? lastBlock : null;
    const recreate = templateIndex !== null && emptyCarrier[templateIndex] === true;
    if (paragraph && (isEmptyParagraph(paragraph) || !recreate)) {
      attachToParagraph(paragraph, sectPr);
    } else {
      const carrier = createSibling(templateBody, 'p');
      attachToParagraph(carrier, sectPr);
      templateBody.appendChild(carrier);
    }
  }
  return { even, count: segments.length };
}
