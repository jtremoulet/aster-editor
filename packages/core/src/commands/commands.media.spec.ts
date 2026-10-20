import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findNodePos,
  mountEditor,
  selectFirstBlock,
  selectRange,
  type MountedEditor,
} from '../testing/mount';

describe('commandes de liens et d’images', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour le monde</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
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

    it('link.set refuse javascript:, data: et les entités dans le schéma', () => {
      selectFirstBlock(mounted.editor);
      for (const href of [
        'javascript:alert(1)',
        'data:text/html,x',
        'JAVASCRIPT:x',
        'java&#115;cript:alert(1)',
        'javascript&colon;alert(1)',
      ]) {
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

    it('image.insert accepte data:image/ mais refuse javascript: et data:text/html', () => {
      expect(
        mounted.editor.commands.canRun('image.insert', { src: 'data:image/png;base64,AA==' }),
      ).toBe(true);
      for (const src of ['javascript:alert(1)', 'data:text/html,x']) {
        expect(mounted.editor.commands.canRun('image.insert', { src })).toBe(false);
        expect(mounted.editor.commands.run('image.insert', { src })).toBe(false);
      }
    });

    it('image.insert n’est jamais active et refuse un bloc de code', () => {
      mounted.editor.setHTML('<p>a</p><img src="https://example.com/a.png">');
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'image'));
      expect(mounted.editor.commands.isActive('image.insert', { src: 'x' })).toBe(false);

      mounted.editor.setHTML('<pre><code>x</code></pre>');
      selectRange(mounted.editor, 1, 1);
      const before = mounted.editor.getHTML();
      const args = { src: 'https://example.com/a.png' };
      expect(mounted.editor.commands.canRun('image.insert', args)).toBe(false);
      expect(mounted.editor.commands.run('image.insert', args)).toBe(false);
      expect(mounted.editor.getHTML()).toBe(before);
    });

    it('image.setAttributes modifie l’image sélectionnée et pose data-align', () => {
      mounted.editor.setHTML('<p>a</p><img src="https://example.com/a.png">');
      // `setContent` mappe l'ancienne sélection à travers le remplacement et peut la
      // poser sur l'image : on place le curseur dans le texte explicitement.
      selectRange(mounted.editor, 1, 1);
      expect(mounted.editor.commands.canRun('image.setAttributes', { alt: 'x' })).toBe(false);
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'image'));
      expect(mounted.editor.commands.isActive('image.setAttributes')).toBe(true);
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
});
