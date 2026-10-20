import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { AsterEditor, PageViewOptions, Unsubscribe } from '../api';
import {
  PAGE_FOOTER_CLASS,
  PAGE_VIEW_CHANGE_EVENT,
  PAGE_VIEW_CLASS,
  getActivePageView,
  resolvePageMetrics,
} from './page-view';
import {
  EMPTY_PAGINATION,
  MM_TO_PX,
  cssLengthToPx,
  paginate,
  samePagination,
  type PageGap,
  type PaginationResult,
} from './pagination-layout';

/** Nom de l'extension. */
export const PAGINATION_EXTENSION_NAME = 'pagination';
/** Classe du widget de coupure de page posé avant le bloc qui ouvre une page. */
export const PAGE_GAP_CLASS = 'aster-page-gap';
/** Classe du libellé « Page n / N » rendu dans la coupure. */
export const PAGE_GAP_NUMBER_CLASS = 'aster-page-gap__number';
/** Attribut du widget : numéro (1-based) de la page qui commence après la coupure. */
export const PAGE_NUMBER_ATTRIBUTE = 'data-page-number';
/** Attribut du widget et du pied affiché : nombre total de pages. */
export const PAGE_COUNT_ATTRIBUTE = 'data-page-count';
/** Variable CSS posée sur l'hôte : nombre de pages, pour étirer la feuille (`ui/themes/page.css`). */
export const PAGE_COUNT_CSS_VARIABLE = '--aster-page-count';
/** Variable CSS posée sur chaque widget : espace libre en bas de la page précédente (px). */
export const PAGE_GAP_FILL_CSS_VARIABLE = '--aster-page-gap-fill';
/** Délai de débounce après une modification du document, en millisecondes. */
export const PAGINATION_DEBOUNCE_MS = 150;
/** Classe posée par ProseMirror sur tout widget de décoration (exclu de l'alignement DOM / doc). */
const PROSEMIRROR_WIDGET_CLASS = 'ProseMirror-widget';
/** Nom du nœud de saut de page d'un intégrateur (`slash-menu` le propose s'il existe). */
const PAGE_BREAK_NODE_NAME = 'pageBreak';

/** Clé du plugin ProseMirror. */
export const paginationPluginKey = new PluginKey('asterPagination');

/**
 * Proposition de contrat (`api/layout.ts`, non modifié ici) : `PageViewOptions.pagination`,
 * vrai par défaut quand la vue page est active. Le plugin lit la propriété si elle est
 * présente ; `ui` l'envoie depuis le dialogue « Mise en page ».
 */
export interface PaginatedPageViewOptions extends PageViewOptions {
  readonly pagination?: boolean;
}

/** Options de l'extension `Pagination`. */
export interface PaginationOptions {
  /** Éditeur Aster propriétaire : i18n du libellé de page. `null` : libellé « Page n / N ». */
  readonly aster: AsterEditor | null;
}

/**
 * Vrai sauf si les options portent explicitement `pagination: false`. `null` / `undefined`
 * (pas d'options connues) vaut le défaut, vrai ; l'activité de la vue page elle-même est
 * vérifiée à part.
 */
