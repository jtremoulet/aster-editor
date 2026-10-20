import type { HeaderFooterSet } from '@aster-editor/core';
import type { DocxExportWarning } from '../../export/types';
import { importDocx } from '../import-docx';
import { childNamed, childrenNamed } from '../preprocess/xml-utils';
import { createNumberingResolver } from '../reader/lists';
import { openPackage } from '../reader/package';
import type { DocxPackage, NumberingResolver } from '../reader/types';
import type { DocxInput } from '../types';
import { wordAttr, type XmlCodec } from './xml-io';

/**
 * Ouverture du gabarit de `exportDocx({ template })` : octets, paquet en lecture,
 * identifiants de styles définis, largeur utile de la page, et, sur demande, les
 * en-têtes et pieds tels que l'import les lit (pour savoir si `layout.headers` /
 * `footers` en diffère). Un gabarit illisible ne lève jamais : l'export neuf prend le
 * relais avec un avertissement `template-invalid`.
 */

/** Gabarit validé : son tampon, son paquet en lecture, ses styles. */
export interface TemplateContext {
  readonly buffer: ArrayBuffer;
  readonly pkg: DocxPackage;
  /** Chemin de `styles.xml` (relation `/styles`, sinon le nom usuel). */
  readonly stylesPath: string;
  readonly styleIds: ReadonlySet<string>;
  /** Largeur utile de la dernière section en pixels (96 dpi), plafond des images. */
  readonly contentWidthPx: number | undefined;
  /** Numérotations du gabarit (`numbering.xml`), pour le niveau des listes réutilisées. */
  readonly numbering: NumberingResolver;
  /** En-têtes et pieds du gabarit en HTML stylé, lus seulement si `readHeadersFooters` est demandé. */
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
}

/** Détection d'`ArrayBuffer` robuste aux realms (jsdom vs Node), contrairement à `instanceof`. */
function isArrayBuffer(input: unknown): input is ArrayBuffer {
  return Object.prototype.toString.call(input) === '[object ArrayBuffer]';
}

/** Vrai si l'entrée est un `File`/`Blob` (`arrayBuffer()` disponible). */
function isBlobLike(input: unknown): input is Blob {
  return (
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

/** Les 4 premiers octets d'un .docx valide sont la signature zip `PK\x03\x04`. */
function hasZipSignature(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return (
    bytes.length === 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** Octets d'une entrée `DocxInput`, `null` si elle n'en est pas une. Une vue typée est copiée. */
async function toArrayBuffer(input: DocxInput): Promise<ArrayBuffer | null> {
  if (isArrayBuffer(input)) return input;
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer;
  }
  if (isBlobLike(input)) {
    try {
      return await input.arrayBuffer();
    } catch {
      return null;
    }
  }
  return null;
}

/** Largeur utile (`w:pgSz w:w` moins les marges) du `w:sectPr` final, en pixels à 96 dpi. */
function contentWidthOf(body: Element): number | undefined {
  const sectPr = childNamed(body, 'sectPr');
  const pgSz = sectPr ? childNamed(sectPr, 'pgSz') : null;
  const pgMar = sectPr ? childNamed(sectPr, 'pgMar') : null;
  const width = Number(pgSz ? wordAttr(pgSz, 'w') : '');
  if (!Number.isFinite(width) || width <= 0) return undefined;
  const left = Math.abs(Number(pgMar ? wordAttr(pgMar, 'left') : '') || 0);
  const right = Math.abs(Number(pgMar ? wordAttr(pgMar, 'right') : '') || 0);
  const usable = width - left - right;
  return usable > 0 ? Math.max(1, Math.floor((usable / 1440) * 96)) : undefined;
}

export interface OpenTemplateOptions {
  /** Lire les en-têtes et pieds du gabarit (import stylé complet), pour les comparer à `layout`. */
  readonly readHeadersFooters?: boolean;
}

/**
 * Ouvre et valide le gabarit : archive zip, partie principale lisible avec un `w:body`.
 * Rend `null` avec un avertissement `template-invalid` sinon.
 */
export async function openTemplate(
  input: DocxInput,
  codec: XmlCodec,
  warnings: DocxExportWarning[],
  options: OpenTemplateOptions = {},
): Promise<TemplateContext | null> {
  const invalid = (detail: string): null => {
    warnings.push({
      code: 'template-invalid',
      message: `Gabarit illisible, export neuf à la place : ${detail}`,
    });
    return null;
  };
  const buffer = await toArrayBuffer(input);
  if (!buffer) return invalid("l'entrée n'est ni un File, ni un ArrayBuffer, ni une vue typée");
  if (!hasZipSignature(buffer)) return invalid('signature zip absente');
  let pkg: DocxPackage;
  try {
    pkg = await openPackage(buffer, codec.parse);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error));
  }
  const main = await pkg.part(pkg.mainPart);
  if (!main) return invalid(`partie principale ${pkg.mainPart} absente ou illisible`);
  const body = childNamed(main.documentElement, 'body');
  if (!body) return invalid(`partie principale ${pkg.mainPart} sans w:body`);
  const stylesPath = (await pkg.related(pkg.mainPart, '/styles')) ?? 'word/styles.xml';
  const styleIds = new Set<string>();
  const styles = await pkg.part(stylesPath);
  if (styles) {
    for (const style of childrenNamed(styles.documentElement, 'style')) {
      const id = wordAttr(style, 'styleId');
      if (id) styleIds.add(id);
    }
  }
  const context: TemplateContext = {
    buffer,
    pkg,
    stylesPath,
    styleIds,
    contentWidthPx: contentWidthOf(body),
    numbering: await createNumberingResolver(pkg),
  };
  if (!options.readHeadersFooters) return context;
  try {
    // Même lecture que celle qui a produit le `layout` de l'intégrateur : comparable terme à terme.
    const imported = await importDocx(buffer, { fidelity: 'styled', footnotes: false });
    return {
      ...context,
      ...(imported.layout.headers ? { headers: imported.layout.headers } : {}),
      ...(imported.layout.footers ? { footers: imported.layout.footers } : {}),
    };
  } catch {
    return context;
  }
}
