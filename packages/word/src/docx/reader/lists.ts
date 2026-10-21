import type { DocxLostObject } from '../types';
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
import { numericAttribute, twipsToPt } from './units';

/**
 * Listes : résolution de `numbering.xml` (`w:abstractNum` → niveaux, `w:num` →
 * `abstractNumId` + `w:lvlOverride`) et regroupement des paragraphes numérotés en
 * `<ol data-docx-num-id start type>` / `<ul data-bullet data-docx-num-id>` imbriqués
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

/**
 * Valeur de départ (`w:start`, `w:startOverride`) tronquée en entier sûr, sinon 1 : un
 * `start="1e+300"` serait relu en 1 par l'éditeur, l'aller-retour ne serait plus idempotent.
 */
export function safeStart(value: number | undefined): number {
  if (value === undefined) return 1;
  const truncated = Math.trunc(value);
  return Number.isSafeInteger(truncated) ? truncated : 1;
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
    start: safeStart(numericAttribute(childNamed(lvl, 'start'), 'val')),
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
      if (start !== undefined && current) {
        levels.set(level, { ...current, start: safeStart(start) });
      }
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

/** Attribut posé par `paragraphs.ts` quand le retrait du paragraphe vient de la numérotation. */
const NUM_INDENT_ATTRIBUTE = /\sdata-docx-num-indent(?:="")?(?=[\s>])/;
const FIRST_TAG = /^<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/;
const STYLE_ATTRIBUTE = /\sstyle="([^"]*)"/;
const NUMBERING_DECLARATIONS = /^(?:margin-left|text-indent):/;

/**
 * Retire d'un item le retrait venu de la numérotation (`margin-left`, `text-indent` marqués
 * par `data-docx-num-indent`) et l'attribut : dans `<li>` la liste porte le retrait, et
 * l'éditeur ignore l'attribut. Sans l'attribut, le retrait est direct et reste tel quel.
 */
export function stripNumberingIndent(html: string): string {
  const tag = FIRST_TAG.exec(html)?.[0];
  if (!tag || !NUM_INDENT_ATTRIBUTE.test(tag)) return html;
  let patched = tag.replace(NUM_INDENT_ATTRIBUTE, '');
  const style = STYLE_ATTRIBUTE.exec(patched);
  if (style) {
    const kept = (style[1] ?? '')
      .split(';')
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration !== '' && !NUMBERING_DECLARATIONS.test(declaration));
    patched = patched.replace(
      STYLE_ATTRIBUTE,
      kept.length > 0 ? ` style="${kept.join('; ')}"` : '',
    );
  }
  return patched + html.slice(tag.length);
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

/**
 * État de numérotation d'un document (compteurs par `numId:niveau`, rang des blocs, `numId`
 * signalés), clé sur le tableau `lost` du contexte : unique par document et propagé tel quel
 * par `deriveContext` (cellules, notes, en-têtes), sans toucher aux types figés.
 */
interface ListState {
  readonly counters: Map<string, number>;
  readonly offsets: WeakMap<ParagraphBlock, number>;
  readonly warned: Set<string>;
}

const STATES = new WeakMap<DocxLostObject[], ListState>();

function stateOf(ctx: ConverterContext): ListState {
  const known = STATES.get(ctx.lost);
  if (known) return known;
  const state: ListState = { counters: new Map(), offsets: new WeakMap(), warned: new Set() };
  STATES.set(ctx.lost, state);
  return state;
}

/** Avertit une fois par `numId` dont la liste est rendue en paragraphes. */
function warnOnce(ctx: ConverterContext, numId: string, reason: string): void {
  const state = stateOf(ctx);
  if (state.warned.has(numId)) return;
  state.warned.add(numId);
  ctx.warnings.push({
    code: 'reader',
    message: `Numérotation ${numId} : ${reason}, liste rendue en paragraphes.`,
  });
}

/** Le bloc est-il un item de liste rendable ? Signale une fois les numérotations inconnues. */
function asListItem(block: Block, ctx: ConverterContext): ListItem | null {
  if (block.kind !== 'paragraph' || !block.numbering || block.numbering.numId === '0') {
    return null;
  }
  const { numId } = block.numbering;
  const definition = ctx.numbering.definition(numId);
  if (!definition) {
    warnOnce(ctx, numId, 'définition introuvable dans numbering.xml');
    return null;
  }
  const level = definition.levels.find((candidate) => candidate.level === block.numbering?.level);
  if (!level) {
    warnOnce(ctx, numId, `niveau ${String(block.numbering.level)} non défini`);
    return null;
  }
  if (level.format === 'none') return null;
  if (topLevelElementCount(block.html) !== 1) return null;
  return { block, numId: definition.numId, level };
}

