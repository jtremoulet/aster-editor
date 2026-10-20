import type { DocumentLayout, SectionLayout, SectionStart } from '@aster-editor/core';
import type { FileChild, Footer, Header, ISectionOptions, ISectionPropertiesOptions } from 'docx';
import type { ExportContext } from './context';
import { SECTION_BREAK_ATTRIBUTE, isElement } from './dom';
import {
  buildFooters,
  buildHeaders,
  buildSectionFooters,
  buildSectionHeaders,
  type HeaderFooterGroup,
} from './header-footer';
import { resolvePageLayout, type PageLayout } from './styles';
import type { DocxExportOptions, DocxExportWarning } from './types';

/**
 * Sections de l'export neuf (session 4). Le corps HTML est découpé à chaque
 * `<hr data-section-break="n">` de premier niveau ; chaque segment devient une `section`
 * de la lib `docx` avec les propriétés de `layout.sections[n - 1]` (page, colonnes,
 * `titlePage`, `start` → `w:type`, en-têtes et pieds). Le dernier segment prend
 * `layout.sections[dernier]` quand la liste a autant d'entrées que de segments, sinon les
 * champs de premier niveau du `layout` (comportement 0.5, un corps sans saut = une section).
 */

/** Un segment du corps : son conteneur et le numéro (à partir de 1) de la section qu'il forme. */
export interface BodySegment {
  readonly container: Element;
  readonly number: number;
}

/**
 * Découpe le corps aux sauts de section de premier niveau. Sans saut, le corps lui-même
 * est l'unique segment (aucun nœud déplacé) ; sinon les nœuds de chaque segment sont
 * déplacés dans un `<div>` neuf, que `convertChildren` traverse comme un conteneur.
 * Le numéro d'un segment vient de l'attribut du saut qui le termine (`n`), le dernier
 * segment porte le numéro suivant.
 */
export function splitSections(body: Element): BodySegment[] {
  const nodes = Array.from(body.childNodes);
  const isBreak = (node: Node): node is Element =>
    isElement(node, 'hr') && node.hasAttribute(SECTION_BREAK_ATTRIBUTE);
  if (!nodes.some(isBreak)) return [{ container: body, number: 1 }];
  const segments: BodySegment[] = [];
  let container = body.ownerDocument.createElement('div');
  for (const node of nodes) {
    if (!isBreak(node)) {
      container.appendChild(node);
      continue;
    }
    const declared = Number.parseInt(node.getAttribute(SECTION_BREAK_ATTRIBUTE) ?? '', 10);
    const number = Number.isFinite(declared) && declared > 0 ? declared : segments.length + 1;
    segments.push({ container, number });
    node.remove();
    container = body.ownerDocument.createElement('div');
  }
  const last = segments[segments.length - 1];
  segments.push({ container, number: (last?.number ?? 0) + 1 });
  return segments;
}

/** `SectionStart` du contrat → `w:type` de la lib `docx`. */
function sectionType(
  start: SectionStart | undefined,
  ctx: ExportContext,
): ISectionPropertiesOptions['type'] | undefined {
  const { SectionType } = ctx.docx;
  switch (start) {
    case 'continuous':
      return SectionType.CONTINUOUS;
    case 'evenPage':
      return SectionType.EVEN_PAGE;
    case 'oddPage':
      return SectionType.ODD_PAGE;
    case 'nextPage':
      return SectionType.NEXT_PAGE;
    default:
      return undefined;
  }
}

/** Mise en page résolue d'un segment : page (twips) et le reste de `SectionLayout`. */
export interface ResolvedSection {
  readonly page: PageLayout;
  readonly columns: number | undefined;
  readonly titlePage: boolean;
  readonly start: SectionStart | undefined;
  readonly layout: SectionLayout | undefined;
}

/**
 * Section du contrat pour le segment `index` (0-based) sur `count` : `layout.sections[n]`
 * pour un segment intermédiaire ; pour le dernier, `layout.sections[dernier]` seulement si
 * la liste compte autant de sections que de segments, sinon les champs de premier niveau.
 */
