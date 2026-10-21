import { W_NS } from '../preprocess/minimal-docx.js';
import { childNamed } from '../preprocess/xml-utils.js';
import { relsPathOf, resolveTarget } from './package.js';
import type {
  Block,
  BlockConverters,
  ConverterContext,
  DocxPackage,
  ParagraphBlock,
  Relationship,
  StyleResolver,
  TableBlock,
} from './types.js';

/**
 * Harnais des specs du lecteur (L24) : paquet en mémoire à partir de chaînes XML,
 * fragments Word parsés en `application/xml`, contexte de conversion avec des modules
 * voisins factices. Aucune utilité en production.
 */

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Parse une chaîne XML en `Document`, comme le lecteur le fait (jamais `text/html`). */
export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

/** Enveloppe un fragment WordprocessingML (`<w:p>…</w:p>`) et retourne son premier élément. */
export function fragment(xml: string): Element {
  const doc = parseXml(
    `<w:root xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:xml="http://www.w3.org/XML/1998/namespace">${xml}</w:root>`,
  );
  const first = doc.documentElement.firstElementChild;
  if (!first) throw new Error('fragment vide');
  return first;
}

/** Un `w:p` parsé depuis son contenu inline (et un `w:pPr` optionnel). */
export function paragraphOf(inline: string, pPr = ''): Element {
  return fragment(`<w:p>${pPr}${inline}</w:p>`);
}

/** `w:pPr` parsé, prêt pour `styles.paragraph(pPr)`. */
export function pPrOf(inner: string): Element {
  return fragment(`<w:pPr>${inner}</w:pPr>`);
}

/** `w:rPr` parsé, prêt pour `styles.run(rPr, paragraph)`. */
export function rPrOf(inner: string): Element {
  return fragment(`<w:rPr>${inner}</w:rPr>`);
}

/** `styles.xml` complet à partir de `docDefaults` et d'une liste de `w:style`. */
export function stylesXml(styles: string, docDefaults = ''): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W_NS}">` +
    (docDefaults ? `<w:docDefaults>${docDefaults}</w:docDefaults>` : '') +
    `${styles}</w:styles>`
  );
}

/** `theme1.xml` minimal avec les polices majeure et mineure. */
export function themeXml(major: string, minor: string): string {
  const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  return (
    `<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="${A_NS}"><a:themeElements><a:fontScheme name="Office">` +
    `<a:majorFont><a:latin typeface="${major}"/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="${minor}"/></a:minorFont>` +
    `</a:fontScheme></a:themeElements></a:theme>`
  );
}

/** Relations `document.xml.rels` à partir de `{ rId: [type, target, external?] }`. */
export function relsXml(
  rels: Readonly<Record<string, readonly [string, string, boolean?]>>,
): string {
  const items = Object.entries(rels)
    .map(
      ([id, [type, target, external]]) =>
        `<Relationship Id="${id}" Type="${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`
  );
}

/**
 * Paquet en mémoire : `parts` associe un chemin zip à son XML. Les relations sont lues
 * dans `word/_rels/document.xml.rels` comme le vrai paquet, sans archive.
 */
export function fakePackage(parts: Readonly<Record<string, string>>): DocxPackage {
  const docs = new Map<string, Document | null>();
  const part = async (path: string): Promise<Document | null> => {
    if (!docs.has(path)) {
      const xml = parts[path];
      docs.set(path, xml === undefined ? null : parseXml(xml));
    }
    return docs.get(path) ?? null;
  };
  const rels = async (partPath: string): Promise<ReadonlyMap<string, Relationship>> => {
    const map = new Map<string, Relationship>();
    const doc = await part(relsPathOf(partPath));
    if (!doc) return map;
    for (const rel of Array.from(doc.documentElement.children)) {
      const id = rel.getAttribute('Id') ?? '';
      const target = rel.getAttribute('Target') ?? '';
      const external = rel.getAttribute('TargetMode') === 'External';
      map.set(id, {
        id,
        type: rel.getAttribute('Type') ?? '',
        target: external ? target : resolveTarget(partPath, target),
        external,
      });
    }
    return map;
  };
  return {
    mainPart: 'word/document.xml',
    has: (path) => parts[path] !== undefined,
    part,
    binary: async () => null,
    rels,
    related: async (partPath, suffix) => {
      for (const rel of (await rels(partPath)).values()) {
        if (!rel.external && rel.type.endsWith(suffix)) return rel.target;
      }
      return null;
    },
  };
}

/** Modules voisins factices : images → `<img data-test>`, notes → `<sup>`, listes → aucune. */
export function createTestContext(
  styles: StyleResolver,
  pkg: DocxPackage,
  patch: Partial<ConverterContext> = {},
): ConverterContext {
  const convert: BlockConverters = {
    paragraph: async (): Promise<ParagraphBlock> => ({
      kind: 'paragraph',
      html: '',
      isEmpty: true,
    }),
    table: async (): Promise<TableBlock> => ({ kind: 'table', html: '' }),
    blocks: async (): Promise<Block[]> => [],
    render: (blocks) => blocks.map((block) => block.html).join(''),
  };
  return {
    pkg,
    part: pkg.mainPart,
    where: 'body',
    styles,
    numbering: { definition: () => null },
    images: {
      drawing: async (drawing) =>
        `<img data-test="${childNamed(drawing, 'inline') ? 'inline' : drawing.localName}">`,
    },
    notes: {
      reference: (id, kind) => `<sup data-${kind}-ref="${id}">${id}</sup>`,
      render: async () => '',
    },
    convert,
    options: { footnotes: true, emptyParagraphs: 'keep', parseXml },
    warnings: [],
    lost: [],
    tableStyle: null,
    ...patch,
  };
}
