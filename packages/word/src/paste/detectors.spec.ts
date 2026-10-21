import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { untyped } from '../testing/untyped.js';
import { isGoogleDocsHtml, isWordHtml } from './detectors.js';

const fixture = (name: string): string =>
  readFileSync(`${import.meta.env.ASTER_FIXTURES}word-html/${name}.html`, 'utf8');

/** Durée d'exécution d'une fonction synchrone, en millisecondes. */
const ms = (fn: () => unknown): number => {
  const started = performance.now();
  fn();
  return performance.now() - started;
};

const BROWSER_HTML = '<meta charset="utf-8"><p style="color:red">Du HTML de navigateur</p>';

describe('isWordHtml', () => {
  it.each(['word-365-list-nested', 'word-365-table', 'word-2016-headings'])(
    'reconnaît la fixture Word %s',
    (name) => {
      expect(isWordHtml(fixture(name))).toBe(true);
    },
  );

  it('reconnaît chaque indice Word pris isolément', () => {
    expect(isWordHtml('<html xmlns:w="urn:schemas-microsoft-com:office:word"></html>')).toBe(true);
    expect(isWordHtml('<p class=MsoNormal>x</p>')).toBe(true);
    expect(isWordHtml('<p class="MsoListParagraph">x</p>')).toBe(true);
    expect(isWordHtml('<span style="mso-spacerun:yes"> </span>')).toBe(true);
    expect(isWordHtml('<p>x<o:p></o:p></p>')).toBe(true);
    expect(isWordHtml('<meta name=ProgId content=Word.Document>')).toBe(true);
    expect(isWordHtml('<meta name="ProgId" content="Word.Document">')).toBe(true);
  });

  it('rejette le HTML de navigateur, Google Docs, la chaîne vide et les non-chaînes', () => {
    expect(isWordHtml(BROWSER_HTML)).toBe(false);
    expect(isWordHtml(fixture('google-docs-basic'))).toBe(false);
    expect(isWordHtml('')).toBe(false);
    expect(isWordHtml(untyped<string>(undefined))).toBe(false);
  });

  it('reste linéaire sur un <meta ProgId jamais fermé : 1 Mo en moins de 100 ms (W-1)', () => {
    const hostile = '<meta ' + 'name=ProgId content=y '.repeat(46_000);
    expect(hostile.length).toBeGreaterThan(1_000_000);
    const elapsed = ms(() => isWordHtml(hostile));
    expect(elapsed).toBeLessThan(100);
  });
});

describe('isGoogleDocsHtml', () => {
  it('reconnaît la fixture Google Docs', () => {
    expect(isGoogleDocsHtml(fixture('google-docs-basic'))).toBe(true);
  });

  it('rejette Word, le HTML de navigateur, la chaîne vide et les non-chaînes', () => {
    expect(isGoogleDocsHtml(fixture('word-2016-headings'))).toBe(false);
    expect(isGoogleDocsHtml(BROWSER_HTML)).toBe(false);
    expect(isGoogleDocsHtml('')).toBe(false);
    expect(isGoogleDocsHtml(untyped<string>(null))).toBe(false);
  });
});
