import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import { VARIABLE_EDIT_EVENT, createVariableDialog, type VariableDialog } from './variable-dialog';

describe('createVariableDialog', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let dialog: VariableDialog;
  let chip: HTMLElement;

  beforeEach(() => {
    editor = createMockEditor({
      variables: [{ name: 'client.name', label: 'Client name' }],
      variableValues: { date: '2026-10-16' },
    });
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    host.append(editor.element);
    chip = document.createElement('span');
    chip.className = 'aster-variable aster-variable--unresolved';
    chip.dataset['name'] = 'client.name';
    chip.getBoundingClientRect = (): DOMRect =>
      ({ left: 30, top: 10, right: 90, bottom: 30, width: 60, height: 20 }) as DOMRect;
    editor.contentElement.append(chip);
    editor.presentVariables.add('client.name');
    dialog = createVariableDialog(editor);
  });

  afterEach(() => {
    dialog.destroy();
    host.remove();
  });

  const edit = (name: string, pos = 1): CustomEvent =>
    new CustomEvent(VARIABLE_EDIT_EVENT, { bubbles: true, detail: { pos, name } });
  const input = (kind: 'label' | 'value'): HTMLInputElement =>
    dialog.element.querySelector<HTMLInputElement>(`.aster-variable-dialog__${kind}`)!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(dialog.element.querySelectorAll<HTMLButtonElement>('.aster-dialog__button')).find(
      (b) => b.textContent === text,
    )!;

  it('s’ouvre sur aster:variable-edit sous la puce, prérempli, focus sur le libellé', () => {
    expect(dialog.isOpen()).toBe(false);
    editor.contentElement.dispatchEvent(edit('client.name'));
    expect(dialog.isOpen()).toBe(true);
    expect(editor.element.contains(dialog.element)).toBe(true);
    expect(dialog.element.getAttribute('role')).toBe('dialog');
    expect(dialog.element.getAttribute('aria-label')).toBe('Edit variable');
    expect(dialog.element.querySelector('.aster-variable-dialog__title')?.textContent).toBe(
      '{{client.name}}',
    );
    expect(input('label').value).toBe('Client name');
    expect(input('value').value).toBe('');
    expect(document.activeElement).toBe(input('label'));
    expect(dialog.element.style.left).toBe('30px');
    expect(dialog.element.style.top).toBe('34px');
    expect(button('Remove').disabled).toBe(false);
  });

  it('Appliquer pousse la valeur dans le magasin et ferme en rendant le focus', () => {
    editor.contentElement.dispatchEvent(edit('client.name'));
    input('value').value = 'ACME';
    button('Apply').click();
    expect(editor.variables.getValues()).toEqual({ date: '2026-10-16', 'client.name': 'ACME' });
    expect(dialog.isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
    // Une valeur vidée efface la valeur ; Entrée vaut Appliquer.
    editor.contentElement.dispatchEvent(edit('client.name'));
    expect(input('value').value).toBe('ACME');
    input('value').value = '';
    input('value').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(editor.variables.getValues()).toEqual({ date: '2026-10-16' });
  });

  it('un libellé modifié met à jour la déclaration, sans toucher aux valeurs', () => {
    editor.contentElement.dispatchEvent(edit('client.name'));
    input('label').value = ' Customer ';
    button('Apply').click();
    expect(editor.variables.list()[0]).toEqual({ name: 'client.name', label: 'Customer' });
    expect(editor.variables.getValues()).toEqual({ date: '2026-10-16' });
    expect(editor.calls).toEqual([]);
  });

  it('rien ne change si rien n’est modifié', () => {
    let changes = 0;
    editor.on('variablesChange', () => {
      changes += 1;
    });
    editor.contentElement.dispatchEvent(edit('client.name'));
    button('Apply').click();
    expect(changes).toBe(0);
  });

  it('Supprimer lance variable.remove, grisé si la commande est inexécutable', () => {
    editor.contentElement.dispatchEvent(edit('client.name'));
    button('Remove').click();
    expect(editor.calls).toEqual([{ id: 'variable.remove', args: undefined }]);
    expect(dialog.isOpen()).toBe(false);
    editor.disabled.add('variable.remove');
    editor.contentElement.dispatchEvent(edit('client.name'));
    expect(button('Remove').disabled).toBe(true);
  });

  it('Annuler, Échap et un clic extérieur ferment sans rien appliquer', () => {
    editor.contentElement.dispatchEvent(edit('client.name'));
    input('value').value = 'ignored';
    button('Cancel').click();
    expect(dialog.isOpen()).toBe(false);
    editor.contentElement.dispatchEvent(edit('client.name'));
    input('value').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(dialog.isOpen()).toBe(false);
    editor.contentElement.dispatchEvent(edit('client.name'));
    dialog.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(dialog.isOpen()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(dialog.isOpen()).toBe(false);
    expect(editor.variables.getValues()).toEqual({ date: '2026-10-16' });
  });

  it('une variable inconnue du magasin s’édite aussi (libellé vide, ancrée sur le contenu)', () => {
    dialog.open({ pos: 7, name: 'other' });
    expect(input('label').value).toBe('');
    expect(input('value').value).toBe('');
    input('value').value = 'x';
    button('Apply').click();
    expect(editor.variables.getValues()['other']).toBe('x');
  });

  it('ignore un détail invalide, la lecture seule, et se ferme quand l’éditeur passe en lecture seule', () => {
    editor.contentElement.dispatchEvent(
      new CustomEvent(VARIABLE_EDIT_EVENT, { bubbles: true, detail: { name: 42 } }),
    );
    expect(dialog.isOpen()).toBe(false);
    editor.setReadOnly(true);
    editor.contentElement.dispatchEvent(edit('client.name'));
    expect(dialog.isOpen()).toBe(false);
    editor.setReadOnly(false);
    editor.contentElement.dispatchEvent(edit('client.name'));
    editor.setReadOnly(true);
    dialog.update();
    expect(dialog.isOpen()).toBe(false);
  });

  it('les libellés suivent la locale', () => {
    editor.i18n.setLocale('fr');
    editor.contentElement.dispatchEvent(edit('client.name'));
    expect(dialog.element.getAttribute('aria-label')).toBe('Modifier la variable');
    expect(button('Supprimer')).toBeDefined();
  });

  it('destroy retire l’écouteur et l’élément', () => {
    editor.contentElement.dispatchEvent(edit('client.name'));
    dialog.destroy();
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.element.isConnected).toBe(false);
    editor.contentElement.dispatchEvent(edit('client.name'));
    expect(dialog.isOpen()).toBe(false);
  });
});
