import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import {
  BORDER_SIDES,
  BORDER_STYLES,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH_PT,
  DEFAULT_SHADING_COLOR,
  createParagraphBordersDialog,
  currentBorders,
  hasBordersOrShading,
  isBlockBorder,
  toHexColor,
} from './paragraph-borders-dialog';

describe('paragraph-borders helpers', () => {
  it('isBlockBorder valide côté, style, épaisseur et couleur', () => {
    expect(isBlockBorder({ side: 'top', style: 'solid', widthPt: 1, color: '#000000' })).toBe(true);
    expect(isBlockBorder({ side: 'between', style: 'double', widthPt: 0.5, color: '#fff' })).toBe(
      true,
    );
    expect(isBlockBorder({ side: 'up', style: 'solid', widthPt: 1, color: '#000000' })).toBe(false);
    expect(isBlockBorder({ side: 'top', style: 'wavy', widthPt: 1, color: '#000000' })).toBe(false);
    expect(isBlockBorder({ side: 'top', style: 'solid', widthPt: '1', color: '#000000' })).toBe(
      false,
    );
    expect(isBlockBorder(null)).toBe(false);
  });

  it('currentBorders filtre les bordures malformées et un fond vide', () => {
    const editor = createMockEditor();
    editor.attributes.set('paragraph', {
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#ff0000' }, { side: 'x' }],
      shading: '',
    });
    expect(currentBorders(editor)).toEqual({
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#ff0000' }],
      shading: null,
    });
    expect(hasBordersOrShading(editor)).toBe(true);
    editor.attributes.set('paragraph', { borders: null, shading: '#eeeeee' });
    expect(currentBorders(editor)).toEqual({ borders: [], shading: '#eeeeee' });
    editor.attributes.set('paragraph', { borders: 'nope' });
    expect(hasBordersOrShading(editor)).toBe(false);
  });

  it('toHexColor normalise en #rrggbb minuscule avec repli', () => {
    expect(toHexColor('#ABCDEF', '#000000')).toBe('#abcdef');
    expect(toHexColor('#abc', '#000000')).toBe('#aabbcc');
    expect(toHexColor('red', '#000000')).toBe('#000000');
    expect(toHexColor(null, '#111111')).toBe('#111111');
    expect(toHexColor(undefined, '#111111')).toBe('#111111');
  });
});

