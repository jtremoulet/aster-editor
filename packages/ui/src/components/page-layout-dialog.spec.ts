import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DocumentLayout, PageSetup, PaginatedPageViewOptions } from '@aster-editor/core';
import { applyPageView, createEditor } from '@aster-editor/core';
import {
  createMockEditor,
  type MockEditor,
  type MockEditorOptions,
} from '../testing/mock-editor.js';
import { registerUiTranslations } from '../toolbar/create-toolbar.js';
import type { ToolbarWidget } from '../types.js';
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
} from './page-layout-dialog.js';

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
      // Une seule section sans `sections` : seul `page` change, comme avant. Avec une
      // section déclarée, c'est elle qui est éditée et recopiée au premier niveau (R44-03).
      const page: PageSetup = { size: 'Legal', orientation: 'portrait' };
      expect(withSectionPage({ page: { size: 'A5' } }, { index: 1, count: 1 }, page)).toEqual({
        page,
      });
      expect(withSectionPage(layout, { index: 1, count: 1 }, page)).toEqual({
        ...layout,
        page,
        headers: { default: { html: '<p>h</p>' } },
        sections: [{ page, headers: { default: { html: '<p>h</p>' } } }],
      });
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
      // Sans saut de section dans le document, aucune mention de section ; la page
      // préremplie est celle de la section 1 déclarée, comme l'hôte la rend (R44-03).
      widget.destroy();
      host.remove();
      mount({ layout: { sections: [{ page: { size: 'A3' } }] } });
      open();
      expect(panel().querySelector('.aster-page-layout__section')).toBeNull();
      expect(size().value).toBe('A3');
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

  describe('correctifs R44 (sections)', () => {
    const S1: PageSetup = { size: 'Legal' };
    const S2: PageSetup = { size: 'Letter', orientation: 'landscape', margins: { topMm: 12.7 } };
    const S3: PageSetup = { size: 'A5', margins: { topMm: 10 } };
    /** Trois sections déclarées ; le premier niveau est la copie de la troisième (contrat). */
    const THREE: DocumentLayout = {
      page: S3,
      footers: { default: { html: '<p>Pied 3</p>' } },
      sections: [
        { page: S1, footers: { default: { html: '<p>Pied 1</p>' } } },
        { page: S2, headers: { default: { html: '<p>Tête 2</p>' } }, start: 'continuous' },
        { page: S3, footers: { default: { html: '<p>Pied 3</p>' } } },
      ],
    };
    const sentLayout = (): DocumentLayout => {
      const call = editor.pageViewCalls[0];
      if (typeof call !== 'object' || !call.layout) throw new Error('layout attendu');
      return call.layout;
    };

    it('R44-02 : withSectionPage ne tronque jamais sections ; la dernière du corps est recopiée au premier niveau', () => {
      // Corps à 2 sections, 3 déclarées : la section 3 (en-têtes, pieds) survit, l'invariant tient.
      const edited = withSectionPage(THREE, { index: 1, count: 2 }, { size: 'A3' });
      expect(edited.sections).toHaveLength(3);
      expect(edited.sections?.[0]).toEqual({ ...THREE.sections?.[0], page: { size: 'A3' } });
      expect(edited.sections?.[1]).toBe(THREE.sections?.[1]);
      expect(edited.sections?.[2]).toBe(THREE.sections?.[2]);
      expect(edited.page).toBe(edited.sections?.at(-1)?.page);
      expect(edited.footers).toEqual(edited.sections?.at(-1)?.footers);
      // Dernière section du corps éditée : `page` et consorts suivent la dernière entrée.
      const last = withSectionPage(THREE, { index: 3, count: 3 }, { size: 'A3' });
      expect(last.sections?.[2]?.page).toEqual({ size: 'A3' });
      expect(last.page).toEqual({ size: 'A3' });
      expect(last.footers).toBe(THREE.sections?.[2]?.footers);
      expect(last.headers).toBeUndefined();
      // Un premier niveau orphelin (en-tête sans équivalent dans la dernière section) est retiré.
      const orphan: DocumentLayout = {
        ...THREE,
        headers: { default: { html: '<p>Orphelin</p>' } },
        columns: 2,
      };
      const synced = withSectionPage(orphan, { index: 3, count: 3 }, { size: 'A3' });
      expect(synced.headers).toBeUndefined();
      expect(synced.columns).toBeUndefined();
      expect(synced.lang).toBe(orphan.lang);
      // Section intermédiaire : rien ne bouge au premier niveau.
      const middle = withSectionPage(THREE, { index: 2, count: 3 }, { size: 'A3' });
      expect(middle.page).toBe(THREE.page);
      expect(middle.sections?.[1]).toEqual({ ...THREE.sections?.[1], page: { size: 'A3' } });
      // Un `sections` qui n'est pas un tableau vaut aucune section.
      expect(
        withSectionPage({ sections: 'x' as never }, { index: 1, count: 1 }, { size: 'A3' }),
      ).toEqual({ sections: 'x', page: { size: 'A3' } });
    });

    it('R44-03 : corps sans saut mais sections déclarées : préremplit et édite sections[0], comme l’hôte', () => {
      widget.destroy();
      host.remove();
      mount({ layout: THREE, pageView: true });
      open();
      expect(panel().querySelector('.aster-page-layout__section')).toBeNull();
      // L'hôte rend sections[0] (Legal), pas la copie de la dernière section (A5).
      expect(size().value).toBe('Legal');
      size().value = 'A3';
      button('Apply').click();
      const sent = sentLayout();
      expect(sent.sections).toHaveLength(3);
      expect(sent.sections?.[0]?.page?.size).toBe('A3');
      expect(sent.sections?.[0]?.footers).toBe(THREE.sections?.[0]?.footers);
      expect(sent.sections?.[1]).toBe(THREE.sections?.[1]);
      expect(sent.sections?.[2]).toBe(THREE.sections?.[2]);
      // Invariant du contrat : le premier niveau reste la copie de la dernière entrée.
      expect(sent.page).toBe(S3);
      // Réouvert : la section 1 montre A3.
      open();
      expect(size().value).toBe('A3');
    });

    it('R44-06 : la section affichée est celle de la tête ; une sélection à cheval est signalée (fr / en)', () => {
      expect(
        sectionOfSelection(createMockEditor({ sections: { count: 3, current: 2, anchor: 3 } })),
      ).toEqual({ index: 2, count: 3, mixed: true });
      expect(
        sectionOfSelection(createMockEditor({ sections: { count: 3, current: 3, anchor: 1 } })),
      ).toEqual({ index: 3, count: 3, mixed: true });
      expect(
        sectionOfSelection(createMockEditor({ sections: { count: 3, current: 1, anchor: 1 } })),
      ).toEqual({ index: 1, count: 3 });
      widget.destroy();
      host.remove();
      mount({ layout: THREE, pageView: true, sections: { count: 3, current: 2, anchor: 3 } });
      open();
      expect(panel().querySelector('.aster-page-layout__section')?.textContent).toBe(
        'Section 2 of 3 — the selection spans several sections',
      );
      expect(size().value).toBe('Letter');
      button('Cancel').click();
      editor.i18n.setLocale('fr');
      open();
      expect(panel().querySelector('.aster-page-layout__section')?.textContent).toBe(
        'Section 2 sur 3 — la sélection couvre plusieurs sections',
      );
    });

    it('R44-06 : sur un éditeur réel, curseur sur le hr → section qui s’y termine ; tête et bornes réelles', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const element = document.createElement('div');
      container.append(element);
      const real = createEditor({
        element,
        content:
          '<p>un</p><hr data-section-break="1"><p>deux</p><hr data-section-break="2"><p>trois</p>',
      });
      try {
        const { doc } = real.tiptap.state;
        const breaks: number[] = [];
        const texts = new Map<string, number>();
        doc.forEach((node, offset) => {
          if (node.type.name === 'sectionBreak') breaks.push(offset);
          else texts.set(node.textContent, offset + 1);
        });
        real.tiptap.commands.setNodeSelection(breaks[0]!);
        expect(sectionOfSelection(real)).toEqual({ index: 1, count: 3 });
        real.tiptap.commands.setNodeSelection(breaks[1]!);
        expect(sectionOfSelection(real)).toEqual({ index: 2, count: 3 });
        // De « un » à « trois » : la tête est dans la section 3, la sélection couvre 1 à 3.
        real.tiptap.commands.setTextSelection({
          from: texts.get('un')!,
          to: texts.get('trois')! + 3,
        });
        expect(sectionOfSelection(real)).toEqual({ index: 3, count: 3, mixed: true });
        // Inversée (ancre dans « trois », tête dans « deux ») : la tête compte, pas la borne basse.
        real.tiptap.commands.setTextSelection({
          from: texts.get('trois')! + 1,
          to: texts.get('deux')!,
        });
        expect(sectionOfSelection(real)).toEqual({ index: 2, count: 3, mixed: true });
        real.tiptap.commands.setTextSelection({
          from: texts.get('deux')! + 1,
          to: texts.get('deux')! + 3,
        });
        expect(sectionOfSelection(real)).toEqual({ index: 2, count: 3 });
        // Sélection de tout le document : à cheval, tête dans la dernière section.
        real.tiptap.commands.selectAll();
        expect(sectionOfSelection(real)).toEqual({ index: 3, count: 3, mixed: true });
      } finally {
        real.destroy();
        container.remove();
      }
    });
  });

  describe('en-têtes et pieds (L54)', () => {
    const rich = (kind: 'headers' | 'footers', type: 'default' | 'first' | 'even'): HTMLElement =>
      panel().querySelector<HTMLElement>(`.aster-page-layout__${kind}-${type}`)!;
    const richShown = (kind: 'headers' | 'footers', type: 'default' | 'first' | 'even'): boolean =>
      !rich(kind, type).parentElement!.hasAttribute('hidden');
    const titlePage = (): HTMLInputElement =>
      panel().querySelector<HTMLInputElement>('.aster-page-layout__title-page')!;
    const evenPages = (): HTMLInputElement =>
      panel().querySelector<HTMLInputElement>('.aster-page-layout__even-pages')!;
    /** Saisie simulée : remplace le contenu et signale l'`input` (un champ intact n'est pas réécrit, R52-02). */
    const edit = (
      kind: 'headers' | 'footers',
      type: 'default' | 'first' | 'even',
      html: string,
    ): void => {
      rich(kind, type).innerHTML = html;
      rich(kind, type).dispatchEvent(new Event('input', { bubbles: true }));
    };
    const sentLayout = (index = 0): DocumentLayout => {
      const call = editor.pageViewCalls[index];
      if (typeof call !== 'object' || !call.layout) throw new Error('layout attendu');
      return call.layout;
    };
    /** Fixture 18 en miniature : première page sur la 1, pages paires sur la 2, pied sur la 3. */
    const TRIPLE: DocumentLayout = {
      page: { size: 'A4' },
      footers: { default: { html: '<p>Pied 3</p>' } },
      sections: [
        {
          page: { size: 'A4' },
          headers: {
            default: { html: '<p>Section 1</p>' },
            first: { html: '<p>Première page</p>' },
          },
          titlePage: true,
        },
        {
          page: { size: 'Letter', orientation: 'landscape' },
          headers: {
            default: { html: '<p>Section 2</p>' },
            even: { html: '<p>Section 2 paire</p>' },
          },
        },
        { page: { size: 'A4' }, footers: { default: { html: '<p>Pied 3</p>' } } },
      ],
    };

    it('affiche les champs de la section du curseur : default toujours, first si titlePage, even si présent', () => {
      widget.destroy();
      host.remove();
      mount({ layout: TRIPLE, pageView: true, sections: { count: 3, current: 1 } });
      open();
      const group = panel().querySelector('.aster-page-layout__headers');
      expect(group?.getAttribute('aria-label')).toBe('Header and footer');
      expect(group?.querySelector('.aster-page-layout__hint')?.textContent).toContain(
        'Enter starts a new paragraph',
      );
      expect(titlePage().checked).toBe(true);
      expect(evenPages().checked).toBe(false);
      expect(rich('headers', 'default').innerHTML).toBe('<p>Section 1</p>');
      expect(rich('headers', 'first').innerHTML).toBe('<p>Première page</p>');
      expect(richShown('headers', 'first')).toBe(true);
      expect(richShown('headers', 'even')).toBe(false);
      expect(richShown('footers', 'first')).toBe(true);
      expect(rich('footers', 'default').innerHTML).toBe('');
      expect(rich('headers', 'default').getAttribute('contenteditable')).toBe('true');
      button('Cancel').click();
      editor.i18n.setLocale('fr');
      open();
      expect(panel().querySelector('.aster-page-layout__headers')?.getAttribute('aria-label')).toBe(
        'En-tête et pied',
      );
      expect(
        panel().querySelector(`label[for="${rich('headers', 'first').id}"]`)?.textContent,
      ).toBe('En-tête de première page');
      expect(titlePage().parentElement?.textContent).toBe('Première page différente');
      expect(evenPages().parentElement?.textContent).toBe('Pages paires différentes');
      button('Annuler').click();
      // Section 2 : pas de première page, un en-tête pair.
      widget.destroy();
      host.remove();
      mount({ layout: TRIPLE, pageView: true, sections: { count: 3, current: 2 } });
      open();
      expect(titlePage().checked).toBe(false);
      expect(evenPages().checked).toBe(true);
      expect(richShown('headers', 'first')).toBe(false);
      expect(richShown('headers', 'even')).toBe(true);
      expect(rich('headers', 'even').innerHTML).toBe('<p>Section 2 paire</p>');
      expect(rich('headers', 'default').innerHTML).toBe('<p>Section 2</p>');
    });

    it('assainit la saisie : <script> et onclick retirés, b / i / div normalisés', () => {
      open();
      edit(
        'headers',
        'default',
        '<p onclick="alert(1)">Titre<script>alert(1)</script></p><div><b>gras</b> <i>it</i></div>',
      );
      enabled().checked = true;
      button('Apply').click();
      expect(sentLayout()).toEqual({
        page: {
          size: 'A4',
          orientation: 'portrait',
          margins: { topMm: 25.4, rightMm: 25.4, bottomMm: 25.4, leftMm: 25.4 },
        },
        headers: { default: { html: '<p>Titre</p><p><strong>gras</strong> <em>it</em></p>' } },
      });
      expect(isOpen()).toBe(false);
    });

    it('un champ vidé retire le type, un jeu vide est retiré ; un contenu inchangé garde sa référence', () => {
      widget.destroy();
      host.remove();
      const layout: DocumentLayout = {
        headers: { default: { html: '<p>H</p>' } },
        footers: { default: { html: '<p>F</p>' } },
      };
      mount({ layout, pageView: true });
      open();
      edit('headers', 'default', '<p><br></p>');
      button('Apply').click();
      const sent = sentLayout();
      expect(sent.headers).toBeUndefined();
      expect('headers' in sent).toBe(false);
      expect(sent.footers).toEqual(layout.footers);
      expect(sent.footers?.default).toBe(layout.footers?.default);
    });

    it('R52-02 : « Appliquer » sans édition laisse headers et footers identiques (même référence)', () => {
      widget.destroy();
      host.remove();
      const layout: DocumentLayout = {
        headers: { default: { html: '<p style="border-bottom: 1pt solid #000000"></p>' } },
        footers: { default: { html: '<div><div>Pied</div></div>' }, even: { html: '<hr>' } },
      };
      mount({ layout, pageView: true });
      open();
      expect(evenPages().checked).toBe(true);
      button('Apply').click();
      const sent = sentLayout();
      expect(sent.headers).toBe(layout.headers);
      expect(sent.footers).toBe(layout.footers);
    });

    it('« Première page différente » pose titlePage et écrit first ; décochée, titlePage est retiré et first conservé (R52-03)', () => {
      open();
      expect(richShown('headers', 'first')).toBe(false);
      titlePage().click();
      expect(titlePage().checked).toBe(true);
      expect(richShown('headers', 'first')).toBe(true);
      expect(richShown('footers', 'first')).toBe(true);
      edit('headers', 'first', '<p>Première</p>');
      enabled().checked = true;
      button('Apply').click();
      expect(sentLayout()).toMatchObject({
        headers: { first: { html: '<p>Première</p>' } },
        titlePage: true,
      });
      expect(sentLayout().footers).toBeUndefined();
      // Réouvert (le mock mémorise) : la case et le champ suivent ; décocher retire
      // `titlePage` seulement, la partie `first` reste (comme Word), même référence.
      open();
      expect(titlePage().checked).toBe(true);
      expect(rich('headers', 'first').innerHTML).toBe('<p>Première</p>');
      titlePage().click();
      expect(richShown('headers', 'first')).toBe(false);
      button('Apply').click();
      expect(sentLayout(1).titlePage).toBeUndefined();
      expect(sentLayout(1).headers).toBe(sentLayout(0).headers);
      expect(sentLayout(1).headers).toEqual({ first: { html: '<p>Première</p>' } });
    });

    it('dernière section du corps : en-têtes et pieds recopiés au premier niveau (invariant)', () => {
      widget.destroy();
      host.remove();
      mount({ layout: TRIPLE, pageView: true, sections: { count: 3, current: 3 } });
      open();
      expect(rich('footers', 'default').innerHTML).toBe('<p>Pied 3</p>');
      edit('footers', 'default', '<p>Nouveau pied</p>');
      edit('headers', 'default', '<p>Tête 3</p>');
      button('Apply').click();
      const sent = sentLayout();
      expect(sent.sections?.[2]).toEqual({
        page: {
          size: 'A4',
          orientation: 'portrait',
          margins: { topMm: 25.4, rightMm: 25.4, bottomMm: 25.4, leftMm: 25.4 },
        },
        headers: { default: { html: '<p>Tête 3</p>' } },
        footers: { default: { html: '<p>Nouveau pied</p>' } },
      });
      expect(sent.footers).toBe(sent.sections?.[2]?.footers);
      expect(sent.headers).toBe(sent.sections?.[2]?.headers);
      expect(sent.titlePage).toBeUndefined();
      expect(sent.sections?.[0]).toBe(TRIPLE.sections?.[0]);
      expect(sent.sections?.[1]).toBe(TRIPLE.sections?.[1]);
    });

    it('section intermédiaire : son entrée seule change, le premier niveau reste celui de la dernière', () => {
      widget.destroy();
      host.remove();
      mount({ layout: TRIPLE, pageView: true, sections: { count: 3, current: 2 } });
      open();
      edit('headers', 'default', '<p>Section 2 bis</p>');
      button('Apply').click();
      const sent = sentLayout();
      expect(sent.sections?.[1]?.headers).toEqual({
        default: { html: '<p>Section 2 bis</p>' },
        even: { html: '<p>Section 2 paire</p>' },
      });
      expect(sent.sections?.[1]?.headers?.even).toBe(TRIPLE.sections?.[1]?.headers?.even);
      expect(sent.sections?.[1]?.page).toEqual({
        size: 'Letter',
        orientation: 'landscape',
        margins: { topMm: 25.4, rightMm: 25.4, bottomMm: 25.4, leftMm: 25.4 },
      });
      expect(sent.sections?.[0]).toBe(TRIPLE.sections?.[0]);
      expect(sent.sections?.[2]).toBe(TRIPLE.sections?.[2]);
      expect(sent.headers).toBeUndefined();
      expect(sent.footers).toBe(TRIPLE.footers);
      expect(sent.page).toBe(TRIPLE.page);
      // Entrée dans un champ riche ne valide pas le dialogue.
      open();
      rich('headers', 'default').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      expect(isOpen()).toBe(true);
      expect(editor.pageViewCalls).toHaveLength(1);
    });
  });
});
