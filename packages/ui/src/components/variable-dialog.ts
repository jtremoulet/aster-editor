import { VARIABLE_EDIT_EVENT, variableLabel } from '@aster-editor/core';
import type {
  AsterEditor,
  AsterVariable,
  Unsubscribe,
  VariableEditEventDetail,
} from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { clear, el } from '../utils/dom';
import { isRecord } from '../utils/guards';
import { createPlainButton, setDisabled } from './button';
import { clampToViewport } from './table-context-menu';
import { placeholderText } from './variable-menu';

// Réexportés pour les intégrateurs de `ui` : la source de vérité est le core.
export { VARIABLE_EDIT_EVENT } from '@aster-editor/core';
export type { VariableEditEventDetail } from '@aster-editor/core';

/** Dialogue d'édition de puce monté sur un éditeur. */
export interface VariableDialog extends ToolbarWidget {
  /** Ouvre le dialogue pour la puce décrite, ancré sous `anchor` (sinon sous la puce trouvée). */
  open(detail: VariableEditEventDetail, anchor?: HTMLElement | null): void;
  close(focusEditor?: boolean): void;
  isOpen(): boolean;
}

/** Espace entre la puce et le dialogue, en pixels. */
const PANEL_OFFSET = 4;

/** Vrai si `value` est un détail d'événement valide. */
function isEditDetail(value: unknown): value is VariableEditEventDetail {
  return isRecord(value) && typeof value['pos'] === 'number' && typeof value['name'] === 'string';
}

/**
 * Élément DOM de la puce à `pos` : NodeView via `view.nodeDOM`, sinon première puce du
 * contenu portant ce nom, sinon le contenu lui-même. Tolérant si l'extension manque.
 */
function findAnchor(editor: AsterEditor, detail: VariableEditEventDetail): HTMLElement {
  try {
    const tiptap: unknown = editor.tiptap;
    if (isRecord(tiptap) && isRecord(tiptap['view'])) {
      const dom: unknown = editor.tiptap.view.nodeDOM(detail.pos);
      if (dom instanceof HTMLElement) return dom;
    }
  } catch {
    // Vue absente ou position hors document : on retombe sur la recherche DOM.
  }
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(detail.name)
      : detail.name.replace(/["\\]/g, '\\$&');
  return (
    editor.contentElement.querySelector<HTMLElement>(`.aster-variable[data-name="${escaped}"]`) ??
    editor.contentElement
  );
}

/**
 * Met à jour l'attribut `label` du nœud `variable` à `pos` par une transaction
 * ProseMirror. Faux si la vue n'est pas disponible (mock) ou si le nœud n'est pas une
 * variable : la déclaration du magasin reste alors la seule source du libellé.
 */
function updateNodeLabel(editor: AsterEditor, pos: number, label: string | undefined): boolean {
  try {
    const tiptap: unknown = editor.tiptap;
    if (!isRecord(tiptap) || !isRecord(tiptap['state']) || !isRecord(tiptap['view'])) return false;
    const { state, view } = editor.tiptap;
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'variable') return false;
    view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: label ?? null }));
    return true;
  } catch {
    return false;
  }
}

/** Variable du magasin portant ce nom, ou une déclaration minimale. */
function variableNamed(editor: AsterEditor, name: string): AsterVariable {
  return editor.variables.list().find((variable) => variable.name === name) ?? { name };
}

/**
 * Libellé porté par le nœud `variable` à `pos` : la puce est la source de vérité (une
 * puce non déclarée insérée avec un libellé n'existe pas dans le magasin). `null` si le
 * nœud n'a pas de libellé, `undefined` si la vue n'est pas disponible (mock) ou si le
 * nœud n'est pas une variable.
 */
function nodeLabel(editor: AsterEditor, pos: number): string | null | undefined {
  try {
    const tiptap: unknown = editor.tiptap;
    if (!isRecord(tiptap) || !isRecord(tiptap['state'])) return undefined;
    const node = editor.tiptap.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'variable') return undefined;
    return variableLabel(node);
  } catch {
    return undefined;
  }
}

/** Saisie en cours, conservée quand le dialogue est reconstruit (changement de locale). */
interface DialogDraft {
  readonly label: string;
  readonly value: string;
  readonly focused: 'label' | 'value' | null;
}

/**
 * Édition d'une puce : sur `aster:variable-edit` (double-clic, émis par le core), un
 * panneau `dialog` s'ouvre sous la puce avec le libellé (celui du nœud, sinon celui du
 * magasin) et la valeur modifiables, et un bouton « Supprimer ». Appliquer →
 * `variables.setValues({ [name]: value })` (vide efface) et, si le libellé change, mise à
 * jour du nœud et de la déclaration (`define([{ name, label }])`, sans `value` pour ne
 * pas ressusciter une valeur effacée). Supprimer → `variable.remove` (le core a
 * sélectionné la puce). Retraduit sur `localeChange` tant qu'il est ouvert, saisie
 * conservée. Fermé à Échap, au clic extérieur, après action et au `destroy`. Monté par
 * `createAster`, utilisable seul.
 */
