import { childNamed, childrenNamed, wordAttribute } from '../preprocess/xml-utils';
import { escapeAttr } from './html';
import type {
  Block,
  ConverterContext,
  DocxPackage,
  ListDefinition,
  ListFormat,
  ListLevel,
  NumberingResolver,
  ParagraphBlock,
} from './types';
import { numericAttribute, twipsToPt } from './units-blocks';

/**
 * Listes : résolution de `numbering.xml` (`w:abstractNum` → niveaux, `w:num` →
 * `abstractNumId` + `w:lvlOverride`) et regroupement des paragraphes numérotés en
 * `<ol type start data-docx-num-id>` / `<ul data-bullet data-docx-num-id>` imbriqués
 * selon le niveau, chaque `<li>` contenant le `<p>` du paragraphe.
 */

const FORMATS: ReadonlyMap<string, ListFormat> = new Map([
  ['bullet', 'bullet'],
  ['decimal', '1'],
  ['lowerLetter', 'a'],
  ['upperLetter', 'A'],
  ['lowerRoman', 'i'],
  ['upperRoman', 'I'],
  ['none', 'none'],
]);

/**
 * Puces des polices symboliques (Symbol, Wingdings) : Word stocke un caractère de la zone
 * privée Unicode, illisible hors de la police. Les plus courantes sont ramenées à leur
 * équivalent, les autres à `•`.
 */
const SYMBOL_BULLETS: ReadonlyMap<string, string> = new Map([
  ['', '•'],
  ['', '▪'],
  ['', '◦'],
  ['', '➢'],
  ['', '✓'],
  ['', '❖'],
  ['', '–'],
  ['', '■'],
  ['', '□'],
  ['', '•'],
  ['', '●'],
]);

const PRIVATE_USE = /[-]/g;

/** Format de numérotation du contrat ; les formats non mappés (`decimalZero`, `ordinal`…) deviennent `1`. */
export function listFormatOf(numFmt: string): ListFormat {
  return FORMATS.get(numFmt) ?? '1';
}

/** Texte de puce lisible : caractères de polices symboliques remplacés. */
export function normalizeBullet(text: string): string {
  return text.replace(PRIVATE_USE, (char) => SYMBOL_BULLETS.get(char) ?? '•');
}

function readLevel(lvl: Element): ListLevel {
  const level = numericAttribute(lvl, 'ilvl') ?? 0;
  const numFmt = childNamed(lvl, 'numFmt');
  const format = listFormatOf(numFmt ? wordAttribute(numFmt, 'val') : '');
  const lvlText = childNamed(lvl, 'lvlText');
  const rawText = lvlText ? wordAttribute(lvlText, 'val') : '';
  const pPr = childNamed(lvl, 'pPr');
  const ind = pPr ? childNamed(pPr, 'ind') : null;
  const left = numericAttribute(ind, 'left') ?? numericAttribute(ind, 'start');
  const hanging = numericAttribute(ind, 'hanging');
  const result: { -readonly [K in keyof ListLevel]: ListLevel[K] } = {
    level,
    format,
    text: format === 'bullet' ? normalizeBullet(rawText) : rawText,
    start: numericAttribute(childNamed(lvl, 'start'), 'val') ?? 1,
  };
  if (left !== undefined) result.indentLeftPt = twipsToPt(left);
  if (hanging !== undefined) result.hangingPt = twipsToPt(hanging);
  return result;
}

/**
 * Crée le résolveur de numérotation. Signature figée : lit `numbering.xml` via
 * `pkg.related(pkg.mainPart, '/numbering')`. Les `w:abstractNum` liés à un style
 * (`w:numStyleLink`) sans niveaux propres donnent une définition vide.
 */
