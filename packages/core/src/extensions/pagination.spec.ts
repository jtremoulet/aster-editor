import { Node, mergeAttributes } from '@tiptap/core';
import { DecorationSet, type Decoration } from '@tiptap/pm/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AsterEditor,
  AsterOptions,
  DocumentLayout,
  PageSetup,
  PageViewOptions,
} from '../api/index.js';
import { AsterEditorImpl } from '../editor/aster-editor.js';
import { en } from '../i18n/en.js';
import { fr } from '../i18n/fr.js';
import { mountEditor, type MountedEditor } from '../testing/mount.js';
import {
  PAGE_FOOTER_CLASS,
  PAGE_HEADER_CLASS,
  PAGE_VIEW_CLASS,
  PAGE_WIDTH_MAX_CSS_VARIABLE,
  getActivePageView,
} from './page-view.js';
import { gapPages, lastPageOf } from './pagination-sections.js';
import {
  PAGE_COUNT_ATTRIBUTE,
  PAGE_COUNT_CSS_VARIABLE,
  PAGE_GAP_CLASS,
  PAGE_GAP_FILL_CSS_VARIABLE,
  PAGE_GAP_FOOTER_CLASS,
  PAGE_GAP_HEADER_CLASS,
  PAGE_GAP_NUMBER_CLASS,
  PAGE_GAP_SECTION_CLASS,
  PAGE_GAP_SECTION_LABEL_CLASS,
  PAGE_HEIGHT_TOTAL_CSS_VARIABLE,
  PAGE_NUMBER_ATTRIBUTE,
  PAGE_SECTION_ATTRIBUTE,
  PAGINATION_DEBOUNCE_MS,
  gapCssVariables,
  getPaginationResult,
  isPaginationEnabled,
  measureBlocks,
  measurePagination,
  pageHeightTotalMm,
  paginateNow,
  paginationPluginKey,
  previousPageSection,
  sectionLabel,
  usablePageHeightPx,
  type PaginatedPageViewOptions,
} from './pagination.js';
import {
  EMPTY_PAGINATION,
  MM_TO_PX,
  paginate,
  type SectionCssVariables,
} from './pagination-layout.js';

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

  it('L50 : un redessin relit d’abord la sélection du DOM (clic pas encore lu par ProseMirror), sans change ni historique', () => {
    const { editor } = mount({ content: paragraphs(6), pageView: { layout: SMALL_PAGE } });
    paginateNow(editor);
    expect(gaps(editor)).toHaveLength(2);
    const { view } = editor.tiptap;
    view.dom.focus();
    expect(document.activeElement).toBe(view.dom);
    // Un clic dans le 4e paragraphe : le navigateur pose la sélection dans le DOM, ProseMirror
    // ne la relit qu'au `selectionchange` asynchrone (jamais émis par jsdom : la situation
    // « entre les deux » est exactement celle du test).
    const text = view.dom.querySelectorAll('p')[3]?.firstChild;
    if (!text) {
      throw new Error('paragraphe attendu');
    }
    document.getSelection()?.collapse(text, 2);
    const clicked = view.posAtDOM(text, 2);
    expect(view.state.selection.from).not.toBe(clicked);
    const change = vi.fn();
    editor.on('change', change);
    const undoable = editor.commands.canRun('undo');

    // Redessin synchrone (changement de locale) : avant L50, `updateState` réécrivait
    // l'ancienne sélection dans le DOM et le clic était perdu.
    editor.i18n.setLocale('en');
    expect(view.state.selection.from).toBe(clicked);
    expect(document.getSelection()?.anchorNode).toBe(text);
    expect(document.getSelection()?.anchorOffset).toBe(2);
    expect(gaps(editor)).toHaveLength(2);
    expect(change).not.toHaveBeenCalled();
    expect(editor.commands.canRun('undo')).toBe(undoable);
    document.getSelection()?.removeAllRanges();
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
    expect(measureBlocks(view)).toEqual({
      heights: [10, 20, 30],
      breaks: new Set(),
      sectionBreaks: [],
    });
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

  describe('sections (L44)', () => {
    /** Section 2 : 100 × 20 mm sans marges, 75,59 px utiles, un bloc de 40 px par page. */
    const SECTION_2_PAGE: PageSetup = {
      size: { widthMm: 100, heightMm: 20 },
      margins: { topMm: 0, bottomMm: 0 },
    };
    const SECTION_2_PX = 20 * MM_TO_PX;
    const SECTIONS: DocumentLayout = {
      page: SECTION_2_PAGE,
      sections: [
        { page: SMALL_PAGE.page, footers: { default: { html: '<p>Pied 1</p>' } } },
        {
          page: SECTION_2_PAGE,
          headers: { default: { html: '<p>Tête 2</p><script>alert(1)</script>' } },
        },
      ],
    };
    const TWO_SECTIONS = '<p>a</p><p>b</p><hr data-section-break="1"><p>c</p><p>d</p><p>e</p>';

    const sectionGap = (editor: AsterEditor): HTMLElement | undefined =>
      gaps(editor).find((gap) => gap.classList.contains(PAGE_GAP_SECTION_CLASS));

    it('i18n : les clés de section existent en fr et en en', () => {
      expect(fr['pageView.section']).toBe('Section');
      expect(fr['pageView.landscape']).toBe('paysage');
      expect(en['pageView.section']).toBe('Section');
      expect(en['pageView.portrait']).toBe('portrait');
    });

    it('un saut de section force la coupure et la section suivante a sa propre hauteur utile', () => {
      const { editor, element } = mount({
        content: TWO_SECTIONS,
        extensions: [SimulatedSectionBreak],
        pageView: { layout: SECTIONS },
      });
      const htmlBefore = editor.getHTML();
      expect(htmlBefore).toContain('<hr data-section-break="1">');
      const measured = measureBlocks(editor.tiptap.view);
      expect(measured.sectionBreaks.map((brk) => brk.index)).toEqual([2]);
      expect(measured.sectionBreaks[0]?.element?.tagName).toBe('HR');

      const result = paginateNow(editor);
      expect(result.pageCount).toBe(4);
      expect(result.gaps.map((gap) => [gap.index, gap.page, gap.section])).toEqual([
        [3, 2, 2],
        [4, 3, 2],
        [5, 4, 2],
      ]);
      // Remplissage de la page 1 avec la hauteur de la section 1, des suivantes avec la section 2.
      expect(result.gaps[0]?.fill).toBeCloseTo(SMALL_PAGE_PX - 80, 6);
      expect(result.gaps[1]?.fill).toBeCloseTo(SECTION_2_PX - 40, 6);
      expect(result.sections?.map((section) => section['--aster-page-height'])).toEqual([
        '30mm',
        '20mm',
      ]);

      // Chaque coupure porte sa section ; seule la première ouvre la section 2.
      const posed = gaps(editor);
      expect(posed.map((gap) => gap.getAttribute(PAGE_SECTION_ATTRIBUTE))).toEqual(['2', '2', '2']);
      expect(posed.map((gap) => gap.classList.contains(PAGE_GAP_SECTION_CLASS))).toEqual([
        true,
        false,
        false,
      ]);
      expect(posed.map((gap) => gap.getAttribute(PAGE_NUMBER_ATTRIBUTE))).toEqual(['2', '3', '4']);
      const opening = posed[0];
      expect(opening?.querySelector(`.${PAGE_GAP_SECTION_LABEL_CLASS}`)?.textContent).toBe(
        'Section 2 · 100 × 20 mm paysage',
      );
      // En-tête de la section 2 assaini, pied de la section 1, en lecture seule.
      const header = opening?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`);
      expect(header?.innerHTML).toBe('<p>Tête 2</p>');
      expect(header?.getAttribute('contenteditable')).toBe('false');
      expect(opening?.querySelector(`.${PAGE_GAP_FOOTER_CLASS}`)?.innerHTML).toBe('<p>Pied 1</p>');
      // L52 (retour n° 3) : les coupures suivantes portent aussi l'en-tête de la section 2
      // (et pas de pied : la section 2 n'en a pas), seul le libellé reste à l'ouverture.
      expect(posed[1]?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 2</p>');
      expect(posed[1]?.querySelector(`.${PAGE_GAP_FOOTER_CLASS}`)).toBeNull();
      expect(posed[2]?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 2</p>');
      expect(posed[1]?.querySelector(`.${PAGE_GAP_SECTION_LABEL_CLASS}`)).toBeNull();
      // Variables de la coupure : marge basse de la section qui se termine, le reste de
      // celle qui commence ; jamais les marges horizontales (la feuille garde celles de l'hôte).
      expect(opening?.style.getPropertyValue('--aster-page-height')).toBe('20mm');
      expect(opening?.style.getPropertyValue('--aster-page-width')).toBe('100mm');
      expect(opening?.style.getPropertyValue('--aster-page-margin-top')).toBe('0mm');
      expect(opening?.style.getPropertyValue('--aster-page-margin-bottom')).toBe('0mm');
      expect(opening?.style.getPropertyValue('--aster-page-margin-footer')).toBe('12.7mm');
      expect(opening?.style.getPropertyValue('--aster-page-margin-left')).toBe('');
      expect(posed[1]?.style.getPropertyValue('--aster-page-height')).toBe('20mm');
      // Hôte : largeur de la plus large section et somme des hauteurs de pages (30 + 3 × 20).
      expect(element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE)).toBe('100mm');
      expect(element.style.getPropertyValue(PAGE_HEIGHT_TOTAL_CSS_VARIABLE)).toBe('90mm');
      // Le saut lui-même mesure 0 (remplacé par la coupure) ; le document est intact.
      expect(editor.getHTML()).toBe(htmlBefore);
      expect(paginateNow(editor)).toEqual(result);
      expect(gapIndexes(editor)).toEqual([3, 4, 5]);
    });

    it('section continuous : pas de coupure au saut, hauteur changée au bloc suivant, hr mesuré', () => {
      const continuous: DocumentLayout = {
        ...SECTIONS,
        sections: [
          SECTIONS.sections?.[0] ?? {},
          { ...SECTIONS.sections?.[1], start: 'continuous' },
        ],
      };
      const { editor } = mount({
        content: TWO_SECTIONS.replace('<hr', '<hr data-section-start="continuous"'),
        extensions: [SimulatedSectionBreak],
        pageView: { layout: continuous },
      });
      setHeights([40, 40, 4, 40, 40, 40]);
      expect(measureBlocks(editor.tiptap.view).heights).toEqual([40, 40, 4, 40, 40, 40]);
      const result = paginateNow(editor);
      // 84 px posés quand la section 2 (75,59 px) commence : « c » déborde, remplissage nul.
      expect(result.gaps.map((gap) => [gap.index, gap.page, gap.section])).toEqual([
        [3, 2, 2],
        [4, 3, 2],
        [5, 4, 2],
      ]);
      expect(result.gaps[0]?.fill).toBe(0);
      expect(result.gaps[1]?.fill).toBeCloseTo(SECTION_2_PX - 40, 6);
      // La première coupure de la section, même par débordement, en porte le libellé et l'en-tête.
      const opening = sectionGap(editor);
      expect(opening).toBe(gaps(editor)[0]);
      expect(opening?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 2</p>');
      // Sans `data-section-start`, le `start` de la section fait foi.
      editor.setHTML(TWO_SECTIONS, false);
      setHeights([40, 40, 4, 40, 40, 40]);
      expect(paginateNow(editor).gaps[0]?.fill).toBe(0);
    });

    it('les variables posées sur le hr priment sur la mise en page de la section', () => {
      const { editor, element } = mount({
        content: TWO_SECTIONS,
        extensions: [SimulatedSectionBreak],
        pageView: { layout: SECTIONS },
      });
      const hr = editor.contentElement.querySelector<HTMLElement>('hr[data-section-break]');
      expect(hr).not.toBeNull();
      hr?.style.setProperty('--aster-page-height', '40mm');
      const result = paginateNow(editor);
      // 151 px utiles : c, d, e (120 px) tiennent sur la page 2.
      expect(result.gaps.map((gap) => [gap.index, gap.page, gap.section])).toEqual([[3, 2, 2]]);
      expect(result.sections?.[1]?.['--aster-page-height']).toBe('40mm');
      expect(gaps(editor)[0]?.style.getPropertyValue('--aster-page-height')).toBe('40mm');
      expect(gaps(editor)[0]?.querySelector(`.${PAGE_GAP_SECTION_LABEL_CLASS}`)?.textContent).toBe(
        'Section 2 · 100 × 40 mm paysage',
      );
      expect(element.style.getPropertyValue(PAGE_HEIGHT_TOTAL_CSS_VARIABLE)).toBe('70mm');
      // Une variable illisible sur le hr retombe sur la section.
      hr?.style.setProperty('--aster-page-height', 'auto');
      expect(paginateNow(editor).pageCount).toBe(4);
    });

    it('showHeadersFooters: false retire en-têtes et pieds des coupures, pas le libellé', () => {
      const { editor } = mount({
        content: TWO_SECTIONS,
        extensions: [SimulatedSectionBreak],
        pageView: { layout: SECTIONS, showHeadersFooters: false },
      });
      paginateNow(editor);
      const opening = sectionGap(editor);
      expect(opening).toBeDefined();
      expect(opening?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)).toBeNull();
      expect(opening?.querySelector(`.${PAGE_GAP_FOOTER_CLASS}`)).toBeNull();
      expect(opening?.querySelector(`.${PAGE_GAP_SECTION_LABEL_CLASS}`)?.textContent).toBe(
        'Section 2 · 100 × 20 mm paysage',
      );
      expect(editor.contentElement.querySelectorAll(`.${PAGE_GAP_HEADER_CLASS}`)).toHaveLength(0);
    });

    it('libellé « Section n · Format orientation » i18n, format nommé reconnu en paysage', () => {
      const letter: DocumentLayout = {
        sections: [
          { page: SMALL_PAGE.page },
          {
            page: { size: 'Letter', orientation: 'landscape', margins: { topMm: 0, bottomMm: 0 } },
          },
        ],
      };
      const { editor, element } = mount({
        content: TWO_SECTIONS,
        extensions: [SimulatedSectionBreak],
        pageView: { layout: letter },
      });
      paginateNow(editor);
      const label = (): string | undefined =>
        sectionGap(editor)?.querySelector(`.${PAGE_GAP_SECTION_LABEL_CLASS}`)?.textContent ??
        undefined;
      expect(label()).toBe('Section 2 · Letter paysage');
      expect(element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE)).toBe('279.4mm');
      editor.i18n.setLocale('en');
      expect(label()).toBe('Section 2 · Letter landscape');
      expect(
        sectionLabel(null, { '--aster-page-width': '210mm', '--aster-page-height': '297mm' }, 3),
      ).toBe('Section 3 · A4 portrait');
      expect(sectionLabel(null, { '--aster-page-width': 'auto' }, 3)).toBe('Section 3');
      expect(sectionLabel(null, undefined, 1)).toBe('Section 1');
    });

    it('une nouvelle mise en page redessine les coupures même à coupures égales ; retrait complet', () => {
      const { editor, element } = mount({
        content: TWO_SECTIONS,
        extensions: [SimulatedSectionBreak],
        pageView: { layout: SECTIONS },
      });
      paginateNow(editor);
      expect(sectionGap(editor)?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe(
        '<p>Tête 2</p>',
      );
      const renamed: DocumentLayout = {
        ...SECTIONS,
        sections: [
          SECTIONS.sections?.[0] ?? {},
          { page: SECTION_2_PAGE, headers: { default: { html: '<p>Autre</p>' } } },
        ],
      };
      impl(editor).setPageView({ layout: renamed });
      paginateNow(editor);
      expect(sectionGap(editor)?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe(
        '<p>Autre</p>',
      );
      impl(editor).setPageView(false);
      expect(gaps(editor)).toEqual([]);
      expect(element.getAttribute('style')).toBeNull();
      expect(getPaginationResult(editor)).toBe(EMPTY_PAGINATION);
    });

    /** Trois sections sans marges haut/bas : 100 × 30, 120 × 20 et 130 × 10 mm (nœud `sectionBreak` réel). */
    const THREE: DocumentLayout = {
      page: { size: { widthMm: 130, heightMm: 10 }, margins: { topMm: 0, bottomMm: 0 } },
      footers: { default: { html: '<p>Pied 3</p>' } },
      sections: [
        {
          page: SMALL_PAGE.page,
          headers: { default: { html: '<p>Tête 1</p>' } },
          footers: { default: { html: '<p>Pied 1</p>' } },
        },
        {
          page: { size: { widthMm: 120, heightMm: 20 }, margins: { topMm: 0, bottomMm: 0 } },
          headers: { default: { html: '<p>Tête 2</p>' } },
          footers: { default: { html: '<p>Pied 2</p>' } },
        },
        {
          page: { size: { widthMm: 130, heightMm: 10 }, margins: { topMm: 0, bottomMm: 0 } },
          headers: { default: { html: '<p>Tête 3</p>' } },
          footers: { default: { html: '<p>Pied 3</p>' } },
        },
      ],
    };
    const hrs = (editor: AsterEditor): HTMLElement[] =>
      Array.from(editor.contentElement.querySelectorAll<HTMLElement>('hr[data-section-break]'));

    it('R44-01 : numéros hors ordre chargés → hr, coupure, libellé et en-tête désignent la même section positionnelle', () => {
      const { editor } = mount({
        // Un chargement complet garde les numéros tels quels (L41) : 2 puis 1.
        content:
          '<p>a</p><p>b</p><hr data-section-break="2"><p>c</p><p>d</p><hr data-section-break="1"><p>e</p><p>f</p>',
        pageView: { layout: THREE },
      });
      expect(editor.getHTML()).toContain('<hr data-section-break="2"><p>c</p>');
      const result = paginateNow(editor);
      // Le premier saut ouvre la section 2 (120 × 20), le second la section 3 (130 × 10),
      // quel que soit leur attribut : le hr et le segment lisent la même entrée.
      expect(hrs(editor).map((hr) => hr.style.getPropertyValue('--aster-page-height'))).toEqual([
        '20mm',
        '10mm',
      ]);
      expect(result.sections?.map((section) => section['--aster-page-height'])).toEqual([
        '30mm',
        '20mm',
        '10mm',
      ]);
      const first = gaps(editor)[0];
      expect(first?.getAttribute(PAGE_SECTION_ATTRIBUTE)).toBe('2');
      expect(first?.style.getPropertyValue('--aster-page-height')).toBe('20mm');
      expect(first?.querySelector(`.${PAGE_GAP_SECTION_LABEL_CLASS}`)?.textContent).toBe(
        'Section 2 · 120 × 20 mm paysage',
      );
      expect(first?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 2</p>');
      expect(first?.querySelector(`.${PAGE_GAP_FOOTER_CLASS}`)?.innerHTML).toBe('<p>Pied 1</p>');
      const third = gaps(editor).find((gap) => gap.getAttribute(PAGE_SECTION_ATTRIBUTE) === '3');
      expect(third?.querySelector(`.${PAGE_GAP_SECTION_LABEL_CLASS}`)?.textContent).toBe(
        'Section 3 · 130 × 10 mm paysage',
      );
      expect(third?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 3</p>');
    });

    it('R44-05 : le pied de l’hôte et --aster-page-width-max suivent la dernière section du corps', () => {
      const { editor, element } = mount({
        content: '<p>a</p><p>b</p><hr data-section-break="1"><p>c</p><p>d</p>',
        pageView: { layout: THREE },
      });
      paginateNow(editor);
      expect(gaps(editor).map((gap) => gap.getAttribute(PAGE_SECTION_ATTRIBUTE))).toEqual([
        '2',
        '2',
      ]);
      // Un seul saut : le corps finit en section 2, jamais en section 3.
      expect(element.querySelector(`.${PAGE_FOOTER_CLASS}`)?.innerHTML).toBe('<p>Pied 2</p>');
      expect(element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE)).toBe('120mm');
      // Sans saut : section 1 seule.
      editor.setHTML('<p>seul</p>');
      impl(editor).setPageView({ layout: THREE });
      expect(element.querySelector(`.${PAGE_FOOTER_CLASS}`)?.innerHTML).toBe('<p>Pied 1</p>');
      expect(element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE)).toBe('100mm');
      // Plus de sauts que de sections : borné par les sections déclarées.
      editor.setHTML(
        '<p>a</p><hr data-section-break="1"><p>b</p><hr data-section-break="2"><p>c</p><hr data-section-break="3"><p>d</p>',
      );
      impl(editor).setPageView({ layout: THREE });
      expect(element.querySelector(`.${PAGE_FOOTER_CLASS}`)?.innerHTML).toBe('<p>Pied 3</p>');
      expect(element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE)).toBe('130mm');
    });

    it('L50 : le pied de l’hôte et --aster-page-width-max suivent insertBreak, removeBreak et undo sans setPageView', () => {
      const { editor, element } = mount({
        content: '<p>a</p><p>b</p><hr data-section-break="1"><p>c</p><p>d</p>',
        pageView: { layout: THREE },
      });
      const footer = (): string | undefined =>
        element.querySelector(`.${PAGE_FOOTER_CLASS}`)?.innerHTML;
      const widthMax = (): string => element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE);
      expect(footer()).toBe('<p>Pied 2</p>');
      expect(widthMax()).toBe('120mm');

      // Curseur dans « d », un saut de plus : le corps ouvre la section 3.
      editor.tiptap.commands.setTextSelection(editor.tiptap.state.doc.content.size - 1);
      expect(editor.commands.run('section.insertBreak')).toBe(true);
      expect(footer()).toBe('<p>Pied 3</p>');
      expect(widthMax()).toBe('130mm');

      // Retrait du saut 1 : il reste un saut, le corps finit en section 2.
      expect(editor.commands.run('section.removeBreak', { section: 1 })).toBe(true);
      expect(footer()).toBe('<p>Pied 2</p>');
      expect(widthMax()).toBe('120mm');

      // undo rétablit le saut : section 3 à nouveau. Puis plus aucun saut : section 1.
      expect(editor.commands.run('undo')).toBe(true);
      expect(footer()).toBe('<p>Pied 3</p>');
      expect(widthMax()).toBe('130mm');
      editor.setHTML('<p>seul</p>');
      expect(footer()).toBe('<p>Pied 1</p>');
      expect(widthMax()).toBe('100mm');

      // Après le retrait de la vue page, l'écouteur est parti : un saut ajouté ne touche plus l'hôte.
      impl(editor).setPageView(false);
      editor.setHTML('<p>a</p><hr data-section-break="1"><p>b</p>');
      expect(element.querySelector(`.${PAGE_FOOTER_CLASS}`)).toBeNull();
      expect(widthMax()).toBe('');
    });

    it('L52 (retour n° 3) : chaque coupure porte le pied de la page qui se termine et l’en-tête de celle qui commence, first / even selon la page', () => {
      const layout: DocumentLayout = {
        ...SMALL_PAGE,
        titlePage: true,
        headers: {
          default: { html: '<p>Tête</p>' },
          first: { html: '<p>Première</p>' },
          even: { html: '<p>Tête paire</p>' },
        },
        footers: {
          default: { html: '<p>Pied</p>' },
          first: { html: '<p>Pied première</p>' },
          even: { html: '<p>Pied pair</p>' },
        },
      };
      // Deux blocs par page : six blocs → trois pages, quatre après un ajout.
      const { editor, element } = mount({ content: paragraphs(6), pageView: { layout } });
      expect(paginateNow(editor).pageCount).toBe(3);
      const posed = gaps(editor);
      expect(posed).toHaveLength(2);
      const header = (gap: HTMLElement | undefined): string | undefined =>
        gap?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML;
      const footer = (gap: HTMLElement | undefined): string | undefined =>
        gap?.querySelector(`.${PAGE_GAP_FOOTER_CLASS}`)?.innerHTML;
      // Hôte : page 1, première de la section 1 → `first`.
      expect(element.querySelector(`.${PAGE_HEADER_CLASS}`)?.innerHTML).toBe('<p>Première</p>');
      // Coupure 1 : la page 1 (première) se termine, la page 2 (paire) commence.
      expect(footer(posed[0])).toBe('<p>Pied première</p>');
      expect(header(posed[0])).toBe('<p>Tête paire</p>');
      // Coupure 2 : la page 2 (paire) se termine, la page 3 (quelconque) commence.
      expect(footer(posed[1])).toBe('<p>Pied pair</p>');
      expect(header(posed[1])).toBe('<p>Tête</p>');
      // Sans section : ni classe d'ouverture, ni libellé, ni `data-section`.
      expect(posed.some((gap) => gap.classList.contains(PAGE_GAP_SECTION_CLASS))).toBe(false);
      expect(posed[0]?.querySelector(`.${PAGE_GAP_SECTION_LABEL_CLASS}`)).toBeNull();
      expect(posed[0]?.hasAttribute(PAGE_SECTION_ATTRIBUTE)).toBe(false);
      // Pied de l'hôte : dernière page, la 3 (impaire, pas la première) → `default`.
      const hostFooter = element.querySelector(`.${PAGE_FOOTER_CLASS}`);
      expect(hostFooter?.innerHTML).toBe('<p>Pied</p>');
      // Une page de plus : la dernière devient la 4, paire → `even` sur le pied de l'hôte.
      editor.setHTML(paragraphs(8), false);
      expect(paginateNow(editor).pageCount).toBe(4);
      expect(hostFooter?.innerHTML).toBe('<p>Pied pair</p>');
      // Lecture seule, en-têtes et pieds assainis comme ceux de l'hôte.
      expect(
        gaps(editor)[0]
          ?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)
          ?.getAttribute('contenteditable'),
      ).toBe('false');
      // Retrait de la vue page : plus rien.
      impl(editor).setPageView(false);
      expect(gaps(editor)).toEqual([]);
    });

    it('L52 : titlePage sans first retombe sur default ; une section continuous n’a pas de première page propre', () => {
      const sections: DocumentLayout = {
        page: SECTION_2_PAGE,
        sections: [
          {
            page: SMALL_PAGE.page,
            titlePage: true,
            headers: { default: { html: '<p>Tête 1</p>' } },
            footers: {
              default: { html: '<p>Pied 1</p>' },
              first: { html: '<p>Pied 1 première</p>' },
            },
          },
          {
            page: SECTION_2_PAGE,
            titlePage: true,
            headers: {
              default: { html: '<p>Tête 2</p>' },
              first: { html: '<p>Tête 2 première</p>' },
            },
          },
        ],
      };
      const { editor, element } = mount({
        content: TWO_SECTIONS,
        extensions: [SimulatedSectionBreak],
        pageView: { layout: sections },
      });
      paginateNow(editor);
      // Hôte : page 1 de la section 1, `titlePage` sans `first` → `default` (repli assumé).
      expect(element.querySelector(`.${PAGE_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 1</p>');
      const posed = gaps(editor);
      expect(posed).toHaveLength(3);
      // Coupure 1 : page 1 (première de la section 1) se termine → pied `first` ; page 2 ouvre la section 2 → en-tête `first`.
      expect(posed[0]?.querySelector(`.${PAGE_GAP_FOOTER_CLASS}`)?.innerHTML).toBe(
        '<p>Pied 1 première</p>',
      );
      expect(posed[0]?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe(
        '<p>Tête 2 première</p>',
      );
      // Coupures suivantes : pages 3 et 4 de la section 2 → `default`.
      expect(posed[1]?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 2</p>');
      expect(posed[2]?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 2</p>');

      // Section 2 `continuous` : sa première page est partagée, la coupure qui porte son
      // numéro n'en est pas la première page → `default`, même avec `titlePage`.
      const continuous: DocumentLayout = {
        ...sections,
        sections: [
          sections.sections?.[0] ?? {},
          { ...sections.sections?.[1], start: 'continuous' },
        ],
      };
      impl(editor).setPageView({ layout: continuous });
      setHeights([40, 40, 4, 40, 40, 40]);
      paginateNow(editor);
      const first = gaps(editor)[0];
      expect(first?.classList.contains(PAGE_GAP_SECTION_CLASS)).toBe(true);
      expect(first?.querySelector(`.${PAGE_GAP_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête 2</p>');
    });

    it('L52 : lastPageOf et gapPages décrivent les pages des coupures', () => {
      const layout: DocumentLayout = { sections: [{}, { start: 'continuous' }, {}] };
      const result = paginate(
        [40, 40, 40, 40, 40, 40],
        [
          { start: 0, pageHeight: 100 },
          { start: 2, pageHeight: 50 },
          { start: 4, pageHeight: 50 },
        ],
        [4],
      );
      expect(result.gaps.map((gap) => [gap.page, gap.section])).toEqual([
        [2, 2],
        [3, 2],
        [4, 3],
        [5, 3],
      ]);
      const pages = result.gaps.map((gap, position) =>
        gapPages(gap, previousPageSection(result.gaps, position), result, layout),
      );
      // Page 1 : première de la section 1 ; la section 2 (continuous) n'ouvre jamais de première page.
      expect(pages[0]).toEqual({
        closing: { pageNumber: 1, firstOfSection: true },
        opening: { pageNumber: 2, firstOfSection: false },
      });
      expect(pages[1]).toEqual({
        closing: { pageNumber: 2, firstOfSection: false },
        opening: { pageNumber: 3, firstOfSection: false },
      });
      // La section 3 s'ouvre sur une nouvelle page : page 4 première, page 5 non.
      expect(pages[2]?.opening).toEqual({ pageNumber: 4, firstOfSection: true });
      expect(pages[3]).toEqual({
        closing: { pageNumber: 4, firstOfSection: true },
        opening: { pageNumber: 5, firstOfSection: false },
      });
      expect(lastPageOf(result, layout)).toEqual({ pageNumber: 5, firstOfSection: false });
      expect(lastPageOf(EMPTY_PAGINATION, layout)).toEqual({ pageNumber: 1, firstOfSection: true });
      // Coupure étrangère au résultat : pages quelconques de leur section.
      expect(gapPages({ index: 9, page: 9, fill: 0 }, 1, result, layout)).toEqual({
        closing: { pageNumber: 8, firstOfSection: false },
        opening: { pageNumber: 9, firstOfSection: false },
      });
    });

    it('helpers : previousPageSection, gapCssVariables et pageHeightTotalMm', () => {
      const result = paginate(
        [40, 40, 40, 40],
        [
          { start: 0, pageHeight: 100 },
          { start: 2, pageHeight: 50 },
        ],
        [2],
      );
      expect(
        result.gaps.map((_gap, position) => previousPageSection(result.gaps, position)),
      ).toEqual([1, 2]);
      const sections: SectionCssVariables[] = [
        {
          '--aster-page-height': '297mm',
          '--aster-page-margin-bottom': '10mm',
          '--aster-page-margin-footer': '5mm',
        },
        {
          '--aster-page-height': '210mm',
          '--aster-page-margin-top': '20mm',
          '--aster-page-width': '297mm',
        },
      ];
      expect(gapCssVariables(sections, 1, 2)).toEqual({
        '--aster-page-margin-bottom': '10mm',
        '--aster-page-margin-footer': '5mm',
        '--aster-page-height': '210mm',
        '--aster-page-margin-top': '20mm',
        '--aster-page-width': '297mm',
      });
      expect(gapCssVariables(sections, 1, 3)).toEqual({});
      expect(pageHeightTotalMm({ ...result, sections })).toBe(297 + 210 + 210);
      expect(pageHeightTotalMm(result)).toBeNull();
      expect(pageHeightTotalMm({ ...result, sections: [sections[0] ?? {}, {}] })).toBeNull();
    });
  });
});

/**
 * Saut de section simulé pour les tests : tout bloc rendu `hr[data-section-break]`
 * (nœud `sectionBreak` de L41 ou autre) doit être reconnu. Les variables de la section
 * suivante viennent ici de `layout.sections` (repli), ou du style inline posé par le test.
 */
const SimulatedSectionBreak = Node.create({
  name: 'simulatedSectionBreak',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      section: {
        default: 1,
        parseHTML: (element: HTMLElement) =>
          Number.parseInt(element.getAttribute('data-section-break') ?? '1', 10) || 1,
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-section-break': String(attributes['section']),
        }),
      },
      start: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-section-start'),
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes['start'] === 'string'
            ? { 'data-section-start': attributes['start'] }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'hr[data-section-break]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes)];
  },
});
