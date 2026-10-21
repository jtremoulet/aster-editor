import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEditor, type MountedEditor } from '../testing/mount.js';

describe('commandes de table', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour le monde</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('table.insert crée la table avec en-tête par défaut', () => {
    mounted.editor.focus('end');
    expect(mounted.editor.commands.isActive('table.insert', { rows: 1, cols: 1 })).toBe(false);
    expect(mounted.editor.commands.run('table.insert', { rows: 2, cols: 3 })).toBe(true);
    const html = mounted.editor.getHTML();
    expect(html).toContain('<table><tbody><tr><th');
    expect((html.match(/<tr>/g) ?? []).length).toBe(2);
    expect((html.match(/<th>/g) ?? []).length).toBe(3);
    expect(mounted.editor.commands.isActive('table.insert', { rows: 1, cols: 1 })).toBe(true);
  });

  it('table.insert refuse des dimensions nulles', () => {
    expect(mounted.editor.commands.canRun('table.insert', { rows: 0, cols: 2 })).toBe(false);
  });

  it('table.insert est impossible dans une table : pas de tables imbriquées', () => {
    mounted.editor.focus('end');
    mounted.editor.commands.run('table.insert', { rows: 1, cols: 1, withHeaderRow: false });
    expect(mounted.editor.commands.isActive('table.insert', { rows: 1, cols: 1 })).toBe(true);
    const before = mounted.editor.getHTML();
    expect(mounted.editor.commands.canRun('table.insert', { rows: 1, cols: 1 })).toBe(false);
    expect(mounted.editor.commands.run('table.insert', { rows: 1, cols: 1 })).toBe(false);
    expect(mounted.editor.getHTML()).toBe(before);
    expect((before.match(/<table>/g) ?? []).length).toBe(1);
  });

  it('les commandes de table sont impossibles hors d’une table', () => {
    for (const id of [
      'table.delete',
      'table.addRowBefore',
      'table.addRowAfter',
      'table.deleteRow',
      'table.addColumnBefore',
      'table.addColumnAfter',
      'table.deleteColumn',
      'table.mergeCells',
      'table.splitCell',
      'table.toggleHeaderRow',
      'table.toggleHeaderColumn',
    ] as const) {
      expect(mounted.editor.commands.canRun(id)).toBe(false);
    }
  });

  it('ajoute, supprime des lignes et colonnes, bascule les en-têtes', () => {
    mounted.editor.focus('end');
    mounted.editor.commands.run('table.insert', { rows: 2, cols: 2, withHeaderRow: false });
    const count = (pattern: RegExp): number =>
      (mounted.editor.getHTML().match(pattern) ?? []).length;
    expect(count(/<th>/g)).toBe(0);
    expect(mounted.editor.commands.run('table.addRowAfter')).toBe(true);
    expect(count(/<tr>/g)).toBe(3);
    expect(mounted.editor.commands.run('table.addRowBefore')).toBe(true);
    expect(count(/<tr>/g)).toBe(4);
    expect(mounted.editor.commands.run('table.deleteRow')).toBe(true);
    expect(count(/<tr>/g)).toBe(3);
    expect(mounted.editor.commands.run('table.addColumnAfter')).toBe(true);
    expect(mounted.editor.commands.run('table.addColumnBefore')).toBe(true);
    expect(count(/<td>/g)).toBe(12);
    expect(mounted.editor.commands.run('table.deleteColumn')).toBe(true);
    expect(count(/<td>/g)).toBe(9);
    expect(mounted.editor.commands.run('table.toggleHeaderRow')).toBe(true);
    expect(count(/<th>/g)).toBe(3);
    expect(mounted.editor.commands.run('table.toggleHeaderColumn')).toBe(true);
    expect(count(/<th>/g)).toBeGreaterThan(3);
    expect(mounted.editor.commands.run('table.delete')).toBe(true);
    expect(mounted.editor.getHTML()).not.toContain('<table');
  });

  it('fusionne puis scinde des cellules', () => {
    mounted.editor.focus('end');
    mounted.editor.commands.run('table.insert', { rows: 1, cols: 2, withHeaderRow: false });
    expect(mounted.editor.commands.canRun('table.mergeCells')).toBe(false);
    // Sélection de cellule sur les deux cellules de la ligne.
    const doc = mounted.editor.tiptap.state.doc;
    let firstCell = -1;
    let secondCell = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') {
        if (firstCell < 0) {
          firstCell = pos;
        } else if (secondCell < 0) {
          secondCell = pos;
        }
      }
      return true;
    });
    mounted.editor.tiptap.commands.setCellSelection({
      anchorCell: firstCell,
      headCell: secondCell,
    });
    expect(mounted.editor.commands.canRun('table.mergeCells')).toBe(true);
    expect(mounted.editor.commands.run('table.mergeCells')).toBe(true);
    expect(mounted.editor.getHTML()).toContain('colspan="2"');
    expect(mounted.editor.commands.canRun('table.splitCell')).toBe(true);
    expect(mounted.editor.commands.run('table.splitCell')).toBe(true);
    expect(mounted.editor.getHTML()).not.toContain('colspan="2"');
  });
});
