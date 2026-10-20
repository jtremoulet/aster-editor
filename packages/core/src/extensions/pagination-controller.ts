import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { AsterEditor, PageViewOptions, Unsubscribe } from '../api';
import {
  PAGE_FOOTER_CLASS,
  PAGE_VIEW_CHANGE_EVENT,
  PAGE_VIEW_CLASS,
  getActivePageView,
} from './page-view';
import {
  EMPTY_PAGINATION,
  samePagination,
  type PageGap,
  type PaginationResult,
} from './pagination-layout';
import { PAGE_GAP_CLASS, measurePagination } from './pagination-measure';
import {
  PAGE_HEIGHT_TOTAL_CSS_VARIABLE,
  decorateGapSection,
  pageHeightTotalMm,
  previousPageSection,
  sectionSignature,
} from './pagination-sections';

/**
 * Contrôleur de la pagination approximative (session 3, L30, extrait de `pagination.ts`
 * en F30, R30-13) : vue du plugin ProseMirror qui écoute l'activation de la vue page,
 * planifie les mesures, observe la largeur de la feuille et dessine les coupures en
 * décorations widget. Le jeu de décorations vit dans l'état du plugin, mappé par
 * ProseMirror à chaque transaction (R30-05) ; il n'est reconstruit qu'après une mesure.
 */

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

/**
 * État du plugin : le jeu de décorations courant et la génération du contrôleur qui l'a
 * construit. ProseMirror le mappe (`DecorationSet.map`) à chaque transaction qui change le
 * document : une frappe ne reconstruit rien (R30-05). Après une mesure, le contrôleur
 * avance sa génération et le jeu est reconstruit **en place** à la lecture suivante, sans
 * transaction (même état, nouveau jeu) : l'objet est mutable à dessein.
 */
export interface PaginationDecorations {
  generation: number;
  set: DecorationSet;
}

/** Clé du plugin ProseMirror ; son état est le jeu de décorations (`PaginationDecorations`). */
export const paginationPluginKey = new PluginKey<PaginationDecorations>('asterPagination');

/** État initial du plugin : génération 0, toujours en retard sur le contrôleur (qui part à 1). */
export function initPaginationDecorations(): PaginationDecorations {
  return { generation: 0, set: DecorationSet.empty };
}

/** Une transaction qui change le document mappe le jeu ; les autres le partagent tel quel. */
export function mapPaginationDecorations(
  tr: Transaction,
  value: PaginationDecorations,
): PaginationDecorations {
  if (!tr.docChanged) {
    return value;
  }
  return { generation: value.generation, set: value.set.map(tr.mapping, tr.doc) };
}

/**
 * Proposition de contrat (`api/layout.ts`, non modifié ici) : `PageViewOptions.pagination`,
 * vrai par défaut quand la vue page est active. Le plugin lit la propriété si elle est
 * présente ; `ui` l'envoie depuis le dialogue « Mise en page ».
 */
