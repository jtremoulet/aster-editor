import JSZip from 'jszip';

/**
 * Accès en lecture et en écriture aux parties d'un paquet `.docx` pour la greffe : les
 * parties XML sont parsées à la demande et mises en cache, puis réécrites **seulement**
 * si elles ont été marquées modifiées. Une entrée non touchée garde ses octets d'origine
 * (jszip ne recompresse pas ce qu'il n'a pas relu), ce qui garantit l'identité à l'octet
 * des parties du gabarit hors corps.
 */

/** Parseur et sérialiseur XML injectables. Par défaut `DOMParser` et `XMLSerializer` globaux. */
export interface XmlCodec {
  parse(xml: string): Document;
  serialize(doc: Document): string;
}

/** Marque d'ordre des octets qu'un éditeur peut avoir posée avant `<?xml`. */
const BOM = String.fromCharCode(0xfeff);

/** Résout le codec XML sur les globaux, ou lève si l'environnement n'en a pas. */
export function defaultXmlCodec(): XmlCodec {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('export dans le gabarit : DOMParser ou XMLSerializer indisponible');
  }
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  return {
    parse: (xml) => parser.parseFromString(xml, 'application/xml'),
    serialize: (doc) => serializer.serializeToString(doc),
  };
}

/** Déclaration `<?xml …?>` d'origine, que `XMLSerializer` ne réémet pas. */
export function xmlDeclarationOf(xml: string): string {
  if (!xml.startsWith('<?xml')) return '';
  const end = xml.indexOf('?>');
  return end === -1 ? '' : xml.slice(0, end + 2);
}

/** Vrai si le document parsé est une erreur de parsing (`<parsererror>` de DOMParser). */
export function isParseError(doc: Document): boolean {
  const root = doc.documentElement;
  return root === null || root.localName === 'parsererror';
}

/** Partie XML parsée, avec ce qu'il faut pour la réécrire à l'identique hors contenu. */
interface CachedPart {
  readonly doc: Document;
  readonly declaration: string;
  changed: boolean;
}

/** Dossier d'un chemin de partie (`word/document.xml` → `word/`), vide à la racine. */
export function directoryOf(partPath: string): string {
  const slash = partPath.lastIndexOf('/');
  return slash < 0 ? '' : partPath.slice(0, slash + 1);
}

/** Nom de fichier d'un chemin de partie. */
export function basenameOf(partPath: string): string {
  return partPath.slice(partPath.lastIndexOf('/') + 1);
}

/**
 * Paquet ouvert en écriture. `dom(path)` rend le document parsé (mis en cache) ; l'appelant
 * le modifie en place puis appelle `markChanged(path)` ; `commit()` sérialise les parties
 * modifiées et `generate()` produit l'archive.
 */
export class PartStore {
  private readonly cache = new Map<string, Promise<CachedPart | null>>();

  private constructor(
    private readonly zip: JSZip,
    private readonly codec: XmlCodec,
  ) {}

  /** Ouvre une archive. Lève si jszip ne la lit pas : l'appelant décide du repli. */
  static async open(buffer: ArrayBuffer | Uint8Array, codec: XmlCodec): Promise<PartStore> {
    return new PartStore(await JSZip.loadAsync(buffer), codec);
  }

  has(path: string): boolean {
    return this.zip.file(path) !== null;
  }

  /** Parse un XML avec le codec du paquet (documents neufs des parties créées). */
  parse(xml: string): Document {
    return this.codec.parse(xml);
  }

  /** Chemins des fichiers (pas des dossiers) commençant par `prefix`. */
  paths(prefix = ''): string[] {
    return Object.keys(this.zip.files)
      .filter((name) => !this.zip.files[name]?.dir && name.startsWith(prefix))
      .sort();
  }

  async text(path: string): Promise<string | null> {
    const file = this.zip.file(path);
    if (!file) return null;
    const raw = await file.async('string');
    return raw.startsWith(BOM) ? raw.slice(BOM.length) : raw;
  }

  async binary(path: string): Promise<Uint8Array | null> {
    const file = this.zip.file(path);
    return file ? file.async('uint8array') : null;
  }

  /** Partie XML parsée (en cache), `null` si absente ou illisible. */
  async dom(path: string): Promise<Document | null> {
    return (await this.cached(path))?.doc ?? null;
  }

  /** Enregistre un document neuf pour une partie absente (numérotation, notes). */
  create(path: string, doc: Document, declaration: string): void {
    this.cache.set(path, Promise.resolve({ doc, declaration, changed: true }));
  }

  /**
   * Adopte un document déjà parsé par ailleurs (la partie principale, lue par le paquet
   * du lecteur à l'ouverture du gabarit) : la partie n'est pas reparsée, le DOM est
   * partagé et sera réécrit avec `declaration` en tête s'il est marqué modifié.
   */
  adopt(path: string, doc: Document, declaration: string): void {
    this.cache.set(path, Promise.resolve({ doc, declaration, changed: false }));
  }

