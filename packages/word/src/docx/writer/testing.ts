import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { importDocx } from '../import-docx';
import type { DocxImportResult } from '../types';
import { exportDocx } from '../../export/export-docx';
import type { DocxExportOptions, DocxExportWarning } from '../../export/types';

/**
 * Harnais des specs de la greffe : fixtures, archives décomposées en parties, exports
 * dans le gabarit avec leurs avertissements, normalisation du XML. Aucune utilité en
 * production.
 */

const FIXTURES = join(import.meta.env.ASTER_FIXTURES, 'docx');

/** Octets d'une fixture `.docx` (`13-styles-nommes.docx`). */
export async function fixture(name: string): Promise<ArrayBuffer> {
  const buffer = await readFile(join(FIXTURES, name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/** Chemin absolu d'une fixture (pour `existsSync`). */
export function fixturePath(name: string): string {
  return join(FIXTURES, name);
}

/** Parties d'une archive : chemin → octets. */
export async function partsOf(buffer: ArrayBuffer): Promise<ReadonlyMap<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(buffer);
  const parts = new Map<string, Uint8Array>();
  for (const name of Object.keys(zip.files).sort()) {
    const file = zip.files[name];
    if (file && !file.dir) parts.set(name, await file.async('uint8array'));
  }
  return parts;
}

/** Texte d'une partie, `''` si absente. */
export function textOf(parts: ReadonlyMap<string, Uint8Array>, path: string): string {
  const bytes = parts.get(path);
  return bytes ? new TextDecoder().decode(bytes) : '';
}

/** Chemins dont les octets diffèrent (ou qui n'existent que d'un côté). */
export function differingParts(
  a: ReadonlyMap<string, Uint8Array>,
  b: ReadonlyMap<string, Uint8Array>,
): string[] {
  const paths = new Set([...a.keys(), ...b.keys()]);
  const result: string[] = [];
  for (const path of Array.from(paths).sort()) {
    const left = a.get(path);
    const right = b.get(path);
    if (!left || !right || left.byteLength !== right.byteLength) {
      result.push(path);
      continue;
    }
    if (!left.every((byte, index) => byte === right[index])) result.push(path);
  }
  return result;
}

/**
 * Variante d'un gabarit : parties retirées (et leurs relations dans
 * `word/_rels/document.xml.rels`), parties remplacées ou ajoutées.
 */
export async function alterTemplate(
  buffer: ArrayBuffer,
  changes: {
    readonly remove?: readonly string[];
    readonly replace?: Readonly<Record<string, string>>;
  },
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const path of changes.remove ?? []) {
    zip.remove(path);
    const relsPath = 'word/_rels/document.xml.rels';
    const rels = await zip.file(relsPath)?.async('string');
    if (rels) {
      const target = path.replace(/^word\//, '');
      zip.file(
        relsPath,
        rels.replace(new RegExp(`<Relationship [^>]*Target="${target}"[^>]*/>`), ''),
      );
    }
    const types = await zip.file('[Content_Types].xml')?.async('string');
    if (types) {
      zip.file(
        '[Content_Types].xml',
        types.replace(new RegExp(`<Override [^>]*PartName="/${path}"[^>]*/>`), ''),
      );
    }
  }
  for (const [path, content] of Object.entries(changes.replace ?? {})) zip.file(path, content);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/** Résultat d'un export dans le gabarit : octets, parties et avertissements. */
export interface TemplateExport {
  readonly buffer: ArrayBuffer;
  readonly parts: ReadonlyMap<string, Uint8Array>;
  readonly warnings: readonly DocxExportWarning[];
}

/** Exporte `html` dans `template` et décompose le résultat. */
export async function exportInTemplate(
  html: string,
  template: ArrayBuffer,
  options: DocxExportOptions = {},
): Promise<TemplateExport> {
  const warnings: DocxExportWarning[] = [];
  const blob = await exportDocx(html, {
    ...options,
    template,
    onWarning: (warning) => warnings.push(warning),
  });
  const buffer = await blob.arrayBuffer();
  return { buffer, parts: await partsOf(buffer), warnings };
}

/** Import stylé d'une fixture. */
export async function importStyled(buffer: ArrayBuffer): Promise<DocxImportResult> {
  return importDocx(buffer, { fidelity: 'styled' });
}

/**
 * XML comparable : identifiants de révision et de paragraphe retirés, déclaration et
 * blancs entre balises neutralisés.
 */
export function normalizeXml(xml: string): string {
  return xml
    .replace(/^<\?xml[^>]*\?>\s*/, '')
    .replace(/\s+w:rsid[A-Za-z]*="[^"]*"/g, '')
    .replace(/\s+w14:(?:paraId|textId)="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

/** Corps (`<w:body>…</w:body>`) d'un `document.xml`. */
export function bodyOf(xml: string): string {
  const start = xml.indexOf('<w:body>');
  const end = xml.lastIndexOf('</w:body>');
  return start < 0 || end < 0 ? '' : xml.slice(start + '<w:body>'.length, end);
}

/** `w:sectPr` final du corps (le dernier `<w:sectPr>` de la partie). */
export function finalSectPr(xml: string): string {
  const matches = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g);
  return matches?.[matches.length - 1] ?? '';
}

/** Blocs de premier niveau du corps (`<w:p>`, `<w:tbl>`), hors `w:sectPr`. */
export function topLevelBlocks(body: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  const tag = /<(\/?)w:(p|tbl)\b[^>]*?(\/?)>/g;
  for (const match of body.matchAll(tag)) {
    const closing = match[1] === '/';
    const selfClosing = match[3] === '/';
    if (!closing) {
      if (depth === 0) start = match.index;
      if (!selfClosing) depth += 1;
      else if (depth === 0) blocks.push(match[0]);
      continue;
    }
    depth -= 1;
    if (depth === 0 && start >= 0) {
      blocks.push(body.slice(start, match.index + match[0].length));
      start = -1;
    }
  }
  return blocks;
}