function sectionLayoutOf(
  layout: DocumentLayout | undefined,
  segment: BodySegment,
  index: number,
  count: number,
): SectionLayout | undefined {
  const sections = layout?.sections ?? [];
  const last = index === count - 1;
  if (!last) return sections[segment.number - 1];
  if (sections.length === count) return sections[count - 1];
  return undefined;
}

/**
 * Résout la mise en page d'un segment. Pour le dernier (ou l'unique), les options
 * explicites (`page`, `pageSize`) priment champ par champ comme en 0.5 ; une section
 * intermédiaire ne connaît que son `SectionLayout`, complété par les champs de premier
 * niveau du `layout` (format du document) quand elle n'en déclare pas.
 */
export function resolveSection(
  options: DocxExportOptions,
  segment: BodySegment,
  index: number,
  count: number,
  warnings: DocxExportWarning[],
): ResolvedSection {
  const layout = options.layout;
  const section = sectionLayoutOf(layout, segment, index, count);
  const last = index === count - 1;
  const { page: _page, pageSize: _pageSize, ...withoutPage } = options;
  const pageOptions: DocxExportOptions = last
    ? { ...options, layout: { ...layout, ...(section?.page ? { page: section.page } : {}) } }
    : { ...withoutPage, layout: { page: section?.page ?? layout?.page } };
  const columns = section?.columns ?? (last || !section ? layout?.columns : undefined);
  return {
    page: resolvePageLayout(pageOptions, warnings),
    columns,
    titlePage: Boolean(section?.titlePage ?? (last || !section ? layout?.titlePage : false)),
    start: section?.start,
    layout: section,
  };
}

/** Propriétés `docx` d'une section à partir de sa mise en page résolue. */
function sectionProperties(
  resolved: ResolvedSection,
  ctx: ExportContext,
): ISectionPropertiesOptions {
  const { page, columns } = resolved;
  const type = sectionType(resolved.start, ctx);
  return {
    page: {
      size: {
        width: page.width,
        height: page.height,
        ...(page.orientation === 'landscape'
          ? { orientation: ctx.docx.PageOrientation.LANDSCAPE }
          : {}),
      },
      margin: {
        ...page.margins,
        header: page.headerDistance,
        footer: page.footerDistance,
      },
    },
    ...(resolved.titlePage ? { titlePage: true } : {}),
    ...(columns !== undefined && Number.isFinite(columns) && columns >= 2
      ? { column: { count: Math.min(45, Math.floor(columns)), equalWidth: true } }
      : {}),
    ...(type ? { type } : {}),
  };
}

/** Section `docx` construite, avec ce que le document doit savoir d'elle. */
export interface BuiltSection {
  readonly section: ISectionOptions;
  /** Vrai si un en-tête ou un pied de pages paires y est posé (`w:evenAndOddHeaders`). */
  readonly even: boolean;
}

/**
 * Assemble une section : en-têtes et pieds (ceux des options pour la dernière, ceux du
 * `SectionLayout` sinon), propriétés de page et enfants. Word exige au moins un paragraphe
 * par section.
 */
export async function buildSection(
  resolved: ResolvedSection,
  children: readonly FileChild[],
  last: boolean,
  options: DocxExportOptions,
  ctx: ExportContext,
): Promise<BuiltSection> {
  const headers: HeaderFooterGroup<Header> = last
    ? await buildHeaders(options, ctx, resolved.layout?.headers ?? options.layout?.headers)
    : await buildSectionHeaders(resolved.layout?.headers, ctx, options.parse);
  const footers: HeaderFooterGroup<Footer> = last
    ? await buildFooters(options, ctx, resolved.layout?.footers ?? options.layout?.footers)
    : await buildSectionFooters(resolved.layout?.footers, ctx, options.parse);
  const section: ISectionOptions = {
    properties: sectionProperties(resolved, ctx),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(Object.keys(footers).length > 0 ? { footers } : {}),
    children: children.length === 0 ? [new ctx.docx.Paragraph({ children: [] })] : children,
  };
  return { section, even: Boolean(headers.even || footers.even) };
}
