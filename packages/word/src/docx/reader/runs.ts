import type { DocxLostObject } from '../types';
import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import { escapeAttr, escapeHtml, pt } from './html';
import { detectLostInline } from './lost';
import { tabStopsOf } from './properties';
import { hyperlinkHref, hyperlinkTarget, safeHref } from './runs-links';
import { InlineWriter, renderRunTags } from './runs-tags';
import { docDefaultsOf } from './styles';
import type { ConverterContext, ResolvedParagraphProps } from './types';
import { fontName } from './units';

/**
 * Les liens (`runs-links.ts`) et les balises de run (`runs-tags.ts`) sont ré-exportés
 * d'ici : l'API du module est celle d'avant le découpage (L45).
 */
export { hyperlinkTarget, safeHref } from './runs-links';
export { renderRunTags, type RunTags } from './runs-tags';

/** Enfants d'un `w:p` sans contenu ni objet : jamais signalés. */
const IGNORED_PARAGRAPH_CHILDREN: ReadonlySet<string> = new Set([
  'pPr',
  'bookmarkStart',
  'bookmarkEnd',
  'proofErr',
  'commentRangeStart',
  'commentRangeEnd',
  'permStart',
  'permEnd',
  'rPr',
]);

/** Enfants d'un `w:r` qui portent un objet non représentable. */
const LOST_RUN_CHILDREN: ReadonlySet<string> = new Set([
  'object',
  'commentReference',
  'oMath',
  'oMathPara',
]);

function sameLost(a: DocxLostObject, b: DocxLostObject): boolean {
  return a.kind === b.kind && a.where === b.where && a.detail === b.detail && a.text === b.text;
}

/**
 * Signale un objet non représentable rencontré dans le flux inline (classification par
 * `lost.ts`), une seule fois par objet identique : révisions et commentaires reviennent
 * souvent, `images.ts` dédoublonne de la même façon.
 */
function reportLost(element: Element, ctx: ConverterContext): void {
  const lost = detectLostInline(element, ctx);
  if (!lost || ctx.lost.some((known) => sameLost(known, lost))) return;
  ctx.lost.push(lost);
  ctx.warnings.push({
    code: 'object-lost',
    message: `Objet non représentable ignoré (${lost.kind})${lost.detail ? ` : ${lost.detail}` : ''}.`,
  });
}

/**
 * Contenu inline d'un paragraphe Word → HTML stylé. Parcourt les enfants du `w:p` dans
 * l'ordre (runs, hyperliens, champs simples et complexes, contrôles inline, révisions),
 * résout chaque run par `ctx.styles.run`, et fusionne les runs voisins aux mêmes
 * propriétés rendues en un seul groupe de balises.
 *
 * Décisions figées :
 * - les propriétés égales aux `docDefaults` du document ne sont pas écrites ; tout ce qui
 *   en diffère (y compris hérité du style de paragraphe) est posé sur chaque run, jamais
 *   sur le bloc ;
 * - `w:tab` → nœud inline atomique `<span data-tab=""></span>` du contrat (session 4),
 *   `data-stop="Npt"` quand le paragraphe définit un taquet pour cette tabulation (la
 *   n-ième tabulation prend le n-ième taquet, approximation sans mesure du texte) ; émis
 *   dans les balises du run, comme l'éditeur sérialise un atome inline portant des marques ;
 * - `w:br w:type="page"` → marqueur `PAGE_BREAK` dans le flux, que `paragraphs.ts` coupe
 *   en blocs frères ; dans un lien ou un champ, il dégénère en `<br>`.
 */

/** Marqueur de saut de page inséré dans le flux inline, extrait par `paragraphs.ts`. */
export const PAGE_BREAK = '<hr data-page-break>';

/** Tabulation du contrat (`TabAttrs`) : `data-stop` seulement quand le taquet est connu. */
export function tabHtml(stopPt?: number): string {
  return stopPt === undefined
    ? '<span data-tab=""></span>'
    : `<span data-tab="" data-stop="${pt(stopPt)}"></span>`;
}

const NO_BREAK_HYPHEN = String.fromCharCode(0x2011);
const SOFT_HYPHEN = String.fromCharCode(0xad);

/** Champ complexe en cours (`w:fldChar begin` … `separate` … `end`). */
interface FieldFrame {
  readonly instr: string[];
  phase: 'instr' | 'result';
  anchor: boolean;
}

