import type { IRunOptions, ImageRun, ParagraphChild } from 'docx';
import { warn, type ExportContext } from './context';
import { parseColor, parseFontFamily, parseFontSize, parseStyle } from './css';
import { DROPPED_TAGS, SILENT_TAGS, isElement, isText, tagOf } from './dom';
import { imageRun } from './images';
import { CODE_FONT, STYLE_IDS } from './styles';

/** Marques héritées le long de la descente dans les éléments inline. */
export interface InlineState {
  readonly bold?: boolean;
  readonly italics?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  readonly subScript?: boolean;
  readonly superScript?: boolean;
  readonly code?: boolean;
  readonly highlight?: boolean;
  readonly color?: string;
  readonly font?: string;
  readonly size?: number;
  /** URL du lien englobant, `undefined` hors lien. */
  readonly href?: string;
}

type Piece =
  | { readonly kind: 'text'; readonly text: string; readonly state: InlineState }
  | { readonly kind: 'break'; readonly state: InlineState }
  | { readonly kind: 'image'; readonly run: ImageRun; readonly state: InlineState };

/** Schémas de lien que Word accepte dans un `ExternalHyperlink`. */
const LINK_PATTERN = /^(https?:|mailto:|tel:|ftp:)/i;

/** Applique au state les marques portées par un élément inline (balise + `style`). */
export function applyElementState(element: Element, state: InlineState): InlineState {
  const style = parseStyle(element.getAttribute('style'));
  let next: InlineState = state;
  switch (tagOf(element)) {
    case 'strong':
    case 'b':
      next = { ...next, bold: true };
      break;
    case 'em':
    case 'i':
      next = { ...next, italics: true };
      break;
    case 'u':
    case 'ins':
      next = { ...next, underline: true };
      break;
    case 's':
    case 'strike':
    case 'del':
      next = { ...next, strike: true };
      break;
    case 'sub':
      next = { ...next, subScript: true, superScript: false };
      break;
    case 'sup':
      next = { ...next, superScript: true, subScript: false };
      break;
    case 'code':
    case 'kbd':
    case 'samp':
      next = { ...next, code: true };
      break;
    case 'mark':
      next = { ...next, highlight: true };
      break;
    case 'a': {
      const href = element.getAttribute('href')?.trim() ?? '';
      if (LINK_PATTERN.test(href)) next = { ...next, href };
      break;
    }
    default:
      break;
  }
  const weight = style.get('font-weight');
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600)
    next = { ...next, bold: true };
  if (style.get('font-style') === 'italic') next = { ...next, italics: true };
  const decoration = style.get('text-decoration') ?? style.get('text-decoration-line');
  if (decoration?.includes('underline')) next = { ...next, underline: true };
  if (decoration?.includes('line-through')) next = { ...next, strike: true };
  const vertical = style.get('vertical-align');
  if (vertical === 'sub') next = { ...next, subScript: true, superScript: false };
  if (vertical === 'super') next = { ...next, superScript: true, subScript: false };
  const color = parseColor(style.get('color'));
  if (color) next = { ...next, color };
  const font = parseFontFamily(style.get('font-family'));
  if (font) next = { ...next, font };
  const size = parseFontSize(style.get('font-size'));
  if (size) next = { ...next, size };
  const background = style.get('background-color') ?? style.get('background');
  if (background && parseColor(background)) next = { ...next, highlight: true };
  return next;
}

/** Options `docx` d'un run texte à partir du state courant. */
export function runOptions(state: InlineState, text?: string): IRunOptions {
  const options: {
    -readonly [K in keyof IRunOptions]: IRunOptions[K];
  } = {};
  if (text !== undefined) options.text = text;
  if (state.bold) options.bold = true;
  if (state.italics) options.italics = true;
  if (state.underline) options.underline = {};
  if (state.strike) options.strike = true;
  if (state.subScript) options.subScript = true;
  if (state.superScript) options.superScript = true;
  if (state.highlight) options.highlight = 'yellow';
  if (state.color) options.color = state.color;
  if (state.size) options.size = state.size;
  if (state.code) {
    options.style = STYLE_IDS.code;
    options.font = CODE_FONT;
  } else if (state.font) {
    options.font = state.font;
  }
  // Le style de caractère « Hyperlink » prime sur « Code » : Word n'en accepte qu'un.
  if (state.href) options.style = STYLE_IDS.hyperlink;
  return options;
}

