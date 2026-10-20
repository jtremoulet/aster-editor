import type { IRunOptions, ImageRun, ParagraphChild } from 'docx';
import { resolveDocxStyle, warn, type ExportContext } from './context';
import {
  highlightName,
  parseColor,
  parseFontFamily,
  parseFontSize,
  parsePoints,
  parseStyle,
  pointsToTwips,
  type HighlightName,
} from './css';
import { BLOCK_TAGS, DROPPED_TAGS, SILENT_TAGS, isElement, isText, tagOf } from './dom';
import { imageRun } from './images';
import { sanitizeXmlText } from './sanitize';
import { CODE_FONT, STYLE_IDS } from './styles';
import { mergeField, resolvedValue, splitVariables, variableNameOf } from './variables';

/** Attribut du style de caractère Word d'origine d'un span (`RunLayoutAttrs.docxRunStyle`). */
export const DOCX_RUN_STYLE_ATTRIBUTE = 'data-docx-run-style';

/** Styles de trait du souligné (`w:u w:val`), valeurs de `UnderlineType` de `docx`. */
export type UnderlineStyle = 'single' | 'double' | 'dotted' | 'dash' | 'wave';

/** Marques héritées le long de la descente dans les éléments inline. */
export interface InlineState {
  readonly bold?: boolean;
  readonly italics?: boolean;
  readonly underline?: boolean;
  /** Trait du souligné (`text-decoration-style`), simple par défaut. */
  readonly underlineStyle?: UnderlineStyle;
  readonly strike?: boolean;
  /** Barré double (`<s style="text-decoration-style: double">`), `w:dstrike`. */
  readonly doubleStrike?: boolean;
  readonly subScript?: boolean;
  readonly superScript?: boolean;
  readonly code?: boolean;
  /** Surlignage nommé de Word (`yellow`…), pour les seize couleurs qu'il connaît. */
  readonly highlight?: HighlightName;
  /** Fond de run `RRGGBB` (`w:shd`) pour toute autre couleur de fond. */
  readonly shading?: string;
  readonly color?: string;
  readonly font?: string;
  readonly size?: number;
  /** Espacement des caractères en twips (`letter-spacing`). */
  readonly letterSpacing?: number;
  /** Casse forcée : `text-transform: uppercase` ou `font-variant: small-caps`. */
  readonly caps?: 'all' | 'small';
  /** Style de caractère Word d'origine (`data-docx-run-style`), s'il est défini. */
  readonly runStyle?: string;
  /** URL du lien englobant, `undefined` hors lien. */
  readonly href?: string;
}

type Piece =
  /**
   * Texte ; `preserved` pour une valeur de variable résolue, dont les blancs ne suivent
   * pas les règles du HTML : ils sont écrits tels quels.
   */
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly state: InlineState;
      readonly preserved?: boolean;
    }
  /** Saut de ligne ; `preserved` quand il vient d'un `\n` d'une valeur de variable. */
  | { readonly kind: 'break'; readonly state: InlineState; readonly preserved?: boolean }
  | { readonly kind: 'image'; readonly run: ImageRun; readonly state: InlineState }
  /** Champ de fusion Word (mode `fields`). */
  | { readonly kind: 'field'; readonly name: string; readonly state: InlineState }
  /** Appel de note de bas de page, `id` Word déjà attribué. */
  | { readonly kind: 'footnote'; readonly id: number; readonly state: InlineState };

/** Schémas de lien que Word accepte dans un `ExternalHyperlink`. */
const LINK_PATTERN = /^(https?:|mailto:|tel:|ftp:)/i;

/** Attribut d'un `<sup>` qui porte un appel de note explicite. */
const FOOTNOTE_REF_ATTRIBUTE = 'data-footnote-ref';

/** Texte d'un appel de note tel que l'import le produit : `[1]`. */
const FOOTNOTE_CALL_TEXT = /^\[(\d+)\]$/;

/**
 * Encode une URL pour les relations du .docx : Word refuse d'ouvrir un fichier dont une
 * cible de relation contient un espace, `|` ou un caractère non ASCII. `encodeURI`
 * laisse les délimiteurs d'URL en place ; les séquences `%xx` déjà présentes sont
 * restaurées pour que l'encodage soit idempotent. Une URL inencodable (substitut isolé)
 * est rendue telle quelle.
 */
export function encodeHref(href: string): string {
  try {
    return encodeURI(href).replace(/%25([0-9a-f]{2})/gi, '%$1');
  } catch {
    return href;
  }
}

