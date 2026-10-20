import { DecorationSet, type Decoration } from '@tiptap/pm/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsterEditor, AsterOptions, DocumentLayout, PageViewOptions } from '../api';
import { AsterEditorImpl } from '../editor/aster-editor';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { mountEditor, type MountedEditor } from '../testing/mount';
import { PAGE_FOOTER_CLASS, PAGE_VIEW_CLASS, getActivePageView } from './page-view';
import {
  PAGE_COUNT_ATTRIBUTE,
  PAGE_COUNT_CSS_VARIABLE,
  PAGE_GAP_CLASS,
  PAGE_GAP_FILL_CSS_VARIABLE,
  PAGE_GAP_NUMBER_CLASS,
  PAGE_NUMBER_ATTRIBUTE,
  PAGINATION_DEBOUNCE_MS,
  getPaginationResult,
  isPaginationEnabled,
  measureBlocks,
  measurePagination,
  paginateNow,
  paginationPluginKey,
  usablePageHeightPx,
  type PaginatedPageViewOptions,
} from './pagination';
import { EMPTY_PAGINATION, MM_TO_PX } from './pagination-layout';

/** Hauteur d'un bloc sans hauteur déclarée, en px. */
const DEFAULT_BLOCK_HEIGHT = 40;
/** Hauteur simulée d'une coupure déjà posée (elle ne doit jamais compter dans les mesures). */
const GAP_HEIGHT = 60;
/** Page de 30 mm sans marges : 113,39 px utiles, deux blocs de 40 px par page, pas trois. */
const SMALL_PAGE: DocumentLayout = {
  page: { size: { widthMm: 100, heightMm: 30 }, margins: { topMm: 0, bottomMm: 0 } },
};
const SMALL_PAGE_PX = 30 * MM_TO_PX;

/** Hauteurs des blocs de premier niveau, par index ; `DEFAULT_BLOCK_HEIGHT` au-delà. */
let blockHeights: readonly number[] = [];
let layoutVersion = 0;

/** Change les hauteurs simulées et invalide la mise en page mémorisée. */
function setHeights(heights: readonly number[]): void {
  blockHeights = heights;
  layoutVersion += 1;
}

interface Box {
  readonly top: number;
  readonly height: number;
}

let layoutCache: {
  parent: Element;
  version: number;
  count: number;
  boxes: Map<Element, Box>;
} | null = null;

/**
 * Mise en page simulée de la feuille : les enfants de `.ProseMirror` s'empilent, les blocs
 * à la hauteur déclarée, les coupures à `GAP_HEIGHT`, les autres widgets à 0. Calculée une
 * fois par passe de mesure (jsdom rend 0 partout, et un calcul par appel serait quadratique).
 */
function layoutOf(parent: Element): Map<Element, Box> {
  const cached = layoutCache;
  if (
    cached &&
    cached.parent === parent &&
    cached.version === layoutVersion &&
    cached.count === parent.children.length
  ) {
    return cached.boxes;
  }
  const boxes = new Map<Element, Box>();
  let top = 0;
  let blockIndex = 0;
  for (const child of Array.from(parent.children)) {
    let height = 0;
    if (child.classList.contains(PAGE_GAP_CLASS)) {
      height = GAP_HEIGHT;
    } else if (!child.classList.contains('ProseMirror-widget')) {
      height = blockHeights[blockIndex] ?? DEFAULT_BLOCK_HEIGHT;
      blockIndex += 1;
    }
    boxes.set(child, { top, height });
    top += height;
  }
  layoutCache = { parent, version: layoutVersion, count: parent.children.length, boxes };
  return boxes;
}

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Remplace `getBoundingClientRect` : seuls les enfants directs de la feuille ont une taille. */
function mockRects(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ): DOMRect {
    const parent = this.parentElement;
    if (!parent || !parent.classList.contains('ProseMirror')) {
      return rect(0, 0);
    }
    let boxes = layoutOf(parent);
    if (!boxes.has(this)) {
      layoutVersion += 1;
      boxes = layoutOf(parent);
    }
    const box = boxes.get(this);
    return box ? rect(box.top, box.height) : rect(0, 0);
  });
}

