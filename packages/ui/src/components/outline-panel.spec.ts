import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@aster-editor/core';
import { getOutline, scrollToHeading, type OutlineEntry } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import { createOutlinePanel } from './outline-panel';

vi.mock('@aster-editor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return { ...actual, getOutline: vi.fn(() => []), scrollToHeading: vi.fn(() => true) };
});

const ENTRIES: readonly OutlineEntry[] = [
  { level: 1, text: 'Intro', pos: 0, id: 'aster-h-1' },
  { level: 2, text: 'Partie A', pos: 14, id: 'aster-h-2' },
  { level: 3, text: '', pos: 24, id: 'aster-h-3' },
];

describe('createOutlinePanel', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let widget: ToolbarWidget;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    widget = createOutlinePanel(editor);
    host.append(widget.element);
    vi.mocked(getOutline).mockReturnValue(ENTRIES);
  });

  afterEach(() => {
    widget.destroy();
    host.remove();
    vi.clearAllMocks();
  });

  const trigger = (): HTMLButtonElement | null =>
    widget.element.querySelector<HTMLButtonElement>('.aster-dropdown__trigger');
  const items = (): HTMLButtonElement[] =>
    Array.from(widget.element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

  it('liste les titres indentés par niveau, avec position et id', () => {
    expect(trigger()?.getAttribute('aria-label')).toBe('Outline');
    expect(trigger()?.querySelector('svg')).not.toBeNull();
    trigger()?.click();
    expect(getOutline).toHaveBeenCalledWith(editor);
    const panel = widget.element.querySelector('.aster-outline');
    expect(panel?.getAttribute('aria-label')).toBe('Outline');
    expect(items().map((item) => item.textContent)).toEqual(['Intro', 'Partie A', '—']);
    expect(items()[1]?.classList.contains('aster-outline__item--h2')).toBe(true);
    expect(items()[1]?.dataset['pos']).toBe('14');
    expect(items()[1]?.dataset['headingId']).toBe('aster-h-2');
    expect(items()[2]?.classList.contains('aster-outline__item--h3')).toBe(true);
  });

  it('un clic ferme le menu et fait défiler vers le titre', () => {
    trigger()?.click();
    items()[1]?.click();
    expect(scrollToHeading).toHaveBeenCalledWith(editor, 14);
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('sans titre : message « aucun titre », disponible en lecture seule', () => {
    vi.mocked(getOutline).mockReturnValue([]);
    editor.setReadOnly(true);
    widget.update();
    expect(trigger()?.disabled).toBe(false);
    trigger()?.click();
    expect(items()).toEqual([]);
    expect(widget.element.querySelector('.aster-outline__empty')?.textContent).toBe('No heading');
  });

  it('tolère un getOutline qui lève (éditeur sans vue)', () => {
    vi.mocked(getOutline).mockImplementation(() => {
      throw new Error('no view');
    });
    trigger()?.click();
    expect(widget.element.querySelector('.aster-outline__empty')).not.toBeNull();
  });

  it('ne duplique pas les entrées quand getOutline provoque un selectionChange pendant le rendu', () => {
    vi.mocked(getOutline).mockImplementation(() => {
      // ensureHeadingIds dispatche une transaction hors historique : l'éditeur émet
      // selectionChange pendant le rendu, ce qui re-rend le panneau ouvert.
      editor.emit('selectionChange', { editor });
      return ENTRIES;
    });
    trigger()?.click();
    expect(items().map((item) => item.textContent)).toEqual(['Intro', 'Partie A', '—']);
  });
});
