import type { AsterEditor } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el } from '../utils/dom';
import { createPlainButton } from './button';
import { createDropdown, createMenuItem, type Dropdown } from './dropdown';
import {
  MAX_LINE_HEIGHT_MULTIPLE,
  MAX_PARAGRAPH_PT,
  canEditBlockLayout,
  createAlert,
  createNumberField,
  currentBlockLayout,
  fieldSuffix,
  flagInvalid,
  formatNumber,
  numberInputValue,
  parseNumberInput,
  readNumber,
  setBlockLayout,
  submitOnEnter,
  unsetBlockLayout,
} from './paragraph-layout';

/** Interlignes multiples proposés dans le menu, dans l'ordre d'affichage. */
export const LINE_SPACING_PRESETS: readonly number[] = [1, 1.15, 1.5, 2];

/** Interligne du bloc courant : multiple (`lineHeight`) ou exact en points (`lineHeightPt`). */
export interface LineSpacingState {
  readonly lineHeight: number | null;
  readonly lineHeightPt: number | null;
}

/** Lit l'interligne du paragraphe ou du titre sous le curseur. */
export function currentLineSpacing(editor: AsterEditor): LineSpacingState {
  const attrs = currentBlockLayout(editor);
  return {
    lineHeight: readNumber(attrs, 'lineHeight'),
    lineHeightPt: readNumber(attrs, 'lineHeightPt'),
  };
}

/** Brouillon du formulaire « Personnalisé », conservé entre deux rendus du panneau. */
interface CustomDraft {
  kind: 'multiple' | 'exact';
  value: string;
}

/** Plafond Word d'un interligne : 132 pour un multiple, 1584 pt pour une valeur exacte. */
export function maxFor(kind: CustomDraft['kind']): number {
  return kind === 'exact' ? MAX_PARAGRAPH_PT : MAX_LINE_HEIGHT_MULTIPLE;
}

/**
 * Widget `lineSpacing` : menu « Interligne » avec « Par défaut », les multiples 1 / 1,15 /
 * 1,5 / 2 et « Personnalisé… », qui bascule le panneau sur un mini-formulaire (multiple ou
 * valeur exacte en pt). Un multiple envoie `{ lineHeight, lineHeightPt: null }` et une
 * valeur exacte `{ lineHeightPt, lineHeight: null }` : les deux attributs sont exclusifs
 * et `lineHeightPt` l'emporterait au rendu. « Par défaut » efface les deux via
 * `paragraph.unsetLayout`. Le déclencheur est « enfoncé » dès qu'un interligne est posé.
 * Bornes Word : multiple ≤ 132, valeur exacte ≤ 1584 pt.
 */
