import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { Dropdown } from './dropdown';
import { createLinkDialog, isAcceptableUrl } from './link-dialog';

describe('createLinkDialog', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let dialog: Dropdown;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    dialog = createLinkDialog(editor) as Dropdown;
    host.append(dialog.element);
  });

  afterEach(() => {
    host.remove();
  });

  const url = (): HTMLInputElement =>
    dialog.panel.querySelector<HTMLInputElement>('input[type="url"]')!;
  const checkbox = (): HTMLInputElement =>
    dialog.panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(dialog.panel.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === text,
    )!;

  it('ouvre un panneau role=dialog avec URL, case nouvel onglet et trois boutons', () => {
    expect(dialog.trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(dialog.trigger.getAttribute('aria-label')).toBe('Insert link');
    dialog.open();
    expect(dialog.panel.getAttribute('role')).toBe('dialog');
    expect(url().value).toBe('');
    expect(checkbox().checked).toBe(false);
    expect(button('OK')).toBeDefined();
    expect(button('Cancel')).toBeDefined();
    expect(button('Remove link').disabled).toBe(true);
    expect(document.activeElement).toBe(url());
  });

  it('préremplit avec le lien courant et active « supprimer »', () => {
    editor.attributes.set('link', { href: 'https://example.org', target: '_blank' });
    dialog.update();
    expect(dialog.trigger.getAttribute('aria-pressed')).toBe('true');
    dialog.open();
    expect(url().value).toBe('https://example.org');
    expect(checkbox().checked).toBe(true);
    expect(button('Remove link').disabled).toBe(false);
  });

  it('OK appelle link.set avec href et target puis ferme et refocalise', () => {
    dialog.open();
    url().value = '  https://aster.dev  ';
    checkbox().checked = true;
    button('OK').click();
    expect(editor.calls).toEqual([
      { id: 'link.set', args: { href: 'https://aster.dev', target: '_blank' } },
    ]);
    expect(dialog.isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('Entrée dans le champ valide comme OK, avec target _self sans la case', () => {
    dialog.open();
    url().value = '/docs';
    url().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(editor.calls[0]).toEqual({ id: 'link.set', args: { href: '/docs', target: '_self' } });
  });

  it('refuse une URL vide ou javascript: et affiche l’erreur', () => {
    dialog.open();
    url().value = 'javascript:alert(1)';
    button('OK').click();
    expect(editor.calls).toEqual([]);
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.panel.querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(false);
    expect(dialog.panel.querySelector('[role="alert"]')?.textContent).toBe('Enter a valid URL');
    expect(url().getAttribute('aria-invalid')).toBe('true');
  });

  it('Supprimer appelle link.unset', () => {
    editor.attributes.set('link', { href: 'https://x.y' });
    dialog.open();
    button('Remove link').click();
    expect(editor.calls).toEqual([{ id: 'link.unset', args: undefined }]);
    expect(dialog.isOpen()).toBe(false);
  });

  it('Annuler et Échap ferment sans rien appeler', () => {
    dialog.open();
    button('Cancel').click();
    expect(dialog.isOpen()).toBe(false);
    dialog.open();
    url().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(dialog.isOpen()).toBe(false);
    expect(editor.calls).toEqual([]);
  });

  it('les libellés suivent la locale', () => {
    editor.i18n.setLocale('fr');
    dialog.update();
    dialog.open();
    expect(button('Supprimer le lien')).toBeDefined();
    expect(dialog.panel.querySelector('label')?.textContent).toBe('URL');
  });
});

describe('isAcceptableUrl', () => {
  it('accepte http, relatif, ancre, mailto et refuse vide, javascript:, data:', () => {
    expect(isAcceptableUrl('https://a.b')).toBe(true);
    expect(isAcceptableUrl('/path')).toBe(true);
    expect(isAcceptableUrl('#top')).toBe(true);
    expect(isAcceptableUrl('mailto:a@b.c')).toBe(true);
    expect(isAcceptableUrl('   ')).toBe(false);
    expect(isAcceptableUrl('JavaScript:void(0)')).toBe(false);
    expect(isAcceptableUrl('data:text/html,x')).toBe(false);
  });
});
