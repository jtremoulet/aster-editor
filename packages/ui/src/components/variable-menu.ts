import type { AsterEditor, AsterVariable } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el } from '../utils/dom';
import { createPlainButton } from './button';
import { createDropdown, createMenuItem, type Dropdown } from './dropdown';

/** Nom de variable valide : même règle que `isValidVariableName` du core. */
export const VARIABLE_NAME_PATTERN = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u;

/**
 * Nom sondé pour savoir si le core accepte une variable non déclarée : le contrat
 * n'expose pas `allowUnknown`, on interroge `canRun('variable.insert')` avec un nom valide
 * qu'aucun intégrateur ne déclare.
 */
const PROBE_NAME = '_aster_probe';

/** Vrai si `value` est un nom de variable acceptable (après `trim`). */
export function isAcceptableVariableName(value: string): boolean {
  return VARIABLE_NAME_PATTERN.test(value.trim());
}

/** Vrai si le core accepte l'insertion d'une variable non déclarée (`allowUnknown`). */
export function allowsUnknownVariables(editor: AsterEditor): boolean {
  return editor.commands.canRun('variable.insert', { name: PROBE_NAME });
}

/** Texte `{{nom}}` affiché en secondaire dans les menus. */
export function placeholderText(name: string): string {
  return `{{${name}}}`;
}

/** Brouillon du formulaire « Nouvelle variable », conservé entre deux rendus du panneau. */
interface Draft {
  name: string;
  label: string;
}

/**
 * Entrée de menu décrivant une variable : libellé, nom `{{nom}}` en secondaire, valeur
 * courante si connue, sinon pastille « sans valeur ». Partagée avec le panneau de suggestion.
 */
export function renderVariableEntry(
  editor: AsterEditor,
  variable: AsterVariable,
  target: HTMLElement,
): void {
  const t = (key: string): string => editor.i18n.t(key);
  target.append(
    el('span', { className: 'aster-variable-entry__label', text: variable.label ?? variable.name }),
    el('span', { className: 'aster-variable-entry__name', text: placeholderText(variable.name) }),
  );
  if (variable.value !== undefined) {
    target.append(el('span', { className: 'aster-variable-entry__value', text: variable.value }));
  } else {
    target.append(
      el('span', {
        className: 'aster-variable-entry__unresolved',
        text: t('ui.variable.unresolved'),
      }),
    );
  }
  if (variable.description) target.title = variable.description;
}

/**
 * Widget `variable` : dropdown `menu` listant `editor.variables.list()` (libellé, nom,
 * valeur ou pastille « sans valeur »), clic → `variable.insert`. Une entrée « Nouvelle
 * variable… » (si le core accepte les noms non déclarés) bascule le panneau sur un
 * mini-formulaire nom + libellé validé par `VARIABLE_NAME_PATTERN`. Le déclencheur est
 * « enfoncé » quand le curseur est sur une puce (`variable.remove` actif). Resynchronisé
 * sur `variablesChange`.
 */
