import { afterEach, describe, expect, it } from 'vitest';
import type { DocumentLayout, SectionLayout } from '@aster-editor/core';
import { withSectionLayout } from './page-layout-dialog.js';
import { createHeaderFooterSection } from './page-layout-headers.js';
import { createRichField, normalizeFieldHtml, type RichField } from './rich-field.js';

/** Place le curseur (sélection réduite) dans un nœud texte à l'offset donné. */
function caretAt(node: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function pressEnter(field: HTMLElement, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  field.dispatchEvent(event);
  return event;
}

/** Collage simulé : jsdom n'a pas de `ClipboardEvent`, un `Event` porte `clipboardData`. */
function paste(field: HTMLElement, text: string): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  field.dispatchEvent(event);
  return event;
}

const t = (key: string): string => key.replace('ui.pageLayout.', '');

describe('normalizeFieldHtml (L54)', () => {
  it('assainit : <script>, on* et URL dangereuses retirés, data-aster-variable conservé', () => {
    expect(normalizeFieldHtml('<p onclick="x()">Titre<script>alert(1)</script></p>')).toBe(
      '<p>Titre</p>',
    );
    expect(normalizeFieldHtml('<p><a href="javascript:x">lien</a></p>')).toBe('<p><a>lien</a></p>');
    expect(
      normalizeFieldHtml('<p><span data-aster-variable="client.nom">{{client.nom}}</span></p>'),
    ).toBe('<p><span data-aster-variable="client.nom">{{client.nom}}</span></p>');
    // Un `{{nom}}` tapé reste du texte : pas de conversion en puce dans l'éditeur minimal.
    expect(normalizeFieldHtml('<p>Bonjour {{nom}}</p>')).toBe('<p>Bonjour {{nom}}</p>');
  });

  it('normalise : div → p, b → strong, i → em, inline de premier niveau enveloppé, <br> finaux retirés', () => {
    expect(normalizeFieldHtml('<div>a<br></div>')).toBe('<p>a</p>');
    expect(normalizeFieldHtml('texte <b>g</b> et <i>it</i>')).toBe(
      '<p>texte <strong>g</strong> et <em>it</em></p>',
    );
    expect(normalizeFieldHtml('<h1>T</h1>suite<p>fin</p>')).toBe(
      '<h1>T</h1><p>suite</p><p>fin</p>',
    );
    expect(normalizeFieldHtml('<p>a<br><br></p><p><b>b</b></p>')).toBe(
      '<p>a</p><p><strong>b</strong></p>',
    );
    // Une liste ou un tableau sont des blocs conservés tels quels.
    expect(normalizeFieldHtml('<ul><li>x</li></ul>')).toBe('<ul><li>x</li></ul>');
  });

  it('vide → "" (paragraphes vides, blancs, <br> seuls, <script> seul) ; une image compte', () => {
    for (const html of [
      '',
      '   ',
      '<p><br></p>',
      '<p></p><p> </p>',
      '<br>',
      '<script>x</script>',
    ]) {
      expect(normalizeFieldHtml(html), JSON.stringify(html)).toBe('');
    }
    expect(normalizeFieldHtml('<p><img src="data:image/png;base64,AA=="></p>')).toBe(
      '<p><img src="data:image/png;base64,AA=="></p>',
    );
  });
});

