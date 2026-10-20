import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bodyHtml,
  findNodePos,
  mountEditor,
  selectRange,
  type MountedEditor,
} from '../testing/mount';
import { getOutline } from '../extensions/outline';
import {
  FORMAT_PAINTER_CHANGE_EVENT,
  FORMAT_PAINTER_COMMANDS,
  FORMAT_PAINTER_COMMAND_IDS,
  applyFormat,
  clearFormatClipboard,
  getFormatClipboard,
  hasFormatClipboard,
  readFormat,
  wordRangeAt,
} from './format-painter';

/** Simule une frappe sur le contenteditable. `Mod` = Ctrl hors macOS, ce que jsdom est. */
function press(target: HTMLElement, key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      ...modifiers,
    }),
  );
}

describe('format painter', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({
      content:
        '<h2 style="text-align: center"><strong><em>Titre</em></strong></h2><p>plain <a href="https://a.dev/">lien</a> suite</p>',
    });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('déclare deux commandes hors contrat, avec icône, libellé et raccourcis', () => {
    expect(FORMAT_PAINTER_COMMANDS.map((command) => command.id)).toEqual([
      ...FORMAT_PAINTER_COMMAND_IDS,
    ]);
    const copy = mounted.editor.commands.get('formatPainter.copy');
    const paste = mounted.editor.commands.get('formatPainter.paste');
    expect(copy?.shortcut).toBe('Mod-Shift-c');
    expect(paste?.shortcut).toBe('Mod-Shift-v');
    expect(copy?.icon).toBe('format-painter');
    expect(mounted.editor.i18n.t(copy?.labelKey ?? '')).toBe('Copier la mise en forme');
    expect(mounted.editor.i18n.t(paste?.labelKey ?? '')).toBe('Appliquer la mise en forme');
  });

  it('readFormat lit marques (hors lien) et bloc, sans l’id du titre', () => {
    getOutline(mounted.editor);
    selectRange(mounted.editor, 1, 3);
    const format = readFormat(mounted.editor);
    expect(format.marks.map((mark) => mark.type.name).sort()).toEqual(['bold', 'italic']);
    expect(format.block).toEqual({
      type: 'heading',
      attrs: { level: 2, textAlign: 'center' },
    });
    const link = findNodePos(mounted.editor, 'paragraph') + 7;
    selectRange(mounted.editor, link, link + 2);
    expect(readFormat(mounted.editor).marks).toEqual([]);
    expect(readFormat(mounted.editor).block).toEqual({
      type: 'paragraph',
      attrs: { textAlign: null },
    });
  });

  it('copy charge le presse-papier (isActive), paste n’est exécutable qu’ensuite', () => {
    expect(hasFormatClipboard(mounted.editor)).toBe(false);
    expect(mounted.editor.commands.isActive('formatPainter.copy')).toBe(false);
    expect(mounted.editor.commands.canRun('formatPainter.paste')).toBe(false);
    expect(mounted.editor.commands.run('formatPainter.paste')).toBe(false);
    const onChange = vi.fn();
    mounted.element.addEventListener(FORMAT_PAINTER_CHANGE_EVENT, onChange);
    selectRange(mounted.editor, 1, 3);
    expect(mounted.editor.commands.run('formatPainter.copy')).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mounted.editor.commands.isActive('formatPainter.copy')).toBe(true);
    expect(mounted.editor.commands.canRun('formatPainter.paste')).toBe(true);
    expect(getFormatClipboard(mounted.editor)?.block?.type).toBe('heading');
    clearFormatClipboard(mounted.editor);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(hasFormatClipboard(mounted.editor)).toBe(false);
    clearFormatClipboard(mounted.editor);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('paste applique marques et bloc à la sélection, en gardant le lien', () => {
    selectRange(mounted.editor, 1, 3);
    mounted.editor.commands.run('formatPainter.copy');
    const paragraph = findNodePos(mounted.editor, 'paragraph');
    selectRange(mounted.editor, paragraph + 1, paragraph + 17);
    expect(mounted.editor.commands.run('formatPainter.paste')).toBe(true);
    expect(bodyHtml(mounted.editor)).toBe(
      '<h2 style="text-align: center;"><strong><em>Titre</em></strong></h2>' +
        '<h2 style="text-align: center;"><strong><em>plain </em></strong>' +
        '<a href="https://a.dev/"><strong><em>lien</em></strong></a>' +
        '<strong><em> suite</em></strong></h2>',
    );
    // Le presse-papier reste chargé : c'est l'UI qui le vide après un clic simple.
    expect(hasFormatClipboard(mounted.editor)).toBe(true);
  });

  it('paste remplace les marques existantes, change le type de bloc et garde l’id d’un titre', () => {
    mounted.editor.setHTML('<p><u>souligné</u></p><h3>Cible</h3>');
    getOutline(mounted.editor);
    mounted.editor.setHTML(
      `${bodyHtml(mounted.editor)}<h2 style="text-align: right"><strong>gras</strong></h2>`,
    );
    // p(0) souligné(1-9) /p(10) h3(10) Cible(11-16) /h3(17) h2(17) gras(18-22)
    selectRange(mounted.editor, 18, 22);
    mounted.editor.commands.run('formatPainter.copy');
    selectRange(mounted.editor, 1, 16);
    expect(mounted.editor.commands.run('formatPainter.paste')).toBe(true);
    expect(bodyHtml(mounted.editor)).toBe(
      '<h2 style="text-align: right;"><strong>souligné</strong></h2>' +
        '<h2 style="text-align: right;" id="aster-h-1"><strong>Cible</strong></h2>' +
        '<h2 style="text-align: right;"><strong>gras</strong></h2>',
    );
  });

  it('sélection vide : le mot sous le curseur reçoit la mise en forme', () => {
    selectRange(mounted.editor, 1, 3);
    mounted.editor.commands.run('formatPainter.copy');
    const paragraph = findNodePos(mounted.editor, 'paragraph');
    selectRange(mounted.editor, paragraph + 3, paragraph + 3);
    expect(wordRangeAt(mounted.editor.tiptap.state.tr, paragraph + 3)).toEqual({
      from: paragraph + 1,
      to: paragraph + 6,
    });
    expect(wordRangeAt(mounted.editor.tiptap.state.tr, paragraph + 6)).toEqual({
      from: paragraph + 1,
      to: paragraph + 6,
    });
    expect(mounted.editor.commands.run('formatPainter.paste')).toBe(true);
    expect(bodyHtml(mounted.editor)).toContain(
      '<h2 style="text-align: center;"><strong><em>plain</em></strong> <a href=',
    );
  });

  it('sélection vide sans mot : les marques deviennent les marques en attente', () => {
    selectRange(mounted.editor, 1, 3);
    mounted.editor.commands.run('formatPainter.copy');
    mounted.editor.setHTML('<p></p>');
    const tr = mounted.editor.tiptap.state.tr;
    expect(wordRangeAt(tr, 1)).toBeNull();
    expect(applyFormat(tr, getFormatClipboard(mounted.editor)!)).toBe(true);
    expect(tr.storedMarks?.map((mark) => mark.type.name).sort()).toEqual(['bold', 'italic']);
    expect(tr.doc.firstChild?.type.name).toBe('heading');
  });

  it('les raccourcis Mod-Shift-c / Mod-Shift-v passent par le registre', () => {
    selectRange(mounted.editor, 1, 3);
    press(mounted.editor.contentElement, 'C', { shiftKey: true, keyCode: 67 });
    expect(hasFormatClipboard(mounted.editor)).toBe(true);
    const paragraph = findNodePos(mounted.editor, 'paragraph');
    selectRange(mounted.editor, paragraph + 1, paragraph + 6);
    press(mounted.editor.contentElement, 'V', { shiftKey: true, keyCode: 86 });
    expect(bodyHtml(mounted.editor)).toContain('<strong><em>plain</em></strong>');
  });

  it('lecture seule : copy et paste refusés', () => {
    selectRange(mounted.editor, 1, 3);
    mounted.editor.commands.run('formatPainter.copy');
    mounted.editor.setReadOnly(true);
    expect(mounted.editor.commands.canRun('formatPainter.copy')).toBe(false);
    expect(mounted.editor.commands.canRun('formatPainter.paste')).toBe(false);
    expect(mounted.editor.commands.run('formatPainter.paste')).toBe(false);
  });
});
