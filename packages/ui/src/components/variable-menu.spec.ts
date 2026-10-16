import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AsterVariable } from '@aster-editor/core';
import { createMockEditor, type MockEditor, type MockEditorOptions } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import {
  allowsUnknownVariables,
  createVariableMenu,
  isAcceptableVariableName,
  placeholderText,
} from './variable-menu';

const VARIABLES: readonly AsterVariable[] = [
  { name: 'client.name', label: 'Client name', description: 'Full name of the client' },
  { name: 'date', value: '2026-10-16' },
];

describe('isAcceptableVariableName', () => {
  it('accepte lettres, chiffres, _ . - et refuse espaces, vide, accolades', () => {
    expect(isAcceptableVariableName('client.name')).toBe(true);
    expect(isAcceptableVariableName('  prénom_2 ')).toBe(true);
    expect(isAcceptableVariableName('a-b')).toBe(true);
    expect(isAcceptableVariableName('-a')).toBe(false);
    expect(isAcceptableVariableName('')).toBe(false);
    expect(isAcceptableVariableName('two words')).toBe(false);
    expect(isAcceptableVariableName('{{x}}')).toBe(false);
  });

  it('placeholderText entoure le nom de doubles accolades', () => {
    expect(placeholderText('x')).toBe('{{x}}');
  });
});

