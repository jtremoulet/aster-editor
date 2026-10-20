import type { ParagraphChild } from 'docx';
import { warn, type ExportContext } from './context';
import { BLOCK_TAGS, DROPPED_TAGS, SILENT_TAGS, isElement, isText, tagOf } from './dom';
import { imageRun } from './images';
import {
  pushBreak,
  pushFootnoteCall,
  pushTab,
  pushText,
  pushVariable,
  type CollectOptions,
  type InlineCollector,
  type Piece,
} from './inline-pieces';
import { applyElementState, runOptions, type InlineState } from './inline-state';
import { sanitizeXmlText } from './sanitize';
import { mergeField, variableNameOf } from './variables';

/**
 * Nœuds inline → enfants de `Paragraph` : descente avec state hérité, règles de blancs
 * du HTML, regroupement des liens. Le state et ses options de run (`inline-state.ts`) et
 * les morceaux (`inline-pieces.ts`) sont ré-exportés d'ici : l'API du module est celle
 * d'avant le découpage (L45).
 */

export {
  DOCX_RUN_STYLE_ATTRIBUTE,
  applyElementState,
  encodeHref,
  runOptions,
  type InlineState,
  type UnderlineStyle,
} from './inline-state';
export type { InlineCollector } from './inline-pieces';

/** Nœud inline de tabulation du contrat (`TabAttrs`). */
const TAB_ATTRIBUTE = 'data-tab';

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
  if (node.hasAttribute(TAB_ATTRIBUTE)) {
    pushTab(node, state, options, pieces);
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
  const { FootnoteReferenceRun, Tab, TextRun } = ctx.docx;
  switch (piece.kind) {
    case 'text':
      return new TextRun(runOptions(piece.state, piece.text));
    case 'break':
      return new TextRun({ ...runOptions(piece.state), break: 1 });
    case 'tab':
      return new TextRun({ ...runOptions(piece.state), children: [new Tab()] });
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
 * (en-têtes, pieds, notes) dégrade les appels de note en exposant `[n]`. `collector`
 * reçoit les taquets des tabulations rencontrées, à écrire sur le paragraphe.
 */
export async function inlineChildren(
  nodes: readonly Node[],
  ctx: ExportContext,
  initial: InlineState = {},
  notesAllowed = true,
  collector?: InlineCollector,
): Promise<ParagraphChild[]> {
  const pieces: Piece[] = [];
  const options: CollectOptions = { notesAllowed, ...(collector ? { collector } : {}) };
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
