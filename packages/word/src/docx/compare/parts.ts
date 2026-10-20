import JSZip from 'jszip';
import type { XmlParse } from '../reader/types';

/**
 * Comparaison à l'octet des parties du paquet (styles, numérotation, thème, polices,
 * en-têtes, pieds, images…). Le corps (`word/document.xml`), ses relations et les
 * propriétés datées (`docProps/core.xml`, `docProps/app.xml`) sont toujours exclus : ils
 * sont régénérés par construction et comparés propriété par propriété ailleurs.
 */

export interface PartsComparison {
  readonly identical: string[];
  readonly changed: { readonly path: string; readonly summary: string }[];
  /** Parties comparées (présentes dans l'original), conservées ou non, pour le score. */
  readonly compared: { readonly path: string; readonly kept: boolean; readonly summary: string }[];
}

export interface PartsOptions {
  /** Préfixes de chemin retenus ; tout par défaut. */
  readonly prefixes?: readonly string[];
  /** Parties jamais comparées (corps, relations du corps, propriétés datées). */
  readonly excluded: ReadonlySet<string>;
  readonly ignoreRevisionIds: boolean;
  readonly parseXml: XmlParse;
}

const SNIPPET_LENGTH = 80;

/** Tous les fichiers (pas les dossiers) d'une archive, triés. */
export async function listParts(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(buffer);
  const parts = new Map<string, Uint8Array>();
  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .sort();
  for (const name of names) {
    const file = zip.file(name);
    if (file) parts.set(name, await file.async('uint8array'));
  }
  return parts;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function isXmlPath(path: string): boolean {
  return path.endsWith('.xml') || path.endsWith('.rels');
}

const REVISION_ATTRIBUTES = /\s+w:rsid[A-Za-z]*="[^"]*"/g;
const REVISION_ELEMENTS =
  /<w:(?:lastRenderedPageBreak|proofErr|bookmarkStart|bookmarkEnd)\b[^>]*\/>|<w:rsids>[\s\S]*?<\/w:rsids>/g;

/** Retire les identifiants de révision et les marques sans effet visuel d'un XML Word. */
export function stripRevisionIds(xml: string): string {
  return xml.replace(REVISION_ELEMENTS, '').replace(REVISION_ATTRIBUTES, '');
}

function xmlLines(xml: string): string[] {
  return xml.replace(/>\s*</g, '>\n<').split('\n');
}

function snippet(line: string | undefined): string {
  if (line === undefined) return '(fin)';
  return line.length > SNIPPET_LENGTH ? `${line.slice(0, SNIPPET_LENGTH)}…` : line;
}

function isParsable(xml: string, parseXml: XmlParse): boolean {
  try {
    const doc = parseXml(xml);
    return doc.documentElement !== null && doc.documentElement.localName !== 'parsererror';
  } catch {
    return false;
  }
}

/** Résumé d'une partie XML qui diffère : tailles et première ligne différente. */
function xmlSummary(a: string, b: string, sizes: string): string {
  const linesA = xmlLines(a);
  const linesB = xmlLines(b);
  const count = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < count; i += 1) {
    if (linesA[i] !== linesB[i]) {
      return `${sizes} ; ligne ${String(i + 1)} : « ${snippet(linesA[i])} » → « ${snippet(linesB[i])} »`;
    }
  }
  return sizes;
}

/**
 * Compare les parties de l'original à celles du résultat. Une partie de l'original absente
 * du résultat est « supprimée », une partie nouvelle est « ajoutée » (listée, pas comptée).
 * Avec `ignoreRevisionIds`, une partie XML égale hors `w:rsid*` compte comme conservée
 * tout en restant listée comme changée.
 */
export function compareParts(
  original: ReadonlyMap<string, Uint8Array>,
  result: ReadonlyMap<string, Uint8Array>,
  options: PartsOptions,
): PartsComparison {
  const decoder = new TextDecoder();
  const identical: string[] = [];
  const changed: { path: string; summary: string }[] = [];
  const compared: { path: string; kept: boolean; summary: string }[] = [];
  const inScope = (path: string): boolean =>
    !options.excluded.has(path) &&
    (options.prefixes === undefined || options.prefixes.some((p) => path.startsWith(p)));
  const differs = (path: string, summary: string, kept = false): void => {
    changed.push({ path, summary });
    compared.push({ path, kept, summary });
  };

  for (const [path, bytes] of original) {
    if (!inScope(path)) continue;
    const other = result.get(path);
    if (!other) {
      differs(path, 'supprimée');
      continue;
    }
    if (sameBytes(bytes, other)) {
      identical.push(path);
      compared.push({ path, kept: true, summary: 'identique' });
      continue;
    }
    const sizes = `taille ${String(bytes.byteLength)} → ${String(other.byteLength)} octets`;
    if (!isXmlPath(path)) {
      differs(path, sizes);
      continue;
    }
    const a = decoder.decode(bytes);
    const b = decoder.decode(other);
    if (options.ignoreRevisionIds && stripRevisionIds(a) === stripRevisionIds(b)) {
      differs(path, 'identique hors identifiants de révision', true);
      continue;
    }
    const parsable = isParsable(a, options.parseXml) && isParsable(b, options.parseXml);
    differs(path, parsable ? xmlSummary(a, b, sizes) : `${sizes} (XML illisible)`);
  }

  for (const path of result.keys()) {
    if (inScope(path) && !original.has(path)) changed.push({ path, summary: 'ajoutée' });
  }
  return { identical, changed, compared };
}
