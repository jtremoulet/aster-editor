import { childrenNamed } from '../preprocess/xml-utils.js';
import { PART_CONTENT_TYPES } from './content-types.js';
import { REL_TYPE, type RelationshipTable } from './relationships.js';
import { directoryOf, emptyDocumentLike, setWordAttr, wordAttr, type PartStore } from './xml-io.js';

/**
 * Notes de bas de page du corps greffé. Les notes générées sont **ajoutées** à
 * `footnotes.xml` du gabarit sous des identifiants libres (les séparateurs du gabarit
 * sont conservés) ; sans cette partie dans le gabarit, elle est créée avec les
 * séparateurs de l'export. Les notes du gabarit que le corps n'appelle plus restent dans
 * la partie : Word les ignore.
 */

export interface FootnoteMergerInput {
  readonly template: PartStore;
  readonly generated: PartStore;
  readonly mainPart: string;
  /** Chemin de `footnotes.xml` du gabarit (relation `/footnotes`), `null` s'il n'en a pas. */
  readonly templatePath: string | null;
  readonly relationships: RelationshipTable;
}

export interface FootnoteMerger {
  /** `w:id` d'un `w:footnoteReference` généré → identifiant dans le gabarit. */
  remap(id: string): Promise<string>;
  /** Notes copiées dans le gabarit : leurs paragraphes passent aussi par la greffe des styles. */
  readonly imported: () => readonly Element[];
  readonly createdPart: () => { readonly path: string; readonly contentType: string } | null;
}

/** Notes techniques de Word, jamais référencées depuis le corps. */
const TECHNICAL_TYPES: ReadonlySet<string> = new Set(['separator', 'continuationSeparator']);

const FOOTNOTES_FILE = 'footnotes.xml';

/** Crée le fusionneur de notes du gabarit. */
export async function createFootnoteMerger(input: FootnoteMergerInput): Promise<FootnoteMerger> {
  const generatedDoc = await input.generated.dom('word/footnotes.xml');
  let templatePath = input.templatePath;
  let templateDoc = templatePath ? await input.template.dom(templatePath) : null;
  let created: { path: string; contentType: string } | null = null;
  const remapped = new Map<string, string>();
  const imported: Element[] = [];

  const nextId = (): string => {
    let max = 0;
    if (templateDoc) {
      for (const note of childrenNamed(templateDoc.documentElement, 'footnote')) {
        const value = Number(wordAttr(note, 'id'));
        if (Number.isFinite(value) && value > max) max = value;
      }
    }
    return String(max + 1);
  };

  /** `footnotes.xml` du gabarit, créée (séparateurs compris) à la première note copiée. */
  const ensureTemplateDoc = async (): Promise<Document | null> => {
    if (templateDoc) return templateDoc;
    if (!generatedDoc) return null;
    templatePath = templatePath ?? `${directoryOf(input.mainPart)}${FOOTNOTES_FILE}`;
    templateDoc = emptyDocumentLike(generatedDoc);
    for (const note of childrenNamed(generatedDoc.documentElement, 'footnote')) {
      if (TECHNICAL_TYPES.has(wordAttr(note, 'type'))) {
        templateDoc.documentElement.appendChild(templateDoc.importNode(note, true));
      }
    }
    input.template.create(
      templatePath,
      templateDoc,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    );
    await input.relationships.ensure(REL_TYPE.footnotes, templatePath, false);
    created = { path: templatePath, contentType: PART_CONTENT_TYPES.footnotes };
    return templateDoc;
  };

  return {
    async remap(id) {
      const known = remapped.get(id);
      if (known !== undefined) return known;
      const target = await ensureTemplateDoc();
      const note = generatedDoc
        ? childrenNamed(generatedDoc.documentElement, 'footnote').find(
            (candidate) => wordAttr(candidate, 'id') === id,
          )
        : undefined;
      if (!target || !templatePath || !note) {
        remapped.set(id, id);
        return id;
      }
      const newId = nextId();
      const clone = target.importNode(note, true);
      setWordAttr(clone, 'id', newId);
      target.documentElement.appendChild(clone);
      imported.push(clone);
      await input.template.markChanged(templatePath);
      remapped.set(id, newId);
      return newId;
    },
    imported: () => imported,
    createdPart: () => created,
  };
}
