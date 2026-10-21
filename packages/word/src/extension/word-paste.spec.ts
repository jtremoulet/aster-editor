import { readFileSync } from 'node:fs';
import type { PasteContext } from '@aster-editor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { untyped } from '../testing/untyped.js';
import { wordPasteTransformer } from './word-paste.js';

const fixture = (name: string): string =>
  readFileSync(`${import.meta.env.ASTER_FIXTURES}word-html/${name}.html`, 'utf8');

/** Le transformateur n'utilise pas le contexte : un éditeur factice n'apporterait rien. */
const context = untyped<PasteContext>({ plainText: '' });

describe('wordPasteTransformer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalise le HTML Word', () => {
    const out = wordPasteTransformer()(fixture('word-365-table'), context);
    expect(out).toContain('<thead><tr><th>Nom</th>');
    expect(out).not.toMatch(/mso-/);
  });

  it('normalise le HTML Google Docs', () => {
    const out = wordPasteTransformer()(fixture('google-docs-basic'), context);
    expect(out).toMatch(/^<h1>Titre Google Docs<\/h1>/);
    expect(out).not.toContain('docs-internal-guid');
  });

  it('transmet les options au normaliseur', () => {
    const out = wordPasteTransformer({ keepColors: true })(fixture('word-2016-headings'), context);
    expect(out).toContain('color:red');
  });

  it('laisse passer tel quel le HTML non reconnu et la chaîne vide', () => {
    const html = '<p style="color:red">Navigateur</p>';
    expect(wordPasteTransformer()(html, context)).toBe(html);
    expect(wordPasteTransformer()('', context)).toBe('');
  });

  it('rend le HTML d’origine et avertit si le normaliseur lève', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parse = (): Document => {
      throw new Error('boom');
    };
    const html = '<p class=MsoNormal>x</p>';
    expect(wordPasteTransformer({ parse })(html, context)).toBe(html);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(
      /^\[aster-editor\/word\] normalisation du collage échouée/,
    );
  });
});
