import { Editor, type AnyExtension } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeDocumentHtml } from '../html/serialize-html';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import {
  AsterHighlight,
  AsterStrike,
  AsterUnderline,
  RunLayout,
  decorationStyleFromShorthand,
  isCaps,
  isDecorationStyle,
  normalizeStyleColors,
  parseCaps,
  parseDecorationStyle,
} from './run-layout';
import { mountEditor, selectFirstBlock, type MountedEditor } from '../testing/mount';

/**
 * Éditeur Tiptap nu avec les extensions données : pour `AsterStrike` et `AsterHighlight`,
 * pas encore câblés dans `aster-extensions.ts` (fichier réservé à L30). Rendu par le
 * sérialiseur verbatim du core, comme `getHTML()`.
 */
function rawRoundTrip(extensions: AnyExtension[], html: string): string {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({ element, extensions, content: html });
  try {
    return serializeDocumentHtml(editor.state.doc);
  } finally {
    editor.destroy();
    element.remove();
  }
}

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

    it('R23-07 : un span dont aucun attribut textStyle ne se résout ne crée pas de marque vide', () => {
      mounted.editor.setHTML('<p><span style="text-decoration: underline">x</span></p>');
      expect(mounted.editor.getHTML()).toBe('<p><u>x</u></p>');
      expectIdempotent(mounted);
      mounted.editor.setHTML(
        '<p><span style="mso-spacerun: yes; text-decoration: none">x</span></p>',
      );
      expect(mounted.editor.getHTML()).toBe('<p>x</p>');
      // Un attribut qui se résout suffit, même aux côtés de déclarations ignorées.
      mounted.editor.setHTML(
        '<p><span style="mso-spacerun: yes; letter-spacing: 1pt">x</span></p>',
      );
      expect(mounted.editor.getHTML()).toBe('<p><span style="letter-spacing: 1pt">x</span></p>');
      // `letter-spacing: 0pt` est une valeur (zéro), pas une absence.
      mounted.editor.setHTML('<p><span style="letter-spacing: 0pt">x</span></p>');
      expect(mounted.editor.getHTML()).toBe('<p><span style="letter-spacing: 0pt">x</span></p>');
    });

    it('R23-09 : color et background-color sortent en #rrggbb minuscules', () => {
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run('textColor', { color: '#FF0000' })).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p><span style="color: #ff0000">Bonjour</span></p>');
      expect(mounted.editor.commands.run('backgroundColor', { color: 'rgb(0, 255, 0)' })).toBe(
        true,
      );
      // Ordre des déclarations : celui des attributs de `TextStyleKit` (`backgroundColor`
      // avant `color`), inchangé par la normalisation.
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="background-color: #00ff00; color: #ff0000">Bonjour</span></p>',
      );
      expectIdempotent(mounted);
      mounted.editor.setHTML(
        '<p><span style="color: RED; background-color: #ABC; font-family: serif">x</span></p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="background-color: #aabbcc; color: red; font-family: serif">x</span></p>',
      );
      expectIdempotent(mounted);
      // Une valeur que le contrat ne sait pas lire reste telle quelle.
      mounted.editor.setHTML('<p><span style="color: var(--x)">x</span></p>');
      expect(mounted.editor.getHTML()).toBe('<p><span style="color: var(--x)">x</span></p>');
      expect(normalizeStyleColors('color: #FF0000; font-size: 12pt; background-color: Red')).toBe(
        'color: #ff0000; font-size: 12pt; background-color: red',
      );
    });

    it('R23-09 : AsterHighlight normalise data-color et background-color', () => {
      const extensions = [StarterKit, AsterHighlight.configure({ multicolor: true })];
      expect(
        rawRoundTrip(extensions, '<p><mark style="background-color: #FF0000">x</mark></p>'),
      ).toBe(
        '<p><mark data-color="#ff0000" style="background-color: #ff0000; color: inherit">x</mark></p>',
      );
      expect(rawRoundTrip(extensions, '<p><mark data-color="rgb(255, 255, 0)">x</mark></p>')).toBe(
        '<p><mark data-color="#ffff00" style="background-color: #ffff00; color: inherit">x</mark></p>',
      );
      expect(rawRoundTrip(extensions, '<p><mark>x</mark></p>')).toBe('<p><mark>x</mark></p>');
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

    it('R23-05 : un espacement hors bornes est refusé, jamais rendu en Infinitypt', () => {
      expect(mounted.editor.commands.canRun('text.setLetterSpacing', { pt: 1e307 })).toBe(false);
      expect(mounted.editor.commands.run('text.setLetterSpacing', { pt: 1e307 })).toBe(false);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour</p>');
      // Posé en force via Tiptap : l'attribut n'émet rien.
      mounted.editor.tiptap.commands.setMark('textStyle', { letterSpacingPt: 1e307 });
      expect(mounted.editor.getHTML()).not.toContain('Infinity');
      expect(mounted.editor.getHTML()).toBe('<p><span>Bonjour</span></p>');
      expect(mounted.editor.commands.run('text.setLetterSpacing', { pt: 100000 })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p><span style="letter-spacing: 100000pt">Bonjour</span></p>',
      );
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
      // R23-07 : plus de `<span>` vide autour du souligné, et relecture identique.
      mounted.editor.setHTML(
        '<p><span style="text-decoration: underline dotted">Bonjour</span></p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p><u style="text-decoration-style: dotted">Bonjour</u></p>',
      );
      expectIdempotent(mounted);
    });

    it('R23-07 : AsterStrike lit le style de trait du raccourci text-decoration', () => {
      // Même ordre de marques que le jeu d'Aster : `strike` (StarterKit) avant `underline`.
      const extensions = [
        StarterKit.configure({ strike: false, underline: false }),
        AsterStrike,
        AsterUnderline,
        RunLayout,
      ];
      expect(
        rawRoundTrip(
          extensions,
          '<p><span style="text-decoration: line-through double">x</span></p>',
        ),
      ).toBe('<p><s style="text-decoration-style: double">x</s></p>');
      expect(
        rawRoundTrip(
          extensions,
          '<p><span style="text-decoration: underline line-through wavy">x</span></p>',
        ),
      ).toBe(
        '<p><s style="text-decoration-style: wavy"><u style="text-decoration-style: wavy">x</u></s></p>',
      );
      // Les règles d'origine (`<s>`, `<del>`, `<strike>`, trait simple) sont conservées.
      expect(rawRoundTrip(extensions, '<p><del>a</del><strike>b</strike><s>c</s></p>')).toBe(
        '<p><s>abc</s></p>',
      );
      expect(
        rawRoundTrip(extensions, '<p><span style="text-decoration: line-through">x</span></p>'),
      ).toBe('<p><s>x</s></p>');
      expect(AsterStrike.name).toBe('strike');
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
