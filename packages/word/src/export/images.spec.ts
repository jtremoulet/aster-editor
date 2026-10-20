import { describe, expect, it, vi } from 'vitest';
import type { ExportContext } from './context';
import { loadDocx } from './docx-module';
import { decodeDataUrl, displaySize, imageRun, readImageSize, sniffRasterType } from './images';
import { RED_PNG_BASE64, RED_PNG_DATA_URL, parseFragment } from './testing/sample';

/** Contexte de test avec un collecteur d'avertissements neuf. */
async function context(overrides: Partial<ExportContext> = {}): Promise<ExportContext> {
  return {
    docx: await loadDocx(),
    fetchImage: undefined,
    maxImageWidth: 600,
    warnings: [],
    lists: [],
    variables: { mode: 'placeholders', values: {}, pattern: /\{\{(\w+)\}\}/g },
    footnotes: new Map(),
    footnoteCalls: new Set(),
    knownStyles: new Set(),
    template: false,
    templateNumbering: null,
    ...overrides,
  };
}

function img(attrs: string): Element {
  const element = parseFragment(`<img ${attrs}>`).querySelector('img');
  if (!element) throw new Error('img manquant');
  return element;
}

/** En-tête GIF 10x20 (dimensions little-endian aux octets 6-9). */
const GIF_HEADER = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 20, 0, 0, 0]);

/** En-tête BMP 30x40 avec hauteur négative (stockage de haut en bas). */
function bmpHeader(): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  bytes[18] = 30;
  new DataView(bytes.buffer).setInt32(22, -40, true);
  return bytes;
}

/** JPEG minimal : SOI, un segment APP0 vide, puis SOF0 annonçant 50x60. */
function jpegHeader(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 60, 0x00, 50, 0x03,
    0x00, 0x00, 0x00,
  ]);
}

describe('decodeDataUrl', () => {
  it('décode une data URL base64 en octets', () => {
    const bytes = decodeDataUrl(RED_PNG_DATA_URL);
    expect(bytes?.length).toBeGreaterThan(20);
    expect(sniffRasterType(bytes ?? new Uint8Array())).toBe('png');
  });

  it('décode une data URL non base64 en UTF-8 et rejette tout le reste', () => {
    expect(Array.from(decodeDataUrl('data:text/plain,a%20b') ?? [])).toEqual([97, 32, 98]);
    expect(decodeDataUrl('https://x/y.png')).toBeNull();
    expect(decodeDataUrl('data:text/plain,%E0%A4%A')).toBeNull();
  });
});

describe('sniffRasterType et readImageSize', () => {
  it('reconnaît PNG et lit ses dimensions', () => {
    const bytes = decodeDataUrl(RED_PNG_DATA_URL) ?? new Uint8Array();
    expect(readImageSize(bytes, 'png')).toEqual({ width: 2, height: 2 });
  });

  it('reconnaît GIF, BMP et JPEG', () => {
    expect(sniffRasterType(GIF_HEADER)).toBe('gif');
    expect(readImageSize(GIF_HEADER, 'gif')).toEqual({ width: 10, height: 20 });
    expect(sniffRasterType(bmpHeader())).toBe('bmp');
    expect(readImageSize(bmpHeader(), 'bmp')).toEqual({ width: 30, height: 40 });
    expect(sniffRasterType(jpegHeader())).toBe('jpg');
    expect(readImageSize(jpegHeader(), 'jpg')).toEqual({ width: 50, height: 60 });
  });

  it('rend null pour un format inconnu, un en-tête tronqué ou un JPEG sans SOF', () => {
    expect(sniffRasterType(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(sniffRasterType(new TextEncoder().encode('<svg xmlns="x"></svg>'))).toBeNull();
    expect(readImageSize(new Uint8Array(20), 'png')).toBeNull();
    expect(readImageSize(new Uint8Array(20), 'bmp')).toBeNull();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00]), 'jpg')).toBeNull();
    expect(
      readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0, 0, 0, 0, 0, 0]), 'jpg'),
    ).toBeNull();
  });
});

