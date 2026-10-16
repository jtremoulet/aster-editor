import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsterVariable } from '@aster-editor/core';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import {
  VARIABLE_SUGGESTION_PLUGIN_KEY,
  buildSuggestionItems,
  createVariableSuggestion,
  createVariableSuggestionPanel,
  filterVariables,
  insertSuggestedVariable,
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
