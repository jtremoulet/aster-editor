import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bodyHtml,
  findNodePos,
  mountEditor,
  selectRange,
  type MountedEditor,
} from '../testing/mount.js';

const ALIGN_COMMANDS = ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'] as const;

describe('commandes de blocs, listes et alignement', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour le monde</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('blocs', () => {
    it('heading applique le niveau et isActive distingue les niveaux', () => {
      expect(mounted.editor.commands.canRun('heading', { level: 2 })).toBe(true);
      expect(mounted.editor.commands.run('heading', { level: 2 })).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<h2>Bonjour le monde</h2>');
      expect(mounted.editor.commands.isActive('heading', { level: 2 })).toBe(true);
      expect(mounted.editor.commands.isActive('heading', { level: 3 })).toBe(false);
      expect(mounted.editor.commands.isActive('paragraph')).toBe(false);
    });

    it('paragraph ramène un titre au paragraphe', () => {
      mounted.editor.commands.run('heading', { level: 1 });
      expect(mounted.editor.commands.canRun('paragraph')).toBe(true);
      expect(mounted.editor.commands.run('paragraph')).toBe(true);
      expect(mounted.editor.commands.isActive('paragraph')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<p>Bonjour le monde</p>');
    });

    it('un bloc déjà du type demandé : canRun et run répondent false sans mutation', () => {
      expect(mounted.editor.commands.isActive('paragraph')).toBe(true);
      expect(mounted.editor.commands.canRun('paragraph')).toBe(false);
      expect(mounted.editor.commands.run('paragraph')).toBe(false);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour le monde</p>');
      mounted.editor.commands.run('heading', { level: 2 });
      expect(mounted.editor.commands.canRun('heading', { level: 2 })).toBe(false);
      expect(mounted.editor.commands.run('heading', { level: 2 })).toBe(false);
      expect(bodyHtml(mounted.editor)).toBe('<h2>Bonjour le monde</h2>');
      expect(mounted.editor.commands.canRun('heading', { level: 3 })).toBe(true);
    });

    it('paragraph et heading refusent un item de liste et ne touchent pas au document', () => {
      mounted.editor.setHTML('<ul><li><p>a</p></li></ul>');
      // ul(0) li(1) p(2) a(3)
      selectRange(mounted.editor, 3, 3);
      const before = mounted.editor.getHTML();
      expect(mounted.editor.commands.isActive('paragraph')).toBe(true);
      expect(mounted.editor.commands.canRun('paragraph')).toBe(false);
      expect(mounted.editor.commands.run('paragraph')).toBe(false);
      expect(mounted.editor.getHTML()).toBe(before);
      expect(mounted.editor.commands.canRun('heading', { level: 2 })).toBe(false);
      expect(mounted.editor.commands.run('heading', { level: 2 })).toBe(false);
      expect(mounted.editor.getHTML()).toBe(before);
      expect(mounted.editor.commands.isActive('bulletList')).toBe(true);
    });

    it('heading dans une citation change le bloc sans déballer la citation', () => {
      mounted.editor.setHTML('<blockquote><p>a</p></blockquote>');
      // blockquote(0) p(1) a(2)
      selectRange(mounted.editor, 2, 2);
      expect(mounted.editor.commands.canRun('heading', { level: 2 })).toBe(true);
      expect(mounted.editor.commands.run('heading', { level: 2 })).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<blockquote><h2>a</h2></blockquote>');
    });

    it('blockquote et codeBlock enveloppent le bloc', () => {
      expect(mounted.editor.commands.run('blockquote')).toBe(true);
      expect(mounted.editor.commands.isActive('blockquote')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<blockquote><p>Bonjour le monde</p></blockquote>');
      mounted.editor.commands.run('blockquote');
      expect(mounted.editor.commands.run('codeBlock')).toBe(true);
      expect(mounted.editor.commands.isActive('codeBlock')).toBe(true);
      expect(mounted.editor.getHTML()).toContain('<pre><code>');
    });

    it('horizontalRule et hardBreak insèrent leur nœud', () => {
      mounted.editor.focus('end');
      expect(mounted.editor.commands.run('horizontalRule')).toBe(true);
      expect(mounted.editor.getHTML()).toContain('<hr>');
      mounted.editor.setHTML('<p>a</p>');
      mounted.editor.focus('end');
      expect(mounted.editor.commands.run('hardBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toContain('<br>');
    });
  });

  describe('listes', () => {
    it('bulletList et orderedList basculent la liste', () => {
      expect(mounted.editor.commands.run('bulletList')).toBe(true);
      expect(mounted.editor.commands.isActive('bulletList')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<ul><li><p>Bonjour le monde</p></li></ul>');
      expect(mounted.editor.commands.run('orderedList')).toBe(true);
      expect(mounted.editor.commands.isActive('orderedList')).toBe(true);
      expect(mounted.editor.commands.isActive('bulletList')).toBe(false);
      expect(bodyHtml(mounted.editor)).toBe('<ol><li><p>Bonjour le monde</p></li></ol>');
    });

    it('taskList produit une liste de tâches', () => {
      expect(mounted.editor.commands.run('taskList')).toBe(true);
      expect(mounted.editor.commands.isActive('taskList')).toBe(true);
      expect(mounted.editor.getHTML()).toContain('data-type="taskList"');
    });

    it('indent imbrique le second item, outdent le ressort', () => {
      mounted.editor.setHTML('<ul><li><p>Un</p></li><li><p>Deux</p></li></ul>');
      // Curseur dans « Deux » : ul(0) li(1) p(2) U(3)n(4) /p(5) /li(6) li(7) p(8) D(9)
      selectRange(mounted.editor, 9, 9);
      expect(mounted.editor.commands.canRun('outdent')).toBe(true);
      expect(mounted.editor.commands.canRun('indent')).toBe(true);
      expect(mounted.editor.commands.run('indent')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe(
        '<ul><li><p>Un</p><ul><li><p>Deux</p></li></ul></li></ul>',
      );
      expect(mounted.editor.commands.run('outdent')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<ul><li><p>Un</p></li><li><p>Deux</p></li></ul>');
    });

    it('indent et outdent sont impossibles hors d’une liste', () => {
      expect(mounted.editor.commands.canRun('indent')).toBe(false);
      expect(mounted.editor.commands.canRun('outdent')).toBe(false);
      expect(mounted.editor.commands.run('indent')).toBe(false);
      expect(mounted.editor.commands.run('outdent')).toBe(false);
    });
  });

  describe('alignement', () => {
    it.each([
      ['alignCenter', 'center'],
      ['alignRight', 'right'],
      ['alignJustify', 'justify'],
    ] as const)('%s pose text-align: %s', (id, value) => {
      expect(mounted.editor.commands.run(id)).toBe(true);
      expect(mounted.editor.commands.isActive(id)).toBe(true);
      expect(mounted.editor.getHTML()).toContain(`text-align: ${value}`);
    });

    it('alignLeft est actif par défaut et retire l’alignement explicite', () => {
      expect(mounted.editor.commands.isActive('alignLeft')).toBe(true);
      mounted.editor.commands.run('alignCenter');
      expect(mounted.editor.commands.isActive('alignLeft')).toBe(false);
      expect(mounted.editor.commands.run('alignLeft')).toBe(true);
      expect(mounted.editor.commands.isActive('alignLeft')).toBe(true);
    });

    it('aucun align* n’est actif sur une image sélectionnée ni dans un bloc de code', () => {
      mounted.editor.setHTML('<p>a</p><img src="https://example.com/a.png">');
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'image'));
      for (const id of ALIGN_COMMANDS) {
        expect(mounted.editor.commands.isActive(id)).toBe(false);
      }
      mounted.editor.setHTML('<pre><code>x</code></pre>');
      selectRange(mounted.editor, 1, 1);
      expect(mounted.editor.commands.isActive('codeBlock')).toBe(true);
      for (const id of ALIGN_COMMANDS) {
        expect(mounted.editor.commands.isActive(id)).toBe(false);
      }
    });
  });
});
