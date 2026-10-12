import { describe, expect, it, vi } from 'vitest';
import { DOCX_MIME_TYPE, exportDocx } from './export-docx';
import { RED_PNG_DATA_URL, SAMPLE_HTML, parseFragment, roundTrip } from './testing/sample';
import type { DocxExportWarning } from './types';

function count(doc: Document, selector: string): number {
  return doc.querySelectorAll(selector).length;
}

function textOf(doc: Document, selector: string): string[] {
  return Array.from(doc.querySelectorAll(selector)).map((el) => el.textContent ?? '');
}

describe('exportDocx', () => {
  it('rend un Blob .docx dont les octets commencent par la signature zip', async () => {
    const blob = await exportDocx('<p>Bonjour</p>');
    expect(blob.type).toBe(DOCX_MIME_TYPE);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  describe('aller-retour exportDocx → importDocx', () => {
    it('restitue titres, marques, lien, listes, citation, code, image et table', async () => {
      const { html, warnings } = await roundTrip(SAMPLE_HTML);
      const doc = parseFragment(html);

      expect(textOf(doc, 'h1')).toEqual(['Titre principal']);
      expect(textOf(doc, 'h2')).toEqual(['Sous-titre']);
      expect(textOf(doc, 'h3')).toEqual(['Étapes']);

      expect(textOf(doc, 'p > strong')).toContain('gras');
      expect(textOf(doc, 'p > em')).toContain('italique');
      expect(textOf(doc, 'p > u')).toContain('souligné');
      expect(textOf(doc, 'p > s')).toContain('barré');
      expect(textOf(doc, 'p > code')).toContain('code');
      expect(textOf(doc, 'p > mark')).toContain('surligné');
      expect(textOf(doc, 'sub')).toContain('2');
      expect(textOf(doc, 'sup')).toContain('2');

      const link = doc.querySelector('a');
      expect(link?.getAttribute('href')).toBe('https://example.com');
      expect(link?.textContent).toBe('le site');

      expect(count(doc, 'ul > li > ul > li > ul > li')).toBe(1);
      expect(count(doc, 'ul li')).toBe(5);
      expect(count(doc, 'ol > li > ol > li')).toBe(2);
      expect(count(doc, 'ol li')).toBe(4);
      expect(textOf(doc, 'ol > li > ol > li > p')).toEqual(['Détail a', 'Détail b']);

      expect(textOf(doc, 'blockquote > p')).toEqual(['Une citation sur une ligne.']);
      expect(doc.querySelector('pre')?.textContent).toBe('const a = 1;\nconst b = 2;');

      const img = doc.querySelector('img');
      expect(img?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
      expect(img?.getAttribute('alt')).toBe('Carré rouge');

      expect(count(doc, 'table')).toBe(1);
      expect(textOf(doc, 'thead > tr > th')).toEqual(['Nom', 'Rôle', 'Ville']);
      expect(count(doc, 'tbody > tr')).toBe(3);
      expect(doc.querySelector('td[rowspan="2"]')?.textContent).toBe('Montpellier');
      expect(doc.querySelector('td[colspan="3"]')?.textContent).toBe('Fusion sur trois colonnes');

      expect(count(doc, 'br')).toBe(1);
      expect(warnings).toEqual([]);
    });

    it('conserve le texte intégral dans l’ordre', async () => {
      const { html } = await roundTrip(
        '<h1>A</h1><p>B <strong>C</strong> D</p><ul><li><p>E</p></li></ul><table><tbody><tr><td>F</td></tr></tbody></table>',
      );
      expect(textOf(parseFragment(html), 'h1, body > p, li > p, td > p')).toEqual([
        'A',
        'B C D',
        'E',
        'F',
      ]);
    });
  });

  it('accepte un document JSON ProseMirror', async () => {
    const { html } = await roundTrip('');
    expect(html).toBe('');
    const blob = await exportDocx({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'JSON' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'gras', marks: [{ type: 'bold' }] }],
        },
      ],
    });
    const { importDocx } = await import('../docx/import-docx');
    const doc = parseFragment((await importDocx(await blob.arrayBuffer())).html);
    expect(doc.querySelector('h1')?.textContent).toBe('JSON');
    expect(doc.querySelector('p > strong')?.textContent).toBe('gras');
  });

  it('remonte les avertissements via onWarning', async () => {
    const warnings: DocxExportWarning[] = [];
    await exportDocx('<p><img src="https://example.com/a.png"></p><iframe></iframe>', {
      onWarning: (warning) => warnings.push(warning),
    });
    expect(warnings.map((warning) => warning.code)).toEqual([
      'image-skipped',
      'unsupported-element',
    ]);
  });

  it('embarque une image distante via fetchImage', async () => {
    const bytes = Uint8Array.from(atob(RED_PNG_DATA_URL.split(',')[1] ?? ''), (c) =>
      c.charCodeAt(0),
    );
    const fetchImage = vi.fn(async () => bytes.buffer.slice(0) as ArrayBuffer);
    const { html, warnings } = await roundTrip(
      '<p><img src="https://example.com/a.png" alt="A"></p>',
      {
        fetchImage,
      },
    );
    expect(fetchImage).toHaveBeenCalledOnce();
    expect(parseFragment(html).querySelector('img')?.getAttribute('alt')).toBe('A');
    expect(warnings).toEqual([]);
  });

  it('utilise le parseur injecté et refuse une entrée invalide', async () => {
    const parse = {
      parseFromString: vi.fn((html: string) => new DOMParser().parseFromString(html, 'text/html')),
    };
    await exportDocx('<p>a</p>', { parse });
    expect(parse.parseFromString).toHaveBeenCalledOnce();
    await expect(exportDocx(42 as unknown as string)).rejects.toThrow(/chaîne HTML/);
  });

  it('exporte 2 000 paragraphes et 20 tables en moins de 2 s', async () => {
    const paragraphs = Array.from(
      { length: 2000 },
      (_, i) =>
        `<p>Paragraphe ${String(i)} avec du <strong>gras</strong> et un <a href="https://example.com/${String(i)}">lien</a></p>`,
    );
    const row = '<tr><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td></tr>';
    const tables = Array.from(
      { length: 20 },
      () =>
        `<table><thead><tr><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>${row.repeat(5)}</tbody></table>`,
    );
    // Chauffe : l'import dynamique de `docx` et la compilation JIT ne comptent pas.
    await exportDocx('<p>chauffe</p>');
    const started = performance.now();
    const blob = await exportDocx(paragraphs.join('') + tables.join(''));
    const elapsed = performance.now() - started;
    expect(blob.size).toBeGreaterThan(10_000);
    expect(elapsed).toBeLessThan(2000);
  });

  it('lève une erreur explicite sans DOMParser global ni option parse', async () => {
    const original = globalThis.DOMParser;
    Object.defineProperty(globalThis, 'DOMParser', { value: undefined, configurable: true });
    try {
      await expect(exportDocx('<p>a</p>')).rejects.toThrow(/options\.parse/);
    } finally {
      Object.defineProperty(globalThis, 'DOMParser', { value: original, configurable: true });
    }
  });
});
