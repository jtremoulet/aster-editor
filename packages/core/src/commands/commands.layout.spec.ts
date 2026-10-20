import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_COMMAND_IDS } from '../api';
import { FORMAT_PAINTER_COMMAND_IDS } from './format-painter';
import { TEXT_LAYOUT_COMMAND_IDS, hasLayoutBlockInSelection } from './layout';
import { SEARCH_COMMAND_IDS } from './search';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { findNodePos, mountEditor, type MountedEditor } from '../testing/mount';

describe('commandes de mise en page : enregistrement et i18n', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>x</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('STANDARD_COMMAND_IDS compte 52 commandes, dont paragraph.setLayout et unsetLayout', () => {
    expect(STANDARD_COMMAND_IDS).toHaveLength(52);
    expect(STANDARD_COMMAND_IDS).toContain('paragraph.setLayout');
    expect(STANDARD_COMMAND_IDS).toContain('paragraph.unsetLayout');
    expect(mounted.editor.commands.has('paragraph.setLayout')).toBe(true);
    expect(mounted.editor.commands.has('paragraph.unsetLayout')).toBe(true);
    expect(mounted.editor.commands.get('paragraph.setLayout')?.shortcut).toBeUndefined();
  });

  it('les commandes text.* sont enregistrées en plus, hors contrat, sans raccourci', () => {
    expect(TEXT_LAYOUT_COMMAND_IDS).toEqual([
      'text.setLetterSpacing',
      'text.setCaps',
      'text.unsetCaps',
    ]);
    for (const id of TEXT_LAYOUT_COMMAND_IDS) {
      expect(STANDARD_COMMAND_IDS as readonly string[]).not.toContain(id);
      expect(mounted.editor.commands.has(id)).toBe(true);
      expect(mounted.editor.commands.get(id)?.shortcut).toBeUndefined();
    }
    const all = [
      ...STANDARD_COMMAND_IDS,
      ...SEARCH_COMMAND_IDS,
      ...FORMAT_PAINTER_COMMAND_IDS,
      ...TEXT_LAYOUT_COMMAND_IDS,
    ];
    expect(
      mounted.editor.commands
        .list()
        .map((command) => command.id)
        .sort(),
    ).toEqual([...all].sort());
  });

  it('fr et en ont exactement les mêmes clés, dont celles des nouvelles commandes', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const id of ['paragraph.setLayout', 'paragraph.unsetLayout', ...TEXT_LAYOUT_COMMAND_IDS]) {
      expect(fr[`command.${id}`]).toBeTruthy();
      expect(en[`command.${id}`]).toBeTruthy();
      expect(fr[`command.${id}`]).not.toBe(en[`command.${id}`]);
    }
  });

  it('hasLayoutBlockInSelection : vrai dans un paragraphe ou un titre, faux sur une image', () => {
    expect(hasLayoutBlockInSelection(mounted.editor)).toBe(true);
    mounted.editor.setHTML('<h3>T</h3>');
    mounted.editor.tiptap.commands.setTextSelection(1);
    expect(hasLayoutBlockInSelection(mounted.editor)).toBe(true);
    mounted.editor.setHTML('<img src="https://example.com/a.png">');
    mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'image'));
    expect(hasLayoutBlockInSelection(mounted.editor)).toBe(false);
    mounted.editor.setHTML('<pre><code>x</code></pre>');
    mounted.editor.tiptap.commands.setTextSelection(1);
    expect(hasLayoutBlockInSelection(mounted.editor)).toBe(false);
  });

  it('les commandes de mise en page sont refusées en lecture seule', () => {
    mounted.editor.setReadOnly(true);
    expect(mounted.editor.commands.canRun('paragraph.setLayout', { lineHeight: 2 })).toBe(false);
    expect(mounted.editor.commands.run('paragraph.unsetLayout', undefined)).toBe(false);
  });
});