describe('createParagraphBordersDialog', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    widget = createParagraphBordersDialog(editor);
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
  const row = (side: string): HTMLElement =>
    panel().querySelector<HTMLElement>(`.aster-borders-dialog__row[data-side="${side}"]`)!;
  const style = (side: string): HTMLSelectElement => row(side).querySelector('select')!;
  const width = (side: string): HTMLInputElement =>
    row(side).querySelector('input[type="number"]')!;
  const color = (side: string): HTMLInputElement => row(side).querySelector('input[type="color"]')!;
  const shading = (): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>('.aster-borders-dialog__shading')!;
  const shadingColor = (): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>('.aster-borders-dialog__shading-color')!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('.aster-dialog__button')).find(
      (b) => b.textContent === text,
    )!;

  it('ouvre un dialogue avec une ligne par côté (style, épaisseur, couleur), un fond et trois boutons', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Borders and shading');
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().querySelector('.aster-toolbar__icon svg')).not.toBeNull();
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    open();
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-label')).toBe('Borders and shading');
    expect(BORDER_SIDES).toEqual(['top', 'right', 'bottom', 'left']);
    for (const side of BORDER_SIDES) {
      expect(style(side).value, side).toBe('none');
      expect(Array.from(style(side).options).map((option) => option.value)).toEqual([
        'none',
        ...BORDER_STYLES,
      ]);
      expect(width(side).value, side).toBe(String(DEFAULT_BORDER_WIDTH_PT));
      expect(width(side).disabled, side).toBe(true);
      expect(color(side).value, side).toBe(DEFAULT_BORDER_COLOR);
      expect(color(side).disabled, side).toBe(true);
      expect(style(side).getAttribute('aria-label')).toContain('Style');
      expect(color(side).getAttribute('aria-label')).toContain('Color');
    }
    expect(row('top').querySelector('label')?.textContent).toBe('Top');
    expect(shading().checked).toBe(false);
    expect(shadingColor().disabled).toBe(true);
    expect(shadingColor().value).toBe(DEFAULT_SHADING_COLOR);
    expect(button('Apply')).toBeDefined();
    expect(button('Cancel')).toBeDefined();
    expect(button('Reset').disabled).toBe(true);
    expect(document.activeElement).toBe(style('top'));
  });

  it('préremplit depuis les bordures et le fond courants, enfonce le déclencheur', () => {
    editor.attributes.set('paragraph', {
      borders: [
        { side: 'bottom', style: 'double', widthPt: 1.5, color: '#FF0000' },
        { side: 'left', style: 'dotted', widthPt: 0.75, color: '#00ff00' },
      ],
      shading: '#eeeeee',
    });
    widget.update();
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    open();
    expect(style('bottom').value).toBe('double');
    expect(width('bottom').value).toBe('1.5');
    expect(width('bottom').disabled).toBe(false);
    expect(color('bottom').value).toBe('#ff0000');
    expect(style('left').value).toBe('dotted');
    expect(width('left').value).toBe('0.75');
    expect(style('top').value).toBe('none');
    expect(shading().checked).toBe(true);
    expect(shadingColor().value).toBe('#eeeeee');
    expect(shadingColor().disabled).toBe(false);
    expect(button('Reset').disabled).toBe(false);
  });

  it('choisir un style active épaisseur et couleur ; Appliquer envoie borders et shading', () => {
    open();
    style('top').value = 'solid';
    style('top').dispatchEvent(new Event('change'));
    expect(width('top').disabled).toBe(false);
    expect(color('top').disabled).toBe(false);
    width('top').value = '1';
    color('top').value = '#123456';
    style('bottom').value = 'dashed';
    style('bottom').dispatchEvent(new Event('change'));
    width('bottom').value = '0.5';
    shading().checked = true;
    shading().dispatchEvent(new Event('change'));
    expect(shadingColor().disabled).toBe(false);
    shadingColor().value = '#ffff00';
    button('Apply').click();
    expect(editor.calls).toEqual([
      {
        id: 'paragraph.setLayout',
        args: {
          borders: [
            { side: 'top', style: 'solid', widthPt: 1, color: '#123456' },
            { side: 'bottom', style: 'dashed', widthPt: 0.5, color: '#000000' },
          ],
          shading: '#ffff00',
        },
      },
    ]);
    expect(isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('tout à « aucune » sans fond envoie null pour effacer', () => {
    editor.attributes.set('paragraph', {
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#000000' }],
      shading: '#eeeeee',
    });
    open();
    style('top').value = 'none';
    style('top').dispatchEvent(new Event('change'));
    shading().checked = false;
    button('Apply').click();
    expect(editor.calls).toEqual([
      { id: 'paragraph.setLayout', args: { borders: null, shading: null } },
    ]);
  });

  it('refuse une épaisseur vide ou nulle sur un côté bordé, Entrée valide', () => {
    open();
    style('right').value = 'solid';
    style('right').dispatchEvent(new Event('change'));
    width('right').value = '0';
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    expect(isOpen()).toBe(true);
    expect(width('right').getAttribute('aria-invalid')).toBe('true');
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe(
      'Enter a width between 0.25 and 6 pt',
    );
    width('right').value = '2';
    width('right').dispatchEvent(new Event('input'));
    expect(width('right').hasAttribute('aria-invalid')).toBe(false);
    width('right').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(editor.calls[0]?.args).toEqual({
      borders: [{ side: 'right', style: 'solid', widthPt: 2, color: '#000000' }],
      shading: null,
    });
  });

  it('R26-04 : les champs d’épaisseur portent min 0,25 / max 6 et submit refuse hors bornes', () => {
    open();
    expect(width('top').getAttribute('min')).toBe('0.25');
    expect(width('top').getAttribute('max')).toBe('6');
    style('top').value = 'solid';
    style('top').dispatchEvent(new Event('change'));
    width('top').value = '6.25';
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    expect(width('top').getAttribute('aria-invalid')).toBe('true');
    width('top').value = '0.2';
    width('top').dispatchEvent(new Event('input'));
    button('Apply').click();
    expect(editor.calls).toEqual([]);
    width('top').value = '6';
    width('top').dispatchEvent(new Event('input'));
    button('Apply').click();
    expect(editor.calls[0]?.args).toMatchObject({
      borders: [{ side: 'top', style: 'solid', widthPt: 6, color: '#000000' }],
    });
  });

  it('R26-02 (F3) : une bordure between (import Word) survit à « Appliquer » sans y toucher', () => {
    editor.attributes.set('paragraph', {
      borders: [
        { side: 'between', style: 'solid', widthPt: 0.5, color: '#000000' },
        { side: 'top', style: 'solid', widthPt: 1, color: '#000000' },
      ],
    });
    open();
    button('Apply').click();
    const sent = editor.calls[0]?.args as { borders: { side: string }[] };
    expect(sent.borders.map((border) => border.side)).toEqual(['between', 'top']);
    // Retirer le haut ne retire pas le `between` : `borders` n'est pas effacé.
    editor.calls.length = 0;
    open();
    style('top').value = 'none';
    style('top').dispatchEvent(new Event('change'));
    button('Apply').click();
    expect(editor.calls[0]?.args).toEqual({
      borders: [{ side: 'between', style: 'solid', widthPt: 0.5, color: '#000000' }],
      shading: null,
    });
  });

  it('R26-10 (F4) : une couleur hors #rrggbb est conservée tant que le sélecteur n’a pas été touché', () => {
    editor.attributes.set('paragraph', {
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: 'rgb(255, 0, 0)' }],
      shading: 'yellow',
    });
    open();
    // Le champ `<input type="color">` affiche le repli, mais ne le renvoie pas.
    expect(color('top').value).toBe(DEFAULT_BORDER_COLOR);
    expect(shadingColor().value).toBe(DEFAULT_SHADING_COLOR);
    button('Apply').click();
    expect(editor.calls[0]?.args).toEqual({
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: 'rgb(255, 0, 0)' }],
      shading: 'yellow',
    });
    // Après une saisie réelle, c'est la couleur choisie qui part.
    editor.calls.length = 0;
    open();
    color('top').value = '#123456';
    color('top').dispatchEvent(new Event('input'));
    shadingColor().value = '#ffff00';
    shadingColor().dispatchEvent(new Event('input'));
    button('Apply').click();
    expect(editor.calls[0]?.args).toEqual({
      borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#123456' }],
      shading: '#ffff00',
    });
  });

  it('Réinitialiser envoie paragraph.unsetLayout sur borders et shading', () => {
    editor.attributes.set('paragraph', { shading: '#eeeeee' });
    open();
    button('Reset').click();
    expect(editor.calls).toEqual([
      { id: 'paragraph.unsetLayout', args: { attrs: ['borders', 'shading'] } },
    ]);
    expect(isOpen()).toBe(false);
  });

  it('Annuler et Échap ferment sans rien appeler', () => {
    open();
    button('Cancel').click();
    expect(isOpen()).toBe(false);
    open();
    style('top').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
    expect(editor.calls).toEqual([]);
  });

  it('se désactive sans paragraph.setLayout exécutable et suit la locale', () => {
    editor.disabled.add('paragraph.setLayout');
    widget.update();
    expect(trigger().disabled).toBe(true);
    editor.disabled.delete('paragraph.setLayout');
    editor.i18n.setLocale('fr');
    widget.update();
    expect(trigger().getAttribute('aria-label')).toBe('Bordures et fond');
    open();
    expect(row('left').querySelector('label')?.textContent).toBe('Gauche');
    expect(style('left').options[0]?.textContent).toBe('Aucune');
    expect(button('Réinitialiser')).toBeDefined();
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    trigger().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
