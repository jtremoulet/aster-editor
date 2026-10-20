import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_COMMAND_IDS, type StandardCommandId } from '../api';
import { iconIdFor } from './define';
import { mountEditor, selectFirstBlock, type MountedEditor } from '../testing/mount';

/** Arguments minimaux pour que `canRun` d'une commande à arguments ait un sens. */
const SAMPLE_ARGS: Partial<Record<StandardCommandId, unknown>> = {
  heading: { level: 2 },
  'link.set': { href: 'https://example.com' },
  'image.insert': { src: 'https://example.com/a.png' },
  'image.upload': { file: new File(['x'], 'a.png', { type: 'image/png' }) },
  'image.setAttributes': { alt: 'a' },
  'table.insert': { rows: 2, cols: 2 },
  textColor: { color: '#ff0000' },
  backgroundColor: { color: '#00ff00' },
  fontFamily: { family: 'serif' },
  fontSize: { size: '14px' },
};

describe('registre des commandes standard', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour le monde</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('convention du contrat', () => {
    it.each(STANDARD_COMMAND_IDS)(
      '%s est enregistrée avec labelKey et icon conventionnels',
      (id) => {
        const command = mounted.editor.commands.get(id);
        expect(command).toBeDefined();
        expect(command?.labelKey).toBe(`command.${id}`);
        expect(command?.icon).toBe(iconIdFor(id));
      },
    );

    it('iconIdFor remplace les points par des tirets', () => {
      expect(iconIdFor('table.insert')).toBe('table-insert');
      expect(iconIdFor('bold')).toBe('bold');
      expect(iconIdFor('a.b.c')).toBe('a-b-c');
    });

    it('list expose toutes les commandes standard', () => {
      const ids = mounted.editor.commands.list().map((command) => command.id);
      for (const id of STANDARD_COMMAND_IDS) {
        expect(ids).toContain(id);
      }
    });
  });

  describe('lecture seule', () => {
    it.each(STANDARD_COMMAND_IDS)('%s : canRun et run sont faux en lecture seule', (id) => {
      mounted.editor.setReadOnly(true);
      const args = SAMPLE_ARGS[id];
      expect(mounted.editor.commands.canRun(id, args)).toBe(false);
      expect(mounted.editor.commands.run(id, args)).toBe(false);
    });
  });

  describe('tolérance du registre', () => {
    it('identifiant inconnu : false partout, jamais d’exception', () => {
      expect(mounted.editor.commands.run('nope')).toBe(false);
      expect(mounted.editor.commands.canRun('nope')).toBe(false);
      expect(mounted.editor.commands.isActive('nope')).toBe(false);
      expect(mounted.editor.commands.get('nope')).toBeUndefined();
      expect(mounted.editor.commands.has('nope')).toBe(false);
    });

    it('une commande qui lève répond false', () => {
      mounted.editor.commands.register({
        id: 'boom',
        labelKey: 'command.boom',
        run: () => {
          throw new Error('boom');
        },
        canRun: () => {
          throw new Error('boom');
        },
        isActive: () => {
          throw new Error('boom');
        },
      });
      expect(mounted.editor.commands.run('boom')).toBe(false);
      expect(mounted.editor.commands.canRun('boom')).toBe(false);
      expect(mounted.editor.commands.isActive('boom')).toBe(false);
    });

    it('canRun vaut true et isActive false par défaut pour une commande sans ces méthodes', () => {
      mounted.editor.commands.register({ id: 'bare', labelKey: 'command.bare', run: () => true });
      expect(mounted.editor.commands.canRun('bare')).toBe(true);
      expect(mounted.editor.commands.isActive('bare')).toBe(false);
    });

    it('register remplace une commande existante, unregister la retire', () => {
      const run = vi.fn(() => true);
      mounted.editor.commands.register({ id: 'bold', labelKey: 'command.bold', run });
      mounted.editor.commands.run('bold');
      expect(run).toHaveBeenCalledTimes(1);
      mounted.editor.commands.unregister('bold');
      expect(mounted.editor.commands.has('bold')).toBe(false);
    });
  });

  describe('historique', () => {
    it('undo annule, redo rétablit', () => {
      expect(mounted.editor.commands.canRun('undo')).toBe(false);
      expect(mounted.editor.commands.canRun('redo')).toBe(false);
      selectFirstBlock(mounted.editor);
      mounted.editor.commands.run('bold');
      expect(mounted.editor.commands.canRun('undo')).toBe(true);
      expect(mounted.editor.commands.run('undo')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour le monde</p>');
      expect(mounted.editor.commands.canRun('redo')).toBe(true);
      expect(mounted.editor.commands.run('redo')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p><strong>Bonjour le monde</strong></p>');
    });

    it('selectAll sélectionne tout le document', () => {
      expect(mounted.editor.commands.run('selectAll')).toBe(true);
      const { from, to } = mounted.editor.tiptap.state.selection;
      expect(from).toBe(0);
      expect(to).toBe(mounted.editor.tiptap.state.doc.content.size);
    });
  });
});
