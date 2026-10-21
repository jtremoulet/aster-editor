import type { DocumentLayout } from '@aster-editor/core';
import type { ListDefinition, VariableSettings } from '../../export/context';
import type { DocxExportWarning } from '../../export/types';
import { allNamed, childNamed } from '../preprocess/xml-utils';
import { ensureContentTypes } from './content-types';
import { writeCoreProperties } from './core-properties';
import { createFootnoteMerger } from './footnotes-merge';
import { graftSections } from './graft-sections';
import { resolveHeaderFooterVariables } from './header-footer-variables';
import { MediaCopier } from './media';
import { createNumberingMerger } from './numbering-merge';
import { REL_TYPE, RelationshipTable } from './relationships';
import { ensureSettings } from './settings-merge';
import { createStyleMerger, type StyleMerger, type StyleType } from './styles-merge';
import { stripConditionalTableProperties } from './table-look';
import type { TemplateContext } from './template';
import { PartStore, setWordAttr, wordAttr, type XmlCodec } from './xml-io';

/**
 * Greffe du corps généré dans le gabarit. Principe figé (brief L27) : le `.docx` produit
 * par la chaîne d'export (lib `docx`) n'est qu'une source ; le gabarit est ouvert et
 * **aucune de ses parties n'est réécrite** sauf le corps, ses relations, les médias et
 * numérotations ajoutés, les styles ajoutés, les notes ajoutées, `[Content_Types].xml`
 * quand une partie ou une extension apparaît, les en-têtes et pieds quand les
 * variables y sont résolues ou qu'un `layout` les régénère, `settings.xml` quand la
 * table des matières ou un en-tête de pages paires l'exige, et `docProps/core.xml`
 * quand `title` / `creator` sont fournis. Le `w:sectPr` final du gabarit (en-têtes,
 * pieds, marges, colonnes) est conservé ; les sections intermédiaires du corps
 * (`<hr data-section-break>`, session 4) reprennent chacune le `w:sectPr` du gabarit qui
 * leur correspond, ou sont régénérées (`graft-sections.ts`) ; les sections du gabarit
 * abandonnées transmettent leurs en-têtes et pieds à la suivante par héritage.
 */

export interface GraftInput {
  /** Archive produite par `Packer` à partir du corps édité. */
  readonly generated: ArrayBuffer;
  readonly template: TemplateContext;
  readonly lists: readonly ListDefinition[];
  /** `numId` généré → référence `numbering`, lu sur `document.Numbering` après empaquetage. */
  readonly concreteNumbering: ReadonlyMap<string, string>;
  readonly variables: VariableSettings;
  readonly layout: DocumentLayout | undefined;
  /** Vrai avec `options.toc` : `w:updateFields` est posé dans `settings.xml`. */
  readonly toc: boolean;
  /** `options.title` / `options.creator`, réécrits dans `docProps/core.xml`. */
  readonly title?: string;
  readonly creator?: string;
  readonly codec: XmlCodec;
}

/** Partie principale que la lib `docx` écrit toujours. */
const GENERATED_MAIN_PART = 'word/document.xml';

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

/** Attributs de relation que le corps généré peut porter (liens, images). */
const RELATIONSHIP_ATTRIBUTES: ReadonlySet<string> = new Set(['id', 'embed', 'link']);

/** Référence de style du corps → type de style qu'elle impose. */
const STYLE_REFERENCES: ReadonlyArray<readonly [string, StyleType]> = [
  ['pStyle', 'paragraph'],
  ['rStyle', 'character'],
  ['tblStyle', 'table'],
];

/**
 * Greffe le corps de `generated` dans le gabarit et rend l'archive résultante. Lève sur
 * un gabarit sans partie principale (déjà validé par `openTemplate`) ou un document
 * généré illisible : l'appelant replie alors sur l'export neuf.
 */
