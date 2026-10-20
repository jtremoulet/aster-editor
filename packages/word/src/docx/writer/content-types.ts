import type { PartStore } from './xml-io';

/**
 * `[Content_Types].xml` du gabarit : on y **ajoute** les types par défaut des extensions
 * d'images nouvelles et les `Override` des parties créées (numérotation, notes). Rien
 * n'est retiré ni réordonné ; sans ajout, la partie n'est pas réécrite.
 */

/** Chemin de la partie des types de contenu. */
export const CONTENT_TYPES_PATH = '[Content_Types].xml';

const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

const WORDPROCESSING = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

/** Types de contenu des parties que la greffe peut créer. */
export const PART_CONTENT_TYPES = {
  numbering: `${WORDPROCESSING}.numbering+xml`,
  footnotes: `${WORDPROCESSING}.footnotes+xml`,
  header: `${WORDPROCESSING}.header+xml`,
  footer: `${WORDPROCESSING}.footer+xml`,
  settings: `${WORDPROCESSING}.settings+xml`,
  coreProperties: 'application/vnd.openxmlformats-package.core-properties+xml',
} as const;

/** Types MIME des images que l'export embarque, par extension. */
const IMAGE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

/** Type MIME d'une extension d'image, `application/octet-stream` sinon. */
export function imageContentType(extension: string): string {
  return IMAGE_CONTENT_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

/** Ajouts à faire : extensions (`Default`) et parties (`Override`, chemin sans `/` initial). */
export interface ContentTypeAdditions {
  readonly defaults: ReadonlyMap<string, string>;
  readonly overrides: ReadonlyMap<string, string>;
}

/**
 * Complète `[Content_Types].xml` avec les entrées manquantes. Rend vrai si la partie a
 * été modifiée. Un gabarit sans cette partie (archive non conforme) la reçoit entière.
 */
export async function ensureContentTypes(
  store: PartStore,
  additions: ContentTypeAdditions,
): Promise<boolean> {
  if (additions.defaults.size === 0 && additions.overrides.size === 0) return false;
  let doc = await store.dom(CONTENT_TYPES_PATH);
  if (!doc) {
    doc = store.parse(
      `<Types xmlns="${CONTENT_TYPES_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`,
    );
    store.create(
      CONTENT_TYPES_PATH,
      doc,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    );
  }
  const root = doc.documentElement;
  const existingDefaults = new Set<string>();
  const existingOverrides = new Set<string>();
  for (const child of Array.from(root.children)) {
    if (child.localName === 'Default') {
      existingDefaults.add((child.getAttribute('Extension') ?? '').toLowerCase());
    } else if (child.localName === 'Override') {
      existingOverrides.add(child.getAttribute('PartName') ?? '');
    }
  }
  let changed = false;
  for (const [extension, type] of additions.defaults) {
    if (existingDefaults.has(extension.toLowerCase())) continue;
    const element = doc.createElementNS(CONTENT_TYPES_NS, 'Default');
    element.setAttribute('Extension', extension);
    element.setAttribute('ContentType', type);
    // Les `Default` précèdent les `Override` dans les fichiers de Word : on garde cet ordre.
    const firstOverride = Array.from(root.children).find((child) => child.localName === 'Override');
    root.insertBefore(element, firstOverride ?? null);
    changed = true;
  }
  for (const [path, type] of additions.overrides) {
    const partName = path.startsWith('/') ? path : `/${path}`;
    if (existingOverrides.has(partName)) continue;
    const element = doc.createElementNS(CONTENT_TYPES_NS, 'Override');
    element.setAttribute('PartName', partName);
    element.setAttribute('ContentType', type);
    root.appendChild(element);
    changed = true;
  }
  if (changed) await store.markChanged(CONTENT_TYPES_PATH);
  return changed;
}
