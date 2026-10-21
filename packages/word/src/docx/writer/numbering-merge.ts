import type { ListDefinition } from '../../export/context.js';
import type { DocxExportWarning } from '../../export/types.js';
import { childNamed, childrenNamed } from '../preprocess/xml-utils.js';
import { PART_CONTENT_TYPES } from './content-types.js';
import { REL_TYPE, type RelationshipTable } from './relationships.js';
import { directoryOf, emptyDocumentLike, setWordAttr, wordAttr, type PartStore } from './xml-io.js';

/**
 * Numérotation des listes du corps greffé. La lib `docx` numérote ses `w:num` à partir
 * de 1 : chaque `w:numId` du corps est remappé. Une liste qui portait `data-docx-num-id`
 * **réutilise** le `w:num` du gabarit (même compteur, mêmes puces, mêmes retraits que
 * l'original) ; les autres voient leur `w:num` et leur `w:abstractNum` générés
 * **ajoutés** à `numbering.xml` sous des identifiants libres. Les définitions du gabarit
 * ne sont jamais modifiées. Sans `numbering.xml` dans le gabarit, la partie est créée.
 */

export interface NumberingMergerInput {
  readonly template: PartStore;
  readonly generated: PartStore;
  /** Partie principale du gabarit, dont dépend l'emplacement de `numbering.xml`. */
  readonly mainPart: string;
  /** Chemin de `numbering.xml` dans le gabarit (relation `/numbering`), `null` s'il n'en a pas. */
  readonly templatePath: string | null;
  readonly relationships: RelationshipTable;
  readonly lists: readonly ListDefinition[];
  /** `numId` généré → référence `numbering` de l'export (`document.Numbering` après empaquetage). */
  readonly concrete: ReadonlyMap<string, string>;
  readonly warnings: DocxExportWarning[];
}

export interface NumberingMerger {
  /** `numId` du corps généré → `numId` à écrire dans le gabarit. */
  remap(numId: string): Promise<string>;
  /** Partie `numbering.xml` créée dans le gabarit, à déclarer dans `[Content_Types].xml`. */
  readonly createdPart: () => { readonly path: string; readonly contentType: string } | null;
}

/** Chemin par défaut de `numbering.xml`, à côté de la partie principale. */
const NUMBERING_FILE = 'numbering.xml';

/** Plus grand `ST_DecimalNumber` (`xsd:int`) qu'un `w:numId` ou `w:abstractNumId` peut porter. */
const MAX_DECIMAL_NUMBER = 2_147_483_647;