export function isPaginationEnabled(options: PageViewOptions | null | undefined): boolean {
  if (typeof options !== 'object' || options === null) {
    return true;
  }
  return (options as PaginatedPageViewOptions).pagination !== false;
}

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
  const blocks: (Element | null)[] = [];
  doc.forEach((node, offset, index) => {
    if (isExplicitPageBreak(node)) {
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
    if (!rect) {
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

/** Libellé « Page n / N » : i18n du core (`pageView.page`, `pageView.of`), repli sans éditeur. */
function pageLabel(aster: AsterEditor | null, page: number, count: number): string {
  if (!aster) {
    return `Page ${page} / ${count}`;
  }
  return `${aster.i18n.t('pageView.page')} ${page} ${aster.i18n.t('pageView.of')} ${count}`;
}

/** DOM d'une coupure : `div.aster-page-gap[data-page-number][data-page-count]` et son libellé. */
function renderGap(gap: PageGap, count: number, label: string): HTMLElement {
  const element = document.createElement('div');
  element.className = PAGE_GAP_CLASS;
  element.setAttribute('contenteditable', 'false');
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute(PAGE_NUMBER_ATTRIBUTE, String(gap.page));
  element.setAttribute(PAGE_COUNT_ATTRIBUTE, String(count));
  element.style.setProperty(PAGE_GAP_FILL_CSS_VARIABLE, `${Math.round(gap.fill)}px`);
  const number = document.createElement('span');
  number.className = PAGE_GAP_NUMBER_CLASS;
  number.textContent = label;
  element.append(number);
  return element;
}

/** Jeu de décorations widget : une coupure avant chaque bloc d'index listé, clé stable par rendu. */
function buildDecorations(
  doc: ProseMirrorNode,
  result: PaginationResult,
  locale: string,
  aster: AsterEditor | null,
): DecorationSet {
  const byIndex = new Map<number, PageGap>();
  for (const gap of result.gaps) {
    byIndex.set(gap.index, gap);
  }
  const decorations: Decoration[] = [];
  doc.forEach((_node, offset, index) => {
    const gap = byIndex.get(index);
    if (!gap) {
      return;
    }
    const label = pageLabel(aster, gap.page, result.pageCount);
    decorations.push(
      Decoration.widget(offset, () => renderGap(gap, result.pageCount, label), {
        side: -1,
        // La clé porte tout ce qui change le rendu : ProseMirror réutilise le DOM à clé égale.
        key: `${PAGE_GAP_CLASS}:${locale}:${gap.page}:${result.pageCount}:${Math.round(gap.fill)}`,
        ignoreSelection: true,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

/** Décorations mises en cache tant que document, résultat et locale sont les mêmes. */
interface DecorationCache {
  readonly doc: ProseMirrorNode;
  readonly result: PaginationResult;
  readonly locale: string;
  readonly set: DecorationSet;
}

/**
 * Vue du plugin : écoute l'activation de la vue page, planifie les mesures (débounce
 * puis `requestAnimationFrame`, jamais dans un `dispatch`), observe le redimensionnement
 * de la feuille, et redessine les décorations sans transaction (`view.updateState` sur
 * l'état courant : le document ne change pas, aucun `change` n'est émis).
 */
class PaginationController {
  result: PaginationResult = EMPTY_PAGINATION;
  private options: PageViewOptions | null = null;
  private host: HTMLElement | null = null;
  private cache: DecorationCache | null = null;
  private cancelPending: (() => void) | null = null;
  private observer: ResizeObserver | null = null;
  private observedWidth: number | null = null;
  private readonly unsubscribeLocale: Unsubscribe | null;
  private readonly onPageViewChange = (): void => this.syncActivation();
  private destroyed = false;

  constructor(
    private readonly view: EditorView,
    private readonly aster: AsterEditor | null,
  ) {
    view.dom.addEventListener(PAGE_VIEW_CHANGE_EVENT, this.onPageViewChange);
    this.unsubscribeLocale = aster?.on('localeChange', () => this.redraw()) ?? null;
    this.syncActivation();
  }

  /** Appelé par ProseMirror après chaque transaction : une modification relance une mesure débouncée. */
  update(view: EditorView, prevState: EditorState): void {
    if (this.options !== null && view.state.doc !== prevState.doc) {
      this.schedule(PAGINATION_DEBOUNCE_MS);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelPending?.();
    this.cancelPending = null;
    this.observer?.disconnect();
    this.observer = null;
    this.view.dom.removeEventListener(PAGE_VIEW_CHANGE_EVENT, this.onPageViewChange);
    this.unsubscribeLocale?.();
    if (CONTROLLERS.get(this.view) === this) {
      CONTROLLERS.delete(this.view);
    }
  }

  /** Décorations pour l'état donné ; vide hors vue page ou sans coupure. */
  decorationsFor(state: EditorState): DecorationSet {
    if (this.options === null || this.result.gaps.length === 0) {
      return DecorationSet.empty;
    }
    const locale = this.aster?.i18n.getLocale() ?? '';
    const cached = this.cache;
    if (
      cached &&
      cached.doc === state.doc &&
      cached.result === this.result &&
      cached.locale === locale
    ) {
      return cached.set;
    }
    const set = buildDecorations(state.doc, this.result, locale, this.aster);
    this.cache = { doc: state.doc, result: this.result, locale, set };
    return set;
  }

  /** Mesure immédiate (tests, intégrateur) ; `EMPTY_PAGINATION` si inactif. */
  measureNow(): PaginationResult {
    this.cancelPending?.();
    this.cancelPending = null;
    this.measureAndApply();
    return this.result;
  }

  /** Relit la vue page active : démarre, remesure ou arrête la pagination. */
  private syncActivation(): void {
    const options = getActivePageView(this.view.dom);
    if (options === null || !isPaginationEnabled(options)) {
      this.deactivate();
      return;
    }
    this.options = options;
    this.host = this.view.dom.closest<HTMLElement>(`.${PAGE_VIEW_CLASS}`);
    this.ensureObserver();
    this.schedule(0);
  }

  /** `ResizeObserver` absent en jsdom et en SSR : garde, la frappe suffit alors à remesurer. */
  private ensureObserver(): void {
    if (this.observer || typeof ResizeObserver !== 'function') {
      return;
    }
    this.observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width;
      if (width === undefined) {
        return;
      }
      // Seule la largeur compte : la hauteur de la feuille bouge à chaque frappe et à chaque coupure posée.
      if (this.observedWidth !== null && width !== this.observedWidth && this.options !== null) {
        this.schedule(PAGINATION_DEBOUNCE_MS);
      }
      this.observedWidth = width;
    });
    this.observer.observe(this.view.dom);
  }

  /** Débounce (`delay` ms) puis frame d'animation ; une nouvelle demande annule la précédente. */
  private schedule(delay: number): void {
    this.cancelPending?.();
    const frame = (): void => {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => {
          this.cancelPending = null;
          this.measureAndApply();
        });
        this.cancelPending = () => cancelAnimationFrame(id);
      } else {
        const id = setTimeout(() => {
          this.cancelPending = null;
          this.measureAndApply();
        }, 0);
        this.cancelPending = () => clearTimeout(id);
      }
    };
    if (delay <= 0) {
      frame();
      return;
    }
    const id = setTimeout(frame, delay);
    this.cancelPending = () => clearTimeout(id);
  }

  private measureAndApply(): void {
    if (this.destroyed || this.options === null || this.view.isDestroyed) {
      return;
    }
    if (!this.view.dom.isConnected) {
      return;
    }
    const result = measurePagination(this.view, this.options);
    const changed = !samePagination(result, this.result);
    this.result = result;
    this.writePageCount(result.pageCount);
    if (changed) {
      this.redraw();
    }
  }

  /** Phase d'écriture : variable sur l'hôte et attribut du pied affiché. */
  private writePageCount(count: number): void {
    this.host?.style.setProperty(PAGE_COUNT_CSS_VARIABLE, String(count));
    this.footer()?.setAttribute(PAGE_COUNT_ATTRIBUTE, String(count));
  }

  /** Pied affiché posé par la vue page : frère de `view.dom`. */
  private footer(): Element | null {
    const siblings = this.view.dom.parentElement?.children;
    if (!siblings) {
      return null;
    }
    return (
      Array.from(siblings).find((child) => child.classList.contains(PAGE_FOOTER_CLASS)) ?? null
    );
  }

  private deactivate(): void {
    this.cancelPending?.();
    this.cancelPending = null;
    this.options = null;
    const host = this.host;
    this.host = null;
    if (host) {
      host.style.removeProperty(PAGE_COUNT_CSS_VARIABLE);
      if (host.getAttribute('style') === '') {
        host.removeAttribute('style');
      }
    }
    this.footer()?.removeAttribute(PAGE_COUNT_ATTRIBUTE);
    const hadGaps = this.result.gaps.length > 0;
    this.result = EMPTY_PAGINATION;
    this.cache = null;
    if (hadGaps) {
      this.redraw();
    }
  }

  /** Redessine les décorations sans transaction : même état, nouveau jeu de widgets. */
  private redraw(): void {
    if (this.destroyed || this.view.isDestroyed || this.aster?.isDestroyed()) {
      return;
    }
    this.cache = null;
    this.view.updateState(this.view.state);
  }
}

/** Contrôleur par vue ProseMirror, pour `getPaginationResult` et `paginateNow`. */
const CONTROLLERS = new WeakMap<EditorView, PaginationController>();

/** Contrôleur de l'éditeur, `null` sans extension `Pagination` ou éditeur détruit. */
function controllerOf(editor: AsterEditor): PaginationController | null {
  if (editor.isDestroyed()) {
    return null;
  }
  return CONTROLLERS.get(editor.tiptap.view) ?? null;
}

/** Dernière pagination calculée (coupures et nombre de pages) ; une page hors vue page. */
export function getPaginationResult(editor: AsterEditor): PaginationResult {
  return controllerOf(editor)?.result ?? EMPTY_PAGINATION;
}

/**
 * Mesure et pose les coupures tout de suite, sans attendre le débounce ni la frame : pour
 * les tests et pour un intégrateur qui vient de changer la feuille de style. Résultat
 * vide hors vue page ou avec `pagination: false`.
 */
export function paginateNow(editor: AsterEditor): PaginationResult {
  return controllerOf(editor)?.measureNow() ?? EMPTY_PAGINATION;
}

/**
 * Extension `pagination` : pagination **approximative** de la vue page. Mesure la hauteur
 * rendue des blocs de premier niveau et pose, en décorations widget (jamais dans le
 * document), une coupure `div.aster-page-gap` avant chaque bloc qui ouvre une page. Les
 * sauts de page explicites forcent la coupure ; tableaux et listes passent entiers à la
 * page suivante. Inactive hors vue page ou avec `pagination: false`. Aucune promesse
 * d'exactitude Word : la feuille `ui/themes/page.css` dessine, le core ne fait que mesurer.
 */
export const Pagination = Extension.create<PaginationOptions>({
  name: PAGINATION_EXTENSION_NAME,

  addOptions() {
    return { aster: null };
  },

  addProseMirrorPlugins() {
    const aster = this.options.aster;
    let controller: PaginationController | null = null;
    return [
      new Plugin({
        key: paginationPluginKey,
        view: (view) => {
          controller = new PaginationController(view, aster);
          CONTROLLERS.set(view, controller);
          return controller;
        },
        props: {
          decorations: (state) => controller?.decorationsFor(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});