/**
 * Enregistre un item dans l'ordre du document et retourne son rang parmi ceux de même
 * `numId:niveau` (un item redémarre les niveaux plus profonds). À appeler à la conversion
 * (`convertBlocks`) : les cellules sont rendues avant le corps, compter au rendu décalerait
 * le corps. Un bloc déjà enregistré garde son rang ; sinon il l'est au rendu.
 */
export function registerListItem(block: Block, ctx: ConverterContext): number | undefined {
  if (block.kind === 'paragraph' && block.isEmpty && ctx.options.emptyParagraphs === 'drop') {
    return undefined;
  }
  const item = asListItem(block, ctx);
  if (!item) return undefined;
  const state = stateOf(ctx);
  const known = state.offsets.get(item.block);
  if (known !== undefined) return known;
  const { numId, level } = item;
  const key = `${numId}:${String(level.level)}`;
  const offset = state.counters.get(key) ?? 0;
  state.offsets.set(item.block, offset);
  state.counters.set(key, offset + 1);
  for (const existing of Array.from(state.counters.keys())) {
    const [id, depth] = existing.split(':');
    if (id === numId && Number(depth) > level.level) state.counters.delete(existing);
  }
  return offset;
}

function listOpening(definition: ListDefinition, level: ListLevel, start: number): string {
  const numId = ` data-docx-num-id="${escapeAttr(definition.numId)}"`;
  if (level.format === 'bullet') {
    const bullet = level.text ? ` data-bullet="${escapeAttr(level.text)}"` : '';
    return `<ul${bullet}${numId}>`;
  }
  const type = level.format !== '1' && level.format !== 'none' ? ` type="${level.format}"` : '';
  const startAttr =
    start !== 1 ? ` start="${String(Math.min(start, Number.MAX_SAFE_INTEGER))}"` : '';
  // Ordre du core (`setHTML(getHTML())` strict, L49) : `data-docx-num-id`, `start`, `type`.
  return `<ol${numId}${startAttr}${type}>`;
}

/**
 * Rend une suite de blocs en HTML : paragraphes numérotés consécutifs regroupés en listes
 * imbriquées selon leur niveau ; changement de `numId` à même niveau → liste fermée ;
 * `start` posé si le niveau ne démarre pas à 1 ou si la liste reprend après interruption,
 * y compris à travers une cellule, une note ou un en-tête (Word continue, HTML repart à 1).
 * Un `<p>` non numéroté (jamais un titre) qui suit un item avec un retrait au moins égal
 * reste dans le même `<li>` ; un bloc à plusieurs frères (saut de page) reste hors liste.
 * `emptyParagraphs: 'drop'` retire les paragraphes vides.
 */
export function renderBlocks(blocks: readonly Block[], ctx: ConverterContext): string {
  const out: string[] = [];
  const stack: OpenList[] = [];

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

  const isContinuation = (block: Block, list: OpenList): boolean => {
    if (block.kind !== 'paragraph' || block.isEmpty || !list.itemOpen) return false;
    if (block.numbering && block.numbering.numId !== '0') return false;
    if (!/^<p[\s>]/.test(block.html) || topLevelElementCount(block.html) !== 1) return false;
    const indent = marginLeftPt(block.html);
    return indent !== undefined && indent > 0 && indent >= list.itemIndentPt;
  };

  for (const block of blocks) {
    if (block.kind === 'paragraph' && block.isEmpty && ctx.options.emptyParagraphs === 'drop') {
      continue;
    }
    const item = asListItem(block, ctx);
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
      const offset = registerListItem(block, ctx) ?? 0;
      if (!current || current.level < level.level) {
        const definition = ctx.numbering.definition(numId);
        if (definition) out.push(listOpening(definition, level, level.start + offset));
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
      out.push(`<li>${stripNumberingIndent(item.block.html)}`);
      current.itemOpen = true;
      current.itemIndentPt = marginLeftPt(item.block.html) ?? level.indentLeftPt ?? 0;
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
