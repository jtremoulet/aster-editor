import { CellSelection } from '@tiptap/pm/tables';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_COMMAND_IDS } from '../api/index.js';
import { FORMAT_PAINTER_COMMAND_IDS } from './format-painter.js';
import { TAB_COMMAND_IDS, TEXT_LAYOUT_COMMAND_IDS, hasLayoutBlockInSelection } from './layout.js';
import { SEARCH_COMMAND_IDS } from './search.js';
import { SECTION_COMMAND_IDS } from './sections.js';
import { en } from '../i18n/en.js';
import { fr } from '../i18n/fr.js';
import { bodyHtml, findNodePos, mountEditor, type MountedEditor } from '../testing/mount.js';

/** Table 2×2 de la preuve R23-02 : cellules `a`, `b`, `c`, `d`. */
const TABLE_2X2 =
  '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr>' +
  '<tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>';

/** Positions des cellules du document, dans l'ordre du document. */
function cellPositions(mounted: MountedEditor): number[] {
  const positions: number[] = [];
  mounted.editor.tiptap.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell') {
      positions.push(pos);
      return false;
    }
    return true;
  });
  return positions;
}

/** Pose une `CellSelection` de la cellule d'ancrage à la cellule de tête. */
function selectCells(mounted: MountedEditor, anchor: number, head: number): void {
  const { state, view } = mounted.editor.tiptap;
  view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, anchor, head)));
}

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
      // Session 4 (L41) : tabulation et sections, hors contrat elles aussi.
      ...TAB_COMMAND_IDS,
      ...SECTION_COMMAND_IDS,
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

  describe('R23-02 : CellSelection (plusieurs plages)', () => {
    beforeEach(() => {
      mounted.editor.setHTML(TABLE_2X2);
    });

    it('setLayout s’applique aux quatre cellules sélectionnées, pas seulement à l’ancre', () => {
      const [a, , , d] = cellPositions(mounted);
      expect(a).toBe(2);
      expect(d).toBe(19);
      selectCells(mounted, a as number, d as number);
      const { selection } = mounted.editor.tiptap.state;
      expect(selection).toBeInstanceOf(CellSelection);
      expect(selection.ranges).toHaveLength(4);
      expect(hasLayoutBlockInSelection(mounted.editor)).toBe(true);
      expect(mounted.editor.commands.canRun('paragraph.setLayout', { lineHeight: 2 })).toBe(true);
      expect(mounted.editor.commands.run('paragraph.setLayout', { lineHeight: 2 })).toBe(true);
      const html = bodyHtml(mounted.editor);
      expect(html.match(/line-height: 2/g)).toHaveLength(4);
      expect(html).toBe(
        '<table><tbody><tr><td><p style="line-height: 2">a</p></td><td><p style="line-height: 2">b</p></td></tr>' +
          '<tr><td><p style="line-height: 2">c</p></td><td><p style="line-height: 2">d</p></td></tr></tbody></table>',
      );
      // Second appel identique : plus rien à changer.
      expect(mounted.editor.commands.run('paragraph.setLayout', { lineHeight: 2 })).toBe(false);
      // unsetLayout suit les mêmes plages.
      expect(mounted.editor.commands.run('paragraph.unsetLayout', undefined)).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe(TABLE_2X2);
    });

    it('une colonne sélectionnée ne touche que ses deux cellules', () => {
      const [a, , c] = cellPositions(mounted);
      selectCells(mounted, a as number, c as number);
      expect(mounted.editor.commands.run('paragraph.setLayout', { indentLeftPt: 6 })).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td><p style="margin-left: 6pt">a</p></td><td><p>b</p></td></tr>' +
          '<tr><td><p style="margin-left: 6pt">c</p></td><td><p>d</p></td></tr></tbody></table>',
      );
    });

    it('la table entière sélectionnée (NodeSelection normalisée en CellSelection) est couverte', () => {
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'table'));
      expect(mounted.editor.commands.run('paragraph.setLayout', { lineHeight: 1.5 })).toBe(true);
      expect(bodyHtml(mounted.editor).match(/line-height: 1.5/g)).toHaveLength(4);
    });
  });
});
