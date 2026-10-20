import type {
  AsterEditor,
  DocumentLayout,
  PageDimensions,
  PageMargins,
  PageOrientation,
  PageSetup,
  PageSizeName,
  PageViewOptions,
  PaginatedPageViewOptions,
} from '@aster-editor/core';
import { PAGE_SIZES_MM, getActivePageView, isPaginationEnabled } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el } from '../utils/dom';
import { isRecord } from '../utils/guards';
import { createPlainButton } from './button';
import { createDropdown, type Dropdown } from './dropdown';
import {
  createAlert,
  createCheckbox,
  createNumberField,
  fieldSuffix,
  flagInvalid,
  isOutOfRange,
  parseNumberInput,
  submitOnEnter,
} from './paragraph-layout';

/** Classe posée par le core sur l'hôte (`editor.element`) quand la vue page est active. */
export const PAGE_VIEW_CLASS = 'aster--page-view';

/** Formats nommés proposés, dans l'ordre du sélecteur. */
export const PAGE_SIZE_NAMES: readonly PageSizeName[] = ['A4', 'A3', 'A5', 'Letter', 'Legal'];

/** Marge par défaut d'Aster (un pouce), en millimètres. */
export const DEFAULT_PAGE_MARGIN_MM = 25.4;

/**
 * Plus grande dimension de page acceptée (22 pouces, la limite de Word). Un format libre
 * hors de cette borne, non fini ou nul, est traité comme A4 : le dialogue et la feuille
 * (le core replie aussi) disent alors la même chose (R26-13).
 */
export const MAX_PAGE_DIMENSION_MM = 558.8;

/** Clés des quatre marges éditées, dans `PageMargins`. */
type MarginKey = 'topMm' | 'rightMm' | 'bottomMm' | 'leftMm';

/** Côtés des marges, dans l'ordre d'affichage : clé de `PageMargins` et suffixe i18n. */
const MARGIN_FIELDS: readonly {
  readonly key: MarginKey;
  readonly labelKey: string;
}[] = [
  { key: 'topMm', labelKey: 'ui.pageLayout.marginTop' },
  { key: 'rightMm', labelKey: 'ui.pageLayout.marginRight' },
  { key: 'bottomMm', labelKey: 'ui.pageLayout.marginBottom' },
  { key: 'leftMm', labelKey: 'ui.pageLayout.marginLeft' },
];

/**
 * Méthodes de vue page de l'éditeur, **hors contrat** : annoncées par L23 sur `AsterEditor`
 * interne (`setPageView`, `getLayout`), absentes de `api/`. Le widget les détecte à
 * l'exécution et se désactive si le core ne les expose pas.
 */
export interface PageViewApi {
  setPageView(options: PageViewOptions | false): void;
  getLayout(): DocumentLayout | null;
}

/** Vrai si `value` ressemble à un `DocumentLayout` (objet non nul, sans vérification profonde). */
function isLayout(value: unknown): value is DocumentLayout {
  return isRecord(value);
}

/** Accès typé aux méthodes hors contrat, ou `null` si le core ne les expose pas. */
export function pageViewApiOf(editor: AsterEditor): PageViewApi | null {
  if (!isRecord(editor)) return null;
  const set = editor['setPageView'];
  const get = editor['getLayout'];
  if (typeof set !== 'function' || typeof get !== 'function') return null;
  return {
    setPageView: (options) => {
      set.call(editor, options);
    },
    getLayout: () => {
      const layout: unknown = get.call(editor);
      return isLayout(layout) ? layout : null;
    },
  };
}

/** Vrai si la vue page est active (classe posée par le core sur l'hôte). */
export function isPageViewActive(editor: AsterEditor): boolean {
  return editor.element.classList.contains(PAGE_VIEW_CLASS);
}

function isPageSizeName(value: unknown): value is PageSizeName {
  return typeof value === 'string' && (PAGE_SIZE_NAMES as readonly string[]).includes(value);
}

/** Dimension de page exploitable : nombre fini, strictement positif, au plus 558,8 mm. */
function isPageDimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_PAGE_DIMENSION_MM
  );
}

function isPageDimensions(value: unknown): value is PageDimensions {
  return isRecord(value) && isPageDimension(value['widthMm']) && isPageDimension(value['heightMm']);
}

/**
 * Dimensions de la feuille en millimètres pour un format (nommé ou libre) et une
 * orientation : en paysage, largeur et hauteur sont inversées, comme le fait le core.
 */
export function pageDimensionsOf(
  size: PageSizeName | PageDimensions,
  orientation: PageOrientation,
): PageDimensions {
  const portrait = isPageSizeName(size) ? PAGE_SIZES_MM[size] : size;
  return orientation === 'landscape'
    ? { widthMm: portrait.heightMm, heightMm: portrait.widthMm }
    : portrait;
}

/**
 * Marge maximale d'un côté : la moitié de la dimension correspondante (haut / bas : la
 * hauteur, gauche / droite : la largeur), arrondie à deux décimales vers le bas. Au-delà,
 * les marges se chevauchent et la feuille n'a plus de corps (R26-04). L'epsilon absorbe
 * l'erreur flottante (`279.4 * 50` vaut `13969.999…`, pas 13970).
 */
