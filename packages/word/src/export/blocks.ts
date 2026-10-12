import type { FileChild, IParagraphOptions, Paragraph } from 'docx';
import type { ExportContext } from './context';
import { parseAlignment, parseStyle } from './css';
import { BLOCK_TAGS, childElements, hasBlockChild, isElement, isText, tagOf } from './dom';
import { inlineChildren, type InlineState } from './inline';
import { LIST_INDENT, STYLE_IDS, listKindFromType, numberingReference } from './styles';
import { convertTable } from './tables';

/** Position dans une liste : référence de numérotation, niveau et instance Word. */
export interface ListScope {
  readonly reference: string;
  readonly level: number;
  readonly instance: number;
}

/** Contexte structurel hérité par les blocs : citation, liste, marques initiales (en-tête de table). */
export interface BlockScope {
  readonly quote: boolean;
  readonly list: ListScope | null;
  readonly inline: InlineState;
}

/** Scope racine : ni citation, ni liste, aucune marque. */
export const ROOT_SCOPE: BlockScope = { quote: false, list: null, inline: {} };

type MutableParagraphOptions = { -readonly [K in keyof IParagraphOptions]: IParagraphOptions[K] };

/** `HeadingLevel` pour `h1`..`h6`, `undefined` pour tout autre tag. */
function headingLevel(tag: string, ctx: ExportContext): IParagraphOptions['heading'] | undefined {
  const { HeadingLevel } = ctx.docx;
  switch (tag) {
    case 'h1':
      return HeadingLevel.HEADING_1;
    case 'h2':
      return HeadingLevel.HEADING_2;
    case 'h3':
      return HeadingLevel.HEADING_3;
    case 'h4':
      return HeadingLevel.HEADING_4;
    case 'h5':
      return HeadingLevel.HEADING_5;
    case 'h6':
      return HeadingLevel.HEADING_6;
    default:
      return undefined;
  }
}

/**
 * Options de paragraphe communes : alignement lu sur `text-align`, style `Quote` dans
 * une citation, numérotation ou retrait dans une liste.
 */
function paragraphOptions(
  element: Element | null,
  scope: BlockScope,
  ctx: ExportContext,
  numbered: boolean,
): MutableParagraphOptions {
  const options: MutableParagraphOptions = {};
  const alignment = parseAlignment(
    parseStyle(element?.getAttribute('style') ?? null).get('text-align'),
  );
  if (alignment) options.alignment = alignment;
  if (scope.quote) options.style = STYLE_IDS.quote;
  if (scope.list) {
    if (numbered) {
      options.numbering = {
        reference: scope.list.reference,
        level: scope.list.level,
        instance: scope.list.instance,
      };
    } else {
      options.indent = { left: LIST_INDENT * (scope.list.level + 1) };
    }
  }
  return options;
}

/** Paragraphe de texte à partir d'une liste de nœuds inline. */
async function inlineParagraph(
  nodes: readonly Node[],
  element: Element | null,
  scope: BlockScope,
  ctx: ExportContext,
  numbered: boolean,
): Promise<Paragraph> {
  const options = paragraphOptions(element, scope, ctx, numbered);
  options.children = await inlineChildren(nodes, ctx, scope.inline);
  return new ctx.docx.Paragraph(options);
}

/** Titre `h1`..`h6`. Numéroté quand il ouvre un `li`, pour que la puce ne soit pas perdue. */
async function heading(
  element: Element,
  scope: BlockScope,
  ctx: ExportContext,
  numbered = false,
): Promise<Paragraph> {
  const options = paragraphOptions(element, scope, ctx, numbered);
  options.heading = headingLevel(tagOf(element), ctx);
  options.children = await inlineChildren(Array.from(element.childNodes), ctx, scope.inline);
  return new ctx.docx.Paragraph(options);
}

/**
 * `<pre>` : une ligne = un paragraphe de style `HTMLPreformatted` (Consolas), que
 * mammoth réassemble en un seul `<pre>` à l'import. Le saut de ligne final est ignoré.
 */
function preformatted(element: Element, scope: BlockScope, ctx: ExportContext): Paragraph[] {
  const { Paragraph, TextRun } = ctx.docx;
  const lines = (element.textContent ?? '').replace(/\n$/, '').split('\n');
  return lines.map(
    (line) =>
      new Paragraph({
        ...paragraphOptions(null, scope, ctx, false),
        style: STYLE_IDS.preformatted,
        children: line === '' ? [] : [new TextRun({ text: line })],
      }),
  );
}

/** `<hr>` : paragraphe vide à bordure basse, le rendu usuel du filet horizontal dans Word. */
function horizontalRule(ctx: ExportContext): Paragraph {
  const { BorderStyle, Paragraph } = ctx.docx;
  return new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A0A0A0', space: 1 } },
  });
}

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

/** `<ul>`/`<ol>` : chaque liste reçoit sa propre instance pour que la numérotation reparte à 1. */
async function list(element: Element, scope: BlockScope, ctx: ExportContext): Promise<FileChild[]> {
  const kind = tagOf(element) === 'ol' ? listKindFromType(element.getAttribute('type')) : 'bullet';
  const instance = ctx.nextListInstance;
  ctx.nextListInstance += 1;
  const listScope: BlockScope = {
    ...scope,
    list: {
      reference: numberingReference(kind),
      level: Math.min(scope.list ? scope.list.level + 1 : 0, 8),
      instance,
    },
  };
  const children: FileChild[] = [];
  for (const child of childElements(element)) {
    if (tagOf(child) === 'li') children.push(...(await listItem(child, listScope, ctx)));
    else children.push(...(await convertBlock(child, listScope, ctx)));
  }
  return children;
}

/** Vrai pour un commentaire ou un texte blanc, sans valeur en contexte de bloc. */
function isIgnorable(node: Node): boolean {
  if (node.nodeType === 8) return true;
  return isText(node) && node.data.trim() === '';
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
