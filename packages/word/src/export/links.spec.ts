import { describe, expect, it } from 'vitest';
import { exportDocx } from './export-docx.js';
import { encodeHref } from './inline.js';
import { toZipEntries } from './testing/sample.js';

describe('encodeHref (M-4)', () => {
  it('encode espace, barre verticale et non-ASCII sans toucher aux délimiteurs d’URL', () => {
    expect(encodeHref('https://example.com/a b|c?x=1&y=2#frag')).toBe(
      'https://example.com/a%20b%7Cc?x=1&y=2#frag',
    );
    expect(encodeHref('https://exemple.fr/été')).toBe('https://exemple.fr/%C3%A9t%C3%A9');
    expect(encodeHref('mailto:a@b.c?subject=hello world')).toBe(
      'mailto:a@b.c?subject=hello%20world',
    );
  });

  it('est idempotent sur les séquences %xx déjà présentes', () => {
    const once = encodeHref('https://example.com/a%20b c');
    expect(once).toBe('https://example.com/a%20b%20c');
    expect(encodeHref(once)).toBe(once);
    // Un `%` qui n'ouvre pas une séquence hexadécimale est encodé, lui.
    expect(encodeHref('https://example.com/100%')).toBe('https://example.com/100%25');
  });

  it('rend l’URL telle quelle quand encodeURI lève (substitut isolé)', () => {
    const broken = `https://example.com/${String.fromCharCode(0xd800)}`;
    expect(encodeHref(broken)).toBe(broken);
  });

  it('écrit la cible encodée dans document.xml.rels', async () => {
    const entries = await toZipEntries(
      await exportDocx('<p><a href="https://example.com/a b|c?x=1&amp;y=%20">lien</a></p>'),
    );
    const rels = entries.get('word/_rels/document.xml.rels') ?? '';
    expect(rels).toContain('Target="https://example.com/a%20b%7Cc?x=1&amp;y=%20"');
    expect(rels).toContain('TargetMode="External"');
  });
});
