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

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Attribut dans l'espace de noms de l'élément, chaîne vide si absent. */
function attr(element: Element, name: string): string {
  return element.getAttributeNS(element.namespaceURI, name) ?? element.getAttribute(name) ?? '';
}

/** Chemin de zip d'une cible de relation, segments `.`/`..` repliés. */
function resolveRelTarget(relsPath: string, target: string): string {
  const dir = relsPath.replace(/_rels\/[^/]+$/, '');
  const raw = target.startsWith('/') ? target.slice(1) : `${dir}${target}`;
  const out: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '..') out.pop();
    else if (segment !== '.' && segment !== '') out.push(segment);
  }
  return out.join('/');
}

/**
 * Validateur d'intégrité d'un paquet produit (protocole de la relecture R27) : chaque
 * partie XML parse et garde sa déclaration, `[Content_Types].xml` couvre chaque partie
 * sans doublon ni cible absente, relations à `Id` uniques et cibles internes existantes,
 * chaque `r:id`/`r:embed`/`r:link` du corps résolu, chaque `w:numId` → `w:num`, chaque
 * `abstractNumId` → `w:abstractNum`, chaque `pStyle`/`rStyle`/`tblStyle` → `styles.xml`
 * (styles intégrés de Word tolérés : `ignoredStyles`), chaque `footnoteReference` →
 * `footnotes.xml`, identifiants de notes et de styles uniques. Rend la liste des problèmes.
 */
export function checkIntegrity(
  parts: ReadonlyMap<string, Uint8Array>,
  ignoredStyles: ReadonlySet<string> = new Set(),
): string[] {
  const problems: string[] = [];
  const parser = new DOMParser();
  const docs = new Map<string, Document>();
  for (const name of parts.keys()) {
    if (!/\.(xml|rels)$/i.test(name)) continue;
    const xml = textOf(parts, name);
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.documentElement.localName === 'parsererror') problems.push(`XML invalide : ${name}`);
    else docs.set(name, doc);
    if (!xml.startsWith('<?xml') && !name.startsWith('customXml/')) {
      problems.push(`déclaration XML absente : ${name}`);
    }
  }
  const types = docs.get('[Content_Types].xml');
  if (!types) problems.push('[Content_Types].xml absent ou invalide');
  else {
    const defaults = new Set<string>();
    const overrides = new Set<string>();
    for (const child of Array.from(types.documentElement.children)) {
      if (child.localName === 'Default') {
        defaults.add((child.getAttribute('Extension') ?? '').toLowerCase());
      } else if (child.localName === 'Override') {
        const partName = child.getAttribute('PartName') ?? '';
        if (overrides.has(partName)) problems.push(`Override en double : ${partName}`);
        overrides.add(partName);
      }
    }
    for (const name of parts.keys()) {
      if (name === '[Content_Types].xml') continue;
      const extension = name.split('.').pop()?.toLowerCase() ?? '';
      if (!overrides.has(`/${name}`) && !defaults.has(extension)) {
        problems.push(`sans type de contenu : ${name}`);
      }
    }
    for (const partName of overrides) {
      if (!parts.has(partName.slice(1)))
        problems.push(`Override vers partie absente : ${partName}`);
    }
  }
  for (const [name, doc] of docs) {
    if (!name.endsWith('.rels')) continue;
    const ids = new Set<string>();
    for (const rel of Array.from(doc.documentElement.children)) {
      const id = rel.getAttribute('Id') ?? '';
      if (ids.has(id)) problems.push(`${name} : Id en double ${id}`);
      ids.add(id);
      if (rel.getAttribute('TargetMode') === 'External') continue;
      const target = rel.getAttribute('Target') ?? '';
      if (!parts.has(resolveRelTarget(name, target))) {
        problems.push(`${name} : cible absente ${target}`);
      }
    }
  }
  const main = docs.get('word/document.xml');
  if (!main) return problems;
  const relIds = new Set<string>();
  const rels = docs.get('word/_rels/document.xml.rels');
  if (rels) {
    for (const rel of Array.from(rels.documentElement.children)) {
      relIds.add(rel.getAttribute('Id') ?? '');
    }
  }
  for (const element of Array.from(main.getElementsByTagNameNS('*', '*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (
        attribute.namespaceURI === R_NS &&
        ['id', 'embed', 'link'].includes(attribute.localName) &&
        !relIds.has(attribute.value)
      ) {
        problems.push(
          `corps : ${element.localName} r:${attribute.localName}="${attribute.value}" sans relation`,
        );
      }
    }
  }
  const numIds = new Set<string>();
  const abstractIds = new Set<string>();
  const numbering = docs.get('word/numbering.xml');
  if (numbering) {
    for (const child of Array.from(numbering.documentElement.children)) {
      if (child.localName === 'num') {
        const id = attr(child, 'numId');
        if (numIds.has(id)) problems.push(`numbering : numId en double ${id}`);
        numIds.add(id);
      } else if (child.localName === 'abstractNum') {
        const id = attr(child, 'abstractNumId');
        if (abstractIds.has(id)) problems.push(`numbering : abstractNumId en double ${id}`);
        abstractIds.add(id);
      }
    }
    for (const reference of Array.from(numbering.getElementsByTagNameNS('*', 'abstractNumId'))) {
      const value = attr(reference, 'val');
      if (!abstractIds.has(value)) problems.push(`numbering : abstractNumId ${value} introuvable`);
    }
  }
  for (const reference of Array.from(main.getElementsByTagNameNS('*', 'numId'))) {
    const value = attr(reference, 'val');
    if (value !== '0' && !numIds.has(value)) problems.push(`corps : numId ${value} introuvable`);
  }
  const styleIds = new Set<string>();
  const styles = docs.get('word/styles.xml');
  if (styles) {
    for (const style of Array.from(styles.documentElement.children)) {
      if (style.localName !== 'style') continue;
      const id = attr(style, 'styleId');
      if (styleIds.has(id)) problems.push(`styles : styleId en double ${id}`);
      styleIds.add(id);
    }
  }
  for (const name of ['pStyle', 'rStyle', 'tblStyle']) {
    for (const reference of Array.from(main.getElementsByTagNameNS('*', name))) {
      const value = attr(reference, 'val');
      if (!styleIds.has(value) && !ignoredStyles.has(value)) {
        problems.push(`corps : ${name} ${value} introuvable`);
      }
    }
  }
  const noteIds = new Set<string>();
  const footnotes = docs.get('word/footnotes.xml');
  if (footnotes) {
    for (const note of Array.from(footnotes.documentElement.children)) {
      if (note.localName !== 'footnote') continue;
      const id = attr(note, 'id');
      if (noteIds.has(id)) problems.push(`footnotes : id en double ${id}`);
      noteIds.add(id);
    }
  }
  for (const reference of Array.from(main.getElementsByTagNameNS('*', 'footnoteReference'))) {
    const value = attr(reference, 'id');
    if (!noteIds.has(value)) problems.push(`corps : footnoteReference ${value} introuvable`);
  }
  return problems;
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
