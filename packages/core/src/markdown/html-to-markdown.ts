/**
 * Sérialisation HTML Aster → Markdown (GFM).
 *
 * Travaille sur le DOM (`<template>` ou parseur fourni) et non sur le texte : le HTML
 * produit par `getHTML()` est régulier, mais passer par le DOM évite de dépendre de
 * l'ordre des attributs ou des espaces entre balises. Ce que Markdown ne sait pas
 * représenter (souligné, indice, exposant, couleurs) est conservé en HTML inline, que
 * `markdownToHtml` laisse passer à la relecture.
 */

/** Parseur HTML → nœud parent, injectable pour un environnement sans `document`. */
export type HtmlParser = (html: string) => ParentNode;

/** Balises inline conservées telles quelles faute d'équivalent Markdown. */
const RAW_INLINE_TAGS: ReadonlySet<string> = new Set(['u', 'sub', 'sup']);

/** Balises traitées comme des blocs : une ligne à elles, séparées par une ligne vide. */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'img',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'div',
  'label',
  'section',
  'article',
  'figure',
]);

/** Ponctuation échappée dans le texte brut pour ne pas être relue comme de la syntaxe. */
const ESCAPED_CHARS = /[\\`*_[\]<>~]/g;

/** Débuts de ligne qui seraient relus comme un bloc : titre, liste, citation, règle, fence, table. */
const BLOCK_START = /^(#{1,6}\s|[-+*]\s|\d+[.)]\s|>|```|---|\|)/;

/** Parseur par défaut : un `<template>` du document courant. */
function defaultParser(html: string): ParentNode {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isText(node: Node): node is Text {
  return node.nodeType === 3;
}

function tagOf(node: Element): string {
  return node.tagName.toLowerCase();
}

/** Échappe le texte brut pour qu'il ne soit pas interprété comme de la syntaxe Markdown. */
function escapeText(text: string): string {
  return text.replace(ESCAPED_CHARS, (char) => `\\${char}`).replace(/==/g, '\\=\\=');
}

/** Échappe un début de bloc ambigu (`# x` dans un paragraphe, `- x`…). */
function escapeBlockStart(text: string): string {
  return BLOCK_START.test(text) ? `\\${text}` : text;
}

/** Entoure un code inline d'autant d'accents graves qu'il faut pour ne pas le refermer trop tôt. */
function codeSpan(code: string): string {
  let fence = '`';
  while (code.includes(fence)) fence += '`';
  const padded = code.startsWith('`') || code.endsWith('`') ? ` ${code} ` : code;
  return `${fence}${padded}${fence}`;
}

/** Titre optionnel d'un lien ou d'une image : ` "titre"`. */
function titleSuffix(title: string | null): string {
  return title ? ` "${title.replace(/"/g, '\\"')}"` : '';
}

function serializeImage(element: Element): string {
  const alt = (element.getAttribute('alt') ?? '').replace(/[[\]]/g, '\\$&');
  const src = element.getAttribute('src') ?? '';
  return `![${alt}](${src}${titleSuffix(element.getAttribute('title'))})`;
}

/** Sérialise un nœud inline (texte ou marque). */
function serializeInlineNode(node: Node): string {
  if (isText(node)) return escapeText(node.data);
  if (!isElement(node)) return '';
  const tag = tagOf(node);
  switch (tag) {
    case 'strong':
    case 'b':
      return `**${serializeInline(node)}**`;
    case 'em':
    case 'i':
      return `*${serializeInline(node)}*`;
    case 's':
    case 'del':
    case 'strike':
      return `~~${serializeInline(node)}~~`;
    case 'mark':
      return `==${serializeInline(node)}==`;
    case 'code':
      return codeSpan(node.textContent ?? '');
    case 'a': {
      const href = node.getAttribute('href') ?? '';
      return `[${serializeInline(node)}](${href}${titleSuffix(node.getAttribute('title'))})`;
    }
    case 'img':
      return serializeImage(node);
    case 'br':
      return '  \n';
    case 'span': {
      // Puce de variable : la syntaxe canonique, sans échappement (le nom n'en a pas besoin).
      const variable = node.getAttribute('data-aster-variable');
      if (variable !== null) return `{{${variable}}}`;
      const style = node.getAttribute('style');
      return style
        ? `<span style="${style.replace(/"/g, '&quot;')}">${serializeInline(node)}</span>`
        : serializeInline(node);
    }
    default:
      return RAW_INLINE_TAGS.has(tag)
        ? `<${tag}>${serializeInline(node)}</${tag}>`
        : serializeInline(node);
  }
}

/** Sérialise les enfants inline d'un élément. */
function serializeInline(parent: Node): string {
  return Array.from(parent.childNodes).map(serializeInlineNode).join('');
}

/** Préfixe chaque ligne d'un bloc (`> ` pour les citations, indentation des listes). */
function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split('\n')
    .map((line, index) => (index === 0 ? first : rest) + line)
    .join('\n');
}