interface WalkState {
  readonly writer: InlineWriter;
  readonly fields: FieldFrame[];
  /** Profondeur de `<a>` ouverts : un saut de page y devient `<br>`. */
  linkDepth: number;
  /** Taquets du paragraphe et rang de la prochaine tabulation rendue. */
  readonly tabStops: readonly number[];
  tabIndex: number;
}

/**
 * Caractère d'un `w:sym` (`w:char` hexadécimal), chaîne vide s'il est illisible, nul,
 * hors du plan Unicode (`110000`) ou dans les substituts (`D800`-`DFFF`) : jamais
 * d'exception (`String.fromCodePoint` lève un `RangeError` hors plage).
 */
function symbolChar(sym: Element): string {
  const raw = wordAttribute(sym, 'char').trim();
  if (!/^[0-9a-f]{1,6}$/i.test(raw)) return '';
  const code = Number.parseInt(raw, 16);
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
  return String.fromCodePoint(code);
}

/**
 * Convertit le contenu inline d'un paragraphe. `props` est le paragraphe résolu, base
 * des runs (`runDefaults`).
 */
export async function convertRuns(
  paragraph: Element,
  ctx: ConverterContext,
  props: ResolvedParagraphProps,
): Promise<string> {
  const baseline = docDefaultsOf(ctx.styles).run;
  const state: WalkState = {
    writer: new InlineWriter(),
    fields: [],
    linkDepth: 0,
    tabStops: tabStopsOf(props),
    tabIndex: 0,
  };

  const withAnchor = async (target: string | null, body: () => Promise<void>): Promise<void> => {
    const href = safeHref(target);
    if (href === null) {
      await body();
      return;
    }
    state.writer.raw(`<a href="${escapeAttr(href)}">`);
    state.linkDepth += 1;
    await body();
    state.linkDepth -= 1;
    state.writer.raw('</a>');
  };

  const walkChildren = async (parent: Element): Promise<void> => {
    for (const child of Array.from(parent.children)) await walk(child);
  };

  const walk = async (element: Element): Promise<void> => {
    switch (element.localName) {
      case 'r':
        await convertRun(element);
        return;
      case 'hyperlink':
        await withAnchor(await hyperlinkHref(element, ctx), () => walkChildren(element));
        return;
      case 'fldSimple':
        // Le résultat du champ est rendu ; un champ hors fusion / page / lien est signalé.
        reportLost(element, ctx);
        await withAnchor(hyperlinkTarget(wordAttribute(element, 'instr')), () =>
          walkChildren(element),
        );
        return;
      case 'sdt': {
        const content = childNamed(element, 'sdtContent');
        if (content) await walkChildren(content);
        return;
      }
      case 'ins':
      case 'moveTo':
        // Texte inséré conservé ; la révision est signalée une fois par document (lost.ts).
        reportLost(element, ctx);
        await walkChildren(element);
        return;
      case 'del':
      case 'moveFrom':
        // Texte supprimé retiré, révision signalée.
        reportLost(element, ctx);
        return;
      case 'smartTag':
      case 'customXml':
      case 'dir':
      case 'bdo':
        await walkChildren(element);
        return;
      default:
        // `w:pPr`, signets, marques de commentaire, `w:proofErr` : rien à rendre. Le reste
        // (maths, objets, champs inconnus…) est signalé comme objet non représentable.
        if (!IGNORED_PARAGRAPH_CHILDREN.has(element.localName)) reportLost(element, ctx);
        return;
    }
  };

  /** Vrai tant qu'un champ (même englobant) est encore dans sa partie instruction. */
  const inInstruction = (): boolean => state.fields.some((frame) => frame.phase === 'instr');

  const fieldChar = (element: Element): void => {
    const type = wordAttribute(element, 'fldCharType');
    const top = state.fields[state.fields.length - 1];
    if (type === 'begin') {
      state.fields.push({ instr: [], phase: 'instr', anchor: false });
    } else if (type === 'separate' && top && top.phase === 'instr') {
      top.phase = 'result';
      const href = safeHref(hyperlinkTarget(top.instr.join('')));
      if (href !== null && !inInstruction()) {
        state.writer.raw(`<a href="${escapeAttr(href)}">`);
        state.linkDepth += 1;
        top.anchor = true;
      }
    } else if (type === 'end' && top) {
      if (top.anchor) {
        state.linkDepth -= 1;
        state.writer.raw('</a>');
      }
      state.fields.pop();
    }
  };

  const convertRun = async (run: Element): Promise<void> => {
    const resolved = ctx.styles.run(childNamed(run, 'rPr'), props);
    const tags = renderRunTags(resolved, baseline);
    for (const child of Array.from(run.children)) {
      const top = state.fields[state.fields.length - 1];
      switch (child.localName) {
        case 't':
          if (!inInstruction()) state.writer.text(tags, escapeHtml(child.textContent ?? ''));
          break;
        case 'instrText':
          if (top && top.phase === 'instr') top.instr.push(child.textContent ?? '');
          reportLost(child, ctx);
          break;
        case 'fldChar':
          fieldChar(child);
          break;
        case 'tab':
          if (inInstruction()) break;
          state.writer.text(tags, tabHtml(state.tabStops[state.tabIndex]));
          state.tabIndex += 1;
          break;
        case 'ptab':
          // Tabulation absolue (`w:ptab`) : tabulation sans taquet, hors du décompte.
          if (!inInstruction()) state.writer.text(tags, tabHtml());
          break;
        case 'br':
          if (inInstruction()) break;
          if (wordAttribute(child, 'type') === 'page' && state.linkDepth === 0 && !top) {
            state.writer.raw(PAGE_BREAK);
          } else {
            state.writer.raw('<br>');
          }
          break;
        case 'cr':
          if (!inInstruction()) state.writer.raw('<br>');
          break;
        case 'sym': {
          if (inInstruction()) break;
          // Police du symbole validée comme celle d'un `w:rFonts` ; irrecevable → celle du run.
          const font = fontName(wordAttribute(child, 'font'));
          const symbolTags =
            font && font !== resolved.fontFamily
              ? renderRunTags({ ...resolved, fontFamily: font }, baseline)
              : tags;
          state.writer.text(symbolTags, escapeHtml(symbolChar(child)));
          break;
        }
        case 'noBreakHyphen':
          if (!inInstruction()) state.writer.text(tags, NO_BREAK_HYPHEN);
          break;
        case 'softHyphen':
          if (!inInstruction()) state.writer.text(tags, SOFT_HYPHEN);
          break;
        case 'drawing':
        case 'pict':
          if (!inInstruction()) state.writer.raw(await ctx.images.drawing(child, ctx));
          break;
        case 'AlternateContent': {
          // Word 2010+ enveloppe zones de texte et formes `wps` : `<mc:Choice>` porte le
          // dessin moderne, `<mc:Fallback>` son équivalent VML. Seul le premier enfant du
          // `Choice` est traité, le `Fallback` jamais (sinon l'objet serait produit deux fois).
          if (inInstruction()) break;
          const choice = childNamed(child, 'Choice');
          const content = choice?.firstElementChild ?? null;
          if (!content) {
            reportLost(child, ctx);
          } else if (content.localName === 'drawing' || content.localName === 'pict') {
            state.writer.raw(await ctx.images.drawing(content, ctx));
          } else {
            reportLost(content, ctx);
          }
          break;
        }
        case 'footnoteReference':
        case 'endnoteReference': {
          const id = wordAttribute(child, 'id');
          if (id && !inInstruction()) {
            const kind = child.localName === 'footnoteReference' ? 'footnote' : 'endnote';
            state.writer.raw(ctx.notes.reference(id, kind, ctx));
          }
          break;
        }
        default:
          // `w:rPr`, `w:delText`, `w:lastRenderedPageBreak` : ignorés. Objets incorporés,
          // références de commentaire et maths dans un run : signalés, jamais rendus.
          if (LOST_RUN_CHILDREN.has(child.localName)) reportLost(child, ctx);
          break;
      }
    }
  };

  await walkChildren(paragraph);
  // Champs jamais fermés (`w:fldChar end` absent ou dans un paragraphe suivant) : leurs
  // `<a>` sont fermés ici, sinon le parseur HTML les reconstruirait dans chaque paragraphe
  // suivant. Aucun `<a>` ouvert ne survit à `convertRuns`.
  while (state.fields.length > 0) {
    const frame = state.fields.pop();
    if (frame?.anchor) {
      state.linkDepth -= 1;
      state.writer.raw('</a>');
    }
  }
  return state.writer.result();
}
