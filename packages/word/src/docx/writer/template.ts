import type { HeaderFooterSet } from '@aster-editor/core';
import type { DocxExportWarning } from '../../export/types';
import { hasZipSignature, isArrayBuffer, isBlobLike } from '../import-docx';
import { transformVariablesXml } from '../preprocess/variables';
import { childNamed, childrenNamed } from '../preprocess/xml-utils';
import { convertBlocks } from '../reader';
import { readHeadersFooters, type HeadersFootersResult } from '../reader/headers';
import { createImageConverter } from '../reader/images';
import { createNumberingResolver, renderBlocks } from '../reader/lists';
import { createNoteRegistry } from '../reader/notes';
import { openPackage } from '../reader/package';
import { convertParagraph } from '../reader/paragraphs';
import { createStyleResolver, type DocxStyleResolver } from '../reader/styles';
import { convertTable } from '../reader/tables';
import type {
  ConverterContext,
  DocxPackage,
  NumberingResolver,
  ReaderOptions,
} from '../reader/types';
import type { DocxInput } from '../types';
import { allSectPrs } from './graft-sections';
import { headerFooterParts } from './header-footer-variables';
import { wordAttr, xmlDeclarationOf, type XmlCodec } from './xml-io';

/**
 * Ouverture du gabarit de `exportDocx({ template })` : octets, paquet en lecture, partie
 * principale déjà parsée (la greffe la réutilise sans la reparser), identifiants de
 * styles définis, largeur utile de la page, et, sur demande, les en-têtes et pieds tels
 * que l'import les lit (pour savoir si `layout.headers` / `footers` en diffère). Un
 * gabarit illisible ne lève jamais : l'export neuf prend le relais avec un avertissement
 * `template-invalid`. Une partie principale de plus de 16 Mo est refusée avant tout parse :
 * un DOM de cette taille épuise la mémoire du processus.
 */

/** Taille maximale de la partie principale du gabarit (octets décompressés). */
export const MAX_MAIN_PART_BYTES = 16 * 1024 * 1024;

/** Gabarit validé : son tampon, son paquet en lecture, ses styles. */
export interface TemplateContext {
  readonly buffer: ArrayBuffer;
  readonly pkg: DocxPackage;
  /** Partie principale parsée par le paquet : la greffe la modifie en place. */
  readonly mainDoc: Document;
  /** Déclaration `<?xml …?>` d'origine de la partie principale, réémise à l'identique. */
  readonly mainDeclaration: string;
  /** Chemin de `styles.xml` (relation `/styles`, sinon le nom usuel). */
  readonly stylesPath: string;
  readonly styleIds: ReadonlySet<string>;
  /** Largeur utile de la dernière section en pixels (96 dpi), plafond des images. */
  readonly contentWidthPx: number | undefined;
  /** Numérotations du gabarit (`numbering.xml`), pour le niveau des listes réutilisées. */
  readonly numbering: NumberingResolver;
  /** Résolveur de styles du gabarit, partagé avec la greffe. */
  readonly resolver: DocxStyleResolver;
  /** En-têtes et pieds du gabarit en HTML stylé, lus seulement si `readHeadersFooters` est demandé. */
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
  /**
   * En-têtes et pieds **effectifs** de chaque `w:sectPr` du gabarit (héritage compris),
   * dans l'ordre du corps, lus avec `headers` / `footers` : la greffe section par section
   * compare `layout.sections[n]` à l'entrée correspondante.
   */
  readonly sections?: readonly HeadersFootersResult[];
}

/**
 * Octets d'une entrée `DocxInput`, `null` si elle n'en est pas une (mêmes détections que
 * l'import : `isArrayBuffer`, `isBlobLike`). Une vue typée est copiée.
 */
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

/** Marque d'ordre des octets qu'un éditeur peut avoir posée avant `<?xml`. */
const BOM = String.fromCharCode(0xfeff);

/** Déclaration XML lue dans les premiers octets d'une partie (sans la décoder en entier). */
function declarationOf(bytes: Uint8Array): string {
  const head = new TextDecoder().decode(bytes.subarray(0, 256));
  return xmlDeclarationOf(head.startsWith(BOM) ? head.slice(BOM.length) : head);
}

export interface OpenTemplateOptions {
  /** Lire les en-têtes et pieds du gabarit (lecteur stylé, parties d'en-tête seules), pour les comparer à `layout`. */
  readonly readHeadersFooters?: boolean;
}