/** Descente récursive : accumule les morceaux inline avec leur state. */
async function collectPieces(
  node: Node,
  state: InlineState,
  ctx: ExportContext,
  pieces: Piece[],
): Promise<void> {
  if (isText(node)) {
    const text = node.data;
    if (text !== '') pieces.push({ kind: 'text', text, state });
    return;
  }
  if (!isElement(node)) return;
  const tag = tagOf(node);
  if (tag === 'br') {
    pieces.push({ kind: 'break', state });
    return;
  }
  if (tag === 'img') {
    const run = await imageRun(node, ctx);
    if (run) pieces.push({ kind: 'image', run, state });
    return;
  }
  if (SILENT_TAGS.includes(tag)) return;
  if (DROPPED_TAGS.includes(tag)) {
    warn(ctx, 'unsupported-element', `Élément <${tag}> ignoré : pas d'équivalent Word`);
    return;
  }
  const next = applyElementState(node, state);
  for (const child of Array.from(node.childNodes)) await collectPieces(child, next, ctx, pieces);
}

/**
 * Applique les règles de blancs du HTML : suites d'espaces réduites à un, blancs de
 * début et de fin de bloc supprimés, espace doublé à la frontière de deux morceaux
 * supprimé. Les morceaux devenus vides disparaissent.
 */
function collapseWhitespace(pieces: readonly Piece[]): Piece[] {
  const result: Piece[] = [];
  let atBoundary = true;
  for (const piece of pieces) {
    if (piece.kind !== 'text') {
      result.push(piece);
      atBoundary = piece.kind === 'break';
      continue;
    }
    let text = piece.text.replace(/\s+/g, ' ');
    if (atBoundary) text = text.replace(/^ /, '');
    if (text === '') continue;
    result.push({ ...piece, text });
    atBoundary = text.endsWith(' ');
  }
  // Blanc de fin de bloc : on le retire du dernier morceau texte, qui peut alors disparaître.
  for (let i = result.length - 1; i >= 0; i -= 1) {
    const last = result[i];
    if (!last || last.kind !== 'text') break;
    const trimmed = last.text.replace(/ $/, '');
    if (trimmed === '') {
      result.splice(i, 1);
      continue;
    }
    result[i] = { ...last, text: trimmed };
    break;
  }
  return result;
}

/** Fabrique le run `docx` d'un morceau. */
function pieceToRun(piece: Piece, ctx: ExportContext): ParagraphChild {
  const { TextRun } = ctx.docx;
  switch (piece.kind) {
    case 'text':
      return new TextRun(runOptions(piece.state, piece.text));
    case 'break':
      return new TextRun({ ...runOptions(piece.state), break: 1 });
    case 'image':
      return piece.run;
  }
}

/**
 * Convertit une suite de nœuds inline en enfants de `Paragraph`. Les morceaux
 * consécutifs d'un même lien sont regroupés dans un `ExternalHyperlink`. Prend une
 * liste de nœuds plutôt qu'un conteneur pour que le regroupement des inline nus d'un
 * bloc n'ait pas à déplacer de nœuds dans le DOM d'entrée.
 */
export async function inlineChildren(
  nodes: readonly Node[],
  ctx: ExportContext,
  initial: InlineState = {},
): Promise<ParagraphChild[]> {
  const pieces: Piece[] = [];
  for (const node of nodes) await collectPieces(node, initial, ctx, pieces);
  const children: ParagraphChild[] = [];
  let linkRuns: ParagraphChild[] = [];
  let linkHref: string | undefined;
  const flushLink = (): void => {
    if (linkHref !== undefined && linkRuns.length > 0) {
      children.push(new ctx.docx.ExternalHyperlink({ link: linkHref, children: linkRuns }));
    }
    linkRuns = [];
    linkHref = undefined;
  };
  for (const piece of collapseWhitespace(pieces)) {
    const run = pieceToRun(piece, ctx);
    if (piece.state.href === undefined) {
      flushLink();
      children.push(run);
      continue;
    }
    if (piece.state.href !== linkHref) {
      flushLink();
      linkHref = piece.state.href;
    }
    linkRuns.push(run);
  }
  flushLink();
  return children;
}