/** Contenu d'une cellule de table : inline sur une ligne, `|` échappé, `<br>` conservé. */
function serializeCell(cell: Element): string {
  const parts = Array.from(cell.childNodes)
    .map((node) =>
      isElement(node) && BLOCK_TAGS.has(tagOf(node))
        ? serializeInline(node)
        : serializeInlineNode(node),
    )
    .map((text) => text.trim())
    .filter((text) => text.length > 0);
  return parts
    .join('<br>')
    .replace(/ {2}\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function serializeTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    (row) => row.closest('table') === table,
  );
  const cellsOf = (row: Element): string[] =>
    Array.from(row.children)
      .filter((cell) => tagOf(cell) === 'td' || tagOf(cell) === 'th')
      .map(serializeCell);
  const [header, ...body] = rows.map(cellsOf);
  if (!header) return '';
  const width = Math.max(header.length, ...body.map((row) => row.length));
  const pad = (row: string[]): string[] => [
    ...row,
    ...Array<string>(Math.max(0, width - row.length)).fill(''),
  ];
  const line = (row: string[]): string => `| ${pad(row).join(' | ')} |`;
  const separator = `| ${Array<string>(width).fill('---').join(' | ')} |`;
  return [line(header), separator, ...body.map(line)].join('\n');
}

function serializeList(list: Element, tag: 'ul' | 'ol'): string {
  const isTaskList = list.getAttribute('data-type') === 'taskList';
  const start = Number.parseInt(list.getAttribute('start') ?? '1', 10) || 1;
  const items: string[] = [];
  let index = start;
  for (const item of Array.from(list.children)) {
    if (tagOf(item) !== 'li') continue;
    let marker = tag === 'ol' ? `${index}. ` : '- ';
    if (isTaskList || item.getAttribute('data-type') === 'taskItem') {
      marker += item.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ';
    }
    const content = serializeBlocks(item) ?? '';
    items.push(prefixLines(content, marker, ' '.repeat(marker.length)));
    index += 1;
  }
  return items.join('\n');
}

function serializeCodeBlock(pre: Element): string {
  const code = pre.querySelector('code');
  const language = /language-([\w-]+)/.exec(code?.getAttribute('class') ?? '')?.[1] ?? '';
  const text = (code ?? pre).textContent ?? '';
  let fence = '```';
  while (text.includes(fence)) fence += '`';
  return `${fence}${language}\n${text.replace(/\n$/, '')}\n${fence}`;
}

/** Sérialise un élément de bloc ; `null` s'il n'a rien produit (paragraphe vide…). */
function serializeBlock(element: Element): string | null {
  const tag = tagOf(element);
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag.charAt(1));
      const text = serializeInline(element).trim();
      return text ? `${'#'.repeat(level)} ${text}` : null;
    }
    case 'p': {
      const text = serializeInline(element).trim();
      return text ? escapeBlockStart(text) : null;
    }
    case 'ul':
    case 'ol':
      return serializeList(element, tag);
    case 'blockquote': {
      const inner = serializeBlocks(element);
      return inner === null ? null : prefixLines(inner, '> ', '> ');
    }
    case 'pre':
      return serializeCodeBlock(element);
    case 'hr':
      return '---';
    case 'img':
      return serializeImage(element);
    case 'table':
      return serializeTable(element);
    case 'label':
      // Case à cocher d'une tâche Tiptap : déjà traduite par le marqueur `[x]`.
      return null;
    default:
      // Conteneurs (`div` d'une tâche, `li`, `tbody`…) : on descend dans les enfants.
      return serializeBlocks(element);
  }
}

/** Sérialise les blocs enfants d'un parent, séparés par une ligne vide. */
function serializeBlocks(parent: ParentNode): string | null {
  const blocks: string[] = [];
  let inlineBuffer = '';
  const flushInline = (): void => {
    const text = inlineBuffer.trim();
    if (text) blocks.push(escapeBlockStart(text));
    inlineBuffer = '';
  };
  for (const node of Array.from(parent.childNodes)) {
    if (isElement(node) && BLOCK_TAGS.has(tagOf(node))) {
      flushInline();
      const block = serializeBlock(node);
      if (block) blocks.push(block);
    } else {
      inlineBuffer += serializeInlineNode(node);
    }
  }
  flushInline();
  return blocks.length > 0 ? blocks.join('\n\n') : null;
}

/**
 * Convertit du HTML Aster en Markdown GFM : titres, paragraphes, gras/italique/barré/
 * surligné/code, listes imbriquées et tâches, liens, images, citations, blocs de code,
 * règles et tables. Les paragraphes vides sont ignorés ; l'alignement, la cible des
 * liens et la largeur d'image n'ont pas d'équivalent et sont perdus. `parse` remplace
 * le `<template>` du document courant si besoin.
 */
export function htmlToMarkdown(html: string, parse: HtmlParser = defaultParser): string {
  const markdown = serializeBlocks(parse(html)) ?? '';
  // Les lignes vides héritées d'un préfixe de liste ou de citation sont nettoyées.
  return markdown.replace(/^[ \t>]+$/gm, (line) => line.replace(/\s+$/, ''));
}
