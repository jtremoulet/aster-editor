import type { FileChild } from 'docx';
import {
  heading,
  headingLevel,
  horizontalRule,
  inlineParagraph,
  pageBreak,
  preformatted,
  type BlockScope,
} from './blocks-paragraph';
import { registerList, type ExportContext } from './context';
import {
  BLOCK_TAGS,
  PAGE_BREAK_ATTRIBUTE,
  SECTION_BREAK_ATTRIBUTE,
  XSD_INT_MAX,
  childElements,
  hasBlockChild,
  isElement,
  isText,
  positiveIntAttribute,
  tagOf,
} from './dom';
import { DOCX_NUM_ID_ATTRIBUTE, listKindFromType, type ListKind } from './styles';
import { convertTable } from './tables';

/**
 * Blocs HTML → enfants de section `docx` : listes, conteneurs, dispatch par balise et
 * regroupement des inline nus. Les paragraphes et le scope (`blocks-paragraph.ts`) sont
 * ré-exportés d'ici : l'API du module est celle d'avant le découpage (L45).
 */

export { ROOT_SCOPE, type BlockScope, type ListScope } from './blocks-paragraph';

/**
 * `<li>` : le premier paragraphe porte la numérotation, les suivants un simple retrait,
 * les sous-listes descendent d'un niveau. Un `li` sans bloc devient un paragraphe numéroté.
 */
async function listItem(
  item: Element,
  scope: BlockScope,
  ctx: ExportContext,
): Promise<FileChild[]> {
  const nodes = Array.from(item.childNodes);
  if (!hasBlockChild(item)) return [await inlineParagraph(nodes, item, scope, ctx, true)];
  const children: FileChild[] = [];
  let numbered = false;
  let bucket: Node[] = [];
  const flush = async (): Promise<void> => {
    if (bucket.some((node) => !isIgnorable(node))) {
      children.push(await inlineParagraph(bucket, null, scope, ctx, !numbered));
      numbered = true;
    }
    bucket = [];
  };
  for (const node of nodes) {
    if (!isElement(node, ...BLOCK_TAGS)) {
      bucket.push(node);
      continue;
    }
    await flush();
    const tag = tagOf(node);
    if (tag === 'p' || tag === 'div') {
      children.push(
        await inlineParagraph(Array.from(node.childNodes), node, scope, ctx, !numbered),
      );
      numbered = true;
    } else if (headingLevel(tag, ctx) !== undefined) {
      children.push(await heading(node, scope, ctx, !numbered));
      numbered = true;
    } else {
      children.push(...(await convertBlock(node, scope, ctx)));
      // Une sous-liste ne porte pas la puce du li : elle reste à poser sur le premier paragraphe suivant.
      if (tag !== 'ul' && tag !== 'ol') numbered = true;
    }
  }
  await flush();
  if (!numbered) children.unshift(await inlineParagraph([], null, scope, ctx, true));
  return children;
}

/** Format de niveau du gabarit (contrat du lecteur) attendu pour un `<ol type>` / `<ul>`. */
function expectedListFormat(kind: ListKind): string {
  switch (kind) {
    case 'bullet':
      return 'bullet';
    case 'lowerLetter':
      return 'a';
    case 'upperLetter':
      return 'A';
    case 'lowerRoman':
      return 'i';
    case 'upperRoman':
      return 'I';
    default:
      return '1';
  }
}

/**
 * Niveau d'une liste qui réutilise une numérotation du gabarit. La profondeur HTML donne
 * le niveau usuel ; mais une liste Word au niveau 1 sans parent est relue à plat, et son
 * format (`type`, `data-bullet`) ne correspond alors pas au niveau 0. On prend le premier
 * niveau de la définition dont le format (et la puce) correspond, sinon la profondeur.
 */
function templateListLevel(
  element: Element,
  templateNumId: string,
  kind: ListKind,
  depth: number,
  ctx: ExportContext,
): number {
  const definition = ctx.templateNumbering?.definition(templateNumId);
  if (!definition) return depth;
  const format = expectedListFormat(kind);
  const bullet = element.getAttribute('data-bullet');
  const matches = (level: { format: string; text: string }): boolean =>
    level.format === format && (format !== 'bullet' || bullet === null || level.text === bullet);
  const current = definition.levels.find((level) => level.level === depth);
  if (current && matches(current)) return depth;
  const alternative = definition.levels.find(matches);
  return alternative ? Math.min(alternative.level, 8) : depth;
}

/**
 * `<ul>`/`<ol>` : chaque liste, racine ou imbriquée, reçoit sa propre référence de
 * numérotation (donc son propre `abstractNum`) : la numérotation repart à 1 (ou au
 * `start` de l'`<ol>`) et deux sous-listes de même format ne partagent jamais leur compteur.
 */
