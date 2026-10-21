import { sanitizeXmlText } from '../../export/sanitize.js';
import type { DocxPackage } from '../reader/types.js';
import { PART_CONTENT_TYPES } from './content-types.js';
import { REL_TYPE, RelationshipTable } from './relationships.js';
import type { PartStore } from './xml-io.js';

/**
 * Propriétés du document (`docProps/core.xml`) dans le gabarit : `dc:title` et
 * `dc:creator` sont réécrits quand `options.title` / `options.creator` sont fournis, les
 * autres propriétés (dates, révision, mots-clés…) restent telles quelles. Sans option, la
 * partie n'est pas touchée ; une valeur déjà identique ne la réécrit pas non plus. Un
 * gabarit sans cette partie la reçoit, avec sa relation de paquet et son type de contenu.
 */

const CP_NS = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
const DC_NS = 'http://purl.org/dc/elements/1.1/';
const DCTERMS_NS = 'http://purl.org/dc/terms/';
const DCMITYPE_NS = 'http://purl.org/dc/dcmitype/';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';

const CORE_PATH = 'docProps/core.xml';

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const EMPTY_CORE =
  `<cp:coreProperties xmlns:cp="${CP_NS}" xmlns:dc="${DC_NS}" xmlns:dcterms="${DCTERMS_NS}"` +
  ` xmlns:dcmitype="${DCMITYPE_NS}" xmlns:xsi="${XSI_NS}"/>`;

export interface CorePropertiesInput {
  readonly template: PartStore;
  readonly pkg: DocxPackage;
  /** `Override` à ajouter à `[Content_Types].xml` si la partie est créée. */
  readonly overrides: Map<string, string>;
  readonly title?: string;
  readonly creator?: string;
}

/** Pose `dc:<name>` à `value` (créé s'il manque). Rend vrai si le texte a changé. */
function setDublinCore(doc: Document, name: string, value: string): boolean {
  const root = doc.documentElement;
  let element = Array.from(root.children).find(
    (child) => child.namespaceURI === DC_NS && child.localName === name,
  );
  if (!element) {
    element = doc.createElementNS(DC_NS, `dc:${name}`);
    root.appendChild(element);
  } else if (element.textContent === value) {
    return false;
  }
  element.textContent = value;
  return true;
}

/**
 * Réécrit `dc:title` / `dc:creator` du gabarit. Rend le chemin de la partie si elle a été
 * réécrite ou créée, `null` sinon.
 */
export async function writeCoreProperties(input: CorePropertiesInput): Promise<string | null> {
  if (input.title === undefined && input.creator === undefined) return null;
  let path = await input.pkg.related('', '/core-properties');
  let doc = path ? await input.template.dom(path) : null;
  let changed = false;
  if (!doc) {
    path = CORE_PATH;
    doc = input.template.parse(EMPTY_CORE);
    input.template.create(path, doc, DECLARATION);
    const rootRelationships = await RelationshipTable.open(input.template, '');
    await rootRelationships.ensure(REL_TYPE.coreProperties, path, false);
    input.overrides.set(path, PART_CONTENT_TYPES.coreProperties);
    changed = true;
  }
  if (input.title !== undefined) {
    changed = setDublinCore(doc, 'title', sanitizeXmlText(input.title)) || changed;
  }
  if (input.creator !== undefined) {
    changed = setDublinCore(doc, 'creator', sanitizeXmlText(input.creator)) || changed;
  }
  if (!changed || !path) return null;
  await input.template.markChanged(path);
  return path;
}