describe('displaySize', () => {
  it('privilégie les attributs HTML et déduit la dimension manquante du ratio', () => {
    expect(displaySize({ width: 200, height: 100 }, 50, null, 600)).toEqual({
      width: 50,
      height: 25,
    });
    expect(displaySize({ width: 200, height: 100 }, null, 50, 600)).toEqual({
      width: 100,
      height: 50,
    });
    expect(displaySize({ width: 200, height: 100 }, 30, 30, 600)).toEqual({
      width: 30,
      height: 30,
    });
  });

  it('replie sur 300x200 sans en-tête lisible et plafonne à la largeur de page', () => {
    expect(displaySize(null, null, null, 600)).toEqual({ width: 300, height: 200 });
    expect(displaySize({ width: 1200, height: 600 }, null, null, 600)).toEqual({
      width: 600,
      height: 300,
    });
  });
});

describe('imageRun', () => {
  it('embarque une data URL PNG avec ses dimensions et son alt', async () => {
    const ctx = await context();
    const run = await imageRun(img(`src="${RED_PNG_DATA_URL}" alt="Rouge" width="40"`), ctx);
    expect(run).toBeInstanceOf(ctx.docx.ImageRun);
    expect(ctx.warnings).toEqual([]);
  });

  it('ignore une URL distante sans fetchImage, avec avertissement', async () => {
    const ctx = await context();
    expect(await imageRun(img('src="https://example.com/a.png"'), ctx)).toBeNull();
    expect(ctx.warnings).toEqual([
      { code: 'image-skipped', message: expect.stringContaining('fetchImage') },
    ]);
  });

  it('utilise fetchImage pour une URL distante', async () => {
    const bytes = decodeDataUrl(RED_PNG_DATA_URL) ?? new Uint8Array();
    const fetchImage = vi.fn(async () => bytes.buffer.slice(0) as ArrayBuffer);
    const ctx = await context({ fetchImage });
    const run = await imageRun(img('src="https://example.com/a.png"'), ctx);
    expect(run).toBeInstanceOf(ctx.docx.ImageRun);
    expect(fetchImage).toHaveBeenCalledWith('https://example.com/a.png');
    expect(ctx.warnings).toEqual([]);
  });

  it('avertit quand fetchImage rend null ou rejette', async () => {
    const nullCtx = await context({ fetchImage: async () => null });
    expect(await imageRun(img('src="https://x/a.png"'), nullCtx)).toBeNull();
    expect(nullCtx.warnings[0]?.message).toContain('null');

    const failCtx = await context({
      fetchImage: async () => {
        throw new Error('réseau');
      },
    });
    expect(await imageRun(img('src="https://x/a.png"'), failCtx)).toBeNull();
    expect(failCtx.warnings[0]?.message).toContain('réseau');
  });

  it('avertit pour un src vide, une data URL illisible ou un format non supporté', async () => {
    const ctx = await context();
    expect(await imageRun(img('src=""'), ctx)).toBeNull();
    expect(await imageRun(img('src="data:image/png;base64,%%%"'), ctx)).toBeNull();
    expect(await imageRun(img('src="data:image/svg+xml,<svg xmlns=\'x\'></svg>"'), ctx)).toBeNull();
    expect(ctx.warnings.map((warning) => warning.code)).toEqual([
      'image-skipped',
      'image-skipped',
      'image-skipped',
    ]);
    expect(ctx.warnings[2]?.message).toContain('format non supporté');
  });

  it('décode en base64 même sans atob global', async () => {
    const original = globalThis.atob;
    Object.defineProperty(globalThis, 'atob', { value: undefined, configurable: true });
    try {
      const bytes = decodeDataUrl(`data:image/png;base64,${RED_PNG_BASE64}`);
      expect(sniffRasterType(bytes ?? new Uint8Array())).toBe('png');
    } finally {
      Object.defineProperty(globalThis, 'atob', { value: original, configurable: true });
    }
  });
});
