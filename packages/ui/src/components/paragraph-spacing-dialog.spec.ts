import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import {
  PARAGRAPH_SPACING_ATTRS,
  createParagraphSpacingDialog,
  hasParagraphSpacing,
} from './paragraph-spacing-dialog';

describe('createParagraphSpacingDialog', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    widget = createParagraphSpacingDialog(editor);
    host.append(widget.element);
  });

  afterEach(() => {
    widget.destroy();
    host.remove();
  });

  const trigger = (): HTMLButtonElement =>
    widget.element.querySelector<HTMLButtonElement>('.aster-dropdown__trigger')!;
  const panel = (): HTMLElement =>
    widget.element.querySelector<HTMLElement>('.aster-dropdown__panel')!;
  const isOpen = (): boolean => !panel().hasAttribute('hidden');
  const open = (): void => trigger().click();
  const input = (attr: string): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`input[id^="aster-paragraph-spacing-${attr}-"]`)!;
  const checkbox = (name: 'keep' | 'break'): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`.aster-paragraph-spacing__${name}`)!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('.aster-dialog__button')).find(
      (b) => b.textContent === text,
    )!;

  it('ouvre un dialogue avec cinq champs en pt, deux cases et trois boutons', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Spacing');
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().querySelector('.aster-toolbar__icon svg')).not.toBeNull();
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    open();
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-label')).toBe('Spacing');
    for (const attr of [
      'spacingBeforePt',
      'spacingAfterPt',
      'indentLeftPt',
      'indentRightPt',
      'indentFirstLinePt',
    ]) {
      expect(input(attr).type, attr).toBe('number');
      expect(input(attr).value, attr).toBe('');
    }
    expect(input('spacingBeforePt').getAttribute('min')).toBe('0');
    expect(input('spacingBeforePt').getAttribute('max')).toBe('1584');
    expect(input('indentLeftPt').getAttribute('max')).toBe('1584');
    // Retrait suspendu : première ligne négative autorisée, bornée symétriquement.
    expect(input('indentFirstLinePt').getAttribute('min')).toBe('-1584');
    expect(input('indentFirstLinePt').getAttribute('max')).toBe('1584');
    expect(checkbox('keep').checked).toBe(false);
    expect(checkbox('break').checked).toBe(false);
    expect(button('Apply')).toBeDefined();
    expect(button('Cancel')).toBeDefined();
    expect(button('Reset').disabled).toBe(true);
    expect(document.activeElement).toBe(input('spacingBeforePt'));
    expect(panel().querySelectorAll('label').length).toBe(7);
  });

  it('préremplit depuis le bloc courant, enfonce le déclencheur et active Réinitialiser', () => {
    editor.attributes.set('paragraph', {
      spacingBeforePt: 6,
      spacingAfterPt: 12.5,
      indentLeftPt: 36,
      indentFirstLinePt: -18,
      keepWithNext: true,
      pageBreakBefore: null,
    });
    widget.update();
    expect(hasParagraphSpacing(editor)).toBe(true);
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    open();
    expect(input('spacingBeforePt').value).toBe('6');
    expect(input('spacingAfterPt').value).toBe('12.5');
    expect(input('indentLeftPt').value).toBe('36');
    expect(input('indentRightPt').value).toBe('');
    expect(input('indentFirstLinePt').value).toBe('-18');
    expect(checkbox('keep').checked).toBe(true);
    expect(checkbox('break').checked).toBe(false);
    expect(button('Reset').disabled).toBe(false);
  });

  it('Appliquer envoie paragraph.setLayout avec nombres, null pour les champs vides et cases', () => {
    open();
    input('spacingBeforePt').value = '6';
    input('spacingAfterPt').value = '';
    input('indentLeftPt').value = '18';
    input('indentFirstLinePt').value = '-9';
    checkbox('keep').checked = true;
    checkbox('break').checked = true;
    button('Apply').click();
    expect(editor.calls).toEqual([
      {
        id: 'paragraph.setLayout',
        args: {
          spacingBeforePt: 6,
          spacingAfterPt: null,
          indentLeftPt: 18,
          indentRightPt: null,
          indentFirstLinePt: -9,
          keepWithNext: true,
          pageBreakBefore: true,
        },
      },
    ]);
    expect(isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('une case décochée envoie null (retour à l’héritage) ; Entrée valide', () => {
    editor.attributes.set('paragraph', { keepWithNext: true });
    open();
    checkbox('keep').checked = false;
    input('spacingAfterPt').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(editor.calls[0]?.args).toMatchObject({ keepWithNext: null, pageBreakBefore: null });
  });

  it('refuse une valeur négative sur un champ borné et une saisie invalide', () => {
    open();
    input('spacingBeforePt').value = '-2';
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    expect(isOpen()).toBe(true);
    expect(input('spacingBeforePt').getAttribute('aria-invalid')).toBe('true');
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe(
      'Enter a number between 0 and 1584',
    );
    expect(document.activeElement).toBe(input('spacingBeforePt'));
    input('spacingBeforePt').value = '2';
    input('spacingBeforePt').dispatchEvent(new Event('input'));
    expect(input('spacingBeforePt').hasAttribute('aria-invalid')).toBe(false);
    expect(panel().querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('R26-04 (F5) : refuse un retrait au-delà de 1584 pt (1000000000, 1e9) et une première ligne sous -1584', () => {
    open();
    input('indentLeftPt').value = '1000000000';
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    expect(input('indentLeftPt').getAttribute('aria-invalid')).toBe('true');
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe(
      'Enter a number between 0 and 1584',
    );
    input('indentLeftPt').value = '1e9';
    input('indentLeftPt').dispatchEvent(new Event('input'));
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    input('indentLeftPt').value = '1584';
    input('indentLeftPt').dispatchEvent(new Event('input'));
    input('indentFirstLinePt').value = '-1585';
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    expect(input('indentFirstLinePt').getAttribute('aria-invalid')).toBe('true');
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe(
      'Enter a number between -1584 and 1584',
    );
    input('indentFirstLinePt').value = '-1584';
    input('indentFirstLinePt').dispatchEvent(new Event('input'));
    button('Apply').click();
    expect(editor.calls[0]?.args).toMatchObject({ indentLeftPt: 1584, indentFirstLinePt: -1584 });
    expect(isOpen()).toBe(false);
  });

  it('R26-11 (F9) : des drapeaux à false ne rendent pas le bloc « mis en forme »', () => {
    editor.attributes.set('paragraph', { keepWithNext: false, pageBreakBefore: false });
    widget.update();
    expect(hasParagraphSpacing(editor)).toBe(false);
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    open();
    expect(button('Reset').disabled).toBe(true);
    expect(checkbox('keep').checked).toBe(false);
    trigger().click();
    editor.attributes.set('paragraph', { keepWithNext: false, spacingAfterPt: 0 });
    widget.update();
    // Un nombre posé, même nul, reste un attribut explicite.
    expect(hasParagraphSpacing(editor)).toBe(true);
  });

  it('Réinitialiser envoie paragraph.unsetLayout sur les sept attributs', () => {
    editor.attributes.set('paragraph', { spacingAfterPt: 8 });
    open();
    button('Reset').click();
    expect(editor.calls).toEqual([
      { id: 'paragraph.unsetLayout', args: { attrs: PARAGRAPH_SPACING_ATTRS } },
    ]);
    expect(PARAGRAPH_SPACING_ATTRS).toHaveLength(7);
    expect(isOpen()).toBe(false);
  });

  it('Annuler et Échap ferment sans rien appeler ; Échap rend le focus au déclencheur', () => {
    open();
    button('Cancel').click();
    expect(isOpen()).toBe(false);
    open();
    input('indentLeftPt').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
    expect(editor.calls).toEqual([]);
  });

  it('se désactive sans paragraph.setLayout exécutable, et suit la locale', () => {
    editor.setReadOnly(true);
    widget.update();
    expect(trigger().disabled).toBe(true);
    editor.setReadOnly(false);
    editor.i18n.setLocale('fr');
    widget.update();
    expect(trigger().getAttribute('aria-label')).toBe('Espacement');
    open();
    expect(button('Réinitialiser')).toBeDefined();
    expect(panel().querySelector('label')?.textContent).toBe('Avant (pt)');
  });

  it('le mousedown sur le déclencheur ne vole pas le focus de l’éditeur', () => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    trigger().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