async function list(element: Element, scope: BlockScope, ctx: ExportContext): Promise<FileChild[]> {
  const ordered = tagOf(element) === 'ol';
  const kind = ordered ? listKindFromType(element.getAttribute('type')) : 'bullet';
  let level = Math.min(scope.list ? scope.list.level + 1 : 0, 8);
  // `w:start` / `w:startOverride` sont des `ST_DecimalNumber` (xsd:int) : borné à 2^31 - 1.
  const start = ordered ? (positiveIntAttribute(element, 'start', XSD_INT_MAX) ?? 1) : 1;
  // `data-docx-num-id` : numérotation du gabarit à réutiliser (export dans le gabarit seulement).
  const templateNumId = element.getAttribute(DOCX_NUM_ID_ATTRIBUTE)?.trim() || undefined;
  if (templateNumId && ctx.template) {
    level = templateListLevel(element, templateNumId, kind, level, ctx);
  }
  const listScope: BlockScope = {
    ...scope,
    list: {
      reference: registerList(ctx, kind, level, start, ctx.template ? templateNumId : undefined),
      level,
    },
  };
  const children: FileChild[] = [];
  for (const child of childElements(element)) {
    if (tagOf(child) === 'li') children.push(...(await listItem(child, listScope, ctx)));
    else children.push(...(await convertBlock(child, listScope, ctx)));
  }
  return children;
}

/** Blancs au sens HTML : espace, tabulation, LF, CR, FF. NBSP et espaces Unicode sont du contenu. */
const HTML_BLANK = /^[ \t\n\r\f]*$/;

/** Vrai pour un commentaire ou un texte blanc (au sens HTML), sans valeur en contexte de bloc. */
function isIgnorable(node: Node): boolean {
  if (node.nodeType === 8) return true;
  return isText(node) && HTML_BLANK.test(node.data);
}

/**
 * Convertit un élément de bloc en enfants de section `docx`. Les conteneurs sans
 * sémantique Word (`div`, `section`…) sont traversés ; les inline nus rencontrés en
 * contexte de bloc sont regroupés en paragraphes.
 */
export async function convertBlock(
  element: Element,
  scope: BlockScope,
  ctx: ExportContext,
): Promise<FileChild[]> {
  const tag = tagOf(element);
  // `<div data-page-break>` / `<hr data-page-break>` : saut de page seul, le filet n'est pas rendu.
  if ((tag === 'div' || tag === 'hr') && element.hasAttribute(PAGE_BREAK_ATTRIBUTE)) {
    const rest = tag === 'div' ? await convertChildren(element, scope, ctx) : [];
    return [pageBreak(ctx), ...rest];
  }
  // Un saut de section hors du premier niveau (`sections.ts` découpe le corps) : rien à rendre.
  if (tag === 'hr' && element.hasAttribute(SECTION_BREAK_ATTRIBUTE)) return [];
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return [await heading(element, scope, ctx)];
    case 'p':
      return [await inlineParagraph(Array.from(element.childNodes), element, scope, ctx, false)];
    case 'ul':
    case 'ol':
      return list(element, scope, ctx);
    case 'li':
      return listItem(element, scope, ctx);
    case 'blockquote':
      return convertChildren(element, { ...scope, quote: true }, ctx);
    case 'pre':
      return preformatted(element, scope, ctx);
    case 'hr':
      return [horizontalRule(ctx)];
    case 'table':
      return [await convertTable(element, scope, ctx, convertChildren)];
    default:
      return convertChildren(element, scope, ctx);
  }
}

/**
 * Convertit les enfants d'un conteneur : les blocs sont délégués à `convertBlock`, les
 * suites d'inline nus deviennent des paragraphes. Point d'entrée du corps du document,
 * des citations et des cellules.
 */
export async function convertChildren(
  container: Element,
  scope: BlockScope,
  ctx: ExportContext,
): Promise<FileChild[]> {
  if (!hasBlockChild(container)) {
    const nodes = Array.from(container.childNodes);
    if (nodes.every(isIgnorable)) return [];
    return [await inlineParagraph(nodes, container, scope, ctx, false)];
  }
  const children: FileChild[] = [];
  let bucket: Node[] = [];
  const flush = async (): Promise<void> => {
    if (bucket.some((node) => !isIgnorable(node))) {
      children.push(await inlineParagraph(bucket, null, scope, ctx, false));
    }
    bucket = [];
  };
  for (const node of Array.from(container.childNodes)) {
    if (isElement(node, ...BLOCK_TAGS)) {
      await flush();
      children.push(...(await convertBlock(node, scope, ctx)));
    } else {
      bucket.push(node);
    }
  }
  await flush();
  return children;
}
