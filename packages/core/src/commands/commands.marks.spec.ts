import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bodyHtml,
  mountEditor,
  selectFirstBlock,
  selectRange,
  type MountedEditor,
} from '../testing/mount';

describe('commandes de marques et de style', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour le monde</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
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
  });

  describe('clearFormatting', () => {
    it('retire marques, style de texte et type de bloc', () => {
      mounted.editor.setHTML(
        '<h1><strong><em><span style="color: rgb(255, 0, 0)">Titre</span></em></strong></h1>',
      );
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.canRun('clearFormatting')).toBe(true);
      expect(mounted.editor.commands.run('clearFormatting')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<p>Titre</p>');
    });

    it('conserve les liens', () => {
      mounted.editor.setHTML('<p><a href="https://example.com"><strong>lien</strong></a> nu</p>');
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run('clearFormatting')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p><a href="https://example.com">lien</a> nu</p>');
    });

    it('ne sort pas un item de sa liste ni une citation de son bloc', () => {
      mounted.editor.setHTML('<ul><li><p><em>a</em></p></li></ul>');
      // ul(0) li(1) p(2) a(3) /p(4)
      selectRange(mounted.editor, 3, 4);
      expect(mounted.editor.commands.run('clearFormatting')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<ul><li><p>a</p></li></ul>');

      mounted.editor.setHTML('<blockquote><h2><strong>b</strong></h2></blockquote>');
      // blockquote(0) h2(1) b(2) /h2(3)
      selectRange(mounted.editor, 2, 3);
      expect(mounted.editor.commands.run('clearFormatting')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<blockquote><p>b</p></blockquote>');
    });

    it('efface l’alignement explicite du bloc', () => {
      mounted.editor.setHTML('<p style="text-align: center"><strong>c</strong></p>');
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run('clearFormatting')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>c</p>');
    });

    it('est impossible sur un document vide', () => {
      mounted.editor.setHTML('');
      expect(mounted.editor.isEmpty()).toBe(true);
      expect(mounted.editor.commands.canRun('clearFormatting')).toBe(false);
    });
  });

  describe('style de texte', () => {
    it.each([
      // Depuis la session 3, `getHTML` sérialise les `style` verbatim (plus de passage par
      // le CSSOM, qui réécrivait les hex en rgb()) : la couleur ressort telle que posée.
      ['textColor', { color: '#ff0000' }, { color: null }, 'color: #ff0000'],
      ['backgroundColor', { color: '#00ff00' }, { color: null }, 'background-color: #00ff00'],
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
});