describe('createRichField (L54)', () => {
  let rich: RichField;
  const mount = (html: string): RichField => {
    rich = createRichField({ id: 'f', label: 'En-tête', html, placeholder: 'Aucun' });
    document.body.append(rich.wrapper);
    return rich;
  };
  const text = (field: HTMLElement, selector: string): Text => {
    const node = field.querySelector(selector)?.firstChild;
    if (!(node instanceof Text)) throw new Error(`texte attendu dans ${selector}`);
    return node;
  };

  afterEach(() => {
    rich.wrapper.remove();
    document.getSelection()?.removeAllRanges();
  });

  it('monte une zone contenteditable libellée, au contenu initial assaini', () => {
    const { field, wrapper } = mount('<p>Titre<script>alert(1)</script></p>');
    expect(field.getAttribute('contenteditable')).toBe('true');
    expect(field.getAttribute('role')).toBe('textbox');
    expect(field.getAttribute('aria-multiline')).toBe('true');
    expect(field.getAttribute('data-placeholder')).toBe('Aucun');
    expect(field.innerHTML).toBe('<p>Titre</p>');
    const label = wrapper.querySelector('label');
    expect(label?.textContent).toBe('En-tête');
    expect(field.getAttribute('aria-labelledby')).toBe(label?.id);
    label?.click();
    expect(document.activeElement).toBe(field);
    expect(rich.getHtml()).toBe('<p>Titre</p>');
  });

  it('Entrée scinde le paragraphe au curseur (et ne remonte pas au dialogue), Maj+Entrée insère un <br>', () => {
    const { field } = mount('<p>ab<strong>cd</strong></p>');
    caretAt(text(field, 'strong'), 1);
    const event = pressEnter(field);
    expect(event.defaultPrevented).toBe(true);
    expect(field.innerHTML).toBe('<p>ab<strong>c</strong></p><p><strong>d</strong></p>');
    // Le curseur est au début du nouveau paragraphe : une seconde Entrée y laisse un bloc vide.
    pressEnter(field);
    expect(field.innerHTML).toBe('<p>ab<strong>c</strong></p><p><br></p><p><strong>d</strong></p>');
    expect(rich.getHtml()).toBe('<p>ab<strong>c</strong></p><p><strong>d</strong></p>');
    caretAt(text(field, 'p:first-child'), 1);
    pressEnter(field, true);
    expect(field.innerHTML).toBe(
      '<p>a<br>b<strong>c</strong></p><p><br></p><p><strong>d</strong></p>',
    );
  });

  it('Entrée sans sélection dans le champ ajoute un paragraphe à la fin ; champ nu enveloppé', () => {
    const { field } = mount('');
    expect(field.innerHTML).toBe('');
    pressEnter(field);
    expect(field.innerHTML).toBe('<p><br></p><p><br></p>');
    expect(rich.getHtml()).toBe('');
    document.getSelection()?.removeAllRanges();
    field.innerHTML = 'nu';
    pressEnter(field);
    expect(field.innerHTML).toBe('<p>nu</p><p><br></p>');
    // Sélection posée au niveau du champ (devant le premier bloc) : ramenée au début du bloc.
    const range = document.createRange();
    range.setStart(field, 0);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    pressEnter(field);
    expect(field.innerHTML).toBe('<p><br></p><p>nu</p><p><br></p>');
  });

  it('le collage insère le texte brut, un paragraphe par ligne, jamais le HTML', () => {
    const { field } = mount('<p>ab</p>');
    caretAt(text(field, 'p'), 2);
    const event = paste(field, 'un\ndeux\r\n\ntrois');
    expect(event.defaultPrevented).toBe(true);
    expect(field.innerHTML).toBe('<p>abun</p><p>deux</p><p><br></p><p>trois</p>');
    expect(rich.getHtml()).toBe('<p>abun</p><p>deux</p><p>trois</p>');
    // Champ vide : le texte collé devient le premier paragraphe.
    const empty = mount('');
    paste(empty.field, '<b>x</b>');
    expect(empty.field.innerHTML).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>');
    expect(empty.getHtml()).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>');
    empty.wrapper.remove();
  });
});

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
    // « Première page différente » révèle les champs first ; décocher even les cache.
    section.titlePage.click();
    expect(section.fields.headers.first.wrapper.hasAttribute('hidden')).toBe(false);
    section.fields.headers.first.field.innerHTML = '<p>Première</p>';
    section.evenPages.click();
    expect(section.fields.headers.even.wrapper.hasAttribute('hidden')).toBe(true);
    expect(section.read()).toEqual({
      headers: { default: SECTION.headers?.default, first: { html: '<p>Première</p>' } },
      footers: SECTION.footers,
      titlePage: true,
    });
    // Vider le pied retire le jeu entier.
    section.fields.footers.default.field.innerHTML = '<p><br></p>';
    expect(section.read().footers).toBeUndefined();
    section.element.remove();
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
});
