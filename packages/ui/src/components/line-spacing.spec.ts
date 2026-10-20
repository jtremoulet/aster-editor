import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import { LINE_SPACING_PRESETS, createLineSpacingMenu, currentLineSpacing } from './line-spacing';

describe('createLineSpacingMenu', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    widget = createLineSpacingMenu(editor);
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
  const items = (): HTMLButtonElement[] =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  const item = (text: string): HTMLButtonElement =>
    items().find((node) => node.textContent === text)!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('.aster-dialog__button')).find(
      (b) => b.textContent === text,
    )!;
  const valueInput = (): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>('input[type="number"]')!;
  const radio = (value: string): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
  const keydown = (target: Element, key: string): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };

  it('rend un déclencheur avec icône, libellé i18n et menu Par défaut / 1 / 1,15 / 1,5 / 2 / Personnalisé', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Line spacing');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().querySelector('.aster-toolbar__icon svg')).not.toBeNull();
    expect(trigger().hasAttribute('data-toolbar-item')).toBe(true);
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    open();
    expect(panel().getAttribute('role')).toBe('menu');
    expect(panel().getAttribute('aria-label')).toBe('Line spacing');
    expect(items().map((node) => node.textContent)).toEqual([
      'Default',
      '1',
      '1.15',
      '1.5',
      '2',
      'Custom…',
    ]);
    expect(item('Default').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(items()[0]);
    expect(LINE_SPACING_PRESETS).toEqual([1, 1.15, 1.5, 2]);
  });

  it('coche le multiple courant, enfonce le déclencheur, et lit aussi les titres', () => {
    editor.attributes.set('paragraph', { lineHeight: 1.5, lineHeightPt: null });
    widget.update();
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    open();
    expect(item('1.5').getAttribute('aria-checked')).toBe('true');
    expect(item('Default').getAttribute('aria-checked')).toBe('false');
    trigger().click();
    editor.attributes.delete('paragraph');
    editor.attributes.set('heading', { level: 1, lineHeightPt: 14 });
    widget.update();
    expect(currentLineSpacing(editor)).toEqual({ lineHeight: null, lineHeightPt: 14 });
    open();
    expect(item('Custom…').getAttribute('aria-checked')).toBe('true');
    expect(items().filter((node) => node.getAttribute('aria-checked') === 'true').length).toBe(1);
  });

  it('un multiple envoie paragraph.setLayout { lineHeight, lineHeightPt: null } puis ferme et refocalise', () => {
    open();
    item('1.15').click();
    expect(editor.calls).toEqual([
      { id: 'paragraph.setLayout', args: { lineHeight: 1.15, lineHeightPt: null } },
    ]);
    expect(isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('« Par défaut » envoie paragraph.unsetLayout sur lineHeight et lineHeightPt', () => {
    open();
    item('Default').click();
    expect(editor.calls).toEqual([
      { id: 'paragraph.unsetLayout', args: { attrs: ['lineHeight', 'lineHeightPt'] } },
    ]);
    expect(isOpen()).toBe(false);
  });

  it('« Personnalisé… » bascule sur un formulaire dialog : multiple ou valeur exacte en pt', () => {
    editor.attributes.set('paragraph', { lineHeightPt: 14 });
    open();
    item('Custom…').click();
    expect(isOpen()).toBe(true);
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().classList.contains('aster-line-spacing--custom')).toBe(true);
    expect(radio('exact').checked).toBe(true);
    expect(valueInput().value).toBe('14');
    expect(document.activeElement).toBe(valueInput());
    valueInput().value = '15.5';
    button('Apply').click();
    expect(editor.calls).toEqual([
      { id: 'paragraph.setLayout', args: { lineHeightPt: 15.5, lineHeight: null } },
    ]);
    expect(isOpen()).toBe(false);
    // Réouverture : la liste revient.
    open();
    expect(panel().getAttribute('role')).toBe('menu');
    expect(items().length).toBe(6);
  });

  it('un multiple personnalisé est validé par Entrée et envoie lineHeight', () => {
    editor.attributes.set('paragraph', { lineHeight: 1.3 });
    open();
    item('Custom…').click();
    expect(radio('multiple').checked).toBe(true);
    expect(valueInput().value).toBe('1.3');
    valueInput().value = '1.4';
    keydown(valueInput(), 'Enter');
    expect(editor.calls).toEqual([
      { id: 'paragraph.setLayout', args: { lineHeight: 1.4, lineHeightPt: null } },
    ]);
  });

  it('refuse une valeur vide, nulle ou négative et affiche l’erreur ; la saisie survit à un update', () => {
    open();
    item('Custom…').click();
    valueInput().value = '0';
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    expect(isOpen()).toBe(true);
    expect(panel().querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(false);
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe(
      'Enter a number greater than zero, at most 132',
    );
    expect(valueInput().getAttribute('aria-invalid')).toBe('true');
    valueInput().value = '1.2';
    valueInput().dispatchEvent(new Event('input'));
    expect(panel().querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(true);
    // `selectionChange` → update : le brouillon est conservé.
    widget.update();
    expect(valueInput().value).toBe('1.2');
    radio('exact').click();
    radio('exact').dispatchEvent(new Event('change'));
    widget.update();
    expect(radio('exact').checked).toBe(true);
  });

  it('R26-07 (F10) : le formulaire survit à un update() : champ attaché, focus et erreur conservés', () => {
    open();
    item('Custom…').click();
    const input = valueInput();
    input.focus();
    input.value = '1.3';
    input.dispatchEvent(new Event('input'));
    editor.emit('selectionChange', { editor });
    widget.update();
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(input.isConnected).toBe(true);
    expect(valueInput()).toBe(input);
    expect(document.activeElement).toBe(input);
    // L'erreur affichée n'est pas effacée non plus.
    input.value = '0';
    button('Apply').click();
    const alert = panel().querySelector('[role="alert"]')!;
    widget.update();
    expect(panel().querySelector('[role="alert"]')).toBe(alert);
    expect(alert.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('R26-04 : borne un multiple à 132 et une valeur exacte à 1584 pt, max suit le mode', () => {
    open();
    item('Custom…').click();
    expect(valueInput().getAttribute('max')).toBe('132');
    valueInput().value = '133';
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    expect(valueInput().getAttribute('aria-invalid')).toBe('true');
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe(
      'Enter a number greater than zero, at most 132',
    );
    radio('exact').click();
    radio('exact').dispatchEvent(new Event('change'));
    expect(valueInput().getAttribute('max')).toBe('1584');
    valueInput().value = '1585';
    valueInput().dispatchEvent(new Event('input'));
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe(
      'Enter a number greater than zero, at most 1584',
    );
    valueInput().value = '1584';
    valueInput().dispatchEvent(new Event('input'));
    button('Apply').click();
    expect(editor.calls).toEqual([
      { id: 'paragraph.setLayout', args: { lineHeightPt: 1584, lineHeight: null } },
    ]);
  });

  it('Annuler et Échap ferment le formulaire sans rien appeler et rendent la liste à l’ouverture suivante', () => {
    open();
    item('Custom…').click();
    button('Cancel').click();
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
    open();
    expect(panel().getAttribute('role')).toBe('menu');
    item('Custom…').click();
    keydown(valueInput(), 'Escape');
    expect(isOpen()).toBe(false);
    open();
    expect(panel().getAttribute('role')).toBe('menu');
    expect(editor.calls).toEqual([]);
  });

  it('se désactive quand paragraph.setLayout n’est pas exécutable (lecture seule)', () => {
    editor.setReadOnly(true);
    widget.update();
    expect(trigger().disabled).toBe(true);
    editor.setReadOnly(false);
    editor.disabled.add('paragraph.setLayout');
    widget.update();
    expect(trigger().disabled).toBe(true);
  });

  it('les libellés suivent la locale (fr : virgule décimale)', () => {
    editor.i18n.setLocale('fr');
    widget.update();
    expect(trigger().getAttribute('aria-label')).toBe('Interligne');
    open();
    expect(items().map((node) => node.textContent)).toEqual([
      'Par défaut',
      '1',
      '1,15',
      '1,5',
      '2',
      'Personnalisé…',
    ]);
  });

  it('le mousedown sur le déclencheur et les entrées ne vole pas le focus (preventDefault)', () => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    trigger().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    open();
    const inner = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    items()[1]?.dispatchEvent(inner);
    expect(inner.defaultPrevented).toBe(true);
  });
});
