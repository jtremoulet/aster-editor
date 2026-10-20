import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import type { DocumentLayout, PageViewOptions } from '../api';
import {
  PAGE_VIEW_CLASS,
  PAGE_VIEW_CSS_VARIABLES,
  pageViewCssValues,
  resolvePageMetrics,
  resolveSectionLayout,
  type PageMetrics,
} from './page-view';
import {
  cssLengthToPx,
  paginate,
  type PageSegment,
  type PaginationResult,
  type SectionCssVariables,
} from './pagination-layout';

/**
 * Phase de **mesure** de la pagination approximative (session 3, L30, extrait de
 * `pagination.ts` en F30) : hauteur utile de la page depuis l'hôte, hauteurs rendues des
 * blocs de premier niveau depuis le DOM, puis calcul pur (`pagination-layout.ts`). Aucune
 * écriture dans le DOM ici ; le contrôleur (`pagination-controller.ts`) planifie et pose.
 *
 * Sections (session 4, L44) : chaque saut de section (`hr[data-section-break]`, nœud
 * `sectionBreak` de L41 ou `hr` simulé) ouvre un segment de hauteur utile propre, lue
 * dans les variables `--aster-page-*` que le core pose sur le `hr` (section suivante),
 * sinon résolue depuis `layout.sections`. Le saut force une coupure, sauf si la section
 * qui commence est `continuous` (`data-section-start` sur le `hr`, sinon `start` de la
 * section) : la hauteur change alors au bloc suivant, sans coupure.
 */

/** Classe du widget de coupure de page posé avant le bloc qui ouvre une page. */
export const PAGE_GAP_CLASS = 'aster-page-gap';
/** Classe posée par ProseMirror sur tout widget de décoration (exclu de l'alignement DOM / doc). */
const PROSEMIRROR_WIDGET_CLASS = 'ProseMirror-widget';
/** Nom du nœud de saut de page d'un intégrateur (`slash-menu` le propose s'il existe). */
const PAGE_BREAK_NODE_NAME = 'pageBreak';
/** Nom du nœud de saut de section (L41, `section-break.ts`) ; lu par nom pour ne pas en dépendre. */
const SECTION_BREAK_NODE_NAME = 'sectionBreak';
/** Sélecteur DOM d'un saut de section, quel que soit le nœud qui le rend. */
const SECTION_BREAK_SELECTOR = 'hr[data-section-break]';
/** Attribut posé sur le `hr` par le NodeView de L41 : type de saut de la section suivante. */
const SECTION_START_ATTRIBUTE = 'data-section-start';

/** Vrai pour un saut de page explicite : `<hr data-page-break>` ou nœud `pageBreak` d'un intégrateur. */
function isExplicitPageBreak(node: ProseMirrorNode): boolean {
  if (node.type.name === PAGE_BREAK_NODE_NAME) {
    return true;
  }
  return node.type.name === 'horizontalRule' && node.attrs['pageBreak'] === true;
}

/** Vrai pour un saut de section : nœud `sectionBreak`, ou tout bloc rendu `hr[data-section-break]`. */
function isSectionBreak(node: ProseMirrorNode, dom: Element | null): boolean {
  return (
    node.type.name === SECTION_BREAK_NODE_NAME ||
    (dom !== null && dom.matches(SECTION_BREAK_SELECTOR))
  );
}

/** Le `hr` qui porte les variables : le DOM du nœud, ou le `hr` qu'un NodeView enveloppe. */
function sectionBreakElement(dom: Element | null): Element | null {
  if (dom === null || dom.matches('hr')) {
    return dom;
  }
  return dom.querySelector(SECTION_BREAK_SELECTOR) ?? dom;
}

/** Valeur d'une variable CSS sur un élément : calculée, sinon inline, `''` si absente. */
function readCssVariable(element: Element | null, name: string): string {
  if (element === null) {
    return '';
  }
  const computed = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
  const inline = element instanceof HTMLElement ? element.style.getPropertyValue(name) : '';
  return (computed?.getPropertyValue(name) || inline || '').trim();
}