export interface PaginatedPageViewOptions extends PageViewOptions {
  readonly pagination?: boolean;
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

/** Libellé « Page n / N » : i18n du core (`pageView.page`, `pageView.of`), repli sans éditeur. */
function pageLabel(aster: AsterEditor | null, page: number, count: number): string {
  if (!aster) {
    return `Page ${page} / ${count}`;
  }
  return `${aster.i18n.t('pageView.page')} ${page} ${aster.i18n.t('pageView.of')} ${count}`;
}

/** Ce qu'une coupure doit savoir de sa section (L44) : la page qui se termine et les options. */
interface GapSectionContext {
  readonly previous: number;
  readonly options: PageViewOptions;
}

/**
 * DOM d'une coupure : `div.aster-page-gap[data-page-number][data-page-count]` et son
 * libellé ; avec des sections, `data-section`, les variables de la section et, sur la
 * première coupure d'une section, son en-tête, le pied de la précédente et un libellé.
 */
function renderGap(
  gap: PageGap,
  result: PaginationResult,
  label: string,
  context: GapSectionContext,
  aster: AsterEditor | null,
): HTMLElement {
  const element = document.createElement('div');
  element.className = PAGE_GAP_CLASS;
  element.setAttribute('contenteditable', 'false');
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute(PAGE_NUMBER_ATTRIBUTE, String(gap.page));
  element.setAttribute(PAGE_COUNT_ATTRIBUTE, String(result.pageCount));
  element.style.setProperty(PAGE_GAP_FILL_CSS_VARIABLE, `${Math.round(gap.fill)}px`);
  const number = document.createElement('span');
  number.className = PAGE_GAP_NUMBER_CLASS;
  number.textContent = label;
  element.append(number);
  decorateGapSection(element, gap, context.previous, result, context.options, aster);
  return element;
}

/** Jeu de décorations widget : une coupure avant chaque bloc d'index listé, clé stable par rendu. */
function buildDecorations(
  doc: ProseMirrorNode,
  result: PaginationResult,
  locale: string,
  aster: AsterEditor | null,
  options: PageViewOptions,
): DecorationSet {
  if (result.gaps.length === 0) {
    return DecorationSet.empty;
  }
  const byIndex = new Map<number, { gap: PageGap; previous: number }>();
  result.gaps.forEach((gap, position) => {
    byIndex.set(gap.index, { gap, previous: previousPageSection(result.gaps, position) });
  });
  const decorations: Decoration[] = [];
  doc.forEach((_node, offset, index) => {
    const entry = byIndex.get(index);
    if (!entry) {
      return;
    }
    const { gap, previous } = entry;
    const label = pageLabel(aster, gap.page, result.pageCount);
    const context: GapSectionContext = { previous, options };
    const section = sectionSignature(gap, previous, result, options);
    decorations.push(
      Decoration.widget(offset, () => renderGap(gap, result, label, context, aster), {
        side: -1,
        // La clé porte tout ce qui change le rendu : ProseMirror réutilise le DOM à clé égale.
        key: `${PAGE_GAP_CLASS}:${locale}:${gap.page}:${result.pageCount}:${Math.round(gap.fill)}:${section}`,
        ignoreSelection: true,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

/** Contrôleur par vue ProseMirror, pour `getPaginationResult` et `paginateNow`. */
const CONTROLLERS = new WeakMap<EditorView, PaginationController>();

/** Contrôleur attaché à une vue, `null` sans extension `Pagination` ou vue détruite. */
export function paginationControllerOf(view: EditorView): PaginationController | null {
  return CONTROLLERS.get(view) ?? null;
}

/**
 * Vue du plugin : écoute l'activation de la vue page, planifie les mesures (débounce
 * puis `requestAnimationFrame`, jamais dans un `dispatch`), observe le redimensionnement
 * de la feuille, et redessine les décorations sans transaction (`view.updateState` sur
 * l'état courant : le document ne change pas, aucun `change` n'est émis).
 */
export class PaginationController {
  result: PaginationResult = EMPTY_PAGINATION;
  private options: PageViewOptions | null = null;
  /** Vrai entre une (ré)activation avec de nouvelles options et la mesure qui suit. */
  private optionsChanged = false;
  private host: HTMLElement | null = null;
  /** Génération du rendu : avance à chaque mesure qui change quelque chose, locale ou arrêt. */
  private generation = 1;
  /** Document pour lequel le jeu a été construit en dernier (`null` : jamais). */
  private builtDoc: ProseMirrorNode | null = null;
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
    CONTROLLERS.set(view, this);
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

  /**
   * Décorations pour l'état donné : le jeu porté par l'état (mappé par ProseMirror depuis
   * sa construction), reconstruit en place seulement si sa génération est en retard
   * (mesure, locale ou arrêt depuis). Vide hors vue page ou sans coupure.
   */
  decorationsFor(state: EditorState): DecorationSet {
    const holder = paginationPluginKey.getState(state);
    if (!holder) {
      return DecorationSet.empty;
    }
    if (holder.generation !== this.generation) {
      const locale = this.aster?.i18n.getLocale() ?? '';
      holder.set =
        this.options === null
          ? DecorationSet.empty
          : buildDecorations(state.doc, this.result, locale, this.aster, this.options);
      holder.generation = this.generation;
      this.builtDoc = state.doc;
    }
    return holder.set;
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
    // De nouvelles options (mise en page, en-têtes des sections) redessinent les coupures
    // même à coupures égales : leur contenu en dépend (L44).
    this.optionsChanged = this.options !== options;
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

  /**
   * Mesure, puis reconstruit le jeu si les coupures ont changé ou si le document a bougé
   * depuis la dernière construction (le jeu mappé suit ses blocs, pas les index mesurés).
   */
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
    this.writePageCount(result);
    const drifted = result.gaps.length > 0 && this.builtDoc !== this.view.state.doc;
    const renewed = this.optionsChanged;
    this.optionsChanged = false;
    if (changed || drifted || renewed) {
      this.redraw();
    }
  }

  /**
   * Phase d'écriture : variables sur l'hôte (nombre de pages ; avec des sections, somme
   * des hauteurs de pages, L44) et attribut du pied affiché.
   */
  private writePageCount(result: PaginationResult): void {
    const count = result.pageCount;
    this.host?.style.setProperty(PAGE_COUNT_CSS_VARIABLE, String(count));
    const totalMm = pageHeightTotalMm(result);
    if (totalMm === null) {
      this.host?.style.removeProperty(PAGE_HEIGHT_TOTAL_CSS_VARIABLE);
    } else {
      this.host?.style.setProperty(PAGE_HEIGHT_TOTAL_CSS_VARIABLE, `${totalMm}mm`);
    }
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
      host.style.removeProperty(PAGE_HEIGHT_TOTAL_CSS_VARIABLE);
      if (host.getAttribute('style') === '') {
        host.removeAttribute('style');
      }
    }
    this.footer()?.removeAttribute(PAGE_COUNT_ATTRIBUTE);
    const hadGaps = this.result.gaps.length > 0;
    this.result = EMPTY_PAGINATION;
    if (hadGaps) {
      this.redraw();
    }
  }

  /** Redessine sans transaction : génération avancée, même état, le jeu est reconstruit à la lecture. */
  private redraw(): void {
    if (this.destroyed || this.view.isDestroyed || this.aster?.isDestroyed()) {
      return;
    }
    this.generation += 1;
    this.view.updateState(this.view.state);
  }
}
