import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DocumentLayout, PaginatedPageViewOptions } from '@aster-editor/core';
import { applyPageView } from '@aster-editor/core';
import { createMockEditor, type MockEditor, type MockEditorOptions } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import {
  DEFAULT_PAGE_MARGIN_MM,
  PAGE_SIZE_NAMES,
  PAGE_VIEW_CLASS,
  createPageLayoutDialog,
  isPageViewActive,
  pageViewApiOf,
  resolvePageSetup,
} from './page-layout-dialog';

const LAYOUT: DocumentLayout = {
  page: {
    size: 'Letter',
    orientation: 'landscape',
    margins: { topMm: 20, rightMm: 15, bottomMm: 20, leftMm: 15, headerMm: 10 },
  },
  lang: 'fr-FR',
  headers: { default: { html: '<p>En-tête</p>' } },
};

describe('page-layout helpers', () => {
  it('resolvePageSetup applique les défauts A4 / portrait / 25,4 mm', () => {
    expect(resolvePageSetup(null)).toEqual({
      size: 'A4',
      orientation: 'portrait',
      margins: { topMm: 25.4, rightMm: 25.4, bottomMm: 25.4, leftMm: 25.4 },
    });
    expect(DEFAULT_PAGE_MARGIN_MM).toBe(25.4);
    expect(resolvePageSetup({ page: { size: 'Bogus' as 'A4', margins: { topMm: 10 } } })).toEqual({
      size: 'A4',
      orientation: 'portrait',
      margins: { topMm: 10, rightMm: 25.4, bottomMm: 25.4, leftMm: 25.4 },
    });
    expect(resolvePageSetup(LAYOUT)).toEqual({
      size: 'Letter',
      orientation: 'landscape',
      margins: { topMm: 20, rightMm: 15, bottomMm: 20, leftMm: 15, headerMm: 10 },
    });
    expect(resolvePageSetup({ page: { size: { widthMm: 100, heightMm: 200 } } }).size).toEqual({
      widthMm: 100,
      heightMm: 200,
    });
  });

  it('pageViewApiOf détecte les méthodes hors contrat et isPageViewActive lit la classe', () => {
    const editor = createMockEditor({ layout: LAYOUT });
    const api = pageViewApiOf(editor);
    expect(api).not.toBeNull();
    expect(api?.getLayout()).toBe(LAYOUT);
    expect(isPageViewActive(editor)).toBe(false);
    api?.setPageView({});
    expect(editor.pageViewCalls).toEqual([{}]);
    expect(isPageViewActive(editor)).toBe(true);
    expect(editor.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
    editor.layout = null;
    expect(api?.getLayout()).toBeNull();
    expect(pageViewApiOf(createMockEditor({ pageViewApi: false }))).toBeNull();
  });
});

describe('createPageLayoutDialog', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  const mount = (options: MockEditorOptions = {}): void => {
    editor = createMockEditor(options);
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    widget = createPageLayoutDialog(editor);
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
  const isOpen = (): boolean => !panel().hasAttribute('hidden');
  const open = (): void => trigger().click();
  const size = (): HTMLSelectElement => panel().querySelector('select')!;
  const orientation = (value: string): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
  const margin = (key: string): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>(`input[id^="aster-page-layout-${key}-"]`)!;
  const enabled = (): HTMLInputElement =>
    panel().querySelector<HTMLInputElement>('.aster-page-layout__enabled')!;
  const button = (text: string): HTMLButtonElement =>
    Array.from(panel().querySelectorAll<HTMLButtonElement>('.aster-dialog__button')).find(
      (b) => b.textContent === text,
    )!;

  it('ouvre un dialogue format / orientation / marges / vue page avec les défauts', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Page setup');
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().querySelector('.aster-toolbar__icon svg')).not.toBeNull();
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    expect(trigger().disabled).toBe(false);
    open();
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-label')).toBe('Page setup');
    expect(Array.from(size().options).map((option) => option.value)).toEqual([...PAGE_SIZE_NAMES]);
    expect(size().value).toBe('A4');
    expect(orientation('portrait').checked).toBe(true);
    expect(orientation('landscape').checked).toBe(false);
    for (const key of ['topMm', 'rightMm', 'bottomMm', 'leftMm']) {
      expect(margin(key).value, key).toBe('25.4');
      expect(margin(key).getAttribute('min'), key).toBe('0');
    }
    expect(panel().querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Margins (mm)',
    );
    expect(panel().querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
      'Orientation',
    );
    expect(enabled().checked).toBe(false);
    expect(button('Apply')).toBeDefined();
    expect(button('Cancel')).toBeDefined();
    expect(document.activeElement).toBe(size());
  });

  it('préremplit depuis editor.getLayout() et la classe aster--page-view', () => {
    widget.destroy();
    host.remove();
    mount({ layout: LAYOUT, pageView: true });
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    open();
    expect(size().value).toBe('Letter');
    expect(orientation('landscape').checked).toBe(true);
    expect(margin('topMm').value).toBe('20');
    expect(margin('rightMm').value).toBe('15');
    expect(enabled().checked).toBe(true);
  });

  it('Appliquer envoie editor.setPageView({ layout }) avec la page modifiée et le reste conservé', () => {
    widget.destroy();
    host.remove();
    mount({ layout: LAYOUT });
    open();
    size().value = 'A3';
    orientation('portrait').checked = true;
    margin('topMm').value = '30';
    margin('leftMm').value = '12.5';
    enabled().checked = true;
    button('Apply').click();
    expect(editor.pageViewCalls).toEqual([
      {
        layout: {
          ...LAYOUT,
          page: {
            size: 'A3',
            orientation: 'portrait',
            margins: { topMm: 30, rightMm: 15, bottomMm: 20, leftMm: 12.5, headerMm: 10 },
          },
        },
      },
    ]);
    expect(editor.calls).toEqual([]);
    expect(isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
  });

  it('sans mise en page connue, Entrée applique A4 portrait avec les marges saisies', () => {
    open();
    enabled().checked = true;
    margin('bottomMm').value = '10';
    margin('bottomMm').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(editor.pageViewCalls).toEqual([
      {
        layout: {
          page: {
            size: 'A4',
            orientation: 'portrait',
            margins: { topMm: 25.4, rightMm: 25.4, bottomMm: 10, leftMm: 25.4 },
          },
        },
      },
    ]);
  });

  it('décocher « Vue page » envoie setPageView(false) sans valider les marges', () => {
    widget.destroy();
    host.remove();
    mount({ pageView: true });
    open();
    margin('topMm').value = 'abc';
    enabled().checked = false;
    button('Apply').click();
    expect(editor.pageViewCalls).toEqual([false]);
    expect(isOpen()).toBe(false);
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
  });

  it('conserve un format personnalisé (dimensions libres) et l’affiche comme tel', () => {
    widget.destroy();
    host.remove();
    mount({ layout: { page: { size: { widthMm: 100, heightMm: 150 } } } });
    open();
    expect(size().value).toBe('custom');
    expect(size().options[size().options.length - 1]?.textContent).toBe('Custom (100 × 150 mm)');
    enabled().checked = true;
    button('Apply').click();
    expect(editor.pageViewCalls[0]).toMatchObject({
      layout: { page: { size: { widthMm: 100, heightMm: 150 } } },
    });
  });

  it('refuse une marge vide ou négative et affiche l’erreur', () => {
    open();
    enabled().checked = true;
    margin('rightMm').value = '-1';
    button('Apply').click();
    expect(editor.pageViewCalls).toEqual([]);
    expect(isOpen()).toBe(true);
    expect(margin('rightMm').getAttribute('aria-invalid')).toBe('true');
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe('Enter valid margins');
    margin('rightMm').value = '5';
    margin('rightMm').dispatchEvent(new Event('input'));
    expect(margin('rightMm').hasAttribute('aria-invalid')).toBe(false);
    margin('leftMm').value = '';
    button('Apply').click();
    expect(editor.pageViewCalls).toEqual([]);
    expect(document.activeElement).toBe(margin('leftMm'));
  });

  it('se désactive si le core n’expose pas setPageView / getLayout, ou en lecture seule', () => {
    widget.destroy();
    host.remove();
    mount({ pageViewApi: false });
    expect(trigger().disabled).toBe(true);
    open();
    expect(isOpen()).toBe(false);
    widget.destroy();
    host.remove();
    mount({ readOnly: true });
    expect(trigger().disabled).toBe(true);
  });

  it('Annuler et Échap ferment sans rien appeler ; mousedown neutralisé ; libellés fr', () => {
    open();
    button('Cancel').click();
    expect(isOpen()).toBe(false);
    open();
    size().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
    expect(editor.pageViewCalls).toEqual([]);
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    trigger().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    editor.i18n.setLocale('fr');
    widget.update();
    expect(trigger().getAttribute('aria-label')).toBe('Mise en page');
    open();
    expect(panel().querySelector('label')?.textContent).toBe('Format');
    expect(button('Appliquer')).toBeDefined();
    expect(enabled().parentElement?.textContent).toBe('Vue page');
  });

  describe('case « Pagination » (L30)', () => {
    const pagination = (): HTMLInputElement =>
      panel().querySelector<HTMLInputElement>('.aster-page-layout__pagination')!;

    it('cochée par défaut, n’ajoute rien aux options quand elle le reste', () => {
      open();
      expect(pagination().checked).toBe(true);
      expect(pagination().parentElement?.textContent).toBe('Pagination (approximate)');
      enabled().checked = true;
      button('Apply').click();
      expect(editor.pageViewCalls).toEqual([
        {
          layout: {
            page: {
              size: 'A4',
              orientation: 'portrait',
              margins: { topMm: 25.4, rightMm: 25.4, bottomMm: 25.4, leftMm: 25.4 },
            },
          },
        },
      ]);
      expect(Object.keys(editor.pageViewCalls[0] ?? {})).not.toContain('pagination');
    });

    it('décochée, envoie pagination: false avec la mise en page', () => {
      widget.destroy();
      host.remove();
      mount({ layout: LAYOUT, pageView: true });
      open();
      pagination().checked = false;
      button('Apply').click();
      const expected: PaginatedPageViewOptions = {
        layout: {
          ...LAYOUT,
          page: {
            size: 'Letter',
            orientation: 'landscape',
            margins: { topMm: 20, rightMm: 15, bottomMm: 20, leftMm: 15, headerMm: 10 },
          },
        },
        pagination: false,
      };
      expect(editor.pageViewCalls).toEqual([expected]);
      expect(isOpen()).toBe(false);
    });

    it('préremplie depuis la vue page active du core (pagination: false) ; libellé fr', () => {
      const off: PaginatedPageViewOptions = { pagination: false };
      const handle = applyPageView(editor.element, editor.contentElement, off);
      open();
      expect(enabled().checked).toBe(true);
      expect(pagination().checked).toBe(false);
      button('Cancel').click();
      handle.remove();
      open();
      expect(pagination().checked).toBe(true);
      button('Cancel').click();
      editor.i18n.setLocale('fr');
      open();
      expect(pagination().parentElement?.textContent).toBe('Pagination (approximative)');
    });
  });
});