export async function createNumberingResolver(pkg: DocxPackage): Promise<NumberingResolver> {
  const path = await pkg.related(pkg.mainPart, '/numbering');
  const doc = path ? await pkg.part(path) : null;
  if (!doc) return { definition: () => null };

  const abstracts = new Map<string, readonly ListLevel[]>();
  for (const abstractNum of childrenNamed(doc.documentElement, 'abstractNum')) {
    const id = wordAttribute(abstractNum, 'abstractNumId');
    if (!id) continue;
    const levels = childrenNamed(abstractNum, 'lvl')
      .map(readLevel)
      .sort((a, b) => a.level - b.level);
    abstracts.set(id, levels);
  }
  const nums = new Map<string, Element>();
  for (const num of childrenNamed(doc.documentElement, 'num')) {
    const id = wordAttribute(num, 'numId');
    if (id) nums.set(id, num);
  }
  const cache = new Map<string, ListDefinition | null>();

  const resolve = (numId: string): ListDefinition | null => {
    const num = nums.get(numId);
    if (!num) return null;
    const abstractId = childNamed(num, 'abstractNumId');
    const base = abstractId ? abstracts.get(wordAttribute(abstractId, 'val')) : undefined;
    if (!base) return null;
    const levels = new Map<number, ListLevel>(base.map((level) => [level.level, level]));
    for (const override of childrenNamed(num, 'lvlOverride')) {
      const level = numericAttribute(override, 'ilvl');
      if (level === undefined) continue;
      const replacement = childNamed(override, 'lvl');
      if (replacement) levels.set(level, { ...readLevel(replacement), level });
      const start = numericAttribute(childNamed(override, 'startOverride'), 'val');
      const current = levels.get(level);
      if (start !== undefined && current) levels.set(level, { ...current, start });
    }
    return {
      numId,
      levels: Array.from(levels.values()).sort((a, b) => a.level - b.level),
    };
  };

  return {
    definition(numId) {
      let definition = cache.get(numId);
      if (definition === undefined) {
        definition = resolve(numId);
        cache.set(numId, definition);
      }
      return definition;
    },
  };
}

const VOID_TAGS: ReadonlySet<string> = new Set(['br', 'img', 'hr', 'wbr', 'input']);
const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g;

/** Nombre d'éléments de premier niveau d'un fragment HTML (`<hr><p>…</p>` → 2). */
export function topLevelElementCount(html: string): number {
  let depth = 0;
  let count = 0;
  for (const match of html.matchAll(TAG_PATTERN)) {
    const closing = match[1] === '/';
    const name = (match[2] ?? '').toLowerCase();
    const selfClosing = match[3] === '/' || VOID_TAGS.has(name);
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) count += 1;
    if (!selfClosing) depth += 1;
  }
  return count;
}

const FIRST_TAG_STYLE = /^<[a-zA-Z][a-zA-Z0-9]*\b[^>]*?\bstyle="([^"]*)"/;
const MARGIN_LEFT = /(?:^|;)\s*margin-left:\s*(-?\d+(?:\.\d+)?)pt/;

/** Retrait gauche en points du bloc, lu dans son `style` sérialisé, `undefined` sans retrait. */
export function marginLeftPt(html: string): number | undefined {
  const style = FIRST_TAG_STYLE.exec(html)?.[1];
  if (!style) return undefined;
  const match = MARGIN_LEFT.exec(style);
  return match?.[1] ? Number(match[1]) : undefined;
}

interface OpenList {
  readonly numId: string;
  readonly level: number;
  readonly tag: 'ol' | 'ul';
  itemOpen: boolean;
  itemIndentPt: number;
}

interface ListItem {
  readonly block: ParagraphBlock;
  readonly numId: string;
  readonly level: ListLevel;
}

function listOpening(definition: ListDefinition, level: ListLevel, start: number): string {
  const numId = ` data-docx-num-id="${escapeAttr(definition.numId)}"`;
  if (level.format === 'bullet') {
    const bullet = level.text ? ` data-bullet="${escapeAttr(level.text)}"` : '';
    return `<ul${bullet}${numId}>`;
  }
  const type = level.format !== '1' && level.format !== 'none' ? ` type="${level.format}"` : '';
  const startAttr = start !== 1 ? ` start="${String(start)}"` : '';
  return `<ol${type}${startAttr}${numId}>`;
}