export function createLineSpacingMenu(editor: AsterEditor): ToolbarWidget {
  let mode: 'list' | 'custom' = 'list';
  const draft: CustomDraft = { kind: 'multiple', value: '' };
  let error = false;

  const reset = (): void => {
    mode = 'list';
    draft.kind = 'multiple';
    draft.value = '';
    error = false;
  };

  const finish = (dropdown: Dropdown): void => {
    reset();
    dropdown.close(false);
    editor.focus();
  };

  const renderList = (panel: HTMLElement, dropdown: Dropdown): void => {
    const t = (key: string): string => editor.i18n.t(key);
    const state = currentLineSpacing(editor);
    const isDefault = state.lineHeight === null && state.lineHeightPt === null;
    const matchesPreset =
      state.lineHeightPt === null && LINE_SPACING_PRESETS.includes(state.lineHeight ?? Number.NaN);
    panel.append(
      createMenuItem({
        className: 'aster-line-spacing__default',
        text: t('ui.lineSpacing.default'),
        checked: isDefault,
        onSelect: () => {
          unsetBlockLayout(editor, ['lineHeight', 'lineHeightPt']);
          finish(dropdown);
        },
      }),
    );
    for (const preset of LINE_SPACING_PRESETS) {
      const item = createMenuItem({
        className: 'aster-line-spacing__preset',
        text: formatNumber(preset, editor.i18n.getLocale()),
        checked: state.lineHeightPt === null && state.lineHeight === preset,
        onSelect: () => {
          setBlockLayout(editor, { lineHeight: preset, lineHeightPt: null });
          finish(dropdown);
        },
      });
      item.dataset['value'] = String(preset);
      panel.append(item);
    }
    panel.append(
      createMenuItem({
        className: 'aster-line-spacing__custom',
        text: t('ui.lineSpacing.custom'),
        checked: !isDefault && !matchesPreset,
        onSelect: () => {
          mode = 'custom';
          if (state.lineHeightPt !== null) {
            draft.kind = 'exact';
            draft.value = numberInputValue(state.lineHeightPt);
          } else {
            draft.kind = 'multiple';
            draft.value = numberInputValue(state.lineHeight);
          }
          dropdown.rerender();
          panel.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
        },
      }),
    );
  };

  const renderForm = (panel: HTMLElement, dropdown: Dropdown): void => {
    const t = (key: string): string => editor.i18n.t(key);
    const suffix = fieldSuffix();
    const kindName = `aster-line-spacing-kind-${suffix}`;
    const radios: HTMLInputElement[] = [];
    const kinds = el('div', {
      className: 'aster-dialog__field aster-line-spacing__kinds',
      attrs: { role: 'radiogroup', 'aria-label': t('ui.lineSpacing.label') },
    });
    for (const kind of ['multiple', 'exact'] as const) {
      const id = `${kindName}-${kind}`;
      const radio = el('input', {
        className: 'aster-line-spacing__kind',
        attrs: { type: 'radio', name: kindName, id, value: kind },
      });
      radio.checked = draft.kind === kind;
      radio.addEventListener('change', () => {
        if (radio.checked) draft.kind = kind;
      });
      radios.push(radio);
      kinds.append(
        el('label', { className: 'aster-dialog__check', attrs: { for: id } }, [
          radio,
          t(`ui.lineSpacing.${kind}`),
        ]),
      );
    }

    const value = createNumberField({
      id: `aster-line-spacing-value-${suffix}`,
      label: t('ui.lineSpacing.value'),
      value: null,
      min: 0,
      max: maxFor(draft.kind),
      step: 'any',
    });
    value.input.value = draft.value;
    // Le plafond suit le mode : 132 pour un multiple, 1584 pt pour une valeur exacte.
    for (const radio of radios) {
      radio.addEventListener('change', () => {
        if (radio.checked) value.input.setAttribute('max', String(maxFor(draft.kind)));
      });
    }
    const alert = createAlert();
    const invalidMessage = (): string =>
      editor.i18n.t('ui.lineSpacing.invalid', { max: maxFor(draft.kind) });
    value.input.addEventListener('input', () => {
      draft.value = value.input.value;
      if (error) {
        error = false;
        alert.setAttribute('hidden', '');
        value.input.removeAttribute('aria-invalid');
      }
    });
    if (error) {
      alert.textContent = invalidMessage();
      alert.removeAttribute('hidden');
      value.input.setAttribute('aria-invalid', 'true');
    }
    value.wrapper.append(alert);

    const submit = (): void => {
      const parsed = parseNumberInput(value.input.value);
      const kind = radios.find((radio) => radio.checked)?.value === 'exact' ? 'exact' : 'multiple';
      if (parsed === null || parsed === 'invalid' || parsed <= 0 || parsed > maxFor(kind)) {
        error = true;
        flagInvalid(value.input, alert, invalidMessage());
        return;
      }
      setBlockLayout(
        editor,
        kind === 'exact'
          ? { lineHeightPt: parsed, lineHeight: null }
          : { lineHeight: parsed, lineHeightPt: null },
      );
      finish(dropdown);
    };
    submitOnEnter([value.input], submit);

    const ok = createPlainButton({
      className: 'aster-dialog__button aster-dialog__button--primary',
      text: t('ui.lineSpacing.ok'),
    });
    ok.addEventListener('click', submit);
    const cancel = createPlainButton({
      className: 'aster-dialog__button',
      text: t('ui.lineSpacing.cancel'),
    });
    cancel.addEventListener('click', () => {
      reset();
      dropdown.close(true);
    });

    panel.append(
      kinds,
      value.wrapper,
      el('div', { className: 'aster-dialog__actions' }, [cancel, ok]),
    );
  };

  const dropdown = createDropdown({
    editor,
    labelKey: 'ui.lineSpacing.label',
    icon: 'line-spacing',
    panelClass: 'aster-menu aster-line-spacing',
    // Le formulaire « Personnalisé » n'est pas reconstruit à chaque `update()`
    // (`selectionChange`…) : le champ resterait détaché, le focus tomberait sur `body`.
    shouldRerender: () => mode === 'list',
    isEnabled: () => canEditBlockLayout(editor),
    isActive: () => {
      const state = currentLineSpacing(editor);
      return state.lineHeight !== null || state.lineHeightPt !== null;
    },
    renderPanel: (panel, self) => {
      panel.setAttribute('aria-label', editor.i18n.t('ui.lineSpacing.label'));
      // Le rôle suit le contenu : liste = `menu` (navigation flèches), formulaire = `dialog`.
      panel.setAttribute('role', mode === 'list' ? 'menu' : 'dialog');
      panel.classList.toggle('aster-line-spacing--custom', mode === 'custom');
      if (mode === 'list') renderList(panel, self);
      else renderForm(panel, self);
    },
  });

  // Fermeture par le dropdown lui-même (Échap, clic extérieur, focus perdu) : le
  // formulaire repart vierge à la prochaine ouverture (écouté en capture, avant le dropdown).
  const ensureFresh = (): void => {
    if (!dropdown.isOpen()) reset();
  };
  dropdown.trigger.addEventListener('click', ensureFresh, true);
  dropdown.trigger.addEventListener('keydown', ensureFresh, true);

  return {
    element: dropdown.element,
    update: () => {
      ensureFresh();
      dropdown.update();
    },
    destroy: () => {
      dropdown.trigger.removeEventListener('click', ensureFresh, true);
      dropdown.trigger.removeEventListener('keydown', ensureFresh, true);
      dropdown.destroy();
    },
  };
}
