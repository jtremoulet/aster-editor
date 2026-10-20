import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { untyped } from '../testing/untyped';
import { importDocx } from './import-docx';
import { normalizeHtml, parseFragment } from './testing/dom';
import type { DocxInput } from './types';

/** Charge une fixture .docx en `ArrayBuffer` détaché du pool de buffers Node. */
function loadFixture(name: string): ArrayBuffer {
  const buffer = readFileSync(`${import.meta.env.ASTER_FIXTURES}docx/${name}.docx`);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function loadExpected(name: string): string {
  return readFileSync(`${import.meta.env.ASTER_FIXTURES}docx/expected/${name}.html`, 'utf8');
}

function count(doc: Document, selector: string): number {
  return doc.querySelectorAll(selector).length;
}

describe('importDocx', () => {
  describe('01-headings-lists', () => {
    it('produit titres, marques, listes imbriquées et lien externe', async () => {
      const { html, warnings } = await importDocx(loadFixture('01-headings-lists'));
      const doc = parseFragment(html);
      expect(doc.querySelector('h1')?.textContent).toBe('Titre principal');
      expect(doc.querySelector('h2')?.textContent).toBe('Sous-titre');
      expect(doc.querySelector('h3')?.textContent).toBe('Étapes');
      expect(doc.querySelector('p > strong')?.textContent).toBe('gras');
      expect(doc.querySelector('p > em')?.textContent).toBe('italique');
      expect(doc.querySelector('p > u')?.textContent).toBe('souligné');
      expect(count(doc, 'ul > li > ul > li > ul > li')).toBe(1);
      expect(count(doc, 'ul li')).toBe(5);
      expect(count(doc, 'ol > li > ol > li')).toBe(2);
      expect(count(doc, 'ol li')).toBe(4);
      expect(count(doc, 'li > p')).toBe(9);
      expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
      expect(warnings).toEqual([]);
    });

    it('correspond au HTML attendu', async () => {
      const { html } = await importDocx(loadFixture('01-headings-lists'));
      expect(normalizeHtml(html)).toBe(normalizeHtml(loadExpected('01-headings-lists')));
    });
  });

  describe('02-tables', () => {
    it('produit deux tables, une ligne d’en-tête et une cellule fusionnée', async () => {
      const { html } = await importDocx(loadFixture('02-tables'));
      const doc = parseFragment(html);
      const tables = Array.from(doc.querySelectorAll('table'));
      expect(tables).toHaveLength(2);
      expect(count(doc, 'table:first-of-type > thead > tr > th')).toBe(3);
      expect(count(doc, 'table:first-of-type > tbody > tr')).toBe(2);
      expect(tables[1]?.querySelector('thead')).toBeNull();
      expect(tables[1]?.querySelector('td[colspan="2"]')?.textContent).toBe(
        'Fusion sur deux colonnes',
      );
      expect(count(doc, 'td, th')).toBe(count(doc, 'td > p, th > p'));
    });

    it('correspond au HTML attendu', async () => {
      const { html } = await importDocx(loadFixture('02-tables'));
      expect(normalizeHtml(html)).toBe(normalizeHtml(loadExpected('02-tables')));
    });
  });

  describe('03-images', () => {
    it('insère l’image en data URL PNG avec son alt et conserve la note de bas de page', async () => {
      const { html, warnings } = await importDocx(loadFixture('03-images'));
      const doc = parseFragment(html);
      const img = doc.querySelector('img');
      expect(img?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
      expect(img?.getAttribute('alt')).toBe('Un carré rouge');
      expect(doc.querySelector('sup')?.textContent).toBe('[1]');
      expect(count(doc, 'a')).toBe(0);
      expect(
        doc.querySelector('ol[data-footnotes] > li[data-footnote="footnote-1"] > p')?.textContent,
      ).toBe('Une note de bas de page.');
      expect(warnings).toEqual([]);
    });

    it('correspond au HTML attendu', async () => {
      const { html } = await importDocx(loadFixture('03-images'));
      expect(normalizeHtml(html)).toBe(normalizeHtml(loadExpected('03-images')));
    });

    it('supprime la note avec footnotes: false et le signale', async () => {
      const { html, warnings } = await importDocx(loadFixture('03-images'), { footnotes: false });
      const doc = parseFragment(html);
      expect(count(doc, 'ol, sup')).toBe(0);
      expect(doc.querySelectorAll('p')[1]?.textContent).toBe('Texte avec note.');
      expect(warnings.map((w) => w.code)).toEqual(['footnotes-dropped']);
    });
  });

  describe('entrées', () => {
    it('accepte un File et le lit via arrayBuffer()', async () => {
      const file = new File([new Uint8Array(loadFixture('01-headings-lists'))], 'doc.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const { html } = await importDocx(file);
      expect(html).toContain('<h1>Titre principal</h1>');
    });

    it('rejette un buffer sans signature zip avec le code invalid-docx', async () => {
      await expect(importDocx(new ArrayBuffer(0))).rejects.toThrow(/^invalid-docx:/);
      await expect(
        importDocx(new TextEncoder().encode('pas un docx').buffer as ArrayBuffer),
      ).rejects.toThrow(/^invalid-docx:/);
    });

    it('rejette une archive zip qui n’est pas un document Word', async () => {
      // Signature zip valide mais archive tronquée : mammoth échoue, on enveloppe en invalid-docx.
      const fake = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
      await expect(importDocx(fake.buffer as ArrayBuffer)).rejects.toThrow(/invalid-docx: mammoth/);
    });

    it('rejette une entrée qui n’est ni File, ni ArrayBuffer, ni vue typée', async () => {
      await expect(importDocx(untyped<DocxInput>({}))).rejects.toThrow(/invalid-docx: l'entrée/);
    });

    it('rejette null et undefined avec DocxImportError, pas un TypeError (W-4)', async () => {
      for (const input of [null, undefined, 42, 'doc.docx']) {
        const rejection = expect(importDocx(untyped<DocxInput>(input))).rejects;
        await rejection.toThrow(/^invalid-docx: l'entrée doit être un File/);
        await rejection.toHaveProperty('name', 'DocxImportError');
      }
    });

    it('accepte une Uint8Array et un Buffer Node, en ne lisant que leur fenêtre (W-14)', async () => {
      const bytes = new Uint8Array(loadFixture('01-headings-lists'));
      expect((await importDocx(bytes)).html).toContain('<h1>Titre principal</h1>');
      // Fenêtre décalée dans un buffer plus large : seul [byteOffset, byteOffset + byteLength) compte.
      const padded = new Uint8Array(bytes.length + 16);
      padded.set(bytes, 8);
      const view = new Uint8Array(padded.buffer, 8, bytes.length);
      expect((await importDocx(view)).html).toContain('<h1>Titre principal</h1>');
      expect((await importDocx(Buffer.from(bytes))).html).toContain('<h1>Titre principal</h1>');
    });

    it('rejette un buffer de 3 octets, trop court pour une signature zip', async () => {
      await expect(importDocx(new Uint8Array([0x50, 0x4b, 0x03]))).rejects.toThrow(
        /invalid-docx: le contenu n'est pas une archive/,
      );
    });

    it('enveloppe en invalid-docx un File dont arrayBuffer() rejette', async () => {
      const file = new File([new Uint8Array(4)], 'cassé.docx');
      file.arrayBuffer = () => Promise.reject(new Error('disque débranché'));
      await expect(importDocx(file)).rejects.toThrow(
        /^invalid-docx: lecture du fichier impossible : disque débranché/,
      );
    });

    it('utilise le parseur injecté plutôt que le DOMParser global', async () => {
      const parse = {
        parseFromString: vi.fn((html: string) =>
          new DOMParser().parseFromString(html, 'text/html'),
        ),
      };
      await importDocx(loadFixture('01-headings-lists'), { parse });
      expect(parse.parseFromString).toHaveBeenCalledOnce();
    });

    it('échoue clairement sans DOMParser disponible ni parseur injecté', async () => {
      const original = globalThis.DOMParser;
      vi.stubGlobal('DOMParser', undefined);
      try {
        await expect(importDocx(loadFixture('01-headings-lists'))).rejects.toThrow(
          /aucun DOMParser/,
        );
      } finally {
        vi.stubGlobal('DOMParser', original);
      }
    });
  });

  describe('hook upload', () => {
    it('appelle le hook avec un File image et injecte l’URL retournée', async () => {
      const upload = vi.fn(async (file: File) => `https://cdn.example.com/${file.name}`);
      const { html, warnings } = await importDocx(loadFixture('03-images'), { upload });
      expect(upload).toHaveBeenCalledOnce();
      const file = upload.mock.calls[0]?.[0];
      expect(file).toBeInstanceOf(File);
      expect(file?.type).toBe('image/png');
      expect(file?.name).toBe('image-1.png');
      expect(file?.size).toBeGreaterThan(0);
      expect(parseFragment(html).querySelector('img')?.getAttribute('src')).toBe(
        'https://cdn.example.com/image-1.png',
      );
      expect(warnings).toEqual([]);
    });

    it('replie en base64 et avertit quand le hook échoue', async () => {
      const upload = vi.fn(async () => {
        throw new Error('réseau indisponible');
      });
      const { html, warnings } = await importDocx(loadFixture('03-images'), { upload });
      expect(parseFragment(html).querySelector('img')?.getAttribute('src')).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(warnings).toEqual([
        { code: 'image-upload-failed', message: expect.stringContaining('réseau indisponible') },
      ]);
    });

    it('formate aussi un rejet non-Error dans l’avertissement', async () => {
      const upload = vi.fn(() => Promise.reject('boom'));
      const { warnings } = await importDocx(loadFixture('03-images'), { upload });
      expect(warnings[0]?.message).toContain('boom');
    });

    it('replie en base64 et avertit quand le hook résout autre chose qu’une URL (W-5)', async () => {
      for (const resolved of [42, undefined, null, '', '   ', { url: 'x' }]) {
        const upload = vi.fn(async () => untyped<string>(resolved));
        const { html, warnings } = await importDocx(loadFixture('03-images'), { upload });
        expect(parseFragment(html).querySelector('img')?.getAttribute('src')).toMatch(
          /^data:image\/png;base64,/,
        );
        expect(warnings).toEqual([
          {
            code: 'image-upload-failed',
            message: expect.stringContaining("le hook upload n'a pas renvoyé d'URL"),
          },
        ]);
      }
    });
  });

  describe('style map et avertissements', () => {
    it('applique les règles utilisateur après la map Aster', async () => {
      const { html } = await importDocx(loadFixture('01-headings-lists'), {
        styleMap: [
          "p[style-name='Heading 1'] => h2:fresh",
          "p[style-name='Heading 2'] => h4:fresh",
        ],
      });
      // Heading 1 est déjà mappé par Aster, la règle utilisateur ne prime pas ; Heading 2 non plus.
      expect(html).toContain('<h1>Titre principal</h1>');
      expect(html).toContain('<h2>Sous-titre</h2>');
    });
  });
});