/** Crée le fusionneur de numérotation du gabarit. */
export async function createNumberingMerger(input: NumberingMergerInput): Promise<NumberingMerger> {
  const generatedDoc = await input.generated.dom('word/numbering.xml');
  let templatePath = input.templatePath;
  let templateDoc = templatePath ? await input.template.dom(templatePath) : null;
  let created: { path: string; contentType: string } | null = null;
  const remapped = new Map<string, string>();
  const copiedAbstracts = new Map<string, string>();
  const warned = new Set<string>();

  const byReference = new Map<string, ListDefinition>();
  for (const list of input.lists) byReference.set(list.reference, list);

  /** `w:num` et `w:abstractNum` du gabarit, indexés par identifiant (recalculés à chaque ajout). */
  const templateIds = (): { nums: Map<string, Element>; abstracts: Map<string, Element> } => {
    const nums = new Map<string, Element>();
    const abstracts = new Map<string, Element>();
    if (templateDoc) {
      for (const num of childrenNamed(templateDoc.documentElement, 'num')) {
        nums.set(wordAttr(num, 'numId'), num);
      }
      for (const abstractNum of childrenNamed(templateDoc.documentElement, 'abstractNum')) {
        abstracts.set(wordAttr(abstractNum, 'abstractNumId'), abstractNum);
      }
    }
    return { nums, abstracts };
  };

  /**
   * Identifiant libre : le plus grand + 1 (ids ajoutés après ceux du gabarit, comme Word
   * les attribue), borné à `xsd:int` (`ST_DecimalNumber`, 2^31 - 1) : au-delà, Word
   * répare ou refuse. Quand le gabarit occupe déjà le plafond, premier entier libre
   * à partir de 1.
   */
  const nextId = (ids: Iterable<string>): string => {
    const taken = new Set<number>();
    let max = 0;
    for (const id of ids) {
      const value = Number(id);
      if (!Number.isFinite(value)) continue;
      taken.add(value);
      if (value > max) max = value;
    }
    if (max < MAX_DECIMAL_NUMBER) return String(max + 1);
    let candidate = 1;
    while (taken.has(candidate) && candidate < MAX_DECIMAL_NUMBER) candidate += 1;
    return String(candidate);
  };

  const warnFallback = (templateNumId: string): void => {
    if (warned.has(templateNumId)) return;
    warned.add(templateNumId);
    input.warnings.push({
      code: 'template-numbering-fallback',
      message: `Numérotation ${templateNumId} du gabarit introuvable (data-docx-num-id) : numérotation neuve ajoutée`,
    });
  };

  /** `numbering.xml` du gabarit, créée à la première copie si le gabarit n'en avait pas. */
  const ensureTemplateDoc = async (): Promise<Document | null> => {
    if (templateDoc) return templateDoc;
    if (!generatedDoc) return null;
    templatePath = templatePath ?? `${directoryOf(input.mainPart)}${NUMBERING_FILE}`;
    templateDoc = emptyDocumentLike(generatedDoc);
    input.template.create(
      templatePath,
      templateDoc,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    );
    await input.relationships.ensure(REL_TYPE.numbering, templatePath, false);
    created = { path: templatePath, contentType: PART_CONTENT_TYPES.numbering };
    return templateDoc;
  };

  /** Copie le `w:num` généré (et son `w:abstractNum`) sous des identifiants libres. */
  const copy = async (numId: string): Promise<string> => {
    const target = await ensureTemplateDoc();
    if (!generatedDoc || !target || !templatePath) return numId;
    const generatedNum = childrenNamed(generatedDoc.documentElement, 'num').find(
      (num) => wordAttr(num, 'numId') === numId,
    );
    if (!generatedNum) return numId;
    const abstractRef = childNamed(generatedNum, 'abstractNumId');
    const generatedAbstractId = abstractRef ? wordAttr(abstractRef, 'val') : '';
    const generatedAbstract = childrenNamed(generatedDoc.documentElement, 'abstractNum').find(
      (abstractNum) => wordAttr(abstractNum, 'abstractNumId') === generatedAbstractId,
    );
    const root = target.documentElement;

    let abstractId = copiedAbstracts.get(generatedAbstractId);
    if (abstractId === undefined && generatedAbstract) {
      abstractId = nextId(templateIds().abstracts.keys());
      const clone = target.importNode(generatedAbstract, true);
      setWordAttr(clone, 'abstractNumId', abstractId);
      // Schéma : tous les `w:abstractNum` précèdent les `w:num`.
      const firstNum = childNamed(root, 'num');
      root.insertBefore(clone, firstNum);
      copiedAbstracts.set(generatedAbstractId, abstractId);
    }

    const newNumId = nextId(templateIds().nums.keys());
    const numClone = target.importNode(generatedNum, true);
    setWordAttr(numClone, 'numId', newNumId);
    const cloneAbstractRef = childNamed(numClone, 'abstractNumId');
    if (cloneAbstractRef && abstractId !== undefined)
      setWordAttr(cloneAbstractRef, 'val', abstractId);
    // `w:numIdMacAtCleanup`, s'il existe, reste le dernier enfant.
    root.insertBefore(numClone, childNamed(root, 'numIdMacAtCleanup'));
    await input.template.markChanged(templatePath);
    return newNumId;
  };

  return {
    async remap(numId) {
      const known = remapped.get(numId);
      if (known !== undefined) return known;
      const reference = input.concrete.get(numId);
      const definition = reference === undefined ? undefined : byReference.get(reference);
      let result: string;
      if (definition?.templateNumId !== undefined) {
        if (templateIds().nums.has(definition.templateNumId)) {
          result = definition.templateNumId;
        } else {
          warnFallback(definition.templateNumId);
          result = await copy(numId);
        }
      } else {
        result = await copy(numId);
      }
      remapped.set(numId, result);
      return result;
    },
    createdPart: () => created,
  };
}
