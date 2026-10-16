import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsterEditor, AsterVariable } from '@aster-editor/core';
import { createEditor } from '@aster-editor/core';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import { getFullscreen } from './fullscreen';
import {
  VARIABLE_SUGGESTION_PLUGIN_KEY,
  buildSuggestionItems,
  createVariableSuggestion,
  createVariableSuggestionPanel,
  filterVariables,
  insertSuggestedVariable,
  type VariableSuggestion,
  type VariableSuggestionItem,
  type VariableSuggestionPanel,
} from './variable-suggestion';

const LIST: readonly AsterVariable[] = [
  { name: 'client.name', label: 'Client name' },
  { name: 'date', value: '2026-10-16' },
  { name: 'amount', label: 'Total amount' },
  { name: 'city', label: 'Date of birth city' },
];

describe('filterVariables', () => {
  it('renvoie toute la liste pour une requête vide', () => {
    expect(filterVariables('', LIST)).toEqual(LIST);
    expect(filterVariables('  ', LIST)).toEqual(LIST);
  });

  it('filtre par nom ou libellé, insensible à la casse, préfixes de nom d’abord', () => {
    expect(filterVariables('DAT', LIST).map((v) => v.name)).toEqual(['date', 'city']);
    expect(filterVariables('amount', LIST).map((v) => v.name)).toEqual(['amount']);
    expect(filterVariables('total', LIST).map((v) => v.name)).toEqual(['amount']);
    expect(filterVariables('nothing', LIST)).toEqual([]);
  });

  it('ne modifie pas la liste d’origine', () => {
    const copy = [...LIST];
    filterVariables('c', LIST);
    expect(LIST).toEqual(copy);
  });
});

describe('buildSuggestionItems', () => {
  it('ajoute « Créer » pour un nom valide inconnu si autorisé', () => {
    const items = buildSuggestionItems('cli', LIST, true);
    expect(items.map((item) => item.kind)).toEqual(['variable', 'create']);
    expect(items[1]).toEqual({ kind: 'create', name: 'cli' });
  });

  it('pas de « Créer » : non autorisé, nom vide, nom invalide ou déjà connu', () => {
    expect(buildSuggestionItems('cli', LIST, false).map((i) => i.kind)).toEqual(['variable']);
    expect(buildSuggestionItems('', LIST, true).every((i) => i.kind === 'variable')).toBe(true);
    expect(buildSuggestionItems('bad name', LIST, true)).toEqual([]);
    expect(buildSuggestionItems('amount', LIST, true).map((i) => i.kind)).toEqual(['variable']);
  });
});