/**
 * Les huit variables `--aster-page-*` d'un élément (hôte ou `hr` de saut de section),
 * chacune reprise telle quelle si elle est une longueur absolue lisible, sinon formatée
 * depuis les métriques de repli (`DocumentLayout` / `SectionLayout` résolus).
 */
export function readPageVariables(
  element: Element | null,
  fallback: PageMetrics,
): SectionCssVariables {
  const values = pageViewCssValues(fallback);
  const variables: Record<string, string> = {};
  PAGE_VIEW_CSS_VARIABLES.forEach((name, index) => {
    const raw = readCssVariable(element, name);
    variables[name] = raw !== '' && cssLengthToPx(raw) !== null ? raw : (values[index] ?? '');
  });
  return variables;
}

/** Hauteur utile en px depuis des variables lues : hauteur moins marges haute et basse. */
export function usableHeightOf(variables: SectionCssVariables): number {
  const px = (name: string): number => cssLengthToPx(variables[name] ?? '') ?? 0;
  return (
    px('--aster-page-height') - px('--aster-page-margin-top') - px('--aster-page-margin-bottom')
  );
}

/**
 * Hauteur utile d'une page en px : hauteur moins marges haute et basse, lues dans les
 * variables `--aster-page-*` de l'hôte (calculées, puis inline), sinon depuis la mise en
 * page résolue de la section 1. Conversion mm → px exacte (96 / 25,4), pas d'élément
 * témoin : les rectangles mesurés sont eux aussi en px CSS, quel que soit le zoom.
 */
export function usablePageHeightPx(host: HTMLElement | null, options: PageViewOptions): number {
  const layout: DocumentLayout = options.layout ?? {};
  return usableHeightOf(
    readPageVariables(host, resolvePageMetrics(resolveSectionLayout(layout, 1))),
  );
}

/** Un saut de section mesuré : index du bloc et `hr` qui porte les variables de la section suivante. */
export interface MeasuredSectionBreak {
  readonly index: number;
  readonly element: Element | null;
}

/** Hauteurs mesurées des blocs de premier niveau, index des coupures forcées et sauts de section. */
export interface MeasuredBlocks {
  readonly heights: readonly number[];
  readonly breaks: ReadonlySet<number>;
  /** Sauts de section dans l'ordre du document ; vide pour un document d'une section. */
  readonly sectionBreaks: readonly MeasuredSectionBreak[];
}

/**
 * Mesure chaque bloc de premier niveau, en lot : d'abord l'alignement DOM / document,
 * puis toutes les lectures de rectangles, aucune écriture. La hauteur d'un bloc va de son
 * haut au haut du suivant (ou de la coupure déjà posée entre eux), marges comprises ; le
 * dernier bloc prend la hauteur de son rectangle.
 *
 * Un saut de page explicite mesure **0** (R30-01) : `page.css` le rend haut tant qu'aucune
 * coupure ne le suit, puis l'efface derrière elle (`hr:has(+ .aster-page-gap)`). Le
 * compter ferait déborder la page au premier rendu (page vide) et fausserait le
 * remplissage de la coupure jusqu'à la frappe suivante. Un saut de section est mesuré
 * normalement ici (filet fin) ; `measurePagination` le ramène à 0 quand il force une
 * coupure, qui le remplace de la même façon.
 *
 * Alignement : les enfants directs de `view.dom` qui ne sont pas des widgets sont, dans
 * l'ordre, les DOM des enfants du document. Si le compte diffère (DOM d'un intégrateur),
 * on retombe sur `view.nodeDOM` bloc par bloc, plus lent mais sûr.
 */
