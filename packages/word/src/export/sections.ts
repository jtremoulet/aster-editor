import type { SectionLayout, SectionStart } from '@aster-editor/core';
import type { FileChild, Footer, Header, ISectionOptions, ISectionPropertiesOptions } from 'docx';
import type { ExportContext } from './context.js';
import { SECTION_BREAK_ATTRIBUTE, isElement } from './dom.js';
import {
  buildFooters,
  buildHeaders,
  buildSectionFooters,
  buildSectionHeaders,
  type HeaderFooterGroup,
} from './header-footer.js';
import { sectionHeaderFooterSets, sectionLayoutOf } from './section-layout.js';
import { resolvePageLayout, type PageLayout } from './styles.js';
import type { DocxExportOptions, DocxExportWarning } from './types.js';

/**
 * Sections de l'export neuf (session 4). Le corps HTML est découpé à chaque
 * `<hr data-section-break>` de premier niveau ; le segment `n` (1..k, par position)
 * devient une `section` de la lib `docx` avec les propriétés de `layout.sections[n - 1]`
 * (page, colonnes, `titlePage`, `start` → `w:type`, en-têtes et pieds). Le dernier segment
 * prend `layout.sections[dernier]` quand la liste a autant d'entrées que de segments,
 * sinon les champs de premier niveau du `layout` (comportement 0.5, un corps sans saut =
 * une section). La règle est celle de `section-layout.ts`, partagée avec la greffe.
 */

export { sectionHeaderFooterSets, sectionLayoutOf } from './section-layout.js';

/** Un segment du corps : son conteneur et le numéro (à partir de 1, par position) de la section qu'il forme. */
export interface BodySegment {
  readonly container: Element;
  readonly number: number;
}

/**
 * Découpe le corps aux sauts de section de premier niveau. Sans saut, le corps lui-même
 * est l'unique segment (aucun nœud déplacé) ; sinon les nœuds de chaque segment sont
 * déplacés dans un `<div>` neuf, que `convertChildren` traverse comme un conteneur.
 * Les segments sont numérotés 1..k par position : l'attribut du saut n'est pas lu
 * (R43-04), la greffe numérote de la même façon.
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
    segments.push({ container, number: segments.length + 1 });
    node.remove();
    container = body.ownerDocument.createElement('div');
  }
  segments.push({ container, number: segments.length + 1 });
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
 * Résout la mise en page du segment `index` (0-based) sur `count`. Les options explicites
 * (`page`, `pageSize`) portent sur tout le document, comme en 0.5 : elles priment champ par
 * champ pour le dernier segment ; pour un segment intermédiaire, sa `SectionLayout.page`
 * fait foi quand elle existe, sinon les options puis `layout.page` (R43-03). Colonnes et
 * `titlePage` : ceux de la section, ou les champs de premier niveau pour le dernier
 * segment ou un segment sans section.
 */
export function resolveSection(
  options: DocxExportOptions,
  index: number,
  count: number,
  warnings: DocxExportWarning[],
): ResolvedSection {
  const layout = options.layout;
  const section = sectionLayoutOf(layout, index, count);
  const last = index === count - 1;
  const { page: _page, pageSize: _pageSize, ...withoutPage } = options;
  let pageOptions: DocxExportOptions;
  if (last) {
    pageOptions = {
      ...options,
      layout: { ...layout, ...(section?.page ? { page: section.page } : {}) },
    };
  } else if (section?.page) {
    pageOptions = { ...withoutPage, layout: { page: section.page } };
  } else {
    pageOptions = { ...options, layout: { page: layout?.page } };
  }
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
 * Assemble la section du segment `index` sur `count` : en-têtes et pieds selon la règle
 * partagée (`sectionHeaderFooterSets`), `options.header` / `options.footer` primant dans
 * la dernière section et servant de repli `default` dans les autres (R43-03), propriétés
 * de page et enfants. Word exige au moins un paragraphe par section.
 */
export async function buildSection(
  resolved: ResolvedSection,
  children: readonly FileChild[],
  index: number,
  count: number,
  options: DocxExportOptions,
  ctx: ExportContext,
): Promise<BuiltSection> {
  const last = index === count - 1;
  const sets = sectionHeaderFooterSets(options.layout, index, count);
  const headers: HeaderFooterGroup<Header> = last
    ? await buildHeaders(options, ctx, sets.headers)
    : await buildSectionHeaders(sets.headers, options, ctx);
  const footers: HeaderFooterGroup<Footer> = last
    ? await buildFooters(options, ctx, sets.footers)
    : await buildSectionFooters(sets.footers, options, ctx);
  const section: ISectionOptions = {
    properties: sectionProperties(resolved, ctx),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(Object.keys(footers).length > 0 ? { footers } : {}),
    children: children.length === 0 ? [new ctx.docx.Paragraph({ children: [] })] : children,
  };
  return { section, even: Boolean(headers.even || footers.even) };
}
