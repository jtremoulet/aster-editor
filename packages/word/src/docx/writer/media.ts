import { imageContentType } from './content-types.js';
import { REL_TYPE, type RelationshipTable } from './relationships.js';
import { basenameOf, directoryOf, type PartStore } from './xml-io.js';

/**
 * Copie des médias du paquet généré dans `word/media/` du gabarit. Une image dont les
 * octets existent déjà dans le gabarit réutilise cette partie (et sa relation d'image,
 * s'il y en a une dans la table visée) ; sinon elle est ajoutée sous son nom, suffixé en
 * cas de collision. Rien n'est jamais supprimé. Les extensions nouvelles sont collectées
 * pour `[Content_Types].xml`.
 */
export class MediaCopier {
  private readonly copied = new Map<string, string>();
  private templateMedia: Promise<ReadonlyMap<string, Uint8Array>> | null = null;

  constructor(
    private readonly template: PartStore,
    private readonly generated: PartStore,
    private readonly mainPart: string,
    readonly contentDefaults: Map<string, string>,
  ) {}

  /**
   * Chemin généré (`word/media/<sha>.png`) → identifiant de relation d'image dans
   * `relationships` (la table de la partie qui référence l'image), `null` si les octets
   * sont introuvables.
   */
  async copy(generatedPath: string, relationships: RelationshipTable): Promise<string | null> {
    const known = this.copied.get(generatedPath);
    const path = known ?? (await this.store(generatedPath));
    if (path === null) return null;
    this.copied.set(generatedPath, path);
    return relationships.ensure(REL_TYPE.image, path, false);
  }

  /** Partie du gabarit qui porte les octets de l'image générée, copiée au besoin. */
  private async store(generatedPath: string): Promise<string | null> {
    const bytes = await this.generated.binary(generatedPath);
    if (!bytes) return null;
    const extension = basenameOf(generatedPath).split('.').pop()?.toLowerCase() ?? '';
    const existing = await this.findIdentical(bytes, extension);
    if (existing) return existing;
    const path = this.freePath(generatedPath);
    this.template.write(path, bytes);
    if (extension) this.contentDefaults.set(extension, imageContentType(extension));
    return path;
  }

  /** Chemin libre dans le dossier `media/` du gabarit, suffixé `-2`, `-3`… si le nom est pris. */
  private freePath(generatedPath: string): string {
    const name = basenameOf(generatedPath);
    const dot = name.lastIndexOf('.');
    const stem = dot < 0 ? name : name.slice(0, dot);
    const extension = dot < 0 ? '' : name.slice(dot);
    const directory = `${directoryOf(this.mainPart)}media/`;
    let candidate = `${directory}${name}`;
    for (let index = 2; this.template.has(candidate); index += 1) {
      candidate = `${directory}${stem}-${String(index)}${extension}`;
    }
    return candidate;
  }

  /** Partie média du gabarit aux mêmes octets, `null` sinon. */
  private async findIdentical(bytes: Uint8Array, extension: string): Promise<string | null> {
    this.templateMedia ??= this.loadTemplateMedia();
    for (const [path, candidate] of await this.templateMedia) {
      if (
        !path.toLowerCase().endsWith(`.${extension}`) ||
        candidate.byteLength !== bytes.byteLength
      ) {
        continue;
      }
      if (candidate.every((byte, index) => byte === bytes[index])) return path;
    }
    return null;
  }

  private async loadTemplateMedia(): Promise<ReadonlyMap<string, Uint8Array>> {
    const map = new Map<string, Uint8Array>();
    for (const path of this.template.paths(`${directoryOf(this.mainPart)}media/`)) {
      const bytes = await this.template.binary(path);
      if (bytes) map.set(path, bytes);
    }
    return map;
  }
}