/** `text-decoration-style` CSS → trait de souligné Word, `undefined` pour `solid`/absent. */
function underlineStyleOf(value: string | undefined): UnderlineStyle | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'double':
      return 'double';
    case 'dotted':
      return 'dotted';
    case 'dashed':
      return 'dash';
    case 'wavy':
      return 'wave';
    default:
      return undefined;
  }
}

/**
 * Applique au state les marques portées par un élément inline (balise + `style` +
 * `data-docx-run-style`). Le contexte sert à valider le style de caractère Word : sans
 * lui, l'attribut est ignoré.
 */
export function applyElementState(
  element: Element,
  state: InlineState,
  ctx?: ExportContext,
): InlineState {
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
    case 'ins': {
      const underlineStyle = underlineStyleOf(style.get('text-decoration-style'));
      next = { ...next, underline: true, ...(underlineStyle ? { underlineStyle } : {}) };
      break;
    }
    case 's':
    case 'strike':
    case 'del':
      if (style.get('text-decoration-style')?.trim().toLowerCase() === 'double') {
        next = { ...next, doubleStrike: true };
      } else {
        next = { ...next, strike: true };
      }
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
      next = { ...next, highlight: 'yellow', shading: undefined };
      break;
    case 'a': {
      const href = sanitizeXmlText(element.getAttribute('href') ?? '').trim();
      if (LINK_PATTERN.test(href)) next = { ...next, href: encodeHref(href) };
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
  const background = parseColor(style.get('background-color') ?? style.get('background'));
  if (background) {
    // Les seize couleurs de Word restent un surlignage ; les autres deviennent un fond de run.
    const named = highlightName(background);
    next = named
      ? { ...next, highlight: named, shading: undefined }
      : { ...next, shading: background, highlight: undefined };
  }
  const letterSpacing = parsePoints(style.get('letter-spacing'));
  if (letterSpacing !== null && letterSpacing !== 0) {
    next = { ...next, letterSpacing: pointsToTwips(letterSpacing) };
  }
  const transform = style.get('text-transform')?.trim().toLowerCase();
  if (transform === 'uppercase') next = { ...next, caps: 'all' };
  else if (transform === 'none' && next.caps === 'all') next = { ...next, caps: undefined };
  const variant = style.get('font-variant')?.trim().toLowerCase();
  if (variant === 'small-caps' || style.get('font-variant-caps')?.trim() === 'small-caps') {
    next = { ...next, caps: 'small' };
  } else if (variant === 'normal' && next.caps === 'small') {
    next = { ...next, caps: undefined };
  }
  if (ctx) {
    const runStyle = resolveDocxStyle(ctx, element.getAttribute(DOCX_RUN_STYLE_ATTRIBUTE), 'run');
    if (runStyle) next = { ...next, runStyle };
  }
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
  if (state.underline)
    options.underline = state.underlineStyle ? { type: state.underlineStyle } : {};
  if (state.strike) options.strike = true;
  if (state.doubleStrike) options.doubleStrike = true;
  if (state.subScript) options.subScript = true;
  if (state.superScript) options.superScript = true;
  if (state.highlight) options.highlight = state.highlight;
  if (state.shading) options.shading = { fill: state.shading, type: 'clear', color: 'auto' };
  if (state.color) options.color = state.color;
  if (state.size) options.size = state.size;
  if (state.letterSpacing) options.characterSpacing = state.letterSpacing;
  if (state.caps === 'all') options.allCaps = true;
  if (state.caps === 'small') options.smallCaps = true;
  if (state.code) {
    options.style = STYLE_IDS.code;
    options.font = CODE_FONT;
  } else if (state.font) {
    options.font = state.font;
  }
  // Un style de caractère Word d'origine prime sur « Code », et « Hyperlink » sur tout :
  // Word n'en accepte qu'un par run.
  if (state.runStyle) options.style = state.runStyle;
  if (state.href) options.style = STYLE_IDS.hyperlink;
  return options;
}

/** Ajoute un saut de ligne sauf en tête de paragraphe ou juste après un autre saut. */
function pushBreak(pieces: Piece[], state: InlineState): void {
  const last = pieces[pieces.length - 1];
  if (last && last.kind !== 'break') pieces.push({ kind: 'break', state });
}

/**
 * Valeur résolue d'une variable : une ligne par morceau texte, séparées par des sauts
 * de ligne, tous `preserved` pour que `collapseWhitespace` n'y touche pas. Une valeur
 * est de la donnée, pas du HTML : `"a\nb"` donne deux lignes, `"a  b"` garde ses deux espaces.
 */
function pushResolvedValue(value: string, state: InlineState, pieces: Piece[]): void {
  value.split(/\r?\n/).forEach((line, index) => {
    if (index > 0) pieces.push({ kind: 'break', state, preserved: true });
    if (line !== '') pieces.push({ kind: 'text', text: line, state, preserved: true });
  });
}

/**
 * Morceaux d'une variable selon le mode : en `fields` un champ de fusion, en `resolve`
 * sa valeur (ou `{{nom}}`), en `placeholders` le texte d'origine.
 */
function pushVariable(
  name: string,
  raw: string,
  state: InlineState,
  ctx: ExportContext,
  pieces: Piece[],
): void {
  switch (ctx.variables.mode) {
    case 'fields':
      pieces.push({ kind: 'field', name, state });
      return;
    case 'resolve': {
      const value = resolvedValue(name, ctx);
      if (value === undefined) pieces.push({ kind: 'text', text: raw, state });
      else pushResolvedValue(value, state, pieces);
      return;
    }
    default:
      pieces.push({ kind: 'text', text: raw, state });
  }
}

/**
 * Texte brut : découpé sur le motif des variables en modes `fields`/`resolve`, sauf
 * dans une marque de code, où `{{…}}` est du contenu.
 */
function pushText(text: string, state: InlineState, ctx: ExportContext, pieces: Piece[]): void {
  if (text === '') return;
  if (state.code) {
    pieces.push({ kind: 'text', text, state });
    return;
  }
  for (const segment of splitVariables(text, ctx.variables)) {
    if (segment.kind === 'text') pieces.push({ kind: 'text', text: segment.text, state });
    else pushVariable(segment.name, segment.raw, state, ctx, pieces);
  }
}

/**
 * Clé de note d'un `<sup>` : `data-footnote-ref="1"` explicite, ou texte `[1]` tel que
 * l'import le produit. `null` si le `<sup>` est un exposant ordinaire.
 */
function footnoteKey(element: Element): { key: string; explicit: boolean } | null {
  const explicit = element.getAttribute(FOOTNOTE_REF_ATTRIBUTE);
  if (explicit !== null && explicit.trim() !== '') return { key: explicit.trim(), explicit: true };
  const call = FOOTNOTE_CALL_TEXT.exec((element.textContent ?? '').trim());
  return call?.[1] ? { key: call[1], explicit: false } : null;
}

/** Options de descente : où l'on est, pour ce que Word y accepte. */
interface CollectOptions {
  /** Faux dans un en-tête, un pied ou une note : Word y refuse les appels de note. */
  readonly notesAllowed: boolean;
}

/**
 * Appel de note d'un `<sup>` : `true` si un morceau a été émis. Une vraie référence
 * quand la note existe, que l'endroit l'autorise et qu'elle n'a pas déjà été appelée ;
 * sinon un exposant `[n]` avec l'avertissement qui explique le repli. Un `<sup>` qui
 * n'est pas un appel (ou un appel implicite `[n]` sans note) rend `false` : son
 * contenu est converti comme tout exposant.
 */
function pushFootnoteCall(
  element: Element,
  state: InlineState,
  ctx: ExportContext,
  options: CollectOptions,
  pieces: Piece[],
): boolean {
  const call = footnoteKey(element);
  if (!call) return false;
  const note = ctx.footnotes.get(call.key);
  if (!note) {
    if (call.explicit) {
      warn(ctx, 'footnote-missing', `Appel de note ${call.key} sans note, laissé en exposant`);
    }
    return false;
  }
  const fallback: Piece = {
    kind: 'text',
    text: `[${call.key}]`,
    state: { ...state, superScript: true, subScript: false },
  };
  if (!options.notesAllowed) {
    warn(
      ctx,
      'footnote-not-allowed',
      `Appel de note ${call.key} dans un en-tête, un pied ou une note : Word l'y refuse, laissé en exposant`,
    );
    pieces.push(fallback);
    return true;
  }
  if (ctx.footnoteCalls.has(call.key)) {
    warn(
      ctx,
      'footnote-duplicate',
      `Second appel de la note ${call.key} : Word n'en accepte qu'un, laissé en exposant`,
    );
    pieces.push(fallback);
    return true;
  }
  ctx.footnoteCalls.add(call.key);
  pieces.push({ kind: 'footnote', id: note.id, state });
  return true;
}

/** Descente récursive : accumule les morceaux inline avec leur state. */
async function collectPieces(
  node: Node,
  state: InlineState,
  ctx: ExportContext,
  options: CollectOptions,
  pieces: Piece[],
): Promise<void> {
  if (isText(node)) {
    pushText(sanitizeXmlText(node.data), state, ctx, pieces);
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
  const next = applyElementState(node, state, ctx);
  const variable = variableNameOf(node);
  if (variable !== null) {
    // Puce de variable : le span est atomique, son texte d'origine sert de repli.
    const raw = sanitizeXmlText(node.textContent ?? '').trim() || `{{${variable}}}`;
    pushVariable(variable, raw, next, ctx, pieces);
    return;
  }
  if (tag === 'sup' && pushFootnoteCall(node, state, ctx, options, pieces)) return;
  // Un bloc égaré en contexte inline (`<span><p>…</p></span>`) ne peut plus devenir un
  // paragraphe : on isole son texte par des sauts de ligne pour ne pas le coller au reste.
  const block = BLOCK_TAGS.includes(tag);
  if (block) pushBreak(pieces, state);
  for (const child of Array.from(node.childNodes)) {
    await collectPieces(child, next, ctx, options, pieces);
  }
  if (block) pushBreak(pieces, state);
}

/**
 * Applique les règles de blancs du HTML : suites d'espaces réduites à un, blanc de début
 * de bloc supprimé, espace doublé à la frontière de deux morceaux supprimé. Seuls les
 * blancs HTML (espace, tabulation, LF, CR, FF) sont concernés : NBSP et espaces Unicode
 * sont du contenu. L'espace **final** d'un bloc est conservée (réduite à une) : dans
 * l'éditeur `<p>Titre : </p>` est du contenu, et l'import la restitue depuis
 * `<w:t xml:space="preserve">` ; la rogner cassait l'aller-retour. Les morceaux devenus
 * vides disparaissent, ainsi que les sauts de ligne terminaux d'un paragraphe qui
 * contient autre chose. Les morceaux `preserved` (valeurs de variables) sont écrits tels
 * quels.
 */
function collapseWhitespace(pieces: readonly Piece[]): Piece[] {
  const result: Piece[] = [];
  let atBoundary = true;
  for (const piece of pieces) {
    if (piece.kind !== 'text' || piece.preserved) {
      result.push(piece);
      atBoundary = piece.kind === 'break' || (piece.kind === 'text' && piece.text.endsWith(' '));
      continue;
    }
    let text = piece.text.replace(/[ \t\n\r\f]+/g, ' ');
    if (atBoundary) text = text.replace(/^ /, '');
    if (text === '') continue;
    result.push({ ...piece, text });
    atBoundary = text.endsWith(' ');
  }
  // `<br>` terminal : invisible en HTML quand le bloc a d'autre contenu, il ajouterait une
  // ligne vide dans Word. `<p><br></p>` garde le sien : c'est tout ce qui donne corps au paragraphe.
  if (result.some((piece) => piece.kind !== 'break')) {
    for (let last = result[result.length - 1]; last?.kind === 'break' && !last.preserved;) {
      result.pop();
      last = result[result.length - 1];
    }
  }
  return result;
}

/** Fabrique le run `docx` d'un morceau. */
function pieceToRun(piece: Piece, ctx: ExportContext): ParagraphChild {
  const { FootnoteReferenceRun, TextRun } = ctx.docx;
  switch (piece.kind) {
    case 'text':
      return new TextRun(runOptions(piece.state, piece.text));
    case 'break':
      return new TextRun({ ...runOptions(piece.state), break: 1 });
    case 'image':
      return piece.run;
    case 'field':
      return mergeField(piece.name, ctx);
    case 'footnote':
      return new FootnoteReferenceRun(piece.id);
  }
}

/**
 * Convertit une suite de nœuds inline en enfants de `Paragraph`. Les morceaux
 * consécutifs d'un même lien sont regroupés dans un `ExternalHyperlink`. Prend une
 * liste de nœuds plutôt qu'un conteneur pour que le regroupement des inline nus d'un
 * bloc n'ait pas à déplacer de nœuds dans le DOM d'entrée. `notesAllowed` à `false`
 * (en-têtes, pieds, notes) dégrade les appels de note en exposant `[n]`.
 */
export async function inlineChildren(
  nodes: readonly Node[],
  ctx: ExportContext,
  initial: InlineState = {},
  notesAllowed = true,
): Promise<ParagraphChild[]> {
  const pieces: Piece[] = [];
  const options: CollectOptions = { notesAllowed };
  for (const node of nodes) await collectPieces(node, initial, ctx, options, pieces);
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
