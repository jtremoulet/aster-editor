/**
 * Parseur Markdown (GFM) → HTML Aster.
 *
 * Parseur maison, ligne à ligne pour les blocs et à balayage pour l'inline, sans
 * dépendance. Il vise le sous-ensemble que `htmlToMarkdown` produit et que le schéma
 * Aster sait relire : titres, paragraphes, listes imbriquées et tâches, citations,
 * blocs de code, règles, tables, liens, images, gras, italique, barré, surligné, code.
 * Le HTML inline est refusé sauf une liste blanche (`<u>`, `<sub>`, `<sup>`, `<br>`,
 * `<span style>`), le reste est échappé : c'est le schéma qui filtre ensuite.
 */

const FENCE = /^(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const ENTITY = /^&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;
const AUTOLINK = /^<((?:https?|mailto):[^\s<>]+)>/;
const RAW_TAG = /^<(\/?)(u|sub|sup)>|^<br\s*\/?>|^<span style="([^"<>]*)">|^<\/span>/;
const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
/** Variable `{{nom}}` (même motif que `isValidVariableName`) : rendue en texte, jamais en puce. */
const VARIABLE = /^\{\{[\p{L}\p{N}_][\p{L}\p{N}_.-]*\}\}/u;

/** Échappe le texte pour l'inclure dans du HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim().length === 0;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

// --- Inline -----------------------------------------------------------------

/** Cherche `delimiter` à partir de `from`, hors code inline ; `-1` si absent. */
function findDelimiter(src: string, from: number, delimiter: string): number {
  let i = from;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === '`') {
      const close = src.indexOf('`', i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (src.startsWith(delimiter, i)) return i;
    i += 1;
  }
  return -1;
}

/** Position de la prochaine suite d'exactement `length` accents graves, `-1` sinon. */
function findBacktickRun(src: string, from: number, length: number): number {
  let i = from;
  while (i < src.length) {
    if (src[i] !== '`') {
      i += 1;
      continue;
    }
    let run = 0;
    while (src[i + run] === '`') run += 1;
    if (run === length) return i;
    i += run;
  }
  return -1;
}

/** Parse une destination `(url "titre")` à partir de `from` (sur la parenthèse). */
function parseDestination(
  src: string,
  from: number,
): { href: string; title: string | null; end: number } | null {
  if (src[from] !== '(') return null;
  let i = from + 1;
  while (src[i] === ' ') i += 1;
  let href = '';
  if (src[i] === '<') {
    const close = src.indexOf('>', i);
    if (close === -1) return null;
    href = src.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    while (i < src.length) {
      const char = src[i] ?? '';
      if (char === '\\' && i + 1 < src.length) {
        href += src[i + 1];
        i += 2;
        continue;
      }
      if (char === '(') depth += 1;
      if (char === ')') {
        if (depth === 0) break;
        depth -= 1;
      }
      if (char === ' ' || char === '\n') break;
      href += char;
      i += 1;
    }
  }
  while (src[i] === ' ') i += 1;
  let title: string | null = null;
  const quote = src[i];
  if (quote === '"' || quote === "'") {
    let j = i + 1;
    let value = '';
    while (j < src.length && src[j] !== quote) {
      if (src[j] === '\\' && j + 1 < src.length) {
        value += src[j + 1];
        j += 2;
        continue;
      }
      value += src[j];
      j += 1;
    }
    if (src[j] !== quote) return null;
    title = value;
    i = j + 1;
    while (src[i] === ' ') i += 1;
  }
  if (src[i] !== ')') return null;
  return { href, title, end: i + 1 };
}

