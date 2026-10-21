import type { ImageRun } from 'docx';
import { warn, type ExportContext } from './context.js';
import { parsePixels } from './css.js';
import { sanitizeXmlText } from './sanitize.js';

/** Formats raster que Word embarque sans repli. */
export type RasterType = 'png' | 'jpg' | 'gif' | 'bmp';

/** Dimensions intrinsèques en pixels. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** Taille par défaut quand l'en-tête de l'image est illisible et que le HTML ne dit rien. */
const FALLBACK_SIZE: ImageSize = { width: 300, height: 200 };

/** `atob` portable : natif en navigateur et Node 16+, `Buffer` en repli. */
function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(clean, 'base64'));
}

/** Décode une data URL en octets. `null` si ce n'est pas une data URL base64 lisible. */
export function decodeDataUrl(src: string): Uint8Array | null {
  const match = /^data:([^;,]*)(;[^,]*)?,(.*)$/s.exec(src.trim());
  if (!match) return null;
  const [, , params = '', payload = ''] = match;
  try {
    if (/;base64/i.test(params)) return decodeBase64(payload);
    return new TextEncoder().encode(decodeURIComponent(payload));
  } catch {
    return null;
  }
}

/** Entier big-endian sur 16 ou 32 bits. */
function readUint(bytes: Uint8Array, offset: number, size: 2 | 4, littleEndian = false): number {
  let value = 0;
  for (let i = 0; i < size; i += 1) {
    const byte = bytes[littleEndian ? offset + size - 1 - i : offset + i] ?? 0;
    value = value * 256 + byte;
  }
  return value;
}

/** Format raster déduit des octets magiques. `null` pour tout autre contenu (SVG, WebP…). */
export function sniffRasterType(bytes: Uint8Array): RasterType | null {
  if (bytes.length < 10) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  return null;
}

/** Dimensions d'un JPEG : premier marqueur SOFn rencontré après l'en-tête. */
function jpegSize(bytes: Uint8Array): ImageSize | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    const length = readUint(bytes, offset + 2, 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return { height: readUint(bytes, offset + 5, 2), width: readUint(bytes, offset + 7, 2) };
    }
    offset += 2 + length;
  }
  return null;
}

/** Dimensions intrinsèques lues dans l'en-tête, `null` si illisibles. */
export function readImageSize(bytes: Uint8Array, type: RasterType): ImageSize | null {
  let size: ImageSize | null = null;
  switch (type) {
    case 'png':
      if (bytes.length >= 24)
        size = { width: readUint(bytes, 16, 4), height: readUint(bytes, 20, 4) };
      break;
    case 'gif':
      size = { width: readUint(bytes, 6, 2, true), height: readUint(bytes, 8, 2, true) };
      break;
    case 'bmp':
      if (bytes.length >= 26) {
        size = {
          width: readUint(bytes, 18, 4, true),
          // Hauteur signée : négative quand l'image est stockée de haut en bas.
          height: Math.abs(readUint(bytes, 22, 4, true) | 0),
        };
      }
      break;
    case 'jpg':
      size = jpegSize(bytes);
      break;
  }
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/**
 * Taille affichée : les attributs `width`/`height` du HTML priment, la dimension
 * manquante est déduite du ratio intrinsèque, et le tout est plafonné à la largeur
 * utile de la page en conservant le ratio.
 */
export function displaySize(
  intrinsic: ImageSize | null,
  attrWidth: number | null,
  attrHeight: number | null,
  maxWidth: number,
): ImageSize {
  const base = intrinsic ?? FALLBACK_SIZE;
  const ratio = base.width / base.height;
  let width = attrWidth ?? (attrHeight ? Math.round(attrHeight * ratio) : base.width);
  let height = attrHeight ?? (attrWidth ? Math.round(attrWidth / ratio) : base.height);
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/** Lit les octets de l'image : data URL décodée, ou hook `fetchImage` pour les URL distantes. */
async function loadImageBytes(src: string, ctx: ExportContext): Promise<Uint8Array | null> {
  if (/^data:/i.test(src)) {
    const bytes = decodeDataUrl(src);
    if (!bytes) warn(ctx, 'image-skipped', 'Image ignorée : data URL illisible');
    return bytes;
  }
  if (!ctx.fetchImage) {
    warn(ctx, 'image-skipped', `Image ignorée : URL distante sans option fetchImage (${src})`);
    return null;
  }
  try {
    const buffer = await ctx.fetchImage(src);
    if (!buffer) {
      warn(ctx, 'image-skipped', `Image ignorée : fetchImage a renvoyé null (${src})`);
      return null;
    }
    return new Uint8Array(buffer);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(ctx, 'image-skipped', `Image ignorée : fetchImage a échoué (${src}) : ${reason}`);
    return null;
  }
}

/**
 * Convertit un `<img>` en `ImageRun`. Rend `null` (avec avertissement `image-skipped`)
 * si l'image est inaccessible ou dans un format que Word n'embarque pas sans repli
 * (SVG, WebP…).
 */
export async function imageRun(img: Element, ctx: ExportContext): Promise<ImageRun | null> {
  const src = img.getAttribute('src') ?? '';
  if (src.trim() === '') {
    warn(ctx, 'image-skipped', 'Image ignorée : attribut src vide');
    return null;
  }
  const bytes = await loadImageBytes(src, ctx);
  if (!bytes) return null;
  const type = sniffRasterType(bytes);
  if (!type) {
    warn(
      ctx,
      'image-skipped',
      'Image ignorée : format non supporté (PNG, JPEG, GIF, BMP attendus)',
    );
    return null;
  }
  const size = displaySize(
    readImageSize(bytes, type),
    parsePixels(img.getAttribute('width')),
    parsePixels(img.getAttribute('height')),
    ctx.maxImageWidth,
  );
  // `alt`/`title` finissent dans les attributs de `wp:docPr` : même règle XML que le texte.
  const alt = sanitizeXmlText(img.getAttribute('alt') ?? '');
  const title = sanitizeXmlText(img.getAttribute('title') ?? alt);
  return new ctx.docx.ImageRun({
    type,
    data: bytes,
    transformation: { width: size.width, height: size.height },
    altText: { name: alt || 'image', description: alt, title },
  });
}
