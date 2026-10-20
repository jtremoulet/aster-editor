import type { DocumentLayout } from '@aster-editor/core';
import type { ListDefinition, VariableSettings } from '../../export/context';
import type { DocxExportWarning } from '../../export/types';
import { allNamed, childNamed, childrenNamed } from '../preprocess/xml-utils';
import { ensureContentTypes } from './content-types';
import { writeCoreProperties } from './core-properties';
import { createFootnoteMerger } from './footnotes-merge';
import { graftHeadersFooters } from './header-footer-graft';
import { resolveHeaderFooterVariables } from './header-footer-variables';
import { MediaCopier } from './media';
import { createNumberingMerger } from './numbering-merge';
import { REL_TYPE, RelationshipTable } from './relationships';
import { ensureSettings } from './settings-merge';
import { createStyleMerger, type StyleMerger, type StyleType } from './styles-merge';
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
 * pieds, marges, colonnes) est conservé ; un corps régénéré n'a plus de sections
 * intermédiaires : seules les propriétés de la **dernière** section survivent, complétées
 * des en-têtes et pieds que les sections précédentes lui transmettaient par héritage.
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

/** Éléments du `w:sectPr` qui doivent précéder tout le reste (ordre du schéma). */
const SECTION_REFERENCES = ['headerReference', 'footerReference'] as const;

/** Enfants du `w:sectPr` placés après `w:titlePg` dans l'ordre du schéma. */
const AFTER_TITLE_PAGE: ReadonlySet<string> = new Set([
  'textDirection',
  'bidi',
  'rtlGutter',
  'docGrid',
  'printerSettings',
  'sectPrChange',
]);

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

  // 3. Greffe : les blocs remplacent ceux du gabarit, devant son `w:sectPr` final complété.
  const sectPr = inheritedSectionProperties(templateBody);
  for (const child of Array.from(templateBody.childNodes)) templateBody.removeChild(child);
  for (const block of blocks) templateBody.appendChild(templateDoc.importNode(block, true));
  if (sectPr) templateBody.appendChild(sectPr);
  copyNamespaceDeclarations(generatedDoc.documentElement, templateDoc.documentElement);
  await template.markChanged(mainPart);

  // 4. En-têtes et pieds régénérés depuis `layout` quand ils diffèrent du gabarit.
  const overrides = new Map<string, string>();
  const grafted = await graftHeadersFooters({
    template,
    generated,
    mainPart,
    sectPr,
    generatedSectPr: childNamed(generatedBody, 'sectPr'),
    relationships,
    generatedRelationships,
    styles,
    media,
    layout: input.layout,
    templateHeaders: input.template.headers,
    templateFooters: input.template.footers,
    overrides,
    warnings,
  });

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
 * `w:sectPr` final du gabarit, complété des références d'en-tête et de pied (et de
 * `w:titlePg`) que les sections précédentes lui transmettaient : Word fait hériter chaque
 * section de la précédente, et le corps régénéré ne garde que la dernière. `null` si le
 * gabarit n'a aucun `w:sectPr` final.
 */
function inheritedSectionProperties(body: Element): Element | null {
  const last = childNamed(body, 'sectPr');
  if (!last) return null;
  const inherited = new Map<string, Element>();
  let titlePage: Element | null = null;
  for (const paragraph of childrenNamed(body, 'p')) {
    const pPr = childNamed(paragraph, 'pPr');
    const sectPr = pPr ? childNamed(pPr, 'sectPr') : null;
    if (!sectPr) continue;
    for (const child of Array.from(sectPr.children)) {
      if (child.localName === 'headerReference' || child.localName === 'footerReference') {
        inherited.set(`${child.localName}:${wordAttr(child, 'type') || 'default'}`, child);
      } else if (child.localName === 'titlePg') {
        titlePage = child;
      }
    }
  }
  const own = new Set<string>();
  for (const child of Array.from(last.children)) {
    if (child.localName === 'headerReference' || child.localName === 'footerReference') {
      own.add(`${child.localName}:${wordAttr(child, 'type') || 'default'}`);
    }
  }
  // Les références manquantes sont insérées en tête, en-têtes avant pieds (ordre du schéma).
  for (const name of [...SECTION_REFERENCES].reverse()) {
    for (const [key, element] of Array.from(inherited).reverse()) {
      if (!key.startsWith(`${name}:`) || own.has(key)) continue;
      last.insertBefore(element.cloneNode(true), last.firstChild);
    }
  }
  if (titlePage && !childNamed(last, 'titlePg')) {
    const after = Array.from(last.children).find((child) => AFTER_TITLE_PAGE.has(child.localName));
    last.insertBefore(titlePage.cloneNode(true), after ?? null);
  }
  return last;
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