/** Trouve le `]` fermant une étiquette ouverte en `open` (crochets imbriqués gérés). */
function findLabelEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const char = src[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function attribute(name: string, value: string | null): string {
  return value === null ? '' : ` ${name}="${escapeHtml(value)}"`;
}

/** Tente une marque délimitée (`**`, `*`, `~~`, `==`…) ; `null` si pas de fermeture valable. */
function tryDelimited(
  src: string,
  i: number,
  delimiter: string,
  tag: string,
): { html: string; end: number } | null {
  if (!src.startsWith(delimiter, i)) return null;
  const start = i + delimiter.length;
  const next = src[start];
  if (next === undefined || next === ' ' || next === '\n') return null;
  const close = findDelimiter(src, start, delimiter);
  if (close === -1 || close === start) return null;
  const before = src[close - 1];
  if (before === ' ' || before === '\n') return null;
  return {
    html: `<${tag}>${parseInline(src.slice(start, close))}</${tag}>`,
    end: close + delimiter.length,
  };
}

/** Convertit une chaîne Markdown inline en HTML. */
export function parseInline(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const char = src[i] ?? '';
    const next = src[i + 1];

    if (char === '\\' && next !== undefined && PUNCTUATION.test(next)) {
      out += escapeHtml(next);
      i += 2;
      continue;
    }
    if (char === '\n') {
      out += ' ';
      i += 1;
      continue;
    }
    if (char === '{' && next === '{') {
      // Un `_` dans le nom ne doit pas ouvrir une emphase : on copie la variable d'un bloc.
      const variable = VARIABLE.exec(src.slice(i));
      if (variable) {
        out += variable[0];
        i += variable[0].length;
        continue;
      }
    }
    if (char === '`') {
      let fence = '';
      while (src[i + fence.length] === '`') fence += '`';
      const close = findBacktickRun(src, i + fence.length, fence.length);
      if (close !== -1) {
        let code = src.slice(i + fence.length, close);
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim().length > 0) {
          code = code.slice(1, -1);
        }
        out += `<code>${escapeHtml(code)}</code>`;
        i = close + fence.length;
        continue;
      }
      out += fence;
      i += fence.length;
      continue;
    }
    if (char === '!' && next === '[') {
      const end = findLabelEnd(src, i + 1);
      const destination = end === -1 ? null : parseDestination(src, end + 1);
      if (destination) {
        const alt = src.slice(i + 2, end).replace(/\\([[\]])/g, '$1');
        out += `<img${attribute('src', destination.href)}${attribute('alt', alt)}${attribute('title', destination.title)}>`;
        i = destination.end;
        continue;
      }
    }
    if (char === '[') {
      const end = findLabelEnd(src, i);
      const destination = end === -1 ? null : parseDestination(src, end + 1);
      if (destination) {
        out += `<a${attribute('href', destination.href)}${attribute('title', destination.title)}>${parseInline(src.slice(i + 1, end))}</a>`;
        i = destination.end;
        continue;
      }
    }
    const delimited =
      tryDelimited(src, i, '**', 'strong') ??
      tryDelimited(src, i, '__', 'strong') ??
      tryDelimited(src, i, '~~', 's') ??
      tryDelimited(src, i, '==', 'mark') ??
      tryDelimited(src, i, '*', 'em') ??
      (i === 0 || !/\w/.test(src[i - 1] ?? '') ? tryDelimited(src, i, '_', 'em') : null);
    if (delimited) {
      out += delimited.html;
      i = delimited.end;
      continue;
    }
    if (char === '<') {
      const autolink = AUTOLINK.exec(src.slice(i));
      if (autolink?.[1]) {
        out += `<a href="${escapeHtml(autolink[1])}">${escapeHtml(autolink[1])}</a>`;
        i += autolink[0].length;
        continue;
      }
      const raw = RAW_TAG.exec(src.slice(i));
      if (raw) {
        out += raw[0].replace(/^<br\s*\/?>$/, '<br>');
        i += raw[0].length;
        continue;
      }
    }
    if (char === '&') {
      const entity = ENTITY.exec(src.slice(i));
      if (entity) {
        out += entity[0];
        i += entity[0].length;
        continue;
      }
    }
    out += escapeHtml(char);
    i += 1;
  }
  return out;
}

const LONE_IMAGE = /^<img [^>]*>$/;

/**
 * Paragraphe : sauts de ligne forcés (deux espaces ou `\` en fin de ligne) → `<br>`,
 * sauts souples → espace. Une image seule sur son paragraphe est rendue nue : c'est un
 * bloc dans le schéma Aster, l'envelopper créerait un paragraphe vide à la relecture.
 */
function parseParagraph(lines: readonly string[]): string {
  let html = '';
  let hardBreak = false;
  lines.forEach((original, index) => {
    const last = index === lines.length - 1;
    const line = original.trim();
    if (html.length > 0) html += hardBreak ? '' : ' ';
    if (!last && original.endsWith('  ')) {
      html += `${parseInline(line)}<br>`;
      hardBreak = true;
    } else if (!last && line.endsWith('\\')) {
      html += `${parseInline(line.slice(0, -1))}<br>`;
      hardBreak = true;
    } else {
      html += parseInline(line);
      hardBreak = false;
    }
  });
  return LONE_IMAGE.test(html) ? html : `<p>${html}</p>`;
}

