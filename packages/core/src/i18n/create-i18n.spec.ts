import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_LOCALE, interpolate } from './create-i18n';
import { en } from './en';
import { fr } from './fr';
import { mountEditor, type MountedEditor } from '../testing/mount';

describe('i18n', () => {
  describe('interpolate', () => {
    it('remplace les paramètres, chaînes et nombres', () => {
      expect(interpolate('{count} mots de {who}', { count: 3, who: 'moi' })).toBe('3 mots de moi');
    });

    it('laisse un marqueur sans valeur en place et rend le texte tel quel sans params', () => {
      expect(interpolate('{a} et {b}', { a: 'x' })).toBe('x et {b}');
      expect(interpolate('{a}')).toBe('{a}');
    });
  });

  describe('service attaché à l’éditeur', () => {
    let mounted: MountedEditor;

    afterEach(() => {
      mounted.cleanup();
    });

    it('démarre en français par défaut et respecte la locale des options', () => {
      mounted = mountEditor();
      expect(mounted.editor.i18n.getLocale()).toBe('fr');
      expect(mounted.editor.i18n.t('command.bold')).toBe('Gras');
      const english = mountEditor({ locale: 'en' });
      expect(english.editor.i18n.t('command.bold')).toBe('Bold');
      english.cleanup();
    });

    it('interpole les paramètres', () => {
      mounted = mountEditor();
      expect(mounted.editor.i18n.t('editor.words', { count: 2 })).toBe('2 mots');
    });

    it('se replie sur en puis sur la clé', () => {
      mounted = mountEditor({ locale: 'de' });
      expect(FALLBACK_LOCALE).toBe('en');
      expect(mounted.editor.i18n.t('command.bold')).toBe('Bold');
      expect(mounted.editor.i18n.t('inconnue.cle')).toBe('inconnue.cle');
      expect(mounted.editor.i18n.has('command.bold')).toBe(true);
      expect(mounted.editor.i18n.has('inconnue.cle')).toBe(false);
    });

    it('addTranslations fusionne en surface et crée une locale absente', () => {
      mounted = mountEditor();
      mounted.editor.i18n.addTranslations('fr', { 'command.bold': 'Épais', 'ui.x': 'X' });
      expect(mounted.editor.i18n.t('command.bold')).toBe('Épais');
      expect(mounted.editor.i18n.t('ui.x')).toBe('X');
      expect(mounted.editor.i18n.t('command.italic')).toBe('Italique');
      mounted.editor.i18n.addTranslations('de', { 'command.bold': 'Fett' });
      mounted.editor.i18n.setLocale('de');
      expect(mounted.editor.i18n.t('command.bold')).toBe('Fett');
      expect(mounted.editor.i18n.t('command.italic')).toBe('Italic');
    });

    it('addTranslations n’altère pas les dictionnaires exportés', () => {
      mounted = mountEditor();
      mounted.editor.i18n.addTranslations('fr', { 'command.bold': 'Épais' });
      expect(fr['command.bold']).toBe('Gras');
      expect(en['command.bold']).toBe('Bold');
      const other = mountEditor();
      expect(other.editor.i18n.t('command.bold')).toBe('Gras');
      other.cleanup();
    });

    it('setLocale émet localeChange et change les traductions à chaud', () => {
      mounted = mountEditor();
      const handler = vi.fn();
      mounted.editor.on('localeChange', handler);
      mounted.editor.i18n.setLocale('en');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ editor: mounted.editor, locale: 'en' });
      expect(mounted.editor.i18n.getLocale()).toBe('en');
      expect(mounted.editor.i18n.t('command.bold')).toBe('Bold');
    });

    it('setLocale sur la même locale n’émet rien', () => {
      mounted = mountEditor();
      const handler = vi.fn();
      mounted.editor.on('localeChange', handler);
      mounted.editor.i18n.setLocale('fr');
      expect(handler).not.toHaveBeenCalled();
    });

    it('le placeholder suit la locale et peut être surchargé par les options', () => {
      mounted = mountEditor({ content: '' });
      const placeholderOf = (): string | null =>
        mounted.editor.contentElement.querySelector('p')?.getAttribute('data-placeholder') ?? null;
      expect(placeholderOf()).toBe('Commence à écrire…');
      mounted.editor.i18n.setLocale('en');
      // Les décorations se recalculent à la transaction suivante.
      mounted.editor.tiptap.view.dispatch(mounted.editor.tiptap.state.tr);
      expect(placeholderOf()).toBe('Start writing…');
      const custom = mountEditor({ content: '', placeholder: 'Perso' });
      expect(
        custom.editor.contentElement.querySelector('p')?.getAttribute('data-placeholder'),
      ).toBe('Perso');
      custom.cleanup();
    });
  });
});
