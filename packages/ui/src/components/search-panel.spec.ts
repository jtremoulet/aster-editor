import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEARCH_COMMAND_IDS, SEARCH_OPEN_EVENT, STANDARD_COMMAND_IDS } from '@aster-editor/core';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import { createWidget } from '../toolbar/widgets';
import type { ToolbarWidget } from '../types';
import { createSearchPanel, readSearchState } from './search-panel';

/** Forme du storage Tiptap que le panneau lit, posée sur le `tiptap` du mock. */
interface FakeSearchStorage {
  query: string;
  caseSensitive: boolean;
  matches: { from: number; to: number }[];
  currentIndex: number;
}

function setStorage(editor: MockEditor, search: Partial<FakeSearchStorage>): void {
  const storage: FakeSearchStorage = {
    query: '',
    caseSensitive: false,
    matches: [],
    currentIndex: -1,
    ...search,
  };
  Object.assign(editor.tiptap, { storage: { search: storage } });
}

describe('createSearchPanel', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  const trigger = (): HTMLButtonElement => widget.element.querySelector('button')!;
  const panel = (): HTMLElement => widget.element.querySelector('.aster-dropdown__panel')!;
  const query = (): HTMLInputElement => panel().querySelector('.aster-search-panel__query')!;
  const replacement = (): HTMLInputElement =>
    panel().querySelector('.aster-search-panel__replacement')!;
  const checkbox = (): HTMLInputElement => panel().querySelector('input[type="checkbox"]')!;
  const count = (): HTMLElement => panel().querySelector('.aster-search-panel__count')!;
  const button = (selector: string): HTMLButtonElement => panel().querySelector(selector)!;
  const isOpen = (): boolean => !panel().hasAttribute('hidden');
  const type = (input: HTMLInputElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const key = (target: HTMLElement, name: string, init: KeyboardEventInit = {}): void => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }),
    );
  };

  beforeEach(() => {
    editor = createMockEditor({ commands: [...STANDARD_COMMAND_IDS, ...SEARCH_COMMAND_IDS] });
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host, editor.element);
    widget = createSearchPanel(editor);
    host.append(widget.element);
  });

  afterEach(() => {
    widget.destroy();
    host.remove();
    editor.element.remove();
  });

  it('rend un déclencheur dialog avec libellé i18n et un panneau complet', () => {
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-label')).toBe('Find and replace');
    expect(trigger().querySelector('svg')).not.toBeNull();
    trigger().click();
    expect(isOpen()).toBe(true);
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(document.activeElement).toBe(query());
    expect(replacement()).not.toBeNull();
    expect(checkbox()).not.toBeNull();
    expect(count().textContent).toBe('0 / 0');
    expect(button('.aster-search-panel__nav').disabled).toBe(true);
    expect(button('.aster-search-panel__replace').disabled).toBe(true);
    expect(button('.aster-search-panel__replace-all').disabled).toBe(true);
    expect(button('.aster-search-panel__close').textContent).toBe('Close');
  });

  it('la saisie lance search.open avec la requête et la casse, vide → search.clear', () => {
    trigger().click();
    type(query(), 'chat');
    expect(editor.calls).toEqual([
      { id: 'search.open', args: { query: 'chat', caseSensitive: false } },
    ]);
    checkbox().checked = true;
    checkbox().dispatchEvent(new Event('change'));
    expect(editor.calls[1]).toEqual({
      id: 'search.open',
      args: { query: 'chat', caseSensitive: true },
    });
    type(query(), '');
    expect(editor.calls[2]).toEqual({ id: 'search.clear', args: undefined });
  });

  it('affiche le compteur depuis le storage et active la navigation', () => {
    setStorage(editor, {
      query: 'chat',
      matches: [
        { from: 1, to: 5 },
        { from: 9, to: 13 },
      ],
      currentIndex: 1,
    });
    trigger().click();
    expect(query().value).toBe('chat');
    expect(count().textContent).toBe('2 / 2');
    expect(button('.aster-search-panel__nav').disabled).toBe(false);
    expect(button('.aster-search-panel__replace').disabled).toBe(false);
  });

  it('précédent / suivant / remplacer / tout remplacer passent par le registre avec les arguments', () => {
    setStorage(editor, { query: 'a', matches: [{ from: 1, to: 2 }], currentIndex: 0 });
    trigger().click();
    replacement().value = 'b';
    const navs = panel().querySelectorAll<HTMLButtonElement>('.aster-search-panel__nav');
    navs[0]!.click();
    navs[1]!.click();
    button('.aster-search-panel__replace').click();
    button('.aster-search-panel__replace-all').click();
    const expected = { query: 'a', caseSensitive: false, replacement: 'b' };
    expect(editor.calls).toEqual([
      { id: 'search.previous', args: expected },
      { id: 'search.next', args: expected },
      { id: 'search.replace', args: expected },
      { id: 'search.replaceAll', args: expected },
    ]);
  });

  it('Entrée → suivant, Maj+Entrée → précédent, Entrée dans le remplacement → remplacer', () => {
    trigger().click();
    query().value = 'x';
    key(query(), 'Enter');
    key(query(), 'Enter', { shiftKey: true });
    key(replacement(), 'Enter');
    expect(editor.calls.map((call) => call.id)).toEqual([
      'search.next',
      'search.previous',
      'search.replace',
    ]);
  });

  it('Fermer efface la recherche, referme et redonne le focus à l’éditeur', () => {
    trigger().click();
    button('.aster-search-panel__close').click();
    expect(editor.calls).toEqual([{ id: 'search.clear', args: undefined }]);
    expect(isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('Échap dans le panneau efface la recherche comme Fermer, puis referme', () => {
    trigger().click();
    key(query(), 'Escape');
    expect(editor.calls).toEqual([{ id: 'search.clear', args: undefined }]);
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
    // Après destroy, Échap sur le panneau n'appelle plus rien.
    widget.destroy();
    key(panel(), 'Escape');
    expect(editor.calls.length).toBe(1);
    widget = createSearchPanel(editor);
    host.append(widget.element);
  });

  it('s’ouvre sur aster:search-open émis par le core, avec la requête du détail', () => {
    editor.element.dispatchEvent(
      new CustomEvent(SEARCH_OPEN_EVENT, { bubbles: true, detail: { query: 'loup' } }),
    );
    expect(isOpen()).toBe(true);
    expect(query().value).toBe('loup');
    expect(document.activeElement).toBe(query());
    // Déjà ouvert : l'événement sans requête ne touche pas la saisie.
    editor.element.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT, { bubbles: true }));
    expect(query().value).toBe('loup');
  });

  it('reflète l’état actif de search.open et se désactive en lecture seule', () => {
    editor.active.add('search.open');
    widget.update();
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    editor.setReadOnly(true);
    widget.update();
    expect(trigger().disabled).toBe(true);
    editor.element.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT, { bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  it('update() resynchronise le compteur quand le panneau est ouvert', () => {
    trigger().click();
    setStorage(editor, { query: 'a', matches: [{ from: 1, to: 2 }], currentIndex: 0 });
    widget.update();
    expect(count().textContent).toBe('1 / 1');
  });

  it('après destroy, l’événement d’ouverture est ignoré', () => {
    widget.destroy();
    editor.element.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT, { bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  it('les libellés suivent la locale', () => {
    editor.i18n.setLocale('fr');
    widget.update();
    expect(trigger().getAttribute('aria-label')).toBe('Rechercher et remplacer');
    trigger().click();
    expect(button('.aster-search-panel__close').textContent).toBe('Fermer');
    expect(query().getAttribute('placeholder')).toBe('Rechercher');
  });

  it('est enregistré comme widget « search » conditionné à search.open', () => {
    expect(createWidget(editor, 'search')).not.toBeNull();
    const bare = createMockEditor();
    expect(createWidget(bare, 'search')).toBeNull();
  });
});

describe('readSearchState', () => {
  it('retourne l’état vide sans storage et normalise un storage partiel', () => {
    const editor = createMockEditor();
    expect(readSearchState(editor)).toEqual({
      query: '',
      caseSensitive: false,
      total: 0,
      current: 0,
    });
    setStorage(editor, { query: 'q', matches: [{ from: 1, to: 2 }], currentIndex: 5 });
    expect(readSearchState(editor)).toEqual({
      query: 'q',
      caseSensitive: false,
      total: 1,
      current: 0,
    });
    Object.assign(editor.tiptap, { storage: { search: 'nope' } });
    expect(readSearchState(editor).total).toBe(0);
  });
});