// --- Blocs -------------------------------------------------------------------

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (char === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (char === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseTable(lines: readonly string[]): string {
  const [headerLine = '', , ...bodyLines] = lines;
  const header = splitRow(headerLine);
  const cell = (tag: 'th' | 'td', content: string): string =>
    `<${tag}><p>${parseInline(content)}</p></${tag}>`;
  const row = (tag: 'th' | 'td', cells: string[]): string =>
    `<tr>${header.map((_, index) => cell(tag, cells[index] ?? '')).join('')}</tr>`;
  const body = bodyLines.map((line) => row('td', splitRow(line))).join('');
  return `<table><tbody>${row('th', header)}${body}</tbody></table>`;
}

interface ListItem {
  readonly marker: string;
  readonly lines: string[];
}

/** Regroupe les lignes d'une liste en items (ligne de marqueur + continuations indentées). */
function collectList(lines: readonly string[], from: number): { items: ListItem[]; end: number } {
  const items: ListItem[] = [];
  const first = LIST_ITEM.exec(lines[from] ?? '');
  const baseIndent = first ? first[1]!.length : 0;
  const ordered = first ? /\d/.test(first[2]!) : false;
  let i = from;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const match = LIST_ITEM.exec(line);
    if (match && match[1]!.length === baseIndent && /\d/.test(match[2]!) === ordered) {
      const contentIndent = baseIndent + match[2]!.length + 1;
      const item: ListItem = { marker: match[2]!, lines: [match[3] ?? ''] };
      i += 1;
      while (i < lines.length) {
        const continuation = lines[i] ?? '';
        if (isBlank(continuation)) {
          const after = lines[i + 1];
          if (after !== undefined && !isBlank(after) && indentOf(after) >= contentIndent) {
            item.lines.push('');
            i += 1;
            continue;
          }
          break;
        }
        if (indentOf(continuation) < contentIndent) break;
        item.lines.push(continuation.slice(contentIndent));
        i += 1;
      }
      items.push(item);
      continue;
    }
    if (isBlank(line) && LIST_ITEM.test(lines[i + 1] ?? '')) {
      i += 1;
      continue;
    }
    break;
  }
  return { items, end: i };
}

function renderList(items: readonly ListItem[]): string {
  const ordered = /\d/.test(items[0]?.marker ?? '');
  const isTask = items.every((item) => TASK.test(item.lines[0] ?? ''));
  const rendered = items
    .map((item) => {
      const lines = [...item.lines];
      let attrs = '';
      if (isTask) {
        const task = TASK.exec(lines[0] ?? '');
        lines[0] = task?.[2] ?? '';
        attrs = ` data-type="taskItem" data-checked="${task?.[1]?.toLowerCase() === 'x' ? 'true' : 'false'}"`;
      }
      return `<li${attrs}>${parseBlocks(lines) || '<p></p>'}</li>`;
    })
    .join('');
  if (ordered) {
    const start = Number.parseInt(items[0]?.marker ?? '1', 10);
    return `<ol${start > 1 ? ` start="${start}"` : ''}>${rendered}</ol>`;
  }
  return `<ul${isTask ? ' data-type="taskList"' : ''}>${rendered}</ul>`;
}

/** Convertit une suite de lignes Markdown en HTML de blocs. */
function parseBlocks(lines: readonly string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const trimmed = line.trim();

    const fence = FENCE.exec(trimmed);
    if (fence?.[1]) {
      const marker = fence[1];
      const language = fence[2] ?? '';
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(marker)) {
        code.push(lines[i] ?? '');
        i += 1;
      }
      i += 1;
      const classAttr = language ? ` class="language-${escapeHtml(language)}"` : '';
      out.push(`<pre><code${classAttr}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading?.[1]) {
      out.push(`<h${heading[1].length}>${parseInline(heading[2] ?? '')}</h${heading[1].length}>`);
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoted: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        quoted.push((lines[i] ?? '').trim().replace(/^> ?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${parseBlocks(quoted)}</blockquote>`);
      continue;
    }

    if (trimmed.includes('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      const rows: string[] = [line, lines[i + 1] ?? ''];
      i += 2;
      while (i < lines.length && !isBlank(lines[i]) && (lines[i] ?? '').includes('|')) {
        rows.push(lines[i] ?? '');
        i += 1;
      }
      out.push(parseTable(rows));
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const { items, end } = collectList(lines, i);
      out.push(renderList(items));
      i = end;
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (isBlank(current)) break;
      const currentTrimmed = current.trim();
      if (
        paragraph.length > 0 &&
        (FENCE.test(currentTrimmed) ||
          HEADING.test(currentTrimmed) ||
          HR.test(current) ||
          currentTrimmed.startsWith('>') ||
          LIST_ITEM.test(current))
      ) {
        break;
      }
      paragraph.push(current);
      i += 1;
    }
    out.push(parseParagraph(paragraph));
  }
  return out.join('');
}

/**
 * Convertit du Markdown GFM en HTML prêt pour `setHTML`. Le HTML produit suit les
 * conventions de Tiptap (`<li><p>…</p></li>`, cellules avec `<p>`, tâches en
 * `data-type="taskItem"`), pour que `getHTML()` après chargement soit stable.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return parseBlocks(lines);
}