export function createVariableDialog(editor: AsterEditor): VariableDialog {
  const panel = el('div', {
    className: 'aster-dialog aster-variable-dialog',
    attrs: { role: 'dialog', hidden: '' },
  });
  let opened = false;
  let current: VariableEditEventDetail | null = null;
  // Abonné à `localeChange` seulement tant que le dialogue est ouvert.
  let unsubscribeLocale: Unsubscribe | null = null;

  const onDocumentMouseDown = (event: MouseEvent): void => {
    if (!(event.target instanceof Node) || !panel.contains(event.target)) close(false);
  };

  const close = (focusEditor = false): void => {
    if (!opened) return;
    opened = false;
    current = null;
    unsubscribeLocale?.();
    unsubscribeLocale = null;
    panel.setAttribute('hidden', '');
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    clear(panel);
    if (focusEditor) editor.focus();
  };

  const position = (anchor: HTMLElement): void => {
    const rect = anchor.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    panel.style.left = `${clampToViewport(rect.left, size.width, window.innerWidth)}px`;
    panel.style.top = `${clampToViewport(rect.bottom + PANEL_OFFSET, size.height, window.innerHeight)}px`;
  };

  const render = (detail: VariableEditEventDetail, draft?: DialogDraft): void => {
    const t = (key: string): string => editor.i18n.t(key);
    const { name } = detail;
    const declared = variableNamed(editor, name);
    const initialLabel = nodeLabel(editor, detail.pos) ?? declared.label ?? '';
    const initialValue = declared.value ?? '';
    const suffix = Math.random().toString(36).slice(2, 8);
    const labelId = `aster-variable-edit-label-${suffix}`;
    const valueId = `aster-variable-edit-value-${suffix}`;
    panel.setAttribute('aria-label', t('ui.variable.edit'));

    const title = el('div', { className: 'aster-variable-dialog__title' }, [
      el('span', { className: 'aster-variable-entry__name', text: placeholderText(name) }),
    ]);
    const labelInput = el('input', {
      className: 'aster-dialog__input aster-variable-dialog__label',
      attrs: { type: 'text', id: labelId, autocomplete: 'off' },
    });
    labelInput.value = draft ? draft.label : initialLabel;
    const valueInput = el('input', {
      className: 'aster-dialog__input aster-variable-dialog__value',
      attrs: { type: 'text', id: valueId, autocomplete: 'off' },
    });
    valueInput.value = draft ? draft.value : initialValue;

    const apply = (): void => {
      const label = labelInput.value.trim();
      const value = valueInput.value;
      if (label !== initialLabel) {
        const next = label || undefined;
        updateNodeLabel(editor, detail.pos, next);
        editor.variables.define([{ name, label: next }]);
      }
      if (value !== initialValue) {
        editor.variables.setValues({ [name]: value === '' ? undefined : value });
      }
      close(true);
    };

    for (const input of [labelInput, valueInput]) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          apply();
        }
      });
    }

    const ok = createPlainButton({
      className: 'aster-dialog__button aster-dialog__button--primary',
      text: t('ui.variable.apply'),
    });
    ok.addEventListener('click', apply);
    const cancel = createPlainButton({
      className: 'aster-dialog__button',
      text: t('ui.variable.cancel'),
    });
    cancel.addEventListener('click', () => close(true));
    const remove = createPlainButton({
      className: 'aster-dialog__button aster-dialog__button--danger',
      text: t('ui.variable.remove'),
    });
    setDisabled(remove, !editor.commands.canRun('variable.remove'));
    remove.addEventListener('click', () => {
      editor.commands.run('variable.remove');
      close(true);
    });

    panel.append(
      title,
      el('div', { className: 'aster-dialog__field' }, [
        el('label', {
          className: 'aster-dialog__label',
          attrs: { for: labelId },
          text: t('ui.variable.label'),
        }),
        labelInput,
      ]),
      el('div', { className: 'aster-dialog__field' }, [
        el('label', {
          className: 'aster-dialog__label',
          attrs: { for: valueId },
          text: t('ui.variable.value'),
        }),
        valueInput,
      ]),
      el('div', { className: 'aster-dialog__actions' }, [remove, cancel, ok]),
    );
  };

  const input = (kind: 'label' | 'value'): HTMLInputElement | null =>
    panel.querySelector<HTMLInputElement>(`.aster-variable-dialog__${kind}`);

  /** Reconstruit le dialogue ouvert dans la nouvelle locale, saisie et focus conservés. */
  const retranslate = (): void => {
    if (!opened || !current) return;
    const label = input('label');
    const value = input('value');
    const draft: DialogDraft = {
      label: label?.value ?? '',
      value: value?.value ?? '',
      focused:
        document.activeElement === value
          ? 'value'
          : document.activeElement === label
            ? 'label'
            : null,
    };
    clear(panel);
    render(current, draft);
    if (draft.focused) input(draft.focused)?.focus();
  };

  const open = (detail: VariableEditEventDetail, anchor?: HTMLElement | null): void => {
    close(false);
    if (editor.isReadOnly()) return;
    opened = true;
    current = detail;
    clear(panel);
    render(detail);
    panel.removeAttribute('hidden');
    if (!panel.isConnected) editor.element.append(panel);
    position(anchor ?? findAnchor(editor, detail));
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    unsubscribeLocale = editor.on('localeChange', retranslate);
    input('label')?.focus();
  };

  const onVariableEdit = (event: Event): void => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!isEditDetail(detail)) return;
    open(detail);
  };

  const onPanelKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  editor.element.addEventListener(VARIABLE_EDIT_EVENT, onVariableEdit);
  panel.addEventListener('keydown', onPanelKeyDown);

  return {
    element: panel,
    open,
    close,
    isOpen: () => opened,
    update: () => {
      if (opened && editor.isReadOnly()) close(false);
    },
    destroy: () => {
      close(false);
      editor.element.removeEventListener(VARIABLE_EDIT_EVENT, onVariableEdit);
      panel.removeEventListener('keydown', onPanelKeyDown);
      panel.remove();
    },
  };
}