export function createVariableMenu(editor: AsterEditor): ToolbarWidget {
  let mode: 'list' | 'create' = 'list';
  const draft: Draft = { name: '', label: '' };
  let error: string | null = null;

  const reset = (): void => {
    mode = 'list';
    draft.name = '';
    draft.label = '';
    error = null;
  };

  const insert = (dropdown: Dropdown, name: string, label?: string): void => {
    editor.commands.run('variable.insert', label ? { name, label } : { name });
    reset();
    dropdown.close(false);
    editor.focus();
  };

  const renderList = (panel: HTMLElement, dropdown: Dropdown): void => {
    const t = (key: string): string => editor.i18n.t(key);
    const list = editor.variables.list();
    if (list.length === 0) {
      panel.append(
        el('div', {
          className: 'aster-menu__empty aster-variable-menu__empty',
          text: t('ui.variable.empty'),
        }),
      );
    }
    for (const variable of list) {
      const item = createMenuItem({
        className: 'aster-variable-menu__item',
        disabled: !editor.commands.canRun('variable.insert', { name: variable.name }),
        onSelect: () => insert(dropdown, variable.name, variable.label),
        text: '',
      });
      // `createMenuItem` pose un `.aster-toolbar__text` vide : on le remplace par l'entrée riche.
      item.querySelector('.aster-toolbar__text')?.remove();
      renderVariableEntry(editor, variable, item);
      item.dataset['name'] = variable.name;
      panel.append(item);
    }
    if (allowsUnknownVariables(editor)) {
      panel.append(
        createMenuItem({
          className: 'aster-variable-menu__new',
          icon: 'variable-insert',
          text: t('ui.variable.new'),
          onSelect: () => {
            mode = 'create';
            dropdown.update();
            panel.querySelector<HTMLInputElement>('input')?.focus();
          },
        }),
      );
    }
  };

  const renderForm = (panel: HTMLElement, dropdown: Dropdown): void => {
    const t = (key: string): string => editor.i18n.t(key);
    const suffix = Math.random().toString(36).slice(2, 8);
    const nameId = `aster-variable-name-${suffix}`;
    const labelId = `aster-variable-label-${suffix}`;
    const nameInput = el('input', {
      className: 'aster-dialog__input aster-variable-menu__name',
      attrs: { type: 'text', id: nameId, autocomplete: 'off', spellcheck: 'false' },
    });
    nameInput.value = draft.name;
    const labelInput = el('input', {
      className: 'aster-dialog__input aster-variable-menu__label',
      attrs: { type: 'text', id: labelId, autocomplete: 'off' },
    });
    labelInput.value = draft.label;
    const alert = el('div', { className: 'aster-dialog__error', attrs: { role: 'alert' } });
    if (error) alert.textContent = error;
    else alert.setAttribute('hidden', '');

    const showError = (message: string): void => {
      error = message;
      alert.textContent = message;
      alert.removeAttribute('hidden');
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
    };

    const submit = (): void => {
      const name = nameInput.value.trim();
      const label = labelInput.value.trim();
      if (!isAcceptableVariableName(name)) {
        showError(t('ui.variable.invalidName'));
        return;
      }
      if (!editor.commands.canRun('variable.insert', { name })) {
        showError(t('ui.variable.notAllowed'));
        return;
      }
      insert(dropdown, name, label || undefined);
    };

    nameInput.addEventListener('input', () => {
      draft.name = nameInput.value;
      if (error) {
        error = null;
        alert.setAttribute('hidden', '');
        nameInput.removeAttribute('aria-invalid');
      }
    });
    labelInput.addEventListener('input', () => {
      draft.label = labelInput.value;
    });
    for (const input of [nameInput, labelInput]) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });
    }

    const ok = createPlainButton({
      className: 'aster-dialog__button aster-dialog__button--primary',
      text: t('ui.variable.insert'),
    });
    ok.addEventListener('click', submit);
    const cancel = createPlainButton({
      className: 'aster-dialog__button',
      text: t('ui.variable.cancel'),
    });
    cancel.addEventListener('click', () => {
      reset();
      dropdown.close(true);
    });

    panel.append(
      el('div', { className: 'aster-dialog__field' }, [
        el('label', {
          className: 'aster-dialog__label',
          attrs: { for: nameId },
          text: t('ui.variable.name'),
        }),
        nameInput,
        alert,
      ]),
      el('div', { className: 'aster-dialog__field' }, [
        el('label', {
          className: 'aster-dialog__label',
          attrs: { for: labelId },
          text: t('ui.variable.label'),
        }),
        labelInput,
      ]),
      el('div', { className: 'aster-dialog__actions' }, [cancel, ok]),
    );
  };

  const dropdown = createDropdown({
    editor,
    labelKey: 'ui.variable.menu',
    icon: 'variable',
    panelClass: 'aster-menu aster-variable-menu',
    isEnabled: () =>
      !editor.isReadOnly() &&
      (allowsUnknownVariables(editor) ||
        editor.variables
          .list()
          .some((variable) => editor.commands.canRun('variable.insert', { name: variable.name }))),
    isActive: () => editor.commands.isActive('variable.remove'),
    renderPanel: (panel, self) => {
      panel.setAttribute('aria-label', editor.i18n.t('ui.variable.menu'));
      // Le rôle suit le contenu : liste = `menu` (navigation flèches), formulaire = `dialog`.
      panel.setAttribute('role', mode === 'list' ? 'menu' : 'dialog');
      panel.classList.toggle('aster-variable-menu--create', mode === 'create');
      if (mode === 'list') renderList(panel, self);
      else renderForm(panel, self);
    },
  });

  // Fermeture par le dropdown lui-même (Échap, clic extérieur, focus perdu) : le
  // formulaire repart vierge à la prochaine ouverture, quel que soit le chemin (clic ou
  // flèche bas sur le déclencheur, écouté en capture avant le dropdown).
  const ensureFresh = (): void => {
    if (!dropdown.isOpen()) reset();
  };
  dropdown.trigger.addEventListener('click', ensureFresh, true);
  dropdown.trigger.addEventListener('keydown', ensureFresh, true);

  const unsubscribe = editor.on('variablesChange', () => dropdown.update());

  return {
    element: dropdown.element,
    update: () => {
      ensureFresh();
      dropdown.update();
    },
    destroy: () => {
      unsubscribe();
      dropdown.trigger.removeEventListener('click', ensureFresh, true);
      dropdown.trigger.removeEventListener('keydown', ensureFresh, true);
      dropdown.destroy();
    },
  };
}
