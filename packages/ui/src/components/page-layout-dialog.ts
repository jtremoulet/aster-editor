import type {
  AsterEditor,
  DocumentLayout,
  PageDimensions,
  PageMargins,
  PageOrientation,
  PageSetup,
  PageSizeName,
  PageViewOptions,
} from '@aster-editor/core';
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
  parseNumberInput,
  submitOnEnter,
} from './paragraph-layout';

/** Classe posée par le core sur l'hôte (`editor.element`) quand la vue page est active. */
export const PAGE_VIEW_CLASS = 'aster--page-view';

/** Formats nommés proposés, dans l'ordre du sélecteur. */
export const PAGE_SIZE_NAMES: readonly PageSizeName[] = ['A4', 'A3', 'A5', 'Letter', 'Legal'];

/** Marge par défaut d'Aster (un pouce), en millimètres. */
export const DEFAULT_PAGE_MARGIN_MM = 25.4;

/** Côtés des marges, dans l'ordre d'affichage : clé de `PageMargins` et suffixe i18n. */
const MARGIN_FIELDS: readonly {
  readonly key: 'topMm' | 'rightMm' | 'bottomMm' | 'leftMm';
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

function isPageDimensions(value: unknown): value is PageDimensions {
  return (
    isRecord(value) && typeof value['widthMm'] === 'number' && typeof value['heightMm'] === 'number'
  );
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

  // Marges en millimètres.
  const marginFields = MARGIN_FIELDS.map((field) => ({
    ...field,
    ...createNumberField({
      id: `aster-page-layout-${field.key}-${suffix}`,
      label: t(field.labelKey),
      value: current.margins[field.key],
      min: 0,
      step: 1,
    }),
  }));
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
    const margins: Partial<Record<(typeof MARGIN_FIELDS)[number]['key'], number>> = {};
    for (const field of marginFields) {
      const parsed = parseNumberInput(field.input.value);
      if (parsed === null || parsed === 'invalid' || parsed < 0) {
        flagInvalid(field.input, alert, t('ui.pageLayout.invalid'));
        return;
      }
      margins[field.key] = parsed;
    }
    const selectedSize = size.value;
    const page: PageSetup = {
      size: isPageSizeName(selectedSize) ? selectedSize : (customSize ?? 'A4'),
      orientation:
        orientationInputs.find((radio) => radio.checked)?.value === 'landscape'
          ? 'landscape'
          : 'portrait',
      margins: { ...current.margins, ...margins },
    };
    api.setPageView({ layout: { ...(layout ?? {}), page } });
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
    el('div', { className: 'aster-dialog__field' }, [enabled.wrapper]),
    el('div', { className: 'aster-dialog__actions' }, [cancel, ok]),
  );
}