  /** À appeler après toute mutation du DOM d'une partie : elle sera réécrite au `commit`. */
  async markChanged(path: string): Promise<void> {
    const part = await this.cached(path);
    if (part) part.changed = true;
  }

  /** Écrit des octets (média) ou un texte brut à ce chemin. */
  write(path: string, content: Uint8Array | string): void {
    this.zip.file(path, content);
  }

  /**
   * Sérialise les parties XML modifiées dans l'archive, déclaration d'origine en tête.
   * Chromium réémet lui-même la déclaration `<?xml …?>` dans `serializeToString` (jsdom
   * non) : on retire celle du sérialiseur pour ne jamais en écrire deux.
   */
  async commit(): Promise<void> {
    for (const [path, pending] of this.cache) {
      const part = await pending;
      if (!part?.changed) continue;
      this.zip.file(path, part.declaration + stripXmlDeclaration(this.codec.serialize(part.doc)));
      part.changed = false;
    }
  }

  /** Archive finale. Appelle `commit()` d'abord. */
  async generate(): Promise<ArrayBuffer> {
    await this.commit();
    return this.zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  }

  private cached(path: string): Promise<CachedPart | null> {
    let pending = this.cache.get(path);
    if (!pending) {
      pending = this.text(path).then((xml) => {
        if (xml === null) return null;
        try {
          const doc = this.codec.parse(xml);
          if (isParseError(doc)) return null;
          return { doc, declaration: xmlDeclarationOf(xml), changed: false };
        } catch {
          return null;
        }
      });
      this.cache.set(path, pending);
    }
    return pending;
  }
}

/** Attribut `w:…` (espace de noms de l'élément) : lecture, écriture, suppression. */
export function wordAttr(element: Element, name: string): string {
  return element.getAttributeNS(element.namespaceURI, name) ?? element.getAttribute(name) ?? '';
}

export function setWordAttr(element: Element, name: string, value: string): void {
  const prefix = element.prefix ? `${element.prefix}:` : '';
  element.setAttributeNS(element.namespaceURI, `${prefix}${name}`, value);
}

export function removeWordAttr(element: Element, name: string): void {
  if (element.hasAttributeNS(element.namespaceURI, name)) {
    element.removeAttributeNS(element.namespaceURI, name);
  } else if (element.hasAttribute(name)) {
    element.removeAttribute(name);
  }
}

/** Crée un élément dans l'espace de noms (et le préfixe) de `reference`. */
export function createSibling(reference: Element, localName: string): Element {
  const prefix = reference.prefix ? `${reference.prefix}:` : '';
  return reference.ownerDocument.createElementNS(reference.namespaceURI, `${prefix}${localName}`);
}

/** Élément `w:<localName>` avec ses attributs `w:…`, dans l'espace de noms de `reference`. */
export function wordElement(
  reference: Element,
  localName: string,
  attributes: Readonly<Record<string, string>> = {},
): Element {
  const element = createSibling(reference, localName);
  for (const [name, value] of Object.entries(attributes)) setWordAttr(element, name, value);
  return element;
}

/**
 * Insère `element` dans `container` à la place que lui donne `order` (liste des noms
 * locaux dans l'ordre du schéma) : avant le premier enfant connu de rang supérieur, sinon
 * en dernier. Les enfants inconnus de `order` ne contraignent rien.
 */
export function insertOrdered(
  container: Element,
  element: Element,
  order: readonly string[],
): void {
  const rank = order.indexOf(element.localName);
  const anchor = Array.from(container.children).find((child) => {
    const childRank = order.indexOf(child.localName);
    return childRank >= 0 && childRank > rank;
  });
  container.insertBefore(element, anchor ?? null);
}

/** Enfant `w:<localName>` existant ou créé à sa place dans l'ordre du schéma. */
export function ensureChild(
  container: Element,
  localName: string,
  order: readonly string[],
): Element {
  const existing = Array.from(container.children).find((child) => child.localName === localName);
  if (existing) return existing;
  const element = createSibling(container, localName);
  insertOrdered(container, element, order);
  return element;
}

/**
 * Document neuf dont la racine reprend le nom, l'espace de noms et toutes les
 * déclarations `xmlns:*` (et `mc:Ignorable`) de `model`, sans ses enfants : base d'une
 * partie `numbering.xml` ou `footnotes.xml` créée dans un gabarit qui n'en avait pas.
 */
export function emptyDocumentLike(model: Document): Document {
  const root = model.documentElement;
  const doc = model.implementation.createDocument(root.namespaceURI, root.tagName, null);
  const target = doc.documentElement;
  for (const attribute of Array.from(root.attributes)) {
    if (attribute.namespaceURI) {
      target.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
    } else {
      target.setAttribute(attribute.name, attribute.value);
    }
  }
  return doc;
}

/**
 * Retire la déclaration `<?xml …?>` que certains sérialiseurs (Chromium) placent en tête :
 * la partie est réécrite avec sa déclaration d'origine, jamais avec deux.
 */
export function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\s*<\?xml[^>]*\?>\s*/u, '');
}