export function maxMarginMm(key: MarginKey, dimensions: PageDimensions): number {
  const extent = key === 'topMm' || key === 'bottomMm' ? dimensions.heightMm : dimensions.widthMm;
  return Math.floor(extent * 50 + 1e-6) / 100;
}

/** Mise en page de la page telle que le dialogue l'affiche : chaque champ résolu avec son défaut. */
export interface ResolvedPageSetup {
  readonly size: PageSizeName | PageDimensions;
  readonly orientation: PageOrientation;
  readonly margins: Required<Pick<PageMargins, 'topMm' | 'rightMm' | 'bottomMm' | 'leftMm'>> &
    PageMargins;
}

/** Résout `layout.page` avec les défauts d'Aster (A4, portrait, 25,4 mm). */
export function resolvePageSetup(layout: DocumentLayout | null): ResolvedPageSetup {
  const page = layout?.page;
  const size = page?.size;
  const margins = page?.margins ?? {};
  return {
    size: isPageSizeName(size) || isPageDimensions(size) ? size : 'A4',
    orientation: page?.orientation === 'landscape' ? 'landscape' : 'portrait',
    margins: {
      ...margins,
      topMm: margins.topMm ?? DEFAULT_PAGE_MARGIN_MM,
      rightMm: margins.rightMm ?? DEFAULT_PAGE_MARGIN_MM,
      bottomMm: margins.bottomMm ?? DEFAULT_PAGE_MARGIN_MM,
      leftMm: margins.leftMm ?? DEFAULT_PAGE_MARGIN_MM,
    },
  };
}

/**
 * Widget `pageLayout` : dialogue « Mise en page » (format A4 / A3 / A5 / Letter / Legal,
 * orientation, marges en mm, case « Vue page »), prérempli depuis `editor.getLayout()`.
 * « Appliquer » envoie `editor.setPageView({ layout })` avec la page modifiée et le reste
 * de la mise en page conservé (en-têtes, pieds, police…), ou `setPageView(false)` si la
 * case est décochée. Désactivé si le core n'expose pas ces méthodes ou en lecture seule ;
 * le déclencheur est « enfoncé » quand la vue page est active.
 */
export function createPageLayoutDialog(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'ui.pageLayout.title',
    icon: 'page-layout',
    panelRole: 'dialog',
    panelClass: 'aster-dialog aster-page-layout',
    isEnabled: () => pageViewApiOf(editor) !== null && !editor.isReadOnly(),
    isActive: () => isPageViewActive(editor),
    renderPanel: (panel, dropdown) => renderPageLayoutPanel(editor, panel, dropdown),
  });
}

