import { relsPathOf, resolveTarget } from '../reader/package.js';
import { directoryOf, type PartStore } from './xml-io.js';

/**
 * Relations OPC d'une partie (`word/_rels/document.xml.rels`) en lecture et en écriture
 * pour la greffe : les identifiants du corps généré (`rId1`… attribués par la lib `docx`
 * à partir de 1) entrent en collision avec ceux du gabarit, chaque relation du corps est
 * donc **remappée** : réutilisation d'une relation du gabarit de même type et même cible
 * quand elle existe, sinon ajout sous un identifiant libre. Un fichier `.rels` absent
 * n'est créé qu'au premier ajout : une partie sans relation n'en reçoit pas de vide.
 */

/** Espace de noms des fichiers `.rels`. */
export const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const OFFICE_RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIPS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Types de relations manipulés par la greffe. */
export const REL_TYPE = {
  image: `${OFFICE_RELATIONSHIPS}/image`,
  hyperlink: `${OFFICE_RELATIONSHIPS}/hyperlink`,
  numbering: `${OFFICE_RELATIONSHIPS}/numbering`,
  footnotes: `${OFFICE_RELATIONSHIPS}/footnotes`,
  styles: `${OFFICE_RELATIONSHIPS}/styles`,
  settings: `${OFFICE_RELATIONSHIPS}/settings`,
  header: `${OFFICE_RELATIONSHIPS}/header`,
  footer: `${OFFICE_RELATIONSHIPS}/footer`,
  /** Propriétés du document (`docProps/core.xml`), relation du paquet (`_rels/.rels`). */
  coreProperties: `${PACKAGE_RELATIONSHIPS}/metadata/core-properties`,
} as const;

/** Une relation : identifiant, type, cible telle qu'écrite, cible résolue en chemin du zip. */
export interface RelationshipEntry {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly resolved: string;
  readonly external: boolean;
}

const EMPTY_RELS = `<Relationships xmlns="${RELATIONSHIPS_NS}"/>`;

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Table des relations d'une partie, créée (en mémoire) vide si le fichier `.rels` manque. */
export class RelationshipTable {
  private readonly entries = new Map<string, RelationshipEntry>();
  private nextNumber = 1;

  private constructor(
    private readonly store: PartStore,
    readonly path: string,
    private readonly partPath: string,
    private readonly doc: Document,
    /** Vrai tant que le `.rels` n'existe pas dans le paquet : il sera créé au premier ajout. */
    private missing: boolean,
  ) {
    for (const rel of Array.from(doc.documentElement.children)) {
      if (rel.localName !== 'Relationship') continue;
      const id = rel.getAttribute('Id') ?? '';
      const target = rel.getAttribute('Target') ?? '';
      if (!id || !target) continue;
      const external = rel.getAttribute('TargetMode') === 'External';
      this.entries.set(id, {
        id,
        type: rel.getAttribute('Type') ?? '',
        target,
        resolved: external ? target : resolveTarget(partPath, target),
        external,
      });
      const numbered = /^rId(\d+)$/.exec(id);
      if (numbered) this.nextNumber = Math.max(this.nextNumber, Number(numbered[1]) + 1);
    }
  }

  /** Ouvre les relations de `partPath`. Un `.rels` absent ou illisible donne une table vide. */
  static async open(store: PartStore, partPath: string): Promise<RelationshipTable> {
    const path = relsPathOf(partPath);
    const existing = await store.dom(path);
    const doc = existing ?? store.parse(EMPTY_RELS);
    return new RelationshipTable(store, path, partPath, doc, existing === null);
  }

  get(id: string): RelationshipEntry | undefined {
    return this.entries.get(id);
  }

  values(): IterableIterator<RelationshipEntry> {
    return this.entries.values();
  }

  /** Première relation de ce type dont la cible résolue (ou l'URL externe) est `resolved`. */
  find(type: string, resolved: string, external: boolean): RelationshipEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.type === type && entry.external === external && entry.resolved === resolved) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Ajoute une relation et rend son identifiant. `target` est une URL (externe) ou un
   * chemin de partie du zip, réécrit relativement au dossier de la partie.
   */
  async add(type: string, target: string, external: boolean): Promise<string> {
    const id = `rId${String(this.nextNumber)}`;
    this.nextNumber += 1;
    const written = external ? target : relativeTarget(this.partPath, target);
    const element = this.doc.createElementNS(RELATIONSHIPS_NS, 'Relationship');
    element.setAttribute('Id', id);
    element.setAttribute('Type', type);
    element.setAttribute('Target', written);
    if (external) element.setAttribute('TargetMode', 'External');
    this.doc.documentElement.appendChild(element);
    this.entries.set(id, { id, type, target: written, resolved: target, external });
    if (this.missing) {
      this.store.create(this.path, this.doc, DECLARATION);
      this.missing = false;
    } else {
      await this.store.markChanged(this.path);
    }
    return id;
  }

  /** Identifiant d'une relation de ce type vers cette cible : existante, sinon ajoutée. */
  async ensure(type: string, target: string, external: boolean): Promise<string> {
    return this.find(type, target, external)?.id ?? this.add(type, target, external);
  }
}

/**
 * Cible relative au dossier de la partie : `word/media/a.png` depuis `word/document.xml`
 * → `media/a.png` ; hors du dossier, chemin absolu `/x/y.xml` (que Word accepte).
 */
export function relativeTarget(partPath: string, target: string): string {
  const dir = directoryOf(partPath);
  return target.startsWith(dir) ? target.slice(dir.length) : `/${target}`;
}
