import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import {
  decorationStyleFromShorthand,
  isCaps,
  isDecorationStyle,
  parseCaps,
  parseDecorationStyle,
} from './run-layout';
import { mountEditor, selectFirstBlock, type MountedEditor } from '../testing/mount';

/** `setHTML(getHTML())` doit redonner exactement le même HTML. */
function expectIdempotent(mounted: MountedEditor): void {
  const html = mounted.editor.getHTML();
  mounted.editor.setHTML(html);
  expect(mounted.editor.getHTML()).toBe(html);
}

describe('RunLayout', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('helpers purs', () => {
    it('reconnaît les casses et les styles de trait', () => {
      expect(isCaps('all')).toBe(true);
      expect(isCaps('small')).toBe(true);
      expect(isCaps('none')).toBe(false);
      expect(isDecorationStyle('wavy')).toBe(true);
      expect(isDecorationStyle('groove')).toBe(false);
      expect(decorationStyleFromShorthand('underline double')).toBe('double');
      expect(decorationStyleFromShorthand('line-through')).toBeNull();
      expect(decorationStyleFromShorthand(null)).toBeNull();
    });

    it('lit la casse et le style de trait d’un élément', () => {
      const span = document.createElement('span');
      span.setAttribute('style', 'text-transform: uppercase');
      expect(parseCaps(span)).toBe('all');
      span.setAttribute('style', 'font-variant: small-caps');
      expect(parseCaps(span)).toBe('small');
      span.setAttribute('style', 'font-variant-caps: small-caps');
      expect(parseCaps(span)).toBe('small');
      span.setAttribute('style', 'color: red');
      expect(parseCaps(span)).toBeNull();
      span.setAttribute('style', 'text-decoration-style: dotted');
      expect(parseDecorationStyle(span)).toBe('dotted');
      span.setAttribute('style', 'text-decoration: underline wavy');
      expect(parseDecorationStyle(span)).toBe('wavy');
      span.setAttribute('style', 'text-decoration: underline');
      expect(parseDecorationStyle(span)).toBeNull();
    });
  });

  describe('marque textStyle', () => {
    it.each([
      ['letterSpacingPt', '<p><span style="letter-spacing: 1pt">Bonjour</span></p>'],
      ['letterSpacingPt décimal', '<p><span style="letter-spacing: 0.5pt">Bonjour</span></p>'],
      ['caps all', '<p><span style="text-transform: uppercase">Bonjour</span></p>'],
      ['caps small', '<p><span style="font-variant: small-caps">Bonjour</span></p>'],
      ['docxRunStyle seul', '<p><span data-docx-run-style="Emphasis">Bonjour</span></p>'],
      [
        'cumul après les styles Tiptap',
        '<p><span style="color: #ff0000; letter-spacing: 1pt; text-transform: uppercase" data-docx-run-style="Strong">Bonjour</span></p>',
      ],
    ])('%s : rendu exact et idempotence', (_name, html) => {
      mounted.editor.setHTML(html);
      expect(mounted.editor.getHTML()).toBe(html);
      expectIdempotent(mounted);
    });

    it('relit letter-spacing en px et font-variant-caps', () => {
      mounted.editor.setHTML(
        '<p><span style="letter-spacing: 2px; font-variant-caps: small-caps">Bonjour</span></p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="letter-spacing: 1.5pt; font-variant: small-caps">Bonjour</span></p>',
      );
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.tiptap.getAttributes('textStyle')).toMatchObject({
        letterSpacingPt: 1.5,
        caps: 'small',
      });
    });

    it('un span sans style ni data-docx-run-style reste du texte nu', () => {
      mounted.editor.setHTML('<p><span class="x">Bonjour</span></p>');
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour</p>');
    });

    it('les styles Tiptap existants (couleur, police) fonctionnent toujours', () => {
      mounted.editor.setHTML(
        '<p><span style="font-family: serif; font-size: 12pt">Bonjour</span></p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="font-family: serif; font-size: 12pt">Bonjour</span></p>',
      );
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run('textColor', { color: '#00ff00' })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="color: #00ff00; font-family: serif; font-size: 12pt">Bonjour</span></p>',
      );
    });
  });

  describe('commandes text.*', () => {
    beforeEach(() => {
      selectFirstBlock(mounted.editor);
    });

    it('text.setLetterSpacing pose, remplace et retire l’espacement', () => {
      expect(mounted.editor.commands.canRun('text.setLetterSpacing', { pt: 1 })).toBe(true);
      expect(mounted.editor.commands.run('text.setLetterSpacing', { pt: 1 })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="letter-spacing: 1pt">Bonjour</span></p>',
      );
      expect(mounted.editor.commands.isActive('text.setLetterSpacing', { pt: 1 })).toBe(true);
      expect(mounted.editor.commands.isActive('text.setLetterSpacing', { pt: 2 })).toBe(false);
      expect(mounted.editor.commands.run('text.setLetterSpacing', { pt: 2.5 })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="letter-spacing: 2.5pt">Bonjour</span></p>',
      );
      expect(mounted.editor.commands.run('text.setLetterSpacing', { pt: null })).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour</p>');
      expect(mounted.editor.commands.run('text.setLetterSpacing', { pt: 'x' })).toBe(false);
      expect(mounted.editor.commands.canRun('text.setLetterSpacing', { pt: Number.NaN })).toBe(
        false,
      );
      expect(mounted.editor.commands.run('text.setLetterSpacing')).toBe(false);
    });

    it('text.setCaps et text.unsetCaps', () => {
      expect(mounted.editor.commands.canRun('text.setCaps', { caps: 'all' })).toBe(true);
      expect(mounted.editor.commands.canRun('text.setCaps', { caps: 'nope' })).toBe(false);
      expect(mounted.editor.commands.run('text.setCaps', { caps: 'all' })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="text-transform: uppercase">Bonjour</span></p>',
      );
      expect(mounted.editor.commands.isActive('text.setCaps', { caps: 'all' })).toBe(true);
      expect(mounted.editor.commands.isActive('text.unsetCaps')).toBe(true);
      expect(mounted.editor.commands.run('text.setCaps', { caps: 'small' })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="font-variant: small-caps">Bonjour</span></p>',
      );
      expect(mounted.editor.commands.run('text.unsetCaps')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour</p>');
      expect(mounted.editor.commands.isActive('text.unsetCaps')).toBe(false);
      expect(mounted.editor.commands.run('text.setCaps', { caps: 'nope' })).toBe(false);
      expect(mounted.editor.commands.run('text.setCaps')).toBe(false);
    });

    it('les commandes text.* sont enregistrées avec libellé fr et en, et refusées en lecture seule', () => {
      for (const id of ['text.setLetterSpacing', 'text.setCaps', 'text.unsetCaps']) {
        const command = mounted.editor.commands.get(id);
        expect(command?.labelKey).toBe(`command.${id}`);
        expect(fr[`command.${id}`]).toBeDefined();
        expect(en[`command.${id}`]).toBeDefined();
      }
      mounted.editor.setReadOnly(true);
      expect(mounted.editor.commands.canRun('text.setCaps', { caps: 'all' })).toBe(false);
      expect(mounted.editor.commands.run('text.unsetCaps')).toBe(false);
    });

    it('retirer le dernier attribut retire la marque, pas les autres attributs', () => {
      mounted.editor.commands.run('textColor', { color: '#ff0000' });
      mounted.editor.commands.run('text.setCaps', { caps: 'all' });
      expect(mounted.editor.commands.run('text.unsetCaps')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p><span style="color: #ff0000">Bonjour</span></p>');
    });
  });

  describe('decorationStyle sur underline et strike', () => {
    it.each([
      ['<p><u style="text-decoration-style: double">Bonjour</u></p>'],
      ['<p><u style="text-decoration-style: wavy">Bonjour</u></p>'],
      ['<p><s style="text-decoration-style: double">Bonjour</s></p>'],
      // Ordre des marques du schéma : `strike` avant `underline` (celui de StarterKit).
      [
        '<p><s style="text-decoration-style: dashed"><u style="text-decoration-style: dotted">Bonjour</u></s></p>',
      ],
    ])('%s : rendu exact et idempotence', (html) => {
      mounted.editor.setHTML(html);
      expect(mounted.editor.getHTML()).toBe(html);
      expectIdempotent(mounted);
    });

    it('relit le raccourci text-decoration sur u, s et span', () => {
      mounted.editor.setHTML('<p><u style="text-decoration: underline double">Bonjour</u></p>');
      expect(mounted.editor.getHTML()).toBe(
        '<p><u style="text-decoration-style: double">Bonjour</u></p>',
      );
      mounted.editor.setHTML('<p><s style="text-decoration: line-through double">Bonjour</s></p>');
      expect(mounted.editor.getHTML()).toBe(
        '<p><s style="text-decoration-style: double">Bonjour</s></p>',
      );
      // Un `<span style>` produit toujours une marque `textStyle` (règle Tiptap, antérieure
      // à ce lot) : vide ici, elle ressort en `<span>` nu autour du souligné.
      mounted.editor.setHTML(
        '<p><span style="text-decoration: underline dotted">Bonjour</span></p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p><span><u style="text-decoration-style: dotted">Bonjour</u></span></p>',
      );
    });

    it('un souligné et un barré simples restent nus, et les commandes marchent', () => {
      mounted.editor.setHTML(
        '<p><u>a</u> <s>b</s> <u style="text-decoration: underline">c</u></p>',
      );
      expect(mounted.editor.getHTML()).toBe('<p><u>a</u> <s>b</s> <u>c</u></p>');
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run('underline')).toBe(true);
      expect(mounted.editor.commands.isActive('underline')).toBe(true);
      expect(mounted.editor.commands.run('strike')).toBe(true);
      expect(mounted.editor.commands.isActive('strike')).toBe(true);
    });
  });
});