/** `ResizeObserver` factice : enregistre les cibles, déclenche à la demande. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  unobserve(): void {
    // Rien : le plugin ne l'appelle pas.
  }

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(width: number): void {
    const entry = { contentRect: { width } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

function impl(editor: AsterEditor): AsterEditorImpl {
  if (!(editor instanceof AsterEditorImpl)) {
    throw new Error('AsterEditorImpl attendu');
  }
  return editor;
}

function paragraphs(count: number): string {
  let html = '';
  for (let index = 0; index < count; index += 1) {
    html += `<p>Bloc ${index}</p>`;
  }
  return html;
}

function gaps(editor: AsterEditor): HTMLElement[] {
  return Array.from(editor.contentElement.querySelectorAll<HTMLElement>(`.${PAGE_GAP_CLASS}`));
}

function gapIndexes(editor: AsterEditor): number[] {
  const indexes: number[] = [];
  let blockIndex = 0;
  for (const child of Array.from(editor.contentElement.children)) {
    if (child.classList.contains(PAGE_GAP_CLASS)) {
      indexes.push(blockIndex);
    } else if (!child.classList.contains('ProseMirror-widget')) {
      blockIndex += 1;
    }
  }
  return indexes;
}

describe('pagination (plugin)', () => {
  let mounted: MountedEditor | null = null;
  let rects: ReturnType<typeof vi.spyOn>;

  const mount = (options: Partial<AsterOptions> = {}): MountedEditor => {
    mounted = mountEditor(options);
    return mounted;
  };

  beforeEach(() => {
    setHeights([]);
    layoutCache = null;
    FakeResizeObserver.instances = [];
    rects = mockRects();
  });

  afterEach(() => {
    mounted?.cleanup();
    mounted = null;
    rects.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('i18n : les clés de page existent en fr et en en', () => {
    expect(fr['pageView.page']).toBe('Page');
    expect(fr['pageView.of']).toBe('sur');
    expect(en['pageView.page']).toBe('Page');
    expect(en['pageView.of']).toBe('of');
  });

  it('isPaginationEnabled : vrai par défaut, faux seulement sur pagination: false', () => {
    expect(isPaginationEnabled(null)).toBe(true);
    expect(isPaginationEnabled(undefined)).toBe(true);
    expect(isPaginationEnabled({})).toBe(true);
    const off: PaginatedPageViewOptions = { pagination: false };
    expect(isPaginationEnabled(off)).toBe(false);
    const on: PaginatedPageViewOptions = { pagination: true };
    expect(isPaginationEnabled(on)).toBe(true);
  });

  it('hors vue page : aucune mesure, aucune décoration, résultat vide', () => {
    const { editor } = mount({ content: paragraphs(10) });
    setHeights([400, 400, 400]);
    expect(getActivePageView(editor.contentElement)).toBeNull();
    expect(paginateNow(editor)).toBe(EMPTY_PAGINATION);
    expect(getPaginationResult(editor)).toBe(EMPTY_PAGINATION);
    expect(gaps(editor)).toEqual([]);
    expect(rects).not.toHaveBeenCalled();
  });

  it('en vue page : coupures aux bons index, numéros, compteur, pied et variable hôte', () => {
    const { editor, element } = mount({
      content: paragraphs(10),
      pageView: { layout: SMALL_PAGE },
    });
    const transactions = vi.fn();
    const changes = vi.fn();
    editor.tiptap.on('transaction', transactions);
    editor.on('change', changes);
    const htmlBefore = editor.getHTML();

    const result = paginateNow(editor);
    expect(result.pageCount).toBe(5);
    expect(result.gaps.map((gap) => gap.index)).toEqual([2, 4, 6, 8]);
    expect(result.gaps.map((gap) => gap.page)).toEqual([2, 3, 4, 5]);
    expect(result.gaps[0]?.fill).toBeCloseTo(SMALL_PAGE_PX - 80, 6);
    expect(getPaginationResult(editor)).toBe(result);

    expect(gapIndexes(editor)).toEqual([2, 4, 6, 8]);
    const posed = gaps(editor);
    expect(posed.map((gap) => gap.getAttribute(PAGE_NUMBER_ATTRIBUTE))).toEqual([
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(posed.map((gap) => gap.getAttribute(PAGE_COUNT_ATTRIBUTE))).toEqual([
      '5',
      '5',
      '5',
      '5',
    ]);
    expect(posed[0]?.style.getPropertyValue(PAGE_GAP_FILL_CSS_VARIABLE)).toBe('33px');
    expect(posed[0]?.getAttribute('contenteditable')).toBe('false');
    expect(posed[0]?.querySelector(`.${PAGE_GAP_NUMBER_CLASS}`)?.textContent).toBe('Page 2 sur 5');
    expect(element.style.getPropertyValue(PAGE_COUNT_CSS_VARIABLE)).toBe('5');
    expect(element.querySelector(`.${PAGE_FOOTER_CLASS}`)?.getAttribute(PAGE_COUNT_ATTRIBUTE)).toBe(
      '5',
    );

    // Purement visuel : ni transaction, ni `change`, ni sérialisation.
    expect(transactions).not.toHaveBeenCalled();
    expect(changes).not.toHaveBeenCalled();
    expect(editor.getHTML()).toBe(htmlBefore);
    expect(editor.getHTML()).not.toContain(PAGE_GAP_CLASS);
    expect(editor.tiptap.state.doc.childCount).toBe(10);

    // Les coupures déjà posées n'entrent pas dans les hauteurs : remesurer est stable.
    expect(paginateNow(editor)).toEqual(result);
    expect(gapIndexes(editor)).toEqual([2, 4, 6, 8]);
  });

  it('saut explicite <hr data-page-break> et data-page-break-before forcent la coupure', () => {
    const { editor } = mount({
      content: '<p>a</p><hr data-page-break><p>b</p><p>c</p><p data-page-break-before>d</p>',
      pageView: { layout: SMALL_PAGE },
    });
    setHeights([10, 10, 10, 10, 10]);
    const result = paginateNow(editor);
    expect(result.gaps.map((gap) => gap.index)).toEqual([2, 4]);
    expect(result.pageCount).toBe(3);
    expect(gapIndexes(editor)).toEqual([2, 4]);
    expect(gaps(editor)[0]?.previousElementSibling?.tagName).toBe('HR');
    expect(editor.getHTML()).toContain('<hr data-page-break="">');
  });

  it('R30-01 : un hr rendu haut près du bas de page ne crée pas de page vide, et le fill est stable', () => {
    // P1 : `page.css` rend le hr à 216 px en A4 (24 px + 2 × 96 px) tant qu'aucune coupure
    // ne le suit ; il mesure 0, la coupure est posée après lui dès le premier rendu.
    const { editor } = mount({
      content: '<p>a</p><p>b</p><hr data-page-break><p>c</p>',
      pageView: { layout: SMALL_PAGE },
    });
    setHeights([40, 40, 60, 10]);
    const first = paginateNow(editor);
    expect(first.pageCount).toBe(2);
    expect(first.gaps.map((gap) => [gap.index, gap.page])).toEqual([[3, 2]]);
    expect(first.gaps[0]?.fill).toBeCloseTo(SMALL_PAGE_PX - 80, 6);
    expect(gapIndexes(editor)).toEqual([3]);
    // Après le repli CSS (`hr:has(+ .aster-page-gap)` → hauteur 0), rien ne bouge.
    setHeights([40, 40, 0, 10]);
    expect(paginateNow(editor)).toEqual(first);
    expect(gapIndexes(editor)).toEqual([3]);

    // P2 : le remplissage ne dépend pas de la hauteur rendue du hr (plus de saut à la frappe).
    editor.setHTML('<p>a</p><hr data-page-break><p>c</p>', false);
    setHeights([20, 60, 10]);
    expect(paginateNow(editor).gaps[0]?.fill).toBeCloseTo(SMALL_PAGE_PX - 20, 6);
    setHeights([20, 0, 10]);
    expect(paginateNow(editor).gaps[0]?.fill).toBeCloseTo(SMALL_PAGE_PX - 20, 6);
    expect(measureBlocks(editor.tiptap.view).heights).toEqual([20, 0, 10]);
  });

  it('R30-05 : une transaction de frappe mappe le jeu de décorations sans le reconstruire', () => {
    const { editor } = mount({ content: paragraphs(6), pageView: { layout: SMALL_PAGE } });
    paginateNow(editor);
    const view = editor.tiptap.view;
    const plugin = paginationPluginKey.get(view.state);
    expect(plugin).toBeDefined();
    const decorations = (): Decoration[] => {
      const set = plugin?.props.decorations?.call(plugin, view.state);
      return set instanceof DecorationSet ? set.find() : [];
    };
    const before = decorations();
    expect(before).toHaveLength(2);
    const specs = before.map((decoration) => decoration.spec);

    // Une frappe dans le premier bloc : mêmes widgets (même `spec`), positions décalées d'un.
    editor.tiptap.commands.insertContentAt(1, 'x');
    const after = decorations();
    expect(after.map((decoration) => decoration.spec)).toEqual(specs);
    after.forEach((decoration, index) => {
      expect(decoration.spec).toBe(specs[index]);
      expect(decoration.from).toBe((before[index]?.from ?? 0) + 1);
    });
    expect(gapIndexes(editor)).toEqual([2, 4]);
    // Même état relu deux fois : le jeu n'est pas reconstruit entre deux lectures.
    expect(decorations()[0]?.spec).toBe(specs[0]);

    // Après une mesure, le jeu est reconstruit (nouveaux `spec`), même si les coupures sont égales.
    paginateNow(editor);
    const rebuilt = decorations();
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt[0]?.spec).not.toBe(specs[0]);
    expect(gapIndexes(editor)).toEqual([2, 4]);
  });

  it('un tableau qui déborde passe entier à la page suivante', () => {
    const { editor } = mount({
      content: '<p>a</p><table><tr><td>x</td></tr></table><p>b</p>',
      pageView: { layout: SMALL_PAGE },
    });
    // 40 + 100 déborde : le tableau (100 px) ouvre la page 2 ; 100 + 20 déborde à son tour.
    setHeights([40, 100, 20]);
    const result = paginateNow(editor);
    expect(result.gaps.map((gap) => [gap.index, gap.page])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(result.gaps[0]?.fill).toBeCloseTo(SMALL_PAGE_PX - 40, 6);
    expect(result.gaps[1]?.fill).toBeCloseTo(SMALL_PAGE_PX - 100, 6);
    expect(gapIndexes(editor)).toEqual([1, 2]);
    // Un paragraphe plus court après le tableau tient avec lui sur la page 2.
    setHeights([40, 100, 10]);
    expect(paginateNow(editor).gaps.map((gap) => gap.index)).toEqual([1]);
  });

  it('setPageView(false) retire coupures, attribut du pied et variable, sans transaction', () => {
    const { editor, element } = mount({
      content: paragraphs(6),
      pageView: { layout: SMALL_PAGE },
    });
    const transactions = vi.fn();
    editor.tiptap.on('transaction', transactions);
    paginateNow(editor);
    expect(gaps(editor)).toHaveLength(2);
    impl(editor).setPageView(false);
    expect(gaps(editor)).toEqual([]);
    expect(getPaginationResult(editor)).toBe(EMPTY_PAGINATION);
    expect(element.getAttribute('style')).toBeNull();
    expect(element.querySelector(`.${PAGE_FOOTER_CLASS}`)).toBeNull();
    expect(transactions).not.toHaveBeenCalled();
    expect(paginateNow(editor)).toBe(EMPTY_PAGINATION);
  });

  it('pagination: false désactive la pagination tout en gardant la vue page', () => {
    const off: PaginatedPageViewOptions = { layout: SMALL_PAGE, pagination: false };
    const { editor, element } = mount({ content: paragraphs(6), pageView: off });
    expect(element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
    expect(paginateNow(editor)).toBe(EMPTY_PAGINATION);
    expect(gaps(editor)).toEqual([]);
    expect(rects).not.toHaveBeenCalled();
    // Réactivation avec la pagination : coupures posées.
    impl(editor).setPageView({ layout: SMALL_PAGE });
    expect(paginateNow(editor).pageCount).toBe(3);
    expect(gaps(editor)).toHaveLength(2);
    // Puis pagination coupée à nouveau : tout est retiré.
    impl(editor).setPageView(off);
    expect(gaps(editor)).toEqual([]);
    expect(element.style.getPropertyValue(PAGE_COUNT_CSS_VARIABLE)).toBe('');
  });

  it('mesure après une frame à l’activation, puis débounce ≥ 150 ms après une frappe', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const { editor } = mount({ content: paragraphs(6), pageView: { layout: SMALL_PAGE } });
    expect(gaps(editor)).toEqual([]);
    vi.advanceTimersToNextFrame();
    expect(gaps(editor)).toHaveLength(2);
    const measuresAfterMount = rects.mock.calls.length;

    // Deux frappes rapprochées : rien avant le délai (frames comprises), une seule mesure ensuite.
    editor.tiptap.commands.insertContentAt(1, 'x');
    vi.advanceTimersByTime(PAGINATION_DEBOUNCE_MS - 50);
    editor.tiptap.commands.insertContentAt(2, 'y');
    vi.advanceTimersByTime(PAGINATION_DEBOUNCE_MS - 50);
    expect(rects.mock.calls.length).toBe(measuresAfterMount);
    setHeights([40, 40, 40, 40, 40, 100]);
    vi.advanceTimersByTime(PAGINATION_DEBOUNCE_MS);
    expect(rects.mock.calls.length).toBe(measuresAfterMount + 6 + 2);
    expect(getPaginationResult(editor).pageCount).toBe(4);
    expect(gaps(editor)).toHaveLength(3);

    // Sans modification du document, aucune mesure supplémentaire.
    const settled = rects.mock.calls.length;
    vi.advanceTimersByTime(PAGINATION_DEBOUNCE_MS * 4);
    expect(rects.mock.calls.length).toBe(settled);
  });

  it('ResizeObserver : remesure quand la largeur de la feuille change, pas sa hauteur', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const { editor } = mount({ content: paragraphs(6), pageView: { layout: SMALL_PAGE } });
    vi.advanceTimersToNextFrame();
    const observer = FakeResizeObserver.instances[0];
    expect(observer).toBeDefined();
    expect(observer?.targets).toEqual([editor.contentElement]);
    const measured = rects.mock.calls.length;

    observer?.trigger(600);
    observer?.trigger(600);
    vi.advanceTimersByTime(PAGINATION_DEBOUNCE_MS);
    vi.advanceTimersToNextFrame();
    expect(rects.mock.calls.length).toBe(measured);

    setHeights([40, 40, 40, 40, 40, 100]);
    observer?.trigger(400);
    vi.advanceTimersByTime(PAGINATION_DEBOUNCE_MS);
    vi.advanceTimersToNextFrame();
    expect(rects.mock.calls.length).toBeGreaterThan(measured);
    expect(getPaginationResult(editor).pageCount).toBe(4);

    editor.destroy();
    expect(observer?.disconnected).toBe(true);
    expect(FakeResizeObserver.instances).toHaveLength(1);
  });

  it('destroy nettoie sans erreur ; aucun observer créé sans ResizeObserver (jsdom, SSR)', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const { editor } = mount({ content: paragraphs(6), pageView: { layout: SMALL_PAGE } });
    expect(FakeResizeObserver.instances).toEqual([]);
    editor.tiptap.commands.insertContentAt(1, 'x');
    editor.destroy();
    // Les minuteries en attente ont été annulées : rien ne mesure une vue détruite.
    const measured = rects.mock.calls.length;
    vi.advanceTimersByTime(PAGINATION_DEBOUNCE_MS * 2);
    vi.advanceTimersToNextFrame();
    expect(rects.mock.calls.length).toBe(measured);
    expect(getPaginationResult(editor)).toBe(EMPTY_PAGINATION);
    expect(paginateNow(editor)).toBe(EMPTY_PAGINATION);
  });

  it('le libellé suit la locale', () => {
    const { editor } = mount({ content: paragraphs(4), pageView: { layout: SMALL_PAGE } });
    paginateNow(editor);
    const label = (): string | undefined =>
      gaps(editor)[0]?.querySelector(`.${PAGE_GAP_NUMBER_CLASS}`)?.textContent ?? undefined;
    expect(label()).toBe('Page 2 sur 2');
    editor.i18n.setLocale('en');
    expect(label()).toBe('Page 2 of 2');
    editor.i18n.setLocale('fr');
    expect(label()).toBe('Page 2 sur 2');
  });

  it('les coupures survivent à une frappe (mappées, elles suivent leur bloc) et à un plugin ajouté', () => {
    const { editor } = mount({ content: paragraphs(6), pageView: { layout: SMALL_PAGE } });
    paginateNow(editor);
    expect(gapIndexes(editor)).toEqual([2, 4]);
    // Un paragraphe inséré en tête : les coupures suivent leur bloc (R30-05) jusqu'à la remesure.
    editor.tiptap.commands.insertContentAt(0, '<p>nouveau</p>');
    expect(editor.tiptap.state.doc.childCount).toBe(7);
    expect(gapIndexes(editor)).toEqual([3, 5]);
    // La remesure (7 blocs de 40 px) reconstruit le jeu aux index mesurés.
    expect(paginateNow(editor).gaps.map((gap) => gap.index)).toEqual([2, 4, 6]);
    expect(gapIndexes(editor)).toEqual([2, 4, 6]);
    // `setHTML` silencieux recrée le plugin d'historique : la vue du plugin est recréée.
    editor.setHTML(paragraphs(8), false);
    const result = paginateNow(editor);
    expect(result.pageCount).toBe(4);
    expect(gapIndexes(editor)).toEqual([2, 4, 6]);
  });

  it('usablePageHeightPx lit les variables de l’hôte, sinon la mise en page', () => {
    const host = document.createElement('div');
    const options: PageViewOptions = { layout: SMALL_PAGE };
    expect(usablePageHeightPx(null, options)).toBeCloseTo(SMALL_PAGE_PX, 6);
    expect(usablePageHeightPx(host, options)).toBeCloseTo(SMALL_PAGE_PX, 6);
    expect(usablePageHeightPx(host, {})).toBeCloseTo((297 - 50.8) * MM_TO_PX, 6);
    host.style.setProperty('--aster-page-height', '11in');
    host.style.setProperty('--aster-page-margin-top', '96px');
    host.style.setProperty('--aster-page-margin-bottom', '0.5in');
    expect(usablePageHeightPx(host, {})).toBeCloseTo(11 * 96 - 96 - 48, 6);
    // Variable illisible : repli sur la mise en page pour cette variable seulement.
    host.style.setProperty('--aster-page-height', 'auto');
    expect(usablePageHeightPx(host, options)).toBeCloseTo(30 * MM_TO_PX - 96 - 48, 6);
  });

  it('measureBlocks : hauteur du haut d’un bloc au haut du suivant, repli nodeDOM si le DOM est étranger', () => {
    const { editor } = mount({ content: paragraphs(3), pageView: { layout: SMALL_PAGE } });
    const view = editor.tiptap.view;
    setHeights([10, 20, 30]);
    expect(measureBlocks(view)).toEqual({ heights: [10, 20, 30], breaks: new Set() });
    // Un élément étranger au premier niveau : le compte ne colle plus, on passe par nodeDOM.
    const stranger = document.createElement('div');
    stranger.className = 'integrator-overlay';
    view.dom.append(stranger);
    expect(measureBlocks(view).heights).toEqual([10, 20, 30]);
    stranger.remove();
    expect(measurePagination(view, { layout: SMALL_PAGE })).toBe(EMPTY_PAGINATION);
  });

  it('performance : 4 000 paragraphes (≈ 175 pages A4) mesurés et paginés en moins de 100 ms', () => {
    const { editor } = mount({ content: paragraphs(4000), pageView: true });
    const options = getActivePageView(editor.contentElement);
    expect(options).not.toBeNull();
    const view = editor.tiptap.view;
    // Échauffement : jsdom construit ses listes d'enfants à la première lecture.
    measureBlocks(view);
    const start = performance.now();
    const result = measurePagination(view, options ?? {});
    const computeMs = performance.now() - start;
    expect(result.pageCount).toBeGreaterThan(150);
    expect(result.pageCount).toBeLessThan(200);
    expect(computeMs).toBeLessThan(100);

    const applyStart = performance.now();
    const applied = paginateNow(editor);
    const applyMs = performance.now() - applyStart;
    expect(applied.pageCount).toBe(result.pageCount);
    expect(gaps(editor)).toHaveLength(result.gaps.length);
    // Pose des widgets comprise (jsdom est lent à insérer) : borne large contre les faux rouges.
    expect(applyMs).toBeLessThan(2000);
    console.warn(
      `[L30] 4000 paragraphes : mesure + calcul ${computeMs.toFixed(1)} ms, pose ${applyMs.toFixed(1)} ms, ${applied.pageCount} pages`,
    );
  });
});