describe('createVariableSuggestionPanel', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let panel: VariableSuggestionPanel;
  let onDismiss: ReturnType<typeof vi.fn<() => void>>;
  let command: ReturnType<typeof vi.fn<(item: VariableSuggestionItem) => void>>;

  beforeEach(() => {
    editor = createMockEditor({ variables: LIST });
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    host.append(editor.element);
    onDismiss = vi.fn();
    command = vi.fn();
    panel = createVariableSuggestionPanel(editor, { onDismiss });
  });

  afterEach(() => {
    panel.destroy();
    host.remove();
  });

  const items = (query: string, allowCreate = true): readonly VariableSuggestionItem[] =>
    buildSuggestionItems(query, LIST, allowCreate);
  const options = (): HTMLButtonElement[] =>
    Array.from(panel.element.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  const key = (name: string): KeyboardEvent =>
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  const rect =
    (left: number, bottom: number): (() => DOMRect) =>
    () =>
      ({ left, top: bottom - 20, right: left + 10, bottom, width: 10, height: 20 }) as DOMRect;

  it('rend les entrées dans l’éditeur, première surlignée, positionné sous le curseur', () => {
    expect(panel.isOpen()).toBe(false);
    panel.update({ items: items(''), command, clientRect: rect(100, 50) });
    expect(panel.isOpen()).toBe(true);
    expect(editor.element.contains(panel.element)).toBe(true);
    expect(panel.element.getAttribute('role')).toBe('listbox');
    expect(panel.element.getAttribute('aria-label')).toBe('Variable suggestions');
    expect(panel.element.hasAttribute('hidden')).toBe(false);
    expect(options().length).toBe(4);
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
    expect(options()[1]?.getAttribute('aria-selected')).toBe('false');
    expect(panel.selectedIndex()).toBe(0);
    expect(options()[0]?.dataset['name']).toBe('client.name');
    expect(options()[0]?.querySelector('.aster-variable-entry__label')?.textContent).toBe(
      'Client name',
    );
    expect(options()[1]?.querySelector('.aster-variable-entry__value')?.textContent).toBe(
      '2026-10-16',
    );
    expect(panel.element.style.left).toBe('100px');
    expect(panel.element.style.top).toBe('54px');
  });

  it('affiche « Créer {{xxx}} » et le transmet à command au clic', () => {
    panel.update({ items: items('cli'), command });
    expect(options().length).toBe(2);
    expect(options()[1]?.classList.contains('aster-variable-suggestion__option--create')).toBe(
      true,
    );
    expect(options()[1]?.textContent).toBe('Create {{cli}}');
    options()[1]?.click();
    expect(command).toHaveBeenCalledWith({ kind: 'create', name: 'cli' });
  });

  it('↑/↓ déplacent le surlignage en boucle, Entrée choisit, Échap est consommé', () => {
    panel.update({ items: items(''), command });
    expect(panel.onKeyDown(key('ArrowDown'))).toBe(true);
    expect(panel.selectedIndex()).toBe(1);
    expect(options()[1]?.classList.contains('aster-variable-suggestion__option--selected')).toBe(
      true,
    );
    expect(panel.onKeyDown(key('ArrowUp'))).toBe(true);
    expect(panel.onKeyDown(key('ArrowUp'))).toBe(true);
    expect(panel.selectedIndex()).toBe(3);
    expect(panel.onKeyDown(key('ArrowDown'))).toBe(true);
    expect(panel.selectedIndex()).toBe(0);
    expect(panel.onKeyDown(key('a'))).toBe(false);
    expect(panel.onKeyDown(key('Enter'))).toBe(true);
    expect(command).toHaveBeenCalledWith({ kind: 'variable', variable: LIST[0] });
    expect(panel.onKeyDown(key('Escape'))).toBe(true);
    panel.hide();
    expect(panel.onKeyDown(key('ArrowDown'))).toBe(false);
  });

  it('le survol surligne, sans rien choisir', () => {
    panel.update({ items: items(''), command });
    options()[2]?.dispatchEvent(new Event('pointerenter'));
    expect(panel.selectedIndex()).toBe(2);
    expect(command).not.toHaveBeenCalled();
  });

  it('sans entrée : panneau caché et touches non consommées (sauf Échap)', () => {
    panel.update({ items: [], command });
    expect(panel.isOpen()).toBe(true);
    expect(panel.element.hasAttribute('hidden')).toBe(true);
    expect(panel.selectedIndex()).toBe(-1);
    expect(panel.onKeyDown(key('Enter'))).toBe(false);
    expect(panel.onKeyDown(key('ArrowDown'))).toBe(false);
    expect(panel.onKeyDown(key('Escape'))).toBe(true);
    panel.update({ items: items('d'), command });
    expect(panel.element.hasAttribute('hidden')).toBe(false);
  });

  it('un clic hors du panneau et de l’éditeur appelle onDismiss, pas un clic dedans', () => {
    panel.update({ items: items(''), command });
    options()[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    editor.contentElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    panel.hide();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('reste dans le viewport et se repositionne au défilement', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true });
    panel.element.getBoundingClientRect = (): DOMRect =>
      ({ width: 200, height: 100, left: 0, top: 0, right: 200, bottom: 100 }) as DOMRect;
    try {
      let left = 250;
      panel.update({ items: items(''), command, clientRect: () => rect(left, 40)() });
      expect(panel.element.style.left).toBe('92px');
      left = 10;
      window.dispatchEvent(new Event('scroll'));
      expect(panel.element.style.left).toBe('10px');
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
    }
  });

  it('pose aria-controls / aria-expanded / aria-activedescendant sur le contenu, retirés à hide (V-6)', () => {
    const content = editor.contentElement;
    expect(content.hasAttribute('aria-controls')).toBe(false);
    panel.update({ items: items(''), command });
    expect(panel.element.id).toMatch(/^aster-variable-suggestion-/);
    expect(content.getAttribute('aria-controls')).toBe(panel.element.id);
    expect(content.getAttribute('aria-expanded')).toBe('true');
    expect(options().map((option) => option.id)).toEqual([
      'aster-variable-option-0',
      'aster-variable-option-1',
      'aster-variable-option-2',
      'aster-variable-option-3',
    ]);
    expect(content.getAttribute('aria-activedescendant')).toBe('aster-variable-option-0');
    panel.onKeyDown(key('ArrowDown'));
    expect(content.getAttribute('aria-activedescendant')).toBe('aster-variable-option-1');
    options()[3]?.dispatchEvent(new Event('pointerenter'));
    expect(content.getAttribute('aria-activedescendant')).toBe('aster-variable-option-3');
    // Sans entrée : pas de descendant actif, le panneau reste contrôlé.
    panel.update({ items: [], command });
    expect(content.hasAttribute('aria-activedescendant')).toBe(false);
    expect(content.getAttribute('aria-expanded')).toBe('true');
    panel.hide();
    expect(content.hasAttribute('aria-controls')).toBe(false);
    expect(content.hasAttribute('aria-expanded')).toBe(false);
    expect(content.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('bascule au-dessus du curseur quand le panneau ne tient pas en dessous (V-14)', () => {
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true });
    panel.element.getBoundingClientRect = (): DOMRect =>
      ({ width: 100, height: 100, left: 0, top: 0, right: 100, bottom: 100 }) as DOMRect;
    try {
      // Tient en dessous : 54 + 100 ≤ 200.
      panel.update({ items: items(''), command, clientRect: rect(10, 50) });
      expect(panel.element.style.top).toBe('54px');
      // Ne tient plus : 174 + 100 > 200 → au-dessus du texte (top 150) : 150 - 100 - 4.
      panel.update({ items: items(''), command, clientRect: rect(10, 170) });
      expect(panel.element.style.top).toBe('46px');
      // Ne tient ni dessous ni dessus : ramené dans le viewport.
      panel.update({ items: items(''), command, clientRect: rect(10, 110) });
      expect(panel.element.style.top).toBe('0px');
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true });
    }
  });

  it('hide vide et cache, destroy retire l’élément', () => {
    panel.update({ items: items(''), command });
    panel.hide();
    expect(panel.isOpen()).toBe(false);
    expect(panel.element.hasAttribute('hidden')).toBe(true);
    expect(options().length).toBe(0);
    panel.hide();
    panel.destroy();
    expect(panel.element.isConnected).toBe(false);
  });
});