/**
 * Ouvre et valide le gabarit : archive zip, partie principale sous le plafond de taille
 * et lisible avec un `w:body`. Rend `null` avec un avertissement `template-invalid` sinon.
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
  // La taille est contrôlée sur les octets, avant tout parse : un DOM de dizaines de Mo tue le processus.
  const mainBytes = await pkg.binary(pkg.mainPart);
  if (!mainBytes) return invalid(`partie principale ${pkg.mainPart} absente`);
  if (mainBytes.byteLength > MAX_MAIN_PART_BYTES) {
    const megabytes = (mainBytes.byteLength / (1024 * 1024)).toFixed(1);
    return invalid(
      `partie principale ${pkg.mainPart} de ${megabytes} Mo, plus que les ${String(MAX_MAIN_PART_BYTES / (1024 * 1024))} Mo acceptés`,
    );
  }
  const mainDeclaration = declarationOf(mainBytes);
  const main = await pkg.part(pkg.mainPart);
  if (!main) return invalid(`partie principale ${pkg.mainPart} illisible`);
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
  const [numbering, resolver] = await Promise.all([
    createNumberingResolver(pkg),
    createStyleResolver(pkg),
  ]);
  const context: TemplateContext = {
    buffer,
    pkg,
    mainDoc: main,
    mainDeclaration,
    stylesPath,
    styleIds,
    contentWidthPx: contentWidthOf(body),
    numbering,
    resolver,
  };
  if (!options.readHeadersFooters) return context;
  try {
    const read = await readTemplateHeadersFooters(pkg, body, codec, resolver, numbering);
    return {
      ...context,
      ...(read.last.headers ? { headers: read.last.headers } : {}),
      ...(read.last.footers ? { footers: read.last.footers } : {}),
      sections: read.sections,
    };
  } catch {
    return context;
  }
}

/**
 * Vue du paquet dont les parties d'en-tête et de pied ont subi le prétraitement des
 * variables de l'import (champs de fusion et contrôles de contenu → `{{nom}}`) : le HTML
 * relu est ainsi comparable terme à terme au `layout` que l'import a donné à l'intégrateur.
 * Les autres parties sont servies telles quelles.
 */
async function preprocessedView(pkg: DocxPackage, codec: XmlCodec): Promise<DocxPackage> {
  const rewritten = new Map<string, Document>();
  for (const path of await headerFooterParts(pkg, pkg.mainPart)) {
    const bytes = await pkg.binary(path);
    if (!bytes) continue;
    try {
      const xml = transformVariablesXml(
        new TextDecoder().decode(bytes),
        { mergeFields: true, contentControls: true },
        new Map(),
        codec,
      );
      if (xml !== null) rewritten.set(path, codec.parse(xml));
    } catch {
      // Partie illisible pour le prétraitement : servie telle quelle, comme à l'import.
    }
  }
  if (rewritten.size === 0) return pkg;
  return {
    ...pkg,
    part: (path) => {
      const doc = rewritten.get(path);
      return doc ? Promise.resolve(doc) : pkg.part(path);
    },
  };
}

/** En-têtes et pieds effectifs de chaque section du gabarit, et ceux de la dernière. */
interface TemplateHeadersFooters {
  readonly sections: readonly HeadersFootersResult[];
  readonly last: HeadersFootersResult;
}

/**
 * En-têtes et pieds effectifs du gabarit, lus par le lecteur stylé (`reader/headers.ts`,
 * blocs convertis par `convertBlocks` du lecteur, comme à l'import) sur le paquet déjà
 * ouvert : seules les parties d'en-tête et de pied sont converties, pas le corps. Comme
 * à l'import, chaque section hérite des références de la précédente,
 * les plus récentes recouvrant les plus anciennes type par type ; le résultat de chaque
 * section est conservé pour la greffe section par section.
 */
async function readTemplateHeadersFooters(
  pkg: DocxPackage,
  body: Element,
  codec: XmlCodec,
  styles: DocxStyleResolver,
  numbering: NumberingResolver,
): Promise<TemplateHeadersFooters> {
  const options: ReaderOptions = {
    footnotes: false,
    emptyParagraphs: 'keep',
    parseXml: codec.parse,
  };
  const view = await preprocessedView(pkg, codec);
  const ctx: ConverterContext = {
    pkg: view,
    part: pkg.mainPart,
    where: 'body',
    styles,
    numbering,
    images: createImageConverter(view, options),
    notes: await createNoteRegistry(view, options),
    convert: {
      paragraph: convertParagraph,
      table: convertTable,
      blocks: convertBlocks,
      render: renderBlocks,
    },
    options,
    warnings: [],
    lost: [],
    tableStyle: null,
  };
  const merged: { -readonly [K in keyof HeadersFootersResult]: HeadersFootersResult[K] } = {};
  const sections: HeadersFootersResult[] = [];
  for (const sectPr of allSectPrs(body)) {
    const section = await readHeadersFooters(sectPr, ctx);
    if (section.headers) merged.headers = { ...merged.headers, ...section.headers };
    if (section.footers) merged.footers = { ...merged.footers, ...section.footers };
    if (section.titlePage !== undefined) merged.titlePage = section.titlePage;
    sections.push({ ...merged });
  }
  return { sections, last: merged };
}
