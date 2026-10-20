import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_COMMAND_IDS } from '@aster-editor/core';
import type { ToolbarWidgetItem } from '@aster-editor/core';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { createToolbar } from './create-toolbar';
import { FULL_PRESET, STANDARD_PRESET } from './presets';
import { WIDGETS, createWidget } from './widgets';

/** Widgets de mise en page ajoutés par L26, avec la commande qui conditionne leur rendu. */
const LAYOUT_WIDGETS: readonly { readonly name: string; readonly requires: string }[] = [
  { name: 'lineSpacing', requires: 'paragraph.setLayout' },
  { name: 'paragraphSpacing', requires: 'paragraph.setLayout' },
  { name: 'indentIncrease', requires: 'indent' },
  { name: 'indentDecrease', requires: 'outdent' },
  { name: 'paragraphBorders', requires: 'paragraph.setLayout' },
  { name: 'caps', requires: 'text.setCaps' },
  { name: 'underlineStyle', requires: 'underline' },
];

/** Noms de widgets référencés par un preset. */
function widgetNames(preset: readonly (readonly unknown[])[]): string[] {
  return preset.flatMap((group) =>
    group
      .filter(
        (item): item is ToolbarWidgetItem =>
          typeof item === 'object' && item !== null && 'widget' in item,
      )
      .map((item) => item.widget),
  );
}

describe('widgets de mise en page (L26)', () => {
  let editor: MockEditor;

  beforeEach(() => {
    editor = createMockEditor({
      commands: [...STANDARD_COMMAND_IDS, 'text.setCaps', 'text.unsetCaps'],
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sont tous enregistrés dans WIDGETS et instanciables', () => {
    for (const { name } of [...LAYOUT_WIDGETS, { name: 'pageLayout' }]) {
      expect(WIDGETS, name).toHaveProperty(name);
      const widget = createWidget(editor, name);
      expect(widget, name).not.toBeNull();
      expect(
        widget?.element.querySelector('[data-toolbar-item], &[data-toolbar-item]'),
      ).toBeDefined();
      widget?.destroy();
    }
    expect(Object.keys(WIDGETS)).toHaveLength(24);
  });

  it('sont ignorés avec un avertissement quand leur commande manque', () => {
    const bare = createMockEditor({ commands: ['bold'] });
    for (const { name, requires } of LAYOUT_WIDGETS) {
      expect(createWidget(bare, name), name).toBeNull();
      expect(console.warn).toHaveBeenLastCalledWith(expect.stringContaining(requires));
    }
    // `pageLayout` ne dépend d'aucune commande : rendu, désactivé si le core n'a pas setPageView.
    const noPageView = createMockEditor({ commands: ['bold'], pageViewApi: false });
    const pageLayout = createWidget(noPageView, 'pageLayout');
    expect(pageLayout).not.toBeNull();
    expect(pageLayout?.element.querySelector('button')?.disabled).toBe(true);
  });

  it('presets : full reçoit le groupe mise en page, casse et style de souligné ; standard interligne et retraits', () => {
    const full = widgetNames(FULL_PRESET);
    for (const name of [
      'lineSpacing',
      'paragraphSpacing',
      'indentDecrease',
      'indentIncrease',
      'paragraphBorders',
      'pageLayout',
      'caps',
      'underlineStyle',
    ]) {
      expect(full, name).toContain(name);
    }
    const layoutGroup = FULL_PRESET.find((group) =>
      group.some(
        (item) => typeof item === 'object' && 'widget' in item && item.widget === 'lineSpacing',
      ),
    );
    expect(
      layoutGroup?.map((item) =>
        typeof item === 'object' && 'widget' in item ? item.widget : item,
      ),
    ).toEqual([
      'lineSpacing',
      'paragraphSpacing',
      'indentDecrease',
      'indentIncrease',
      'paragraphBorders',
      'pageLayout',
    ]);
    const standard = widgetNames(STANDARD_PRESET);
    expect(standard).toContain('lineSpacing');
    expect(standard).toContain('indentDecrease');
    expect(standard).toContain('indentIncrease');
    for (const name of [
      'paragraphSpacing',
      'paragraphBorders',
      'pageLayout',
      'caps',
      'underlineStyle',
    ]) {
      expect(standard, name).not.toContain(name);
    }
    // Les boutons `indent` / `outdent` limités aux listes sont remplacés par les widgets.
    for (const preset of [FULL_PRESET, STANDARD_PRESET]) {
      expect(preset.flat()).not.toContain('indent');
      expect(preset.flat()).not.toContain('outdent');
    }
    expect(FULL_PRESET).toHaveLength(12);
    expect(STANDARD_PRESET).toHaveLength(9);
  });

  it('la toolbar full rend chaque widget de mise en page avec un item navigable', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const toolbar = createToolbar(editor, container, 'full');
    expect(container.querySelectorAll('.aster-toolbar__group').length).toBe(FULL_PRESET.length);
    for (const selector of [
      '.aster-line-spacing',
      '.aster-paragraph-spacing',
      '.aster-borders-dialog',
      '.aster-page-layout',
      '.aster-caps',
      '.aster-underline-style',
      '[data-widget="indentIncrease"]',
      '[data-widget="indentDecrease"]',
    ]) {
      expect(container.querySelector(selector), selector).not.toBeNull();
    }
    // Un item navigable par entrée rendue : les widgets dont aucune commande requise n'est
    // enregistrée (`search`, `formatPainter` avec ce mock) sont ignorés.
    const rendered = FULL_PRESET.flat().filter((item) => {
      if (typeof item !== 'object' || !('widget' in item)) return true;
      const requires = WIDGETS[item.widget]?.requires ?? [];
      return requires.length === 0 || requires.some((id) => editor.commands.has(id));
    });
    expect(rendered.length).toBe(FULL_PRESET.flat().length - 2);
    expect(container.querySelectorAll('[data-toolbar-item]').length).toBe(rendered.length);
    toolbar.destroy();
    container.remove();
  });
});
