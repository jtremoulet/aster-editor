import type { AsterEditor, AsterVariable } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el } from '../utils/dom';
import { createPlainButton, setDisabled } from './button';
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
 * Liste rendue et mise en cache : le dropdown reconstruit son panneau `menu` ouvert à
 * chaque `update()` (sélection, lecture seule, locale…), ce qui coûte cher avec des
 * centaines de variables. Tant que `key` n'a pas changé, les mêmes nœuds sont réinsérés
 * et seul leur état `disabled` est recalculé.
 */
interface RenderedList {
  readonly key: string;
  readonly nodes: readonly HTMLElement[];
  readonly items: readonly { readonly element: HTMLButtonElement; readonly name: string }[];
}

/** Clé de cache d'une liste : locale, création autorisée, puis `name|label|value|description`. */
function listKey(
  editor: AsterEditor,
  list: readonly AsterVariable[],
  allowCreate: boolean,
): string {
  return [
    editor.i18n.getLocale(),
    allowCreate ? 'create' : 'no-create',
    ...list.map(
      (variable) =>
        `${variable.name}|${variable.label ?? ''}|${variable.value ?? ''}|${variable.description ?? ''}`,
    ),
  ].join('\n');
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
  let rendered: RenderedList | null = null;

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

  /** Construit les nœuds de la liste pour `list`, sans les insérer dans le panneau. */
  const buildList = (
    panel: HTMLElement,
    dropdown: Dropdown,
    list: readonly AsterVariable[],
    allowCreate: boolean,
  ): Omit<RenderedList, 'key'> => {
    const t = (key: string): string => editor.i18n.t(key);
    const nodes: HTMLElement[] = [];
    const items: { element: HTMLButtonElement; name: string }[] = [];
    if (list.length === 0) {
      nodes.push(
        el('div', {
          className: 'aster-menu__empty aster-variable-menu__empty',
          text: t('ui.variable.empty'),
        }),
      );
    }
    for (const variable of list) {
      const item = createMenuItem({
        className: 'aster-variable-menu__item',
        onSelect: () => insert(dropdown, variable.name, variable.label),
        text: '',
      });
      // `createMenuItem` pose un `.aster-toolbar__text` vide : on le remplace par l'entrée riche.
      item.querySelector('.aster-toolbar__text')?.remove();
      renderVariableEntry(editor, variable, item);
      item.dataset['name'] = variable.name;
      nodes.push(item);
      items.push({ element: item, name: variable.name });
    }
    if (allowCreate) {
      nodes.push(
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
    return { nodes, items };
  };

  const renderList = (panel: HTMLElement, dropdown: Dropdown): void => {
    const list = editor.variables.list();
    const allowCreate = allowsUnknownVariables(editor);
    const key = listKey(editor, list, allowCreate);
    if (!rendered || rendered.key !== key) {
      rendered = { key, ...buildList(panel, dropdown, list, allowCreate) };
    }
    // Les états (`canRun`) peuvent changer sans que la liste bouge : recalculés à chaque fois.
    for (const { element, name } of rendered.items) {
      setDisabled(element, !editor.commands.canRun('variable.insert', { name }));
    }
    panel.append(...rendered.nodes);
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

  const isEnabled = (): boolean =>
    !editor.isReadOnly() &&
    (allowsUnknownVariables(editor) ||
      editor.variables
        .list()
        .some((variable) => editor.commands.canRun('variable.insert', { name: variable.name })));
  const isActive = (): boolean => editor.commands.isActive('variable.remove');

  const dropdown = createDropdown({
    editor,
    labelKey: 'ui.variable.menu',
    icon: 'variable',
    panelClass: 'aster-menu aster-variable-menu',
    isEnabled,
    isActive,
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

  /**
   * Liste ouverte et inchangée (même clé que le dernier rendu) : le dropdown
   * reconstruirait tout le panneau à chaque `selectionChange`, coûteux avec des
   * centaines d'entrées. On ne rafraîchit alors que les états : `disabled` des entrées et
   * `aria-pressed` du déclencheur. Faux si une reconstruction complète s'impose (panneau
   * fermé, formulaire, liste changée, dropdown à désactiver).
   */
  const refreshStatesOnly = (): boolean => {
    if (!dropdown.isOpen() || mode !== 'list' || !rendered || !isEnabled()) return false;
    const list = editor.variables.list();
    if (listKey(editor, list, allowsUnknownVariables(editor)) !== rendered.key) return false;
    for (const { element, name } of rendered.items) {
      setDisabled(element, !editor.commands.canRun('variable.insert', { name }));
    }
    const active = isActive();
    dropdown.trigger.setAttribute('aria-pressed', active ? 'true' : 'false');
    dropdown.trigger.classList.toggle('aster-toolbar__button--active', active);
    return true;
  };

  const update = (): void => {
    ensureFresh();
    if (!refreshStatesOnly()) dropdown.update();
  };

  const unsubscribe = editor.on('variablesChange', update);

  return {
    element: dropdown.element,
    update,
    destroy: () => {
      unsubscribe();
      dropdown.trigger.removeEventListener('click', ensureFresh, true);
      dropdown.trigger.removeEventListener('keydown', ensureFresh, true);
      dropdown.destroy();
    },
  };
}
