import JSZip from 'jszip';
import { childrenNamed } from '../preprocess/xml-utils.js';
import type { DocxPackage, Relationship, XmlParse } from './types.js';

const DEFAULT_MAIN_PART = 'word/document.xml';
const ROOT_RELS = '_rels/.rels';
const OFFICE_DOCUMENT_TYPE = '/officeDocument';

/** Chemin du fichier `.rels` d'une partie : `word/document.xml` → `word/_rels/document.xml.rels`. */
export function relsPathOf(partPath: string): string {
  const slash = partPath.lastIndexOf('/');
  const dir = slash < 0 ? '' : partPath.slice(0, slash + 1);
  const name = slash < 0 ? partPath : partPath.slice(slash + 1);
  return `${dir}_rels/${name}.rels`;
}

/**
 * Résout une cible de relation en chemin absolu du zip : relative au dossier de la partie,
 * ou absolue (`/word/media/image1.png`). Les segments `..` sont repliés.
 */
export function resolveTarget(partPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const slash = partPath.lastIndexOf('/');
  const base = slash < 0 ? [] : partPath.slice(0, slash).split('/');
  for (const segment of target.split('/')) {
    if (segment === '..') base.pop();
    else if (segment !== '.' && segment !== '') base.push(segment);
  }
  return base.join('/');
}

/** Parseur XML par défaut : `DOMParser` global, erreur claire sinon (SSR sans jsdom). */
export function defaultXmlParse(): XmlParse {
  if (typeof DOMParser === 'undefined') {
    throw new Error('lecteur .docx : aucun DOMParser disponible, passe `options.parse`');
  }
  const parser = new DOMParser();
  return (xml) => parser.parseFromString(xml, 'application/xml');
}

/**
 * Vrai si le document parsé est une erreur de parsing : `<parsererror>` en racine (jsdom,
 * Firefox) ou injecté **dans** la racine (Chromium), d'où la recherche par nom local.
 */
function isParseError(doc: Document): boolean {
  const root = doc.documentElement;
  if (root === null || root.localName === 'parsererror') return true;
  return doc.getElementsByTagNameNS('*', 'parsererror').length > 0;
}

/**
 * Ouvre un `.docx` en lecture. Les parties XML sont parsées une fois et mises en cache,
 * les relations aussi. Jamais d'écriture : le gabarit reste intact pour l'export.
 */
export async function openPackage(buffer: ArrayBuffer, parseXml: XmlParse): Promise<DocxPackage> {
  const zip = await JSZip.loadAsync(buffer);
  const parts = new Map<string, Promise<Document | null>>();
  const relsCache = new Map<string, Promise<ReadonlyMap<string, Relationship>>>();

  const text = async (path: string): Promise<string | null> => {
    const file = zip.file(path);
    return file ? file.async('string') : null;
  };

  const part = (path: string): Promise<Document | null> => {
    let pending = parts.get(path);
    if (!pending) {
      pending = text(path).then((xml) => {
        if (xml === null) return null;
        try {
          const doc = parseXml(xml);
          return isParseError(doc) ? null : doc;
        } catch {
          return null;
        }
      });
      parts.set(path, pending);
    }
    return pending;
  };

  const rels = (partPath: string): Promise<ReadonlyMap<string, Relationship>> => {
    let pending = relsCache.get(partPath);
    if (!pending) {
      pending = part(relsPathOf(partPath)).then((doc) => {
        const map = new Map<string, Relationship>();
        if (!doc) return map;
        for (const rel of childrenNamed(doc.documentElement, 'Relationship')) {
          const id = rel.getAttribute('Id') ?? '';
          const target = rel.getAttribute('Target') ?? '';
          if (!id || !target) continue;
          const external = rel.getAttribute('TargetMode') === 'External';
          map.set(id, {
            id,
            type: rel.getAttribute('Type') ?? '',
            target: external ? target : resolveTarget(partPath, target),
            external,
          });
        }
        return map;
      });
      relsCache.set(partPath, pending);
    }
    return pending;
  };

  const related = async (partPath: string, typeSuffix: string): Promise<string | null> => {
    for (const rel of (await rels(partPath)).values()) {
      if (!rel.external && rel.type.endsWith(typeSuffix)) return rel.target;
    }
    return null;
  };

  // Partie principale désignée par `_rels/.rels`, repli sur le nom usuel.
  let mainPart = DEFAULT_MAIN_PART;
  const rootDoc = await part(ROOT_RELS);
  if (rootDoc) {
    for (const rel of childrenNamed(rootDoc.documentElement, 'Relationship')) {
      const type = rel.getAttribute('Type') ?? '';
      const target = rel.getAttribute('Target') ?? '';
      if (type.endsWith(OFFICE_DOCUMENT_TYPE) && target) {
        const resolved = resolveTarget('', target);
        if (zip.file(resolved)) mainPart = resolved;
        break;
      }
    }
  }

  return {
    mainPart,
    has: (path) => zip.file(path) !== null,
    part,
    binary: async (path) => {
      const file = zip.file(path);
      return file ? file.async('uint8array') : null;
    },
    rels,
    related,
  };
}
