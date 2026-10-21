import { describe, expect, it } from 'vitest';
import type { DocumentLayout, SectionLayout } from '@aster-editor/core';
import { withSectionLayout } from './page-layout-dialog.js';
import { createHeaderFooterSection } from './page-layout-headers.js';
import type { RichField } from './rich-field.js';

const t = (key: string): string => key.replace('ui.pageLayout.', '');

/** Saisie simulée : remplace le contenu du champ et signale l'`input` (drapeau « modifié »). */
function edit(rich: RichField, html: string): void {
  rich.field.innerHTML = html;
  rich.field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('createHeaderFooterSection (L54)', () => {
  const SECTION: SectionLayout = {
    headers: { default: { html: '<p>Tête</p>' }, even: { html: '<p>Tête paire</p>' } },
    footers: { default: { html: '<p>Pied</p>' } },
  };

  it('affiche default toujours, first selon titlePage, even selon la présence d’un even', () => {
    const section = createHeaderFooterSection({ section: SECTION, suffix: 'x', t });
    document.body.append(section.element);
    expect(section.element.getAttribute('aria-label')).toBe('headersFooters');
    expect(section.titlePage.checked).toBe(false);
    expect(section.evenPages.checked).toBe(true);
    expect(section.fields.headers.default.field.innerHTML).toBe('<p>Tête</p>');
    expect(section.fields.headers.even.field.innerHTML).toBe('<p>Tête paire</p>');
    expect(section.fields.footers.default.field.innerHTML).toBe('<p>Pied</p>');
    expect(section.fields.headers.first.wrapper.hasAttribute('hidden')).toBe(true);
    expect(section.fields.footers.first.wrapper.hasAttribute('hidden')).toBe(true);
    expect(section.fields.headers.even.wrapper.hasAttribute('hidden')).toBe(false);
    // Lu sans modification : mêmes références que la section, pas de titlePage.
    expect(section.read()).toEqual({ headers: SECTION.headers, footers: SECTION.footers });
    expect(section.read().headers?.default).toBe(SECTION.headers?.default);
    // « Première page différente » révèle les champs first ; décocher even les cache et,
    // la case ayant été cochée à l'ouverture, retire les `even`.
    section.titlePage.click();
    expect(section.fields.headers.first.wrapper.hasAttribute('hidden')).toBe(false);
    edit(section.fields.headers.first, '<p>Première</p>');
    section.evenPages.click();
    expect(section.fields.headers.even.wrapper.hasAttribute('hidden')).toBe(true);
    expect(section.read()).toEqual({
      headers: { default: SECTION.headers?.default, first: { html: '<p>Première</p>' } },
      footers: SECTION.footers,
      titlePage: true,
    });
    expect(section.read().footers).toBe(SECTION.footers);
    // Vider le pied retire le jeu entier.
    edit(section.fields.footers.default, '<p><br></p>');
    expect(section.read().footers).toBeUndefined();
    section.element.remove();
  });
});

describe('createHeaderFooterSection (F52)', () => {
  const mount = (section: SectionLayout) => {
    const mounted = createHeaderFooterSection({ section, suffix: 'f', t });
    document.body.append(mounted.element);
    return mounted;
  };

  it('R52-02 : un en-tête « filet » et un pied ouvert par une ligne blanche sont lus tels quels, même référence', () => {
    const section: SectionLayout = {
      headers: { default: { html: '<p style="border-bottom: 1pt solid #000000"></p>' } },
      footers: { default: { html: '<p><br></p><p>Pied</p>' } },
    };
    const mounted = mount(section);
    const values = mounted.read();
    expect(values.headers).toBe(section.headers);
    expect(values.footers).toBe(section.footers);
    expect(values.titlePage).toBeUndefined();
    // Un `<hr>` seul et un `even` fait d'un filet comptent aussi : la case est cochée.
    const ruled: SectionLayout = {
      headers: {
        default: { html: '<hr>' },
        even: { html: '<p style="border-top: 1pt solid"></p>' },
      },
    };
    const ruledSection = mount(ruled);
    expect(ruledSection.evenPages.checked).toBe(true);
    expect(ruledSection.read()).toEqual({ headers: ruled.headers });
    expect(ruledSection.read().headers).toBe(ruled.headers);
    mounted.element.remove();
    ruledSection.element.remove();
  });

  it('R52-02 : seul un champ modifié est réécrit ; une saisie équivalente garde la référence lue', () => {
    const section: SectionLayout = {
      headers: {
        default: { html: '<div class="hdr"><div>Gauche</div></div>' },
        first: { html: '<p>Première</p>' },
      },
      footers: { default: { html: '<p>Pied</p>' } },
      titlePage: true,
    };
    const mounted = mount(section);
    // Lecture sans édition : la valeur non normalisée (`<div>`) est rendue telle quelle.
    expect(mounted.read().headers).toBe(section.headers);
    // Une frappe qui ne change rien (flèche) : chaque type équivaut à l'original, même référence.
    mounted.fields.headers.default.field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(mounted.fields.headers.default.isModified()).toBe(true);
    expect(mounted.read().headers).toBe(section.headers);
    // Une édition réelle : le type édité est normalisé, les autres gardent leur référence.
    edit(mounted.fields.headers.default, '<div>Gauche</div><p><br></p><p>Bas</p>');
    const headers = mounted.read().headers;
    expect(headers).toEqual({
      default: { html: '<p>Gauche</p><p></p><p>Bas</p>' },
      first: { html: '<p>Première</p>' },
    });
    expect(headers?.first).toBe(section.headers?.first);
    expect(mounted.read().footers).toBe(section.footers);
    expect(mounted.read().titlePage).toBe(true);
    mounted.element.remove();
  });

  it('R52-03 : first est conservé quand « Première page différente » est décochée (seul titlePage porte le choix)', () => {
    const section: SectionLayout = {
      headers: { default: { html: '<p>D</p>' }, first: { html: '<p>F</p>' } },
      titlePage: false,
    };
    const mounted = mount(section);
    expect(mounted.titlePage.checked).toBe(false);
    expect(mounted.fields.headers.first.wrapper.hasAttribute('hidden')).toBe(true);
    // « Appliquer » à vide : `first` conservé, `titlePage` absent.
    expect(mounted.read()).toEqual({ headers: section.headers });
    expect(mounted.read().headers).toBe(section.headers);
    // L'en-tête `default` édité : `first` masqué reste dans le jeu réécrit, même référence.
    edit(mounted.fields.headers.default, '<p>D2</p>');
    expect(mounted.read().headers).toEqual({
      default: { html: '<p>D2</p>' },
      first: { html: '<p>F</p>' },
    });
    expect(mounted.read().headers?.first).toBe(section.headers?.first);
    // Cochée puis décochée après une saisie : la saisie masquée n'est pas écrite, `first` d'origine reste.
    mounted.titlePage.click();
    edit(mounted.fields.headers.first, '<p>Oubliée</p>');
    mounted.titlePage.click();
    expect(mounted.read().headers?.first).toBe(section.headers?.first);
    expect(mounted.read().titlePage).toBeUndefined();
    // Et réellement cochée : `titlePage` posé, la saisie écrite.
    mounted.titlePage.click();
    expect(mounted.read()).toEqual({
      headers: { default: { html: '<p>D2</p>' }, first: { html: '<p>Oubliée</p>' } },
      titlePage: true,
    });
    mounted.element.remove();
    // Avec `titlePage` vrai et sans édition : tout est conservé, la case est cochée.
    const titled = mount({ ...section, titlePage: true });
    expect(titled.titlePage.checked).toBe(true);
    expect(titled.read()).toEqual({ headers: section.headers, titlePage: true });
    titled.element.remove();
  });

  it('R52-03 : un even masqué à l’ouverture est conservé ; décocher « Pages paires » les retire', () => {
    // `even` vide une fois normalisé : case décochée à l'ouverture, `even` conservé tel quel.
    const blank: SectionLayout = {
      headers: { default: { html: '<p>D</p>' }, even: { html: '<p><br></p>' } },
    };
    const blankSection = mount(blank);
    expect(blankSection.evenPages.checked).toBe(false);
    expect(blankSection.read().headers).toBe(blank.headers);
    edit(blankSection.fields.headers.default, '<p>D2</p>');
    expect(blankSection.read().headers).toEqual({
      default: { html: '<p>D2</p>' },
      even: { html: '<p><br></p>' },
    });
    blankSection.element.remove();
    // `even` présent : décocher la case le retire des deux jeux, même sans autre édition.
    const paired: SectionLayout = {
      headers: { default: { html: '<p>D</p>' }, even: { html: '<p>E</p>' } },
      footers: { even: { html: '<p>FE</p>' } },
    };
    const pairedSection = mount(paired);
    expect(pairedSection.evenPages.checked).toBe(true);
    pairedSection.evenPages.click();
    expect(pairedSection.read()).toEqual({ headers: { default: { html: '<p>D</p>' } } });
    expect(pairedSection.read().headers?.default).toBe(paired.headers?.default);
    // Recochée : rien n'est retiré.
    pairedSection.evenPages.click();
    expect(pairedSection.read().headers).toBe(paired.headers);
    expect(pairedSection.read().footers).toBe(paired.footers);
    pairedSection.element.remove();
  });
});

describe('withSectionLayout (L54)', () => {
  const layout: DocumentLayout = {
    page: { size: 'A5' },
    headers: { default: { html: '<p>H3</p>' } },
    titlePage: true,
    sections: [
      { page: { size: 'A3' }, headers: { default: { html: '<p>H1</p>' } } },
      { page: { size: 'A4' }, footers: { default: { html: '<p>F2</p>' } } },
      { page: { size: 'A5' }, headers: { default: { html: '<p>H3</p>' } }, titlePage: true },
    ],
  };
  const headers = { default: { html: '<p>Nouveau</p>' } };

  it('une clé à undefined retire le champ, une clé absente le conserve', () => {
    // Document d'une seule section sans `sections` : le premier niveau est édité.
    const single: DocumentLayout = { page: { size: 'A4' }, headers, titlePage: true };
    expect(withSectionLayout(single, { index: 1, count: 1 }, { headers: undefined })).toEqual({
      page: { size: 'A4' },
      titlePage: true,
    });
    expect(
      withSectionLayout(single, { index: 1, count: 1 }, { footers: headers, titlePage: undefined }),
    ).toEqual({ page: { size: 'A4' }, headers, footers: headers });
    expect(withSectionLayout(null, { index: 1, count: 1 }, { headers })).toEqual({ headers });
  });

  it('section intermédiaire : seule son entrée change ; dernière : recopiée au premier niveau', () => {
    const middle = withSectionLayout(layout, { index: 2, count: 3 }, { headers, titlePage: true });
    expect(middle.sections?.[1]).toEqual({
      page: { size: 'A4' },
      footers: { default: { html: '<p>F2</p>' } },
      headers,
      titlePage: true,
    });
    expect(middle.sections?.[0]).toBe(layout.sections?.[0]);
    expect(middle.sections?.[2]).toBe(layout.sections?.[2]);
    expect(middle.headers).toBe(layout.headers);
    expect(middle.page).toBe(layout.page);
    const last = withSectionLayout(
      layout,
      { index: 3, count: 3 },
      { headers: undefined, titlePage: undefined, footers: headers },
    );
    expect(last.sections?.[2]).toEqual({ page: { size: 'A5' }, footers: headers });
    expect(last.headers).toBeUndefined();
    expect(last.titlePage).toBeUndefined();
    expect(last.footers).toBe(headers);
    expect(last.page).toEqual({ size: 'A5' });
  });

  it('R52-03 : « Appliquer » à vide sur {default, first, titlePage: false} conserve first', () => {
    const section: SectionLayout = {
      headers: { default: { html: '<p>D</p>' }, first: { html: '<p>F</p>' } },
      titlePage: false,
    };
    const mounted = createHeaderFooterSection({ section, suffix: 'w', t });
    // Comme le dialogue : une clé absente des valeurs lues est passée à `undefined` (retirée).
    const { headers, footers, titlePage } = mounted.read();
    const applied = withSectionLayout(
      { ...section, sections: [section] },
      { index: 1, count: 1 },
      { headers, footers, titlePage },
    );
    expect(applied.headers).toBe(section.headers);
    expect(applied.sections?.[0]?.headers).toBe(section.headers);
    expect(applied.titlePage).toBeUndefined();
  });
});
