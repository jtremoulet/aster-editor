import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CellSelection } from '@tiptap/pm/tables';
import { mountEditor, type MountedEditor } from '../testing/mount.js';

/** Positions des cellules (`td`/`th`) du document, dans l'ordre. */
function cellPositions(mounted: MountedEditor): number[] {
  const positions: number[] = [];
  mounted.editor.tiptap.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      positions.push(pos);
    }
    return true;
  });
  return positions;
}

/** Pose une largeur de colonne sur une cellule, comme le ferait le drag de colonne. */
function setColwidth(mounted: MountedEditor, pos: number, width: number): void {
  const { tiptap } = mounted.editor;
  const node = tiptap.state.doc.nodeAt(pos);
  if (!node) {
    throw new Error(`pas de nœud en ${pos}`);
  }
  tiptap.view.dispatch(
    tiptap.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: [width] }),
  );
}

function press(target: HTMLElement, key: string, shiftKey = false): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
  );
}

describe('tables redimensionnables', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>x</p>' });
    mounted.editor.focus('end');
    mounted.editor.commands.run('table.insert', { rows: 2, cols: 2, withHeaderRow: false });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('rend la table dans un wrapper redimensionnable avec colgroup en édition', () => {
    const content = mounted.editor.contentElement;
    expect(content.querySelector('.tableWrapper table colgroup')).not.toBeNull();
    // Le HTML de sortie reste propre malgré le NodeView de table.
    expect(mounted.editor.getHTML()).toContain(
      '<table><tbody><tr><td><p></p></td><td><p></p></td></tr>' +
        '<tr><td><p></p></td><td><p></p></td></tr></tbody></table>',
    );
  });

  it('les largeurs de colonnes survivent à setHTML(getHTML())', () => {
    const [first] = cellPositions(mounted);
    setColwidth(mounted, first!, 120);
    const html = mounted.editor.getHTML();
    expect(html).toContain('<td colwidth="120">');
    expect(html).not.toContain('colgroup');
    expect(html).not.toContain('min-width');
    mounted.editor.setHTML(html);
    expect(mounted.editor.getHTML()).toBe(html);
    const col = mounted.editor.contentElement.querySelector<HTMLElement>('colgroup > col');
    expect(col?.style.width).toBe('120px');
  });

  it('une table dont toutes les colonnes sont dimensionnées sérialise sa largeur, idempotent', () => {
    const cells = cellPositions(mounted);
    for (const pos of cells) {
      setColwidth(mounted, pos, 100);
    }
    const html = mounted.editor.getHTML();
    expect(html).toContain('<table style="width: 200px">');
    mounted.editor.setHTML(html);
    expect(mounted.editor.getHTML()).toBe(html);
  });

  it('relit colwidth multi-colonnes sur une cellule fusionnée, idempotent', () => {
    mounted.editor.setHTML(
      '<table><tbody><tr><td colspan="2" colwidth="80,90"><p>a</p></td></tr>' +
        '<tr><td><p>b</p></td><td><p>c</p></td></tr></tbody></table>',
    );
    // `fixTables` (prosemirror-tables) aligne les colwidth d'une même colonne : les
    // cellules b et c héritent 80 et 90. Déterministe, donc stable au second passage.
    const html = mounted.editor.getHTML();
    expect(html).toContain('<td colspan="2" colwidth="80,90">');
    expect(html).toContain('<td colwidth="80"><p>b</p></td><td colwidth="90"><p>c</p></td>');
    mounted.editor.setHTML(html);
    expect(mounted.editor.getHTML()).toBe(html);
  });

  it('Tab et Shift-Tab naviguent entre les cellules', () => {
    const cells = cellPositions(mounted);
    mounted.editor.tiptap.commands.setTextSelection(cells[0]! + 2);
    press(mounted.editor.contentElement, 'Tab');
    expect(mounted.editor.tiptap.state.selection.from).toBeGreaterThan(cells[1]!);
    expect(mounted.editor.tiptap.state.selection.from).toBeLessThan(cells[2]!);
    press(mounted.editor.contentElement, 'Tab', true);
    expect(mounted.editor.tiptap.state.selection.from).toBeGreaterThan(cells[0]!);
    expect(mounted.editor.tiptap.state.selection.from).toBeLessThan(cells[1]!);
  });

  it('Tab sur la dernière cellule ajoute une ligne', () => {
    const cells = cellPositions(mounted);
    mounted.editor.tiptap.commands.setTextSelection(cells[3]! + 2);
    press(mounted.editor.contentElement, 'Tab');
    expect(cellPositions(mounted).length).toBe(6);
  });

  it('mergeCells n’est possible qu’avec une CellSelection multiple, splitCell qu’après fusion', () => {
    const cells = cellPositions(mounted);
    mounted.editor.tiptap.commands.setTextSelection(cells[0]! + 2);
    expect(mounted.editor.commands.canRun('table.mergeCells')).toBe(false);
    expect(mounted.editor.commands.canRun('table.splitCell')).toBe(false);

    const single = CellSelection.create(mounted.editor.tiptap.state.doc, cells[0]!);
    mounted.editor.tiptap.view.dispatch(mounted.editor.tiptap.state.tr.setSelection(single));
    expect(mounted.editor.commands.canRun('table.mergeCells')).toBe(false);

    const row = CellSelection.create(mounted.editor.tiptap.state.doc, cells[0]!, cells[1]!);
    mounted.editor.tiptap.view.dispatch(mounted.editor.tiptap.state.tr.setSelection(row));
    expect(mounted.editor.commands.canRun('table.mergeCells')).toBe(true);
    expect(mounted.editor.commands.run('table.mergeCells')).toBe(true);
    expect(mounted.editor.getHTML()).toContain('colspan="2"');
    expect(mounted.editor.commands.canRun('table.mergeCells')).toBe(false);
    expect(mounted.editor.commands.canRun('table.splitCell')).toBe(true);
    expect(mounted.editor.commands.run('table.splitCell')).toBe(true);
    expect(mounted.editor.getHTML()).not.toContain('colspan');
  });

  it('les commandes de table sont impossibles en lecture seule', () => {
    mounted.editor.setReadOnly(true);
    expect(mounted.editor.commands.canRun('table.addRowAfter')).toBe(false);
    expect(mounted.editor.commands.canRun('table.delete')).toBe(false);
  });
});