describe('createVariableMenu', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  const mount = (options: MockEditorOptions = {}): void => {
    editor = createMockEditor({ variables: VARIABLES, ...options });
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    widget = createVariableMenu(editor);
    host.append(widget.element);
  };

  beforeEach(() => mount());

  afterEach(() => {
    widget.destroy();
    host.remove();
  });

  const trigger = (): HTMLButtonElement =>
    widget.element.querySelector<HTMLButtonElement>('.aster-dropdown__trigger')!;
  const panel = (): HTMLElement =>
    widget.element.querySelector<HTMLElement>('.aster-dropdown__panel')!;
  const items = (): HTMLButtonElement[] =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('.aster-variable-menu__item'));
  const newEntry = (): HTMLButtonElement | null =>
    panel().querySelector<HTMLButtonElement>('.aster-variable-menu__new');
  const input = (name: 'name' | 'label'): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`.aster-variable-menu__${name}`)!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('.aster-dialog__button')).find(
      (b) => b.textContent === text,
    )!;
  const open = (): void => trigger().click();

  it('liste les variables du magasin : libellé, nom, valeur ou pastille « sans valeur »', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Variables');
    expect(trigger().querySelector('.aster-toolbar__icon svg')).not.toBeNull();
    open();
    expect(panel().getAttribute('role')).toBe('menu');
    expect(panel().getAttribute('aria-label')).toBe('Variables');
    const [first, second] = items();
    expect(items().length).toBe(2);
    expect(first?.dataset['name']).toBe('client.name');
    expect(first?.querySelector('.aster-variable-entry__label')?.textContent).toBe('Client name');
    expect(first?.querySelector('.aster-variable-entry__name')?.textContent).toBe(
      '{{client.name}}',
    );
    expect(first?.querySelector('.aster-variable-entry__unresolved')?.textContent).toBe('No value');
    expect(first?.title).toBe('Full name of the client');
    expect(second?.querySelector('.aster-variable-entry__label')?.textContent).toBe('date');
    expect(second?.querySelector('.aster-variable-entry__value')?.textContent).toBe('2026-10-16');
    expect(second?.querySelector('.aster-variable-entry__unresolved')).toBeNull();
    expect(document.activeElement).toBe(first);
  });

  it('un clic insère la variable avec son libellé, ferme et rend le focus', () => {
    open();
    items()[0]?.click();
    expect(editor.calls).toEqual([
      { id: 'variable.insert', args: { name: 'client.name', label: 'Client name' } },
    ]);
    expect(panel().hasAttribute('hidden')).toBe(true);
    expect(editor.focusCalls).toBe(1);
    open();
    items()[1]?.click();
    expect(editor.calls[1]).toEqual({ id: 'variable.insert', args: { name: 'date' } });
  });

  it('se resynchronise sur variablesChange, panneau ouvert ou non', () => {
    open();
    editor.variables.setValues({ 'client.name': 'ACME' });
    expect(items()[0]?.querySelector('.aster-variable-entry__value')?.textContent).toBe('ACME');
    expect(items()[0]?.querySelector('.aster-variable-entry__unresolved')).toBeNull();
    editor.variables.define([{ name: 'city', label: 'City' }]);
    expect(items().length).toBe(3);
    expect(items()[2]?.dataset['name']).toBe('city');
  });

  it('propose « Nouvelle variable… » et valide le nom saisi', () => {
    open();
    expect(newEntry()?.textContent).toBe('New variable…');
    newEntry()?.click();
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().classList.contains('aster-variable-menu--create')).toBe(true);
    expect(document.activeElement).toBe(input('name'));
    input('name').value = 'bad name';
    button('Insert').click();
    expect(editor.calls).toEqual([]);
    const alert = panel().querySelector('[role="alert"]');
    expect(alert?.hasAttribute('hidden')).toBe(false);
    expect(alert?.textContent).toContain('Invalid name');
    expect(input('name').getAttribute('aria-invalid')).toBe('true');
    input('name').value = 'city';
    input('name').dispatchEvent(new Event('input'));
    expect(alert?.hasAttribute('hidden')).toBe(true);
    input('label').value = ' City ';
    input('label').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(editor.calls).toEqual([
      { id: 'variable.insert', args: { name: 'city', label: 'City' } },
    ]);
    expect(panel().hasAttribute('hidden')).toBe(true);
    expect(editor.presentVariables.has('city')).toBe(true);
    // La liste revient vierge à la prochaine ouverture.
    open();
    expect(panel().getAttribute('role')).toBe('menu');
    expect(items().length).toBe(3);
  });

  it('un nom vide de libellé insère sans libellé ; Annuler revient au déclencheur', () => {
    open();
    newEntry()?.click();
    input('name').value = 'ref';
    button('Insert').click();
    expect(editor.calls).toEqual([{ id: 'variable.insert', args: { name: 'ref' } }]);
    open();
    newEntry()?.click();
    button('Cancel').click();
    expect(panel().hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('le brouillon survit à un update() et Échap ferme le formulaire', () => {
    open();
    newEntry()?.click();
    input('name').value = 'draft';
    input('name').dispatchEvent(new Event('input'));
    editor.emit('selectionChange', { editor });
    expect(input('name').value).toBe('draft');
    input('name').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(panel().hasAttribute('hidden')).toBe(true);
    trigger().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(panel().getAttribute('role')).toBe('menu');
    expect(items().length).toBe(2);
  });

  it('sans allowUnknown : pas de création, refus d’un nom non déclaré, désactivé si rien à insérer', () => {
    widget.destroy();
    host.remove();
    mount({ allowUnknownVariables: false });
    expect(allowsUnknownVariables(editor)).toBe(false);
    open();
    expect(newEntry()).toBeNull();
    expect(items().length).toBe(2);
    expect(trigger().disabled).toBe(false);

    widget.destroy();
    host.remove();
    mount({ allowUnknownVariables: false, variables: [] });
    expect(trigger().disabled).toBe(true);
  });

  it('affiche « Aucune variable » sur une liste vide, avec la création si autorisée', () => {
    widget.destroy();
    host.remove();
    mount({ variables: [] });
    expect(trigger().disabled).toBe(false);
    open();
    expect(panel().querySelector('.aster-variable-menu__empty')?.textContent).toBe('No variable');
    expect(newEntry()).not.toBeNull();
    expect(document.activeElement).toBe(newEntry());
  });

  it('aria-pressed suit variable.remove (curseur sur une puce), désactivé en lecture seule', () => {
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    editor.active.add('variable.remove');
    widget.update();
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    editor.setReadOnly(true);
    widget.update();
    expect(trigger().disabled).toBe(true);
  });

  it('les libellés suivent la locale', () => {
    editor.i18n.setLocale('fr');
    widget.update();
    open();
    expect(newEntry()?.textContent).toBe('Nouvelle variable…');
    expect(items()[0]?.querySelector('.aster-variable-entry__unresolved')?.textContent).toBe(
      'Sans valeur',
    );
  });

  it('destroy se désabonne de variablesChange', () => {
    expect(editor.listenerCount()).toBe(1);
    widget.destroy();
    expect(editor.listenerCount()).toBe(0);
  });
});