export async function graftIntoTemplate(
  input: GraftInput,
  warnings: DocxExportWarning[],
): Promise<ArrayBuffer> {
  const { pkg, mainDoc, mainDeclaration } = input.template;
  const mainPart = pkg.mainPart;
  const template = await PartStore.open(input.template.buffer, input.codec);
  // La partie principale a déjà été parsée à l'ouverture du gabarit : on la réutilise.
  template.adopt(mainPart, mainDoc, mainDeclaration);
  const generated = await PartStore.open(input.generated, input.codec);
  const templateDoc = mainDoc;
  const generatedDoc = await generated.dom(GENERATED_MAIN_PART);
  const templateBody = childNamed(templateDoc.documentElement, 'body');
  const generatedBody = generatedDoc ? childNamed(generatedDoc.documentElement, 'body') : null;
  if (!templateBody) throw new Error(`gabarit : ${mainPart} sans w:body`);
  if (!generatedDoc || !generatedBody) throw new Error('corps généré illisible');

  // Variables des en-têtes et pieds (mode `resolve`) : avant toute autre écriture.
  await resolveHeaderFooterVariables({
    template,
    pkg,
    mainPart,
    settings: input.variables,
    codec: input.codec,
    warnings,
  });

  const relationships = await RelationshipTable.open(template, mainPart);
  const generatedRelationships = await RelationshipTable.open(generated, GENERATED_MAIN_PART);
  const styles = await createStyleMerger({
    template,
    generated,
    templatePath: input.template.stylesPath,
    resolver: input.template.resolver,
    warnings,
  });
  const numbering = await createNumberingMerger({
    template,
    generated,
    mainPart,
    templatePath: await pkg.related(mainPart, '/numbering'),
    relationships,
    lists: input.lists,
    concrete: input.concreteNumbering,
    warnings,
  });
  const footnotes = await createFootnoteMerger({
    template,
    generated,
    mainPart,
    templatePath: await pkg.related(mainPart, '/footnotes'),
    relationships,
  });
  const contentDefaults = new Map<string, string>();
  const media = new MediaCopier(template, generated, mainPart, contentDefaults);

  // 1. Le corps généré, sans son `w:sectPr` final.
  const blocks = Array.from(generatedBody.children).filter((child) => child.localName !== 'sectPr');

  // 2. Remappages sur les blocs générés (relations, numérotation, notes, styles).
  for (const block of blocks) {
    for (const element of [block, ...allNamed(block, '*')]) {
      await remapRelationships(element, generatedRelationships, relationships, media);
      if (element.localName === 'numId' && element.parentElement?.localName === 'numPr') {
        setWordAttr(element, 'val', await numbering.remap(wordAttr(element, 'val')));
      } else if (element.localName === 'footnoteReference') {
        setWordAttr(element, 'id', await footnotes.remap(wordAttr(element, 'id')));
      }
    }
  }
  const paragraphs = [
    ...blocks.flatMap((block) => (block.localName === 'p' ? [block] : allNamed(block, 'p'))),
    ...footnotes.imported().flatMap((note) => allNamed(note, 'p')),
  ];
  await remapStyles(blocks, footnotes.imported(), styles);
  for (const paragraph of paragraphs) styles.stripParagraph(paragraph);
  // Tableaux à style conditionnel (`w:tblStyle` + `w:tblLook`) : fond, gras et bordures que
  // le style du gabarit produit déjà ne sont pas écrits en direct (L49).
  stripConditionalTableProperties(blocks, input.template.resolver);

  // 3. Greffe section par section : les blocs remplacent ceux du gabarit, chaque `w:sectPr`
  //    est repris du gabarit ou régénéré, les en-têtes et pieds qui diffèrent sont recopiés.
  const overrides = new Map<string, string>();
  const grafted = await graftSections({
    templateBody,
    blocks,
    generatedBody,
    layout: input.layout,
    templateHeadersFooters:
      input.template.headers || input.template.footers
        ? { headers: input.template.headers, footers: input.template.footers }
        : undefined,
    templateSections: input.template.sections,
    headerFooter: {
      template,
      generated,
      mainPart,
      relationships,
      generatedRelationships,
      styles,
      media,
      overrides,
      warnings,
    },
  });
  copyNamespaceDeclarations(generatedDoc.documentElement, templateDoc.documentElement);
  await template.markChanged(mainPart);

  // 5. Réglages et propriétés que le corps greffé exige.
  await ensureSettings({
    template,
    pkg,
    mainPart,
    relationships,
    overrides,
    updateFields: input.toc,
    evenAndOddHeaders: grafted.even,
  });
  await writeCoreProperties({
    template,
    pkg,
    overrides,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.creator !== undefined ? { creator: input.creator } : {}),
  });

  // 6. Types de contenu des médias et des parties créées.
  for (const created of [numbering.createdPart(), footnotes.createdPart()]) {
    if (created) overrides.set(created.path, created.contentType);
  }
  await ensureContentTypes(template, { defaults: contentDefaults, overrides });

  return template.generate();
}

/**
 * Attributs `r:id` / `r:embed` / `r:link` d'un élément généré → relation du gabarit :
 * un lien externe réutilise une relation de même cible ou en reçoit une neuve, une image
 * passe par le copieur de médias. Une relation inconnue est laissée telle quelle.
 */
async function remapRelationships(
  element: Element,
  source: RelationshipTable,
  target: RelationshipTable,
  media: MediaCopier,
): Promise<void> {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.namespaceURI !== R_NS || !RELATIONSHIP_ATTRIBUTES.has(attribute.localName)) {
      continue;
    }
    const relationship = source.get(attribute.value);
    if (!relationship) continue;
    let id: string | null = null;
    if (relationship.external) {
      id = await target.ensure(relationship.type, relationship.target, true);
    } else if (relationship.type === REL_TYPE.image) {
      id = await media.copy(relationship.resolved, target);
    }
    if (id !== null) attribute.value = id;
  }
}

/**
 * Styles référencés par les blocs et les notes : réutilisés, ajoutés, laissés en place
 * (styles intégrés de Word) ou retirés avec avertissement. Chaque référence impose le
 * type du style (`w:pStyle` → paragraphe…) : un style d'un autre type est retiré.
 */
async function remapStyles(
  blocks: readonly Element[],
  notes: readonly Element[],
  styles: StyleMerger,
): Promise<void> {
  const references: Array<readonly [Element, StyleType]> = [];
  for (const root of [...blocks, ...notes]) {
    for (const [name, expected] of STYLE_REFERENCES) {
      if (root.localName === name) references.push([root, expected]);
      for (const reference of allNamed(root, name)) references.push([reference, expected]);
    }
  }
  for (const [reference, expected] of references) {
    const id = wordAttr(reference, 'val');
    if (!id) continue;
    const ensured = await styles.ensure(id, expected);
    if (ensured.status === 'missing') reference.remove();
    else if (ensured.id !== id) setWordAttr(reference, 'val', ensured.id);
  }
}

/**
 * Déclarations `xmlns:*` du document généré absentes de la racine du gabarit : les blocs
 * importés (dessins `wp:`, `a:`, `pic:`…) les trouvent ainsi en portée sans que le
 * sérialiseur ne les répète sur chaque élément.
 */
function copyNamespaceDeclarations(source: Element, target: Element): void {
  for (const attribute of Array.from(source.attributes)) {
    if (attribute.namespaceURI !== XMLNS_NS && !attribute.name.startsWith('xmlns:')) continue;
    if (target.hasAttribute(attribute.name)) continue;
    target.setAttributeNS(XMLNS_NS, attribute.name, attribute.value);
  }
}