describe('insertSuggestedVariable', () => {
  it('supprime le texte saisi puis insère la variable, et rend le focus', () => {
    const editor = createMockEditor({ variables: LIST });
    const range = { from: 3, to: 9 };
    insertSuggestedVariable(editor, range, { kind: 'variable', variable: LIST[0]! });
    expect(editor.deletedRanges).toEqual([range]);
    expect(editor.calls).toEqual([
      { id: 'variable.insert', args: { name: 'client.name', label: 'Client name' } },
    ]);
    expect(editor.focusCalls).toBe(1);
    insertSuggestedVariable(editor, range, { kind: 'create', name: 'city' });
    expect(editor.calls[1]).toEqual({ id: 'variable.insert', args: { name: 'city' } });
  });

  it('ne touche à rien si le core refuse l’insertion', () => {
    const editor = createMockEditor({ variables: LIST, allowUnknownVariables: false });
    expect(
      insertSuggestedVariable(editor, { from: 0, to: 2 }, { kind: 'create', name: 'unknown' }),
    ).toBe(false);
    expect(editor.deletedRanges).toEqual([]);
    expect(editor.calls).toEqual([]);
  });
});

describe('createVariableSuggestion', () => {
  it('enregistre le plugin Suggestion sur l’éditeur et le retire au destroy', () => {
    const editor = createMockEditor({ variables: LIST });
    registerUiTranslations(editor);
    const suggestion = createVariableSuggestion(editor);
    expect(editor.plugins.length).toBe(1);
    expect(editor.plugins[0]?.spec.key).toBe(VARIABLE_SUGGESTION_PLUGIN_KEY);
    expect(suggestion.panel.isOpen()).toBe(false);
    suggestion.destroy();
    expect(editor.plugins.length).toBe(0);
    expect(suggestion.panel.element.isConnected).toBe(false);
  });

  it('ne désenregistre rien sur un éditeur détruit', () => {
    const editor = createMockEditor({ variables: LIST });
    const suggestion = createVariableSuggestion(editor);
    editor.destroy();
    suggestion.destroy();
    expect(editor.plugins.length).toBe(1);
  });
});

