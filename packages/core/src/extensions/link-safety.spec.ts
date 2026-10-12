import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LINK_POLICY,
  extractScheme,
  isAllowedHref,
  isAllowedImageSrc,
  resolveLinkPolicy,
} from './link-safety';
import { mountEditor, type MountedEditor } from '../testing/mount';

describe('LinkSafety', () => {
  describe('resolveLinkPolicy', () => {
    it('applique les défauts', () => {
      expect(resolveLinkPolicy()).toEqual(DEFAULT_LINK_POLICY);
      expect(DEFAULT_LINK_POLICY.allowedProtocols).toEqual(['http', 'https', 'mailto', 'tel']);
    });

    it('laisse l’intégrateur surcharger chaque champ', () => {
      const policy = resolveLinkPolicy({
        allowedProtocols: ['https'],
        defaultTarget: '_self',
        rel: 'nofollow',
        autolink: false,
      });
      expect(policy).toEqual({
        allowedProtocols: ['https'],
        defaultTarget: '_self',
        rel: 'nofollow',
        autolink: false,
      });
    });
  });

  describe('extractScheme', () => {
    it('extrait le schéma en minuscules', () => {
      expect(extractScheme('HTTPS://a')).toBe('https');
      expect(extractScheme('mailto:a@b')).toBe('mailto');
    });

    it('rend null pour une URL relative ou un faux schéma', () => {
      expect(extractScheme('/page')).toBeNull();
      expect(extractScheme('page.html')).toBeNull();
      expect(extractScheme('#ancre')).toBeNull();
      expect(extractScheme('foo/bar:baz')).toBeNull();
      expect(extractScheme('1abc:x')).toBeNull();
    });

    it('ignore les caractères de contrôle et invisibles glissés dans le schéma', () => {
      expect(extractScheme('java\tscript:alert(1)')).toBe('javascript');
      expect(extractScheme('java\nscript:alert(1)')).toBe('javascript');
      expect(extractScheme(' javascript:alert(1)')).toBe('javascript');
      expect(extractScheme('java​script:alert(1)')).toBe('javascript');
      expect(extractScheme('﻿javascript:alert(1)')).toBe('javascript');
    });
  });

  describe('isAllowedHref', () => {
    const policy = DEFAULT_LINK_POLICY;

    it('accepte les protocoles autorisés et les URL relatives', () => {
      expect(isAllowedHref('https://example.com', policy)).toBe(true);
      expect(isAllowedHref('http://example.com', policy)).toBe(true);
      expect(isAllowedHref('mailto:a@b.c', policy)).toBe(true);
      expect(isAllowedHref('tel:+33', policy)).toBe(true);
      expect(isAllowedHref('/relative', policy)).toBe(true);
      expect(isAllowedHref('#ancre', policy)).toBe(true);
    });

    it('rejette javascript:, data: et tout protocole hors liste', () => {
      expect(isAllowedHref('javascript:alert(1)', policy)).toBe(false);
      expect(isAllowedHref('JavaScript:alert(1)', policy)).toBe(false);
      expect(isAllowedHref('java\tscript:alert(1)', policy)).toBe(false);
      expect(isAllowedHref('data:text/html,<b>x</b>', policy)).toBe(false);
      expect(isAllowedHref('ftp://x', policy)).toBe(false);
      expect(isAllowedHref('vbscript:x', policy)).toBe(false);
    });

    it('respecte une liste blanche custom', () => {
      const custom = resolveLinkPolicy({ allowedProtocols: ['ftp'] });
      expect(isAllowedHref('ftp://x', custom)).toBe(true);
      expect(isAllowedHref('https://x', custom)).toBe(false);
    });
  });

  describe('isAllowedImageSrc', () => {
    it('tolère data: et blob: pour les images, pas javascript:', () => {
      expect(isAllowedImageSrc('data:image/png;base64,AA==', DEFAULT_LINK_POLICY)).toBe(true);
      expect(isAllowedImageSrc('blob:https://x/uuid', DEFAULT_LINK_POLICY)).toBe(true);
      expect(isAllowedImageSrc('https://x/a.png', DEFAULT_LINK_POLICY)).toBe(true);
      expect(isAllowedImageSrc('javascript:alert(1)', DEFAULT_LINK_POLICY)).toBe(false);
    });
  });

  describe('extension Link intégrée', () => {
    let mounted: MountedEditor;

    afterEach(() => {
      mounted.cleanup();
    });

    it('dégrade un lien javascript: en texte au parsing HTML', () => {
      mounted = mountEditor();
      mounted.editor.setHTML('<p><a href="javascript:alert(1)">cliquez</a></p>');
      expect(mounted.editor.getHTML()).toBe('<p>cliquez</p>');
    });

    it('dégrade un lien data: en texte au parsing HTML', () => {
      mounted = mountEditor();
      mounted.editor.setHTML('<p><a href="data:text/html,x">x</a></p>');
      expect(mounted.editor.getHTML()).toBe('<p>x</p>');
    });

    it('conserve un lien https au parsing', () => {
      mounted = mountEditor();
      mounted.editor.setHTML('<p><a href="https://example.com">ok</a></p>');
      expect(mounted.editor.getHTML()).toContain('<a href="https://example.com">ok</a>');
    });

    it('force rel sur un lien collé avec target=_blank, même sans rel', () => {
      mounted = mountEditor();
      mounted.editor.setHTML('<p><a href="https://example.com" target="_blank">x</a></p>');
      const html = mounted.editor.getHTML();
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    it('remplace un rel laxiste par celui de la politique sur _blank', () => {
      mounted = mountEditor();
      mounted.editor.setHTML(
        '<p><a href="https://example.com" target="_blank" rel="opener">x</a></p>',
      );
      expect(mounted.editor.getHTML()).toContain('rel="noopener noreferrer"');
      expect(mounted.editor.getHTML()).not.toContain('rel="opener"');
    });

    it('ne pose pas de rel sur un lien sans target _blank', () => {
      mounted = mountEditor();
      mounted.editor.setHTML('<p><a href="https://example.com" target="_self">x</a></p>');
      const html = mounted.editor.getHTML();
      expect(html).toContain('target="_self"');
      expect(html).not.toContain('rel=');
    });

    it('utilise le rel custom de la politique', () => {
      mounted = mountEditor({ linkPolicy: { rel: 'nofollow' } });
      mounted.editor.setHTML('<p><a href="https://example.com" target="_blank">x</a></p>');
      expect(mounted.editor.getHTML()).toContain('rel="nofollow"');
    });

    it('la politique custom s’applique aussi au parsing', () => {
      mounted = mountEditor({ linkPolicy: { allowedProtocols: ['mailto'] } });
      mounted.editor.setHTML(
        '<p><a href="https://example.com">web</a> <a href="mailto:a@b.c">mail</a></p>',
      );
      const html = mounted.editor.getHTML();
      expect(html).not.toContain('href="https://example.com"');
      expect(html).toContain('href="mailto:a@b.c"');
    });
  });
});
