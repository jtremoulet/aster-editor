import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import type { PageViewOptions } from '../api';
import { PAGE_VIEW_CLASS, resolvePageMetrics } from './page-view';
import { MM_TO_PX, cssLengthToPx, paginate, type PaginationResult } from './pagination-layout';

/**
 * Phase de **mesure** de la pagination approximative (session 3, L30, extrait de
 * `pagination.ts` en F30) : hauteur utile de la page depuis l'hôte, hauteurs rendues des
 * blocs de premier niveau depuis le DOM, puis calcul pur (`pagination-layout.ts`). Aucune
 * écriture dans le DOM ici ; le contrôleur (`pagination-controller.ts`) planifie et pose.
 */

/** Classe du widget de coupure de page posé avant le bloc qui ouvre une page. */
export const PAGE_GAP_CLASS = 'aster-page-gap';
/** Classe posée par ProseMirror sur tout widget de décoration (exclu de l'alignement DOM / doc). */
const PROSEMIRROR_WIDGET_CLASS = 'ProseMirror-widget';
/** Nom du nœud de saut de page d'un intégrateur (`slash-menu` le propose s'il existe). */
const PAGE_BREAK_NODE_NAME = 'pageBreak';

/** Vrai pour un saut de page explicite : `<hr data-page-break>` ou nœud `pageBreak` d'un intégrateur. */
function isExplicitPageBreak(node: ProseMirrorNode): boolean {
  if (node.type.name === PAGE_BREAK_NODE_NAME) {
    return true;
  }
  return node.type.name === 'horizontalRule' && node.attrs['pageBreak'] === true;
}

/**
 * Hauteur utile d'une page en px : hauteur moins marges haute et basse, lues dans les
 * variables `--aster-page-*` de l'hôte (calculées, puis inline), sinon depuis la mise en
 * page résolue. Conversion mm → px exacte (96 / 25,4), pas d'élément témoin : les
 * rectangles mesurés sont eux aussi en px CSS, quel que soit le zoom.
 */
export function usablePageHeightPx(host: HTMLElement | null, options: PageViewOptions): number {
  const metrics = resolvePageMetrics(options.layout);
  const computed = host && typeof getComputedStyle === 'function' ? getComputedStyle(host) : null;
  const read = (name: string, fallbackMm: number): number => {
    const raw = (
      computed?.getPropertyValue(name) ||
      host?.style.getPropertyValue(name) ||
      ''
    ).trim();
    const px = raw === '' ? null : cssLengthToPx(raw);
    return px ?? fallbackMm * MM_TO_PX;
  };
  return (
    read('--aster-page-height', metrics.heightMm) -
    read('--aster-page-margin-top', metrics.marginTopMm) -
    read('--aster-page-margin-bottom', metrics.marginBottomMm)
  );
}

/** Hauteurs mesurées des blocs de premier niveau et index des coupures forcées. */
export interface MeasuredBlocks {
  readonly heights: readonly number[];
  readonly breaks: ReadonlySet<number>;
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
 * remplissage de la coupure jusqu'à la frappe suivante.
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
    blocks.push(dom instanceof Element ? dom : null);
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
  return { heights, breaks };
}

/** Mesure puis pagine la vue : hauteur utile depuis l'hôte, hauteurs depuis le DOM. */
export function measurePagination(view: EditorView, options: PageViewOptions): PaginationResult {
  const host = view.dom.closest<HTMLElement>(`.${PAGE_VIEW_CLASS}`);
  const pageHeight = usablePageHeightPx(host, options);
  const { heights, breaks } = measureBlocks(view);
  return paginate(heights, pageHeight, breaks);
}
