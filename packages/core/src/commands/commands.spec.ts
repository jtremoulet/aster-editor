import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_COMMAND_IDS, type AsterEditor, type StandardCommandId } from '../api';
import { iconIdFor } from './define';
import { mountEditor, selectFirstBlock, selectRange, type MountedEditor } from '../testing/mount';

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

/**
 * HTML sans le paragraphe vide final que `TrailingNode` ajoute dès que le dernier
 * bloc n'est pas un paragraphe (titre, liste, citation…). C'est voulu : il garantit
 * qu'on peut toujours cliquer sous un tel bloc. On l'ignore pour lire le reste.
 */
const body = (editor: AsterEditor): string => editor.getHTML().replace(/<p><\/p>$/, '');

describe('commandes standard', () => {
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

  describe('marques', () => {
    it('bold bascule la marque et isActive suit la sélection', () => {
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.isActive('bold')).toBe(false);
      expect(mounted.editor.commands.canRun('bold')).toBe(true);
      expect(mounted.editor.commands.run('bold')).toBe(true);
      expect(mounted.editor.commands.isActive('bold')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p><strong>Bonjour le monde</strong></p>');
      mounted.editor.commands.run('bold');
      expect(mounted.editor.commands.isActive('bold')).toBe(false);
    });

    it.each([
      ['italic', 'em'],
      ['underline', 'u'],
      ['strike', 's'],
      ['subscript', 'sub'],
      ['superscript', 'sup'],
      ['code', 'code'],
      ['highlight', 'mark'],
    ] as const)('%s produit <%s>', (id, tag) => {
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run(id)).toBe(true);
      expect(mounted.editor.commands.isActive(id)).toBe(true);
      expect(mounted.editor.getHTML()).toContain(`<${tag}`);
    });

    it('clearFormatting retire marques et type de bloc', () => {
      mounted.editor.setHTML('<h1><strong><em>Titre</em></strong></h1>');
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run('clearFormatting')).toBe(true);
      expect(body(mounted.editor)).toBe('<p>Titre</p>');
    });
  });

  describe('blocs', () => {
    it('heading applique le niveau et isActive distingue les niveaux', () => {
      expect(mounted.editor.commands.run('heading', { level: 2 })).toBe(true);
      expect(body(mounted.editor)).toBe('<h2>Bonjour le monde</h2>');
      expect(mounted.editor.commands.isActive('heading', { level: 2 })).toBe(true);
      expect(mounted.editor.commands.isActive('heading', { level: 3 })).toBe(false);
      expect(mounted.editor.commands.isActive('paragraph')).toBe(false);
    });

    it('paragraph ramène un titre au paragraphe', () => {
      mounted.editor.commands.run('heading', { level: 1 });
      expect(mounted.editor.commands.run('paragraph')).toBe(true);
      expect(mounted.editor.commands.isActive('paragraph')).toBe(true);
      expect(body(mounted.editor)).toBe('<p>Bonjour le monde</p>');
    });

    it('blockquote et codeBlock enveloppent le bloc', () => {
      expect(mounted.editor.commands.run('blockquote')).toBe(true);
      expect(mounted.editor.commands.isActive('blockquote')).toBe(true);
      expect(body(mounted.editor)).toBe('<blockquote><p>Bonjour le monde</p></blockquote>');
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
      expect(body(mounted.editor)).toBe('<ul><li><p>Bonjour le monde</p></li></ul>');
      expect(mounted.editor.commands.run('orderedList')).toBe(true);
      expect(mounted.editor.commands.isActive('orderedList')).toBe(true);
      expect(mounted.editor.commands.isActive('bulletList')).toBe(false);
      expect(body(mounted.editor)).toBe('<ol><li><p>Bonjour le monde</p></li></ol>');
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
      expect(body(mounted.editor)).toBe('<ul><li><p>Un</p><ul><li><p>Deux</p></li></ul></li></ul>');
      expect(mounted.editor.commands.run('outdent')).toBe(true);
      expect(body(mounted.editor)).toBe('<ul><li><p>Un</p></li><li><p>Deux</p></li></ul>');
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
  });

  describe('liens', () => {
    it('link.set marque la sélection, link.unset la retire', () => {
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.canRun('link.set', { href: 'https://example.com' })).toBe(
        true,
      );
      expect(mounted.editor.commands.run('link.set', { href: 'https://example.com' })).toBe(true);
      expect(mounted.editor.commands.isActive('link.set', { href: 'https://example.com' })).toBe(
        true,
      );
      expect(mounted.editor.getHTML()).toContain('href="https://example.com"');
      expect(mounted.editor.commands.canRun('link.unset')).toBe(true);
      expect(mounted.editor.commands.run('link.unset')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour le monde</p>');
    });

    it('link.set applique la cible et le rel de la politique', () => {
      selectFirstBlock(mounted.editor);
      mounted.editor.commands.run('link.set', { href: 'https://example.com', title: 'T' });
      const html = mounted.editor.getHTML();
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('title="T"');
    });

    it('link.set sur une sélection vide insère l’URL comme texte lié', () => {
      mounted.editor.setHTML('<p></p>');
      mounted.editor.focus('end');
      expect(mounted.editor.commands.run('link.set', { href: 'https://example.com' })).toBe(true);
      expect(mounted.editor.getHTML()).toContain('>https://example.com</a>');
    });

    it('link.set refuse javascript: et data: par canRun et par run', () => {
      selectFirstBlock(mounted.editor);
      for (const href of ['javascript:alert(1)', 'data:text/html,x', 'JAVASCRIPT:x']) {
        expect(mounted.editor.commands.canRun('link.set', { href })).toBe(false);
        expect(mounted.editor.commands.run('link.set', { href })).toBe(false);
      }
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour le monde</p>');
    });

    it('link.set sans href est refusé', () => {
      expect(mounted.editor.commands.run('link.set', { href: '' })).toBe(false);
      expect(mounted.editor.commands.canRun('link.set', { href: '   ' })).toBe(false);
    });

    it('link.unset est impossible hors d’un lien', () => {
      expect(mounted.editor.commands.canRun('link.unset')).toBe(false);
    });
  });

  describe('images', () => {
    it('image.insert insère une image avec ses attributs', () => {
      mounted.editor.focus('end');
      const args = { src: 'https://example.com/a.png', alt: 'A', title: 'T', width: 100 };
      expect(mounted.editor.commands.canRun('image.insert', args)).toBe(true);
      expect(mounted.editor.commands.run('image.insert', args)).toBe(true);
      const html = mounted.editor.getHTML();
      expect(html).toContain('src="https://example.com/a.png"');
      expect(html).toContain('alt="A"');
      expect(html).toContain('title="T"');
      expect(html).toContain('width="100"');
    });

    it('image.insert accepte data: mais refuse javascript:', () => {
      expect(
        mounted.editor.commands.canRun('image.insert', { src: 'data:image/png;base64,AA==' }),
      ).toBe(true);
      expect(mounted.editor.commands.canRun('image.insert', { src: 'javascript:alert(1)' })).toBe(
        false,
      );
      expect(mounted.editor.commands.run('image.insert', { src: 'javascript:alert(1)' })).toBe(
        false,
      );
    });

    it('image.setAttributes modifie l’image sélectionnée et pose data-align', () => {
      mounted.editor.setHTML('<p>a</p><img src="https://example.com/a.png">');
      // `setContent` mappe l'ancienne sélection à travers le remplacement et peut la
      // poser sur l'image : on place le curseur dans le texte explicitement.
      selectRange(mounted.editor, 1, 1);
      expect(mounted.editor.commands.isActive('image.insert', { src: 'x' })).toBe(false);
      expect(mounted.editor.commands.canRun('image.setAttributes', { alt: 'x' })).toBe(false);
      let imagePos = -1;
      mounted.editor.tiptap.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image') {
          imagePos = pos;
        }
        return imagePos < 0;
      });
      mounted.editor.tiptap.commands.setNodeSelection(imagePos);
      expect(mounted.editor.commands.isActive('image.insert', { src: 'x' })).toBe(true);
      expect(mounted.editor.commands.canRun('image.setAttributes', { alt: 'x' })).toBe(true);
      expect(
        mounted.editor.commands.run('image.setAttributes', { alt: 'Nouveau', align: 'center' }),
      ).toBe(true);
      const html = mounted.editor.getHTML();
      expect(html).toContain('alt="Nouveau"');
      expect(html).toContain('data-align="center"');
    });

    it('image.upload refuse un fichier non-image', () => {
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      expect(mounted.editor.commands.canRun('image.upload', { file })).toBe(false);
      expect(mounted.editor.commands.run('image.upload', { file })).toBe(false);
    });
  });

  describe('tables', () => {
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

  describe('style de texte', () => {
    it.each([
      // Le CSSOM normalise les hex en rgb() à la sérialisation, en navigateur comme sous jsdom.
      ['textColor', { color: '#ff0000' }, { color: null }, 'color: rgb(255, 0, 0)'],
      [
        'backgroundColor',
        { color: '#00ff00' },
        { color: null },
        'background-color: rgb(0, 255, 0)',
      ],
      ['fontFamily', { family: 'serif' }, { family: null }, 'font-family: serif'],
      ['fontSize', { size: '14px' }, { size: null }, 'font-size: 14px'],
    ] as const)('%s pose puis retire le style', (id, set, unset, css) => {
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.canRun(id, set)).toBe(true);
      expect(mounted.editor.commands.run(id, set)).toBe(true);
      expect(mounted.editor.commands.isActive(id, set)).toBe(true);
      expect(mounted.editor.getHTML()).toContain(css);
      expect(mounted.editor.commands.isActive(id, unset)).toBe(false);
      expect(mounted.editor.commands.run(id, unset)).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour le monde</p>');
    });

    it('isActive distingue deux valeurs de la même propriété', () => {
      selectFirstBlock(mounted.editor);
      mounted.editor.commands.run('textColor', { color: '#ff0000' });
      expect(mounted.editor.commands.isActive('textColor', { color: '#ff0000' })).toBe(true);
      expect(mounted.editor.commands.isActive('textColor', { color: '#0000ff' })).toBe(false);
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
