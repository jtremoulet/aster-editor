import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DocumentLayout, PageSetup, PaginatedPageViewOptions } from '@aster-editor/core';
import { applyPageView } from '@aster-editor/core';
import { createMockEditor, type MockEditor, type MockEditorOptions } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { ToolbarWidget } from '../types';
import {
  DEFAULT_PAGE_MARGIN_MM,
  MAX_PAGE_DIMENSION_MM,
  PAGE_SIZE_NAMES,
  PAGE_VIEW_CLASS,
  createPageLayoutDialog,
  isPageViewActive,
  maxMarginMm,
  pageDimensionsOf,
  pageViewApiOf,
  resolvePageSetup,
  sectionOfSelection,
  sectionsOf,
  withSectionPage,
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

  it('R26-13 : un format libre non fini, nul ou au-delà de 558,8 mm est traité comme A4', () => {
    expect(MAX_PAGE_DIMENSION_MM).toBe(558.8);
    // Preuve du relecteur : le core replie ces dimensions sur A4, le dialogue doit dire pareil.
    expect(resolvePageSetup({ page: { size: { widthMm: Number.NaN, heightMm: 1e9 } } }).size).toBe(
      'A4',
    );
    for (const size of [
      { widthMm: Number.POSITIVE_INFINITY, heightMm: 100 },
      { widthMm: 0, heightMm: 100 },
      { widthMm: -10, heightMm: 100 },
      { widthMm: 100, heightMm: 558.81 },
    ]) {
      expect(resolvePageSetup({ page: { size } }).size, JSON.stringify(size)).toBe('A4');
    }
    expect(resolvePageSetup({ page: { size: { widthMm: 558.8, heightMm: 0.1 } } }).size).toEqual({
      widthMm: 558.8,
      heightMm: 0.1,
    });
  });

  it('R26-04 : pageDimensionsOf et maxMarginMm (moitié de la dimension correspondante)', () => {
    expect(pageDimensionsOf('A4', 'portrait')).toEqual({ widthMm: 210, heightMm: 297 });
    expect(pageDimensionsOf('A4', 'landscape')).toEqual({ widthMm: 297, heightMm: 210 });
    expect(pageDimensionsOf({ widthMm: 100, heightMm: 150 }, 'landscape')).toEqual({
      widthMm: 150,
      heightMm: 100,
    });
    const a4 = pageDimensionsOf('A4', 'portrait');
    expect(maxMarginMm('topMm', a4)).toBe(148.5);
    expect(maxMarginMm('bottomMm', a4)).toBe(148.5);
    expect(maxMarginMm('leftMm', a4)).toBe(105);
    expect(maxMarginMm('rightMm', a4)).toBe(105);
    // Letter : 215,9 / 2 = 107,95 ; 279,4 / 2 = 139,7 — deux décimales, vers le bas.
    const letter = pageDimensionsOf('Letter', 'portrait');
    expect(maxMarginMm('leftMm', letter)).toBe(107.95);
    expect(maxMarginMm('topMm', letter)).toBe(139.7);
    expect(maxMarginMm('topMm', { widthMm: 1, heightMm: 0.333 })).toBe(0.16);
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

  it('R26-13 : un format libre invalide n’ajoute pas d’option « Personnalisé » et applique A4', () => {
    widget.destroy();
    host.remove();
    // Preuve du relecteur : « Custom (NaN × 1000000000 mm) » était sélectionné et renvoyé tel quel.
    mount({ layout: { page: { size: { widthMm: Number.NaN, heightMm: 1e9 } } } });
    open();
    expect(size().value).toBe('A4');
    expect(Array.from(size().options).map((option) => option.value)).toEqual([...PAGE_SIZE_NAMES]);
    enabled().checked = true;
    button('Apply').click();
    expect(editor.pageViewCalls[0]).toMatchObject({ layout: { page: { size: 'A4' } } });
  });

  it('R26-04 : refuse une marge au-delà de la moitié de la page, max dynamique selon format et orientation', () => {
    open();
    enabled().checked = true;
    // A4 portrait : haut / bas ≤ 148,5 mm, gauche / droite ≤ 105 mm.
    expect(margin('topMm').getAttribute('max')).toBe('148.5');
    expect(margin('bottomMm').getAttribute('max')).toBe('148.5');
    expect(margin('leftMm').getAttribute('max')).toBe('105');
    expect(margin('rightMm').getAttribute('max')).toBe('105');
    // Preuve du relecteur : 5 000 mm × 4 + « Vue page » partait dans setPageView.
    for (const key of ['topMm', 'rightMm', 'bottomMm', 'leftMm']) margin(key).value = '5000';
    button('Apply').click();
    expect(editor.pageViewCalls).toEqual([]);
    expect(isOpen()).toBe(true);
    expect(margin('topMm').getAttribute('aria-invalid')).toBe('true');
    expect(panel().querySelector('[role="alert"]')?.textContent).toBe('Enter valid margins');
    expect(document.activeElement).toBe(margin('topMm'));
    // Une faute de frappe plausible (« 250 » pour « 25 ») est refusée aussi.
    for (const key of ['topMm', 'rightMm', 'bottomMm']) margin(key).value = '25';
    margin('leftMm').value = '250';
    button('Apply').click();
    expect(editor.pageViewCalls).toEqual([]);
    expect(margin('leftMm').getAttribute('aria-invalid')).toBe('true');
    // Paysage : les bornes s'échangent, le `max` suit l'orientation.
    orientation('landscape').checked = true;
    orientation('landscape').dispatchEvent(new Event('change'));
    expect(margin('topMm').getAttribute('max')).toBe('105');
    expect(margin('leftMm').getAttribute('max')).toBe('148.5');
    // 120 mm en haut dépasse 105 en paysage ; 105 exactement passe (borne incluse).
    margin('leftMm').value = '25';
    margin('topMm').value = '120';
    button('Apply').click();
    expect(editor.pageViewCalls).toEqual([]);
    expect(margin('topMm').getAttribute('aria-invalid')).toBe('true');
    margin('topMm').value = '105';
    button('Apply').click();
    expect(editor.pageViewCalls).toEqual([
      {
        layout: {
          page: {
            size: 'A4',
            orientation: 'landscape',
            margins: { topMm: 105, rightMm: 25, bottomMm: 25, leftMm: 25 },
          },
        },
      },
    ]);
    // Le format change les bornes aussi : réouvert en A4 paysage (mémorisé par le mock),
    // passer en A3 donne 297 / 2 = 148,5 en haut et 420 / 2 = 210 à gauche.
    open();
    expect(orientation('landscape').checked).toBe(true);
    expect(margin('topMm').getAttribute('max')).toBe('105');
    size().value = 'A3';
    size().dispatchEvent(new Event('change'));
    expect(margin('topMm').getAttribute('max')).toBe('148.5');
    expect(margin('leftMm').getAttribute('max')).toBe('210');
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

    it('L44 : sectionOfSelection, sectionsOf et withSectionPage (helpers)', () => {
      expect(sectionOfSelection(createMockEditor())).toEqual({ index: 1, count: 1 });
      expect(sectionOfSelection(createMockEditor({ sections: { count: 3, current: 2 } }))).toEqual({
        index: 2,
        count: 3,
      });
      expect(sectionOfSelection(createMockEditor({ sections: { count: 1, current: 1 } }))).toEqual({
        index: 1,
        count: 1,
      });
      // Sections connues complétées par le premier niveau (copie de la dernière section).
      const layout: DocumentLayout = {
        page: { size: 'A5' },
        lang: 'fr-FR',
        sections: [{ page: { size: 'A3' }, headers: { default: { html: '<p>h</p>' } } }],
      };
      expect(sectionsOf(layout, 3)).toEqual([
        { page: { size: 'A3' }, headers: { default: { html: '<p>h</p>' } } },
        { page: { size: 'A5' } },
        { page: { size: 'A5' } },
      ]);
      expect(sectionsOf(null, 2)).toEqual([{}, {}]);
      // Une seule section : seul `page` change, comme avant.
      const page: PageSetup = { size: 'Legal', orientation: 'portrait' };
      expect(withSectionPage(layout, { index: 1, count: 1 }, page)).toEqual({ ...layout, page });
      expect(withSectionPage(null, { index: 1, count: 1 }, page)).toEqual({ page });
      // Section intermédiaire : `sections` complété, `page` de premier niveau intact.
      expect(withSectionPage(layout, { index: 2, count: 3 }, page)).toEqual({
        ...layout,
        sections: [
          { page: { size: 'A3' }, headers: { default: { html: '<p>h</p>' } } },
          { page },
          { page: { size: 'A5' } },
        ],
      });
      // Dernière section : recopiée dans `page` (contrat `DocumentLayout.sections`).
      expect(withSectionPage(layout, { index: 3, count: 3 }, page)).toEqual({
        ...layout,
        page,
        sections: [
          { page: { size: 'A3' }, headers: { default: { html: '<p>h</p>' } } },
          { page: { size: 'A5' } },
          { page },
        ],
      });
    });

    it('L44 : « Section n sur N », page de la section du curseur préremplie et seule appliquée', () => {
      widget.destroy();
      host.remove();
      const layout: DocumentLayout = {
        ...LAYOUT,
        sections: [
          { page: { size: 'A4' }, footers: { default: { html: '<p>Pied 1</p>' } } },
          { page: LAYOUT.page, headers: { default: { html: '<p>Tête 2</p>' } } },
          { page: { size: 'A5', orientation: 'portrait', margins: { topMm: 10 } } },
        ],
      };
      mount({ layout, pageView: true, sections: { count: 3, current: 2 } });
      open();
      const note = panel().querySelector('.aster-page-layout__section');
      expect(note?.textContent).toBe('Section 2 of 3');
      expect(panel().firstElementChild).toBe(note);
      expect(size().value).toBe('Letter');
      expect(orientation('landscape').checked).toBe(true);
      expect(margin('topMm').value).toBe('20');
      size().value = 'A3';
      margin('topMm').value = '30';
      button('Apply').click();
      expect(editor.pageViewCalls).toEqual([
        {
          layout: {
            ...layout,
            sections: [
              layout.sections?.[0],
              {
                ...layout.sections?.[1],
                page: {
                  size: 'A3',
                  orientation: 'landscape',
                  margins: { topMm: 30, rightMm: 15, bottomMm: 20, leftMm: 15, headerMm: 10 },
                },
              },
              layout.sections?.[2],
            ],
          },
        },
      ]);
      expect(editor.pageViewCalls[0]).toMatchObject({ layout: { page: LAYOUT.page } });
      expect(isOpen()).toBe(false);
      // Réouvert (le mock mémorise la mise en page) : la section 2 montre A3.
      open();
      expect(size().value).toBe('A3');
      expect(margin('topMm').value).toBe('30');
      button('Cancel').click();
      editor.i18n.setLocale('fr');
      open();
      expect(panel().querySelector('.aster-page-layout__section')?.textContent).toBe(
        'Section 2 sur 3',
      );
    });

    it('L44 : dernière section du curseur recopiée dans page ; sans sections connues, complété', () => {
      widget.destroy();
      host.remove();
      mount({
        layout: { page: { size: 'A5' }, lang: 'fr-FR' },
        sections: { count: 2, current: 2 },
      });
      open();
      expect(panel().querySelector('.aster-page-layout__section')?.textContent).toBe(
        'Section 2 of 2',
      );
      expect(size().value).toBe('A5');
      orientation('landscape').checked = true;
      enabled().checked = true;
      button('Apply').click();
      const page: PageSetup = {
        size: 'A5',
        orientation: 'landscape',
        margins: { topMm: 25.4, rightMm: 25.4, bottomMm: 25.4, leftMm: 25.4 },
      };
      expect(editor.pageViewCalls).toEqual([
        {
          layout: {
            page,
            lang: 'fr-FR',
            sections: [{ page: { size: 'A5' } }, { page }],
          },
        },
      ]);
      // Sans saut de section dans le document, aucune mention de section.
      widget.destroy();
      host.remove();
      mount({ layout: { sections: [{ page: { size: 'A3' } }] } });
      open();
      expect(panel().querySelector('.aster-page-layout__section')).toBeNull();
      expect(size().value).toBe('A4');
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
