import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AsterCommand, AsterEditor } from '../api/index.js';
import { EXTRA_SHORTCUT_BINDINGS, collectShortcutBindings } from './shortcuts.js';
import { mountEditor, selectFirstBlock, type MountedEditor } from '../testing/mount.js';

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

/** HTML sans le paragraphe vide final que `TrailingNode` ajoute après un bloc non-paragraphe. */
const body = (editor: AsterEditor): string => editor.getHTML().replace(/<p><\/p>$/, '');

describe('raccourcis', () => {
  describe('collectShortcutBindings', () => {
    it('reprend le shortcut de chaque commande', () => {
      const commands: AsterCommand[] = [
        { id: 'a', labelKey: 'command.a', shortcut: 'Mod-1', run: () => true },
        { id: 'b', labelKey: 'command.b', run: () => true },
      ];
      expect(collectShortcutBindings(commands)).toEqual([{ keys: 'Mod-1', id: 'a' }]);
    });

    it('ajoute les six niveaux de titre et Mod-y seulement si les commandes existent', () => {
      const withHeading: AsterCommand[] = [
        { id: 'heading', labelKey: 'command.heading', run: () => true },
        { id: 'redo', labelKey: 'command.redo', run: () => true },
      ];
      const bindings = collectShortcutBindings(withHeading);
      expect(bindings).toEqual(EXTRA_SHORTCUT_BINDINGS);
      expect(bindings.filter((b) => b.id === 'heading')).toHaveLength(6);
      expect(bindings.find((b) => b.keys === 'Mod-Alt-3')?.args).toEqual({ level: 3 });
      expect(bindings.find((b) => b.keys === 'Mod-y')?.id).toBe('redo');
      expect(collectShortcutBindings([])).toEqual([]);
    });
  });

  describe('dans l’éditeur', () => {
    let mounted: MountedEditor;

    afterEach(() => {
      mounted.cleanup();
    });

    it('Mod-b met en gras via le registre', () => {
      mounted = mountEditor({ content: '<p>abc</p>' });
      selectFirstBlock(mounted.editor);
      press(mounted.editor.contentElement, 'b');
      expect(mounted.editor.getHTML()).toBe('<p><strong>abc</strong></p>');
    });

    it('Mod-Alt-2 applique un titre de niveau 2', () => {
      mounted = mountEditor({ content: '<p>abc</p>' });
      selectFirstBlock(mounted.editor);
      press(mounted.editor.contentElement, '2', { altKey: true });
      expect(body(mounted.editor)).toBe('<h2>abc</h2>');
    });

    it('Mod-Shift-7 et Mod-Shift-8 basculent les listes', () => {
      mounted = mountEditor({ content: '<p>abc</p>' });
      selectFirstBlock(mounted.editor);
      press(mounted.editor.contentElement, '8', { shiftKey: true });
      expect(body(mounted.editor)).toBe('<ul><li><p>abc</p></li></ul>');
      press(mounted.editor.contentElement, '7', { shiftKey: true });
      expect(body(mounted.editor)).toBe('<ol><li><p>abc</p></li></ol>');
    });

    it('Mod-z et Mod-y annulent puis rétablissent', () => {
      mounted = mountEditor({ content: '<p>abc</p>' });
      selectFirstBlock(mounted.editor);
      mounted.editor.commands.run('bold');
      press(mounted.editor.contentElement, 'z');
      expect(mounted.editor.getHTML()).toBe('<p>abc</p>');
      press(mounted.editor.contentElement, 'y');
      expect(mounted.editor.getHTML()).toBe('<p><strong>abc</strong></p>');
    });

    it('le raccourci d’une commande désactivée est avalé, pas transmis à Tiptap', () => {
      mounted = mountEditor({ content: '<p>abc</p>', disabledCommands: ['bold'] });
      selectFirstBlock(mounted.editor);
      press(mounted.editor.contentElement, 'b');
      expect(mounted.editor.getHTML()).toBe('<p>abc</p>');
      // La commande voisine reste câblée.
      press(mounted.editor.contentElement, 'i');
      expect(mounted.editor.getHTML()).toBe('<p><em>abc</em></p>');
    });

    it('Mod-k passe par link.set, qu’un intégrateur peut remplacer', () => {
      mounted = mountEditor({ content: '<p>abc</p>' });
      const run = vi.fn(() => true);
      mounted.editor.commands.register({ id: 'link.set', labelKey: 'command.link.set', run });
      press(mounted.editor.contentElement, 'k');
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(mounted.editor, undefined);
    });

    it('une commande custom avec shortcut est câblée au clavier', () => {
      const run = vi.fn(() => true);
      mounted = mountEditor({
        content: '<p>abc</p>',
        commands: [{ id: 'custom.go', labelKey: 'command.custom.go', shortcut: 'Mod-g', run }],
      });
      press(mounted.editor.contentElement, 'g');
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('les raccourcis sont inertes en lecture seule', () => {
      mounted = mountEditor({ content: '<p>abc</p>', readOnly: true });
      selectFirstBlock(mounted.editor);
      press(mounted.editor.contentElement, 'b');
      expect(mounted.editor.getHTML()).toBe('<p>abc</p>');
    });
  });
});