export function measureBlocks(view: EditorView): MeasuredBlocks {
  const { doc } = view.state;
  const count = doc.childCount;
  const domChildren: Element[] = [];
  const gapsBefore = new Map<number, Element>();
  for (const child of Array.from(view.dom.children)) {
    if (child.classList.contains(PAGE_GAP_CLASS)) {
      gapsBefore.set(domChildren.length, child);
    } else if (!child.classList.contains(PROSEMIRROR_WIDGET_CLASS)) {
      domChildren.push(child);
    }
  }
  const aligned = domChildren.length === count;
  const breaks = new Set<number>();
  const explicitBreaks = new Set<number>();
  const sectionBreaks: MeasuredSectionBreak[] = [];
  const blocks: (Element | null)[] = [];
  doc.forEach((node, offset, index) => {
    if (isExplicitPageBreak(node)) {
      explicitBreaks.add(index);
      breaks.add(index + 1);
    }
    if (node.attrs['pageBreakBefore'] === true) {
      breaks.add(index);
    }
    const dom: unknown = aligned ? domChildren[index] : view.nodeDOM(offset);
    const element = dom instanceof Element ? dom : null;
    if (isSectionBreak(node, element)) {
      sectionBreaks.push({ index, element: sectionBreakElement(element) });
    }
    blocks.push(element);
  });

  const rects = blocks.map((dom) => (dom ? dom.getBoundingClientRect() : null));
  const gapTops = new Map<number, number>();
  if (aligned) {
    for (const [index, gap] of gapsBefore) {
      gapTops.set(index, gap.getBoundingClientRect().top);
    }
  }
  const heights = rects.map((rect, index) => {
    if (!rect || explicitBreaks.has(index)) {
      return 0;
    }
    const bottom = gapTops.get(index + 1) ?? rects[index + 1]?.top ?? rect.bottom;
    return Math.max(rect.height, bottom - rect.top);
  });
  return { heights, breaks, sectionBreaks };
}

/** Un segment de section : hauteur utile, variables lues et type de saut qui l'ouvre. */
export interface SectionSegment extends PageSegment {
  readonly variables: SectionCssVariables;
  /** Vrai si la section commence sans changer de page (`start: 'continuous'`). */
  readonly continuous: boolean;
}

/**
 * Segments de pagination d'un document à sections : la section 1 depuis l'hôte, puis une
 * section par saut, dont les variables sont lues sur son `hr` (posées par le core pour la
 * section suivante) et, à défaut, résolues depuis `layout.sections` (numérotation
 * **positionnelle** : le k-ième saut ouvre la section k + 1, quel que soit son attribut).
 */
export function sectionSegments(
  host: HTMLElement | null,
  options: PageViewOptions,
  sectionBreaks: readonly MeasuredSectionBreak[],
): SectionSegment[] {
  const layout: DocumentLayout = options.layout ?? {};
  const segmentOf = (
    element: Element | null,
    section: number,
    start: number,
    continuous: boolean,
  ): SectionSegment => {
    const variables = readPageVariables(
      element,
      resolvePageMetrics(resolveSectionLayout(layout, section)),
    );
    return { start, pageHeight: usableHeightOf(variables), variables, continuous };
  };
  const segments = [segmentOf(host, 1, 0, false)];
  sectionBreaks.forEach((sectionBreak, position) => {
    const section = position + 2;
    const declared = sectionBreak.element?.getAttribute(SECTION_START_ATTRIBUTE) ?? null;
    const start = declared ?? resolveSectionLayout(layout, section).start ?? 'nextPage';
    segments.push(
      segmentOf(sectionBreak.element, section, sectionBreak.index + 1, start === 'continuous'),
    );
  });
  return segments;
}

/**
 * Mesure puis pagine la vue : hauteur utile depuis l'hôte, hauteurs depuis le DOM. Avec
 * des sauts de section, une hauteur utile par segment, une coupure forcée après chaque
 * saut non `continuous` (le `hr` mesure alors 0, comme un saut de page) et les variables
 * de chaque section dans `sections`.
 */
export function measurePagination(view: EditorView, options: PageViewOptions): PaginationResult {
  const host = view.dom.closest<HTMLElement>(`.${PAGE_VIEW_CLASS}`);
  const { heights, breaks, sectionBreaks } = measureBlocks(view);
  if (sectionBreaks.length === 0) {
    return paginate(heights, usablePageHeightPx(host, options), breaks);
  }
  const segments = sectionSegments(host, options, sectionBreaks);
  const forced = new Set(breaks);
  const measured = [...heights];
  sectionBreaks.forEach((sectionBreak, position) => {
    if (segments[position + 1]?.continuous === false) {
      forced.add(sectionBreak.index + 1);
      measured[sectionBreak.index] = 0;
    }
  });
  const result = paginate(measured, segments, forced);
  return { ...result, sections: segments.map((segment) => segment.variables) };
}
