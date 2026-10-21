import { describe, expect, it } from 'vitest';
import { exportDocx } from './export-docx.js';
import { sanitizeXmlText } from './sanitize.js';
import { toZipEntries } from './testing/sample.js';

/** Caractère d'un code, pour composer la classe sans littéral de contrôle dans la source. */
const ch = (code: number): string => String.fromCharCode(code);

/** Même plage que `sanitizeXmlText`, reconstruite ici pour que le test ne dépende pas du code testé. */
const INVALID_XML = new RegExp(
  `[${ch(0)}-${ch(8)}${ch(0x0b)}${ch(0x0c)}${ch(0x0e)}-${ch(0x1f)}${ch(0xfffe)}${ch(0xffff)}]`,
);

/** Chaîne `a<ctrl>b` pour un code de caractère donné, sans caractère littéral dans la source. */
function wrap(code: number, text = 'ab'): string {
  return text[0] + String.fromCharCode(code) + text.slice(1);
}

describe('sanitizeXmlText', () => {
  it('retire les caractères de contrôle et non-caractères interdits en XML 1.0', () => {
    for (const code of [0, 1, 8, 0x0b, 0x0c, 0x0e, 0x1f, 0xfffe, 0xffff]) {
      expect(sanitizeXmlText(wrap(code))).toBe('ab');
    }
  });

  it('conserve tabulation, sauts de ligne, NBSP et Unicode étendu', () => {
    const kept = `a\tb\nc\rd${String.fromCharCode(160)}e${String.fromCharCode(0x2003)}f\u{1f600}`;
    expect(sanitizeXmlText(kept)).toBe(kept);
    expect(sanitizeXmlText('')).toBe('');
  });
});

describe('exportDocx — assainissement XML (X-1)', () => {
  it('ne laisse aucun caractère interdit dans document.xml, les rels et core.xml', async () => {
    const ctrl = String.fromCharCode(1);
    const nul = String.fromCharCode(0);
    const ff = String.fromCharCode(0x0c);
    const html =
      `<p>texte${ctrl}brut <strong>gras${nul}</strong></p>` +
      `<pre>ligne${ff}1\nligne${ctrl}2</pre>` +
      `<p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAEb+B/0lmPkNAAAAAElFTkSuQmCC" alt="alt${ctrl}" title="titre${nul}"></p>` +
      `<p><a href="https://example.com/a${ctrl}b">lien${ff}</a></p>` +
      `<ul><li>item${String.fromCharCode(0xfffe)}</li></ul>`;
    const blob = await exportDocx(html, { title: `T${ctrl}itre`, creator: `Au${nul}teur` });
    const entries = await toZipEntries(blob);
    for (const name of ['word/document.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml']) {
      const xml = entries.get(name);
      expect(xml, name).toBeDefined();
      expect(xml ?? '', name).not.toMatch(INVALID_XML);
    }
    const document = entries.get('word/document.xml') ?? '';
    expect(document).toContain('>textebrut </w:t>');
    expect(document).toContain('>gras</w:t>');
    expect(document).toContain('>ligne1</w:t>');
    expect(document).toContain('>ligne2</w:t>');
    expect(document).toContain('>lien</w:t>');
    expect(document).toContain('>item</w:t>');
    expect(document).toContain('descr="alt"');
    expect(entries.get('word/_rels/document.xml.rels')).toContain('https://example.com/ab');
    expect(entries.get('docProps/core.xml')).toContain('>Titre<');
    expect(entries.get('docProps/core.xml')).toContain('>Auteur<');
  });
});