/**
 * Rend une suite de blocs en HTML. Les paragraphes numérotés consécutifs sont regroupés
 * en listes imbriquées selon leur niveau ; un changement de `numId` à même niveau ferme
 * la liste ; `start` est posé quand le niveau ne démarre pas à 1 ou quand la liste reprend
 * après une interruption (Word continue la numérotation, HTML repart à 1). Un paragraphe
 * non numéroté qui suit un item avec un retrait gauche au moins égal reste dans le même
 * `<li>` (paragraphe de continuation). Un bloc dont le HTML contient plusieurs frères
 * (saut de page devant le paragraphe) est rendu tel quel hors liste.
 * `emptyParagraphs: 'drop'` retire les paragraphes vides.
 */
export function renderBlocks(blocks: readonly Block[], ctx: ConverterContext): string {
  const out: string[] = [];
  const stack: OpenList[] = [];
  /** Items déjà rendus par `numId:niveau`, pour reprendre la numérotation après interruption. */
  const counters = new Map<string, number>();

  const top = (): OpenList | undefined => stack[stack.length - 1];
  const closeTop = (): void => {
    const list = stack.pop();
    if (!list) return;
    if (list.itemOpen) out.push('</li>');
    out.push(`</${list.tag}>`);
  };
  const closeAll = (): void => {
    while (stack.length > 0) closeTop();
  };

  const asListItem = (block: Block): ListItem | null => {
    if (block.kind !== 'paragraph' || !block.numbering || block.numbering.numId === '0')
      return null;
    const definition = ctx.numbering.definition(block.numbering.numId);
    const level = definition?.levels.find(
      (candidate) => candidate.level === block.numbering?.level,
    );
    if (!definition || !level || level.format === 'none') return null;
    if (topLevelElementCount(block.html) !== 1) return null;
    return { block, numId: definition.numId, level };
  };

  const isContinuation = (block: Block, list: OpenList): boolean => {
    if (block.kind !== 'paragraph' || block.isEmpty || !list.itemOpen) return false;
    if (block.numbering && block.numbering.numId !== '0') return false;
    if (topLevelElementCount(block.html) !== 1) return false;
    const indent = marginLeftPt(block.html);
    return indent !== undefined && indent > 0 && indent >= list.itemIndentPt;
  };

  for (const block of blocks) {
    if (block.kind === 'paragraph' && block.isEmpty && ctx.options.emptyParagraphs === 'drop') {
      continue;
    }
    const item = asListItem(block);
    if (item) {
      const { numId, level } = item;
      let current = top();
      while (
        current &&
        (current.level > level.level || (current.level === level.level && current.numId !== numId))
      ) {
        closeTop();
        current = top();
      }
      if (!current || current.level < level.level) {
        const key = `${numId}:${String(level.level)}`;
        const definition = ctx.numbering.definition(numId);
        if (definition) {
          out.push(listOpening(definition, level, level.start + (counters.get(key) ?? 0)));
        }
        current = {
          numId,
          level: level.level,
          tag: level.format === 'bullet' ? 'ul' : 'ol',
          itemOpen: false,
          itemIndentPt: 0,
        };
        stack.push(current);
      }
      if (current.itemOpen) out.push('</li>');
      out.push(`<li>${item.block.html}`);
      current.itemOpen = true;
      current.itemIndentPt = marginLeftPt(item.block.html) ?? level.indentLeftPt ?? 0;
      const key = `${numId}:${String(level.level)}`;
      counters.set(key, (counters.get(key) ?? 0) + 1);
      // Un item à ce niveau redémarre les niveaux plus profonds de la même numérotation.
      for (const existing of Array.from(counters.keys())) {
        const [id, depth] = existing.split(':');
        if (id === numId && Number(depth) > level.level) counters.delete(existing);
      }
      continue;
    }
    const current = top();
    if (current && isContinuation(block, current)) {
      out.push(block.html);
      continue;
    }
    closeAll();
    out.push(block.html);
  }
  closeAll();
  return out.join('');
}