/**
 * Intégration avec le vrai core (Tiptap + ProseMirror sous jsdom) : l'ordre des plugins
 * et la frappe réelle ne se simulent pas avec le mock.
 */
describe('createVariableSuggestion avec le vrai core', () => {
  let host: HTMLElement;
  let editor: AsterEditor;
  let suggestion: VariableSuggestion;

  /** Laisse le plugin Suggestion récupérer ses entrées (`items` est attendu en asynchrone). */
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const press = (key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    editor.contentElement.dispatchEvent(event);
    return event;
  };
  /** Place le curseur juste après le texte `text` (première occurrence). */
  const cursorAfter = (text: string): void => {
    let at = -1;
    editor.tiptap.state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText && node.text?.includes(text)) {
        at = pos + (node.text?.indexOf(text) ?? 0) + text.length;
      }
      return at < 0;
    });
    editor.tiptap.commands.setTextSelection(at);
  };
  const type = async (text: string): Promise<void> => {
    editor.tiptap.view.dispatch(editor.tiptap.state.tr.insertText(text));
    await flush();
  };
  const html = (): string => editor.getHTML().replace(/<p><\/p>$/, '');
  const CHIP =
    '<span data-aster-variable="client.name" data-label="Client name">{{client.name}}</span>';

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    editor = createEditor({
      element: host,
      content: '<p>Bonjour</p>',
      variables: { variables: [{ name: 'client.name', label: 'Client name' }] },
    });
    registerUiTranslations(editor);
    suggestion = createVariableSuggestion(editor);
  });

  afterEach(() => {
    suggestion.destroy();
    if (!editor.isDestroyed()) editor.destroy();
    host.remove();
  });

  it('enregistre le plugin en tête, avant les keymaps de Tiptap', () => {
    expect(editor.tiptap.state.plugins[0]?.spec.key).toBe(VARIABLE_SUGGESTION_PLUGIN_KEY);
  });

  it('Entrée dans le panneau insère la puce sans couper le paragraphe (V-1)', async () => {
    cursorAfter('Bonjour');
    await type(' {{cl');
    expect(suggestion.panel.isOpen()).toBe(true);
    expect(suggestion.panel.element.hasAttribute('hidden')).toBe(false);
    expect(suggestion.panel.selectedIndex()).toBe(0);
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(html()).toBe(`<p>Bonjour ${CHIP}</p>`);
    expect(editor.tiptap.state.doc.childCount).toBe(1);
    expect(suggestion.panel.isOpen()).toBe(false);
    expect(editor.variables.getNames()).toEqual(['client.name']);
  });

  it('Tab dans une liste valide l’entrée au lieu d’indenter l’élément (V-1)', async () => {
    editor.setHTML('<ul><li><p>Un</p></li><li><p>Deux</p></li></ul>');
    cursorAfter('Deux');
    await type(' {{cl');
    expect(suggestion.panel.isOpen()).toBe(true);
    expect(press('Tab').defaultPrevented).toBe(true);
    expect(html()).toBe(`<ul><li><p>Un</p></li><li><p>Deux ${CHIP}</p></li></ul>`);
  });

  it('ne s’ouvre pas dans un bloc de code (V-8)', async () => {
    editor.setHTML('<pre><code>x</code></pre>');
    cursorAfter('x');
    await type(' {{cl');
    expect(suggestion.panel.isOpen()).toBe(false);
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(html()).toBe('<pre><code>x {{cl\n</code></pre>');
  });

  it('en plein écran, Échap ferme le panneau et garde le plein écran (V-2)', async () => {
    const fullscreen = getFullscreen(editor);
    fullscreen.set(true);
    cursorAfter('Bonjour');
    await type(' {{cl');
    expect(suggestion.panel.isOpen()).toBe(true);
    press('Escape');
    expect(suggestion.panel.isOpen()).toBe(false);
    expect(fullscreen.isActive()).toBe(true);
    expect(html()).toBe('<p>Bonjour {{cl</p>');
    press('Escape');
    expect(fullscreen.isActive()).toBe(false);
    fullscreen.destroy();
  });
});