function renderPageLayoutPanel(editor: AsterEditor, panel: HTMLElement, dropdown: Dropdown): void {
  const t = (key: string): string => editor.i18n.t(key);
  const api = pageViewApiOf(editor);
  const layout = api?.getLayout() ?? null;
  const current = resolvePageSetup(layout);
  const suffix = fieldSuffix();
  panel.setAttribute('aria-label', t('ui.pageLayout.title'));
  const alert = createAlert();

  // Format : les formats nommés, plus « Personnalisé » (dimensions libres) seulement si le
  // document en utilise un, conservé tel quel à l'application.
  const sizeId = `aster-page-layout-size-${suffix}`;
  const size = el('select', {
    className: 'aster-dialog__input aster-dialog__select aster-page-layout__size',
    attrs: { id: sizeId, autofocus: '' },
  });
  for (const name of PAGE_SIZE_NAMES) {
    size.append(el('option', { attrs: { value: name }, text: name }));
  }
  const customSize = isPageDimensions(current.size) ? current.size : null;
  if (customSize) {
    size.append(
      el('option', {
        attrs: { value: 'custom' },
        text: `${t('ui.pageLayout.size.custom')} (${customSize.widthMm} × ${customSize.heightMm} mm)`,
      }),
    );
    size.value = 'custom';
  } else if (isPageSizeName(current.size)) {
    size.value = current.size;
  }
  const sizeField = el('div', { className: 'aster-dialog__field' }, [
    el('label', {
      className: 'aster-dialog__label',
      attrs: { for: sizeId },
      text: t('ui.pageLayout.size'),
    }),
    size,
  ]);

  // Orientation : deux boutons radio.
  const orientationName = `aster-page-layout-orientation-${suffix}`;
  const orientationInputs: HTMLInputElement[] = [];
  const orientationGroup = el('div', {
    className: 'aster-dialog__field aster-page-layout__orientation',
    attrs: { role: 'radiogroup', 'aria-label': t('ui.pageLayout.orientation') },
  });
  orientationGroup.append(
    el('span', { className: 'aster-dialog__label', text: t('ui.pageLayout.orientation') }),
  );
  const radios = el('div', { className: 'aster-dialog__radios' });
  for (const value of ['portrait', 'landscape'] as const) {
    const id = `${orientationName}-${value}`;
    const radio = el('input', {
      className: 'aster-page-layout__radio',
      attrs: { type: 'radio', name: orientationName, id, value },
    });
    radio.checked = current.orientation === value;
    orientationInputs.push(radio);
    radios.append(
      el('label', { className: 'aster-dialog__check', attrs: { for: id } }, [
        radio,
        t(`ui.pageLayout.${value}`),
      ]),
    );
  }
  orientationGroup.append(radios);

  /** Format choisi dans le sélecteur ; « Personnalisé » renvoie les dimensions libres du document. */
  const selectedSize = (): PageSizeName | PageDimensions => {
    const value = size.value;
    return isPageSizeName(value) ? value : (customSize ?? 'A4');
  };
  const selectedOrientation = (): PageOrientation =>
    orientationInputs.find((radio) => radio.checked)?.value === 'landscape'
      ? 'landscape'
      : 'portrait';
  const selectedDimensions = (): PageDimensions =>
    pageDimensionsOf(selectedSize(), selectedOrientation());

  // Marges en millimètres, chacune bornée à la moitié de la dimension correspondante ;
  // le `max` suit le format et l'orientation choisis, `submit` revérifie (R26-04).
  const marginFields = MARGIN_FIELDS.map((field) => ({
    ...field,
    ...createNumberField({
      id: `aster-page-layout-${field.key}-${suffix}`,
      label: t(field.labelKey),
      value: current.margins[field.key],
      min: 0,
      max: maxMarginMm(field.key, selectedDimensions()),
      step: 1,
    }),
  }));
  const syncMarginMax = (): void => {
    const dimensions = selectedDimensions();
    for (const field of marginFields) {
      field.input.max = String(maxMarginMm(field.key, dimensions));
    }
  };
  size.addEventListener('change', syncMarginMax);
  for (const radio of orientationInputs) {
    radio.addEventListener('change', syncMarginMax);
  }
  const marginsGroup = el('div', {
    className: 'aster-dialog__field aster-page-layout__margins',
    attrs: { role: 'group', 'aria-label': t('ui.pageLayout.margins') },
  });
  marginsGroup.append(
    el('span', { className: 'aster-dialog__label', text: t('ui.pageLayout.margins') }),
    el(
      'div',
      { className: 'aster-dialog__row' },
      marginFields.map((field) => field.wrapper),
    ),
  );

  const enabled = createCheckbox(
    t('ui.pageLayout.enabled'),
    isPageViewActive(editor),
    'aster-page-layout__enabled',
  );
  // Pagination approximative (L30) : préremplie depuis les options de la vue page active
  // (`getActivePageView`), vraie par défaut ; envoyée seulement quand elle est décochée.
  const pagination = createCheckbox(
    t('ui.pageLayout.pagination'),
    isPaginationEnabled(getActivePageView(editor.contentElement)),
    'aster-page-layout__pagination',
  );

  const submit = (): void => {
    if (!api) return;
    if (!enabled.input.checked) {
      api.setPageView(false);
      dropdown.close(false);
      // Le core ne signale pas forcément le changement par un événement : on resynchronise
      // le déclencheur (`aria-pressed`) tout de suite.
      dropdown.update();
      editor.focus();
      return;
    }
    const dimensions = selectedDimensions();
    const margins: Partial<Record<MarginKey, number>> = {};
    for (const field of marginFields) {
      const parsed = parseNumberInput(field.input.value);
      if (
        parsed === null ||
        parsed === 'invalid' ||
        isOutOfRange(parsed, 0, maxMarginMm(field.key, dimensions))
      ) {
        flagInvalid(field.input, alert, t('ui.pageLayout.invalid'));
        return;
      }
      margins[field.key] = parsed;
    }
    const page: PageSetup = {
      size: selectedSize(),
      orientation: selectedOrientation(),
      margins: { ...current.margins, ...margins },
    };
    const options: PaginatedPageViewOptions = pagination.input.checked
      ? { layout: { ...(layout ?? {}), page } }
      : { layout: { ...(layout ?? {}), page }, pagination: false };
    api.setPageView(options);
    dropdown.close(false);
    dropdown.update();
    editor.focus();
  };
  submitOnEnter(
    marginFields.map((field) => field.input),
    submit,
  );
  for (const field of marginFields) {
    field.input.addEventListener('input', () => {
      field.input.removeAttribute('aria-invalid');
      alert.setAttribute('hidden', '');
    });
  }

  const ok = createPlainButton({
    className: 'aster-dialog__button aster-dialog__button--primary',
    text: t('ui.pageLayout.ok'),
  });
  ok.addEventListener('click', submit);
  const cancel = createPlainButton({
    className: 'aster-dialog__button',
    text: t('ui.pageLayout.cancel'),
  });
  cancel.addEventListener('click', () => dropdown.close(true));

  panel.append(
    sizeField,
    orientationGroup,
    marginsGroup,
    alert,
    el('div', { className: 'aster-dialog__field' }, [enabled.wrapper, pagination.wrapper]),
    el('div', { className: 'aster-dialog__actions' }, [cancel, ok]),
  );
}
