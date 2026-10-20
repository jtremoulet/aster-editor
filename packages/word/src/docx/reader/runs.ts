import type { DocxLostObject } from '../types';
import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import { escapeAttr, escapeHtml, pt, styleAttr } from './html';
import { detectLostInline } from './lost';
import { docDefaultsOf } from './styles';
import type { ConverterContext, ResolvedParagraphProps, ResolvedRunProps } from './types';

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
 * - `w:tab` → espace cadratin U+2003 (un seul caractère, non replié par HTML, réversible
 *   à l'export) ;
 * - `w:br w:type="page"` → marqueur `PAGE_BREAK` dans le flux, que `paragraphs.ts` coupe
 *   en blocs frères ; dans un lien ou un champ, il dégénère en `<br>`.
 */

/** Marqueur de saut de page inséré dans le flux inline, extrait par `paragraphs.ts`. */
export const PAGE_BREAK = '<hr data-page-break>';

const TAB = String.fromCharCode(0x2003);
const NO_BREAK_HYPHEN = String.fromCharCode(0x2011);
const SOFT_HYPHEN = String.fromCharCode(0xad);

/** Balises ouvrantes et fermantes d'un run, dans l'ordre fixe du contrat. */
export interface RunTags {
  readonly open: string;
  readonly close: string;
}

function decorationAttr(style: string): string {
  return style === 'solid' ? '' : ` style="text-decoration-style: ${style}"`;
}

/**
 * Balises d'un run : `<strong><em><u><s><sup|sub><span style data-docx-run-style>`. Les
 * marques booléennes sont écrites dès qu'elles sont vraies ; les propriétés valuées
 * seulement si elles diffèrent de `baseline` (les `docDefaults`).
 */
export function renderRunTags(props: ResolvedRunProps, baseline: ResolvedRunProps): RunTags {
  const differs = <K extends keyof ResolvedRunProps>(key: K): ResolvedRunProps[K] | undefined =>
    props[key] !== undefined && props[key] !== baseline[key] ? props[key] : undefined;
  const fontSize = differs('fontSizePt');
  const spacing = differs('letterSpacingPt');
  const caps = differs('caps');
  const style = styleAttr([
    // Ordre des déclarations = celui que le core sérialise (attributs de `textStyle`), pour
    // que `setHTML(getHTML())` dans l'éditeur rende exactement ce HTML.
    ['background-color', differs('highlight')],
    ['color', differs('color')],
    ['font-family', differs('fontFamily')],
    ['font-size', fontSize === undefined ? undefined : pt(fontSize)],
    ['letter-spacing', spacing === undefined ? undefined : pt(spacing)],
    ['text-transform', caps === 'all' ? 'uppercase' : undefined],
    ['font-variant', caps === 'small' ? 'small-caps' : undefined],
  ]);
  const runStyle = props.runStyle ? ` data-docx-run-style="${escapeAttr(props.runStyle)}"` : '';
  const open: string[] = [];
  const close: string[] = [];
  const wrap = (tag: string, attrs = ''): void => {
    open.push(`<${tag}${attrs}>`);
    close.unshift(`</${tag}>`);
  };
  // Du plus extérieur au plus intérieur : l'imbrication est celle du schéma du core
  // (`<span><strong><em><s><u><sup>`), sans quoi l'aller-retour dans l'éditeur réordonne.
  if (style || runStyle) wrap('span', `${style}${runStyle}`);
  if (props.bold) wrap('strong');
  if (props.italic) wrap('em');
  if (props.strike) wrap('s', decorationAttr(props.strike));
  if (props.underline) wrap('u', decorationAttr(props.underline));
  if (props.superscript) wrap('sup');
  else if (props.subscript) wrap('sub');
  return { open: open.join(''), close: close.join('') };
}

/** Accumule le HTML inline en fusionnant les textes voisins portés par les mêmes balises. */
class InlineWriter {
  private readonly out: string[] = [];
  private current: { tags: RunTags; parts: string[] } | null = null;

  text(tags: RunTags, html: string): void {
    if (html === '') return;
    if (!this.current || this.current.tags.open !== tags.open) {
      this.flush();
      this.current = { tags, parts: [] };
    }
    this.current.parts.push(html);
  }

  raw(html: string): void {
    this.flush();
    if (html !== '') this.out.push(html);
  }

  private flush(): void {
    if (!this.current) return;
    const { tags, parts } = this.current;
    this.out.push(tags.open + parts.join('') + tags.close);
    this.current = null;
  }

  result(): string {
    this.flush();
    return this.out.join('');
  }
}

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
}

/** Cible d'une instruction `HYPERLINK "url"` ou `HYPERLINK \l "signet"`, sinon `null`. */
export function hyperlinkTarget(instr: string): string | null {
  const trimmed = instr.trim();
  if (!/^HYPERLINK\b/i.test(trimmed)) return null;
  const quoted = /"([^"]*)"/.exec(trimmed);
  const target = quoted ? quoted[1] : trimmed.split(/\s+/)[1];
  if (!target) return null;
  return /\\l\b/.test(trimmed) ? `#${target}` : target;
}

/** Attribut par nom local quel que soit son préfixe (`r:id`, `w:anchor`). */
function attrByLocalName(element: Element, localName: string): string {
  for (const attr of Array.from(element.attributes)) {
    if (attr.localName === localName) return attr.value;
  }
  return '';
}

async function hyperlinkHref(hyperlink: Element, ctx: ConverterContext): Promise<string | null> {
  const id = attrByLocalName(hyperlink, 'id');
  if (id) {
    const rel = (await ctx.pkg.rels(ctx.part)).get(id);
    if (rel?.external) return rel.target;
  }
  const anchor = wordAttribute(hyperlink, 'anchor');
  return anchor ? `#${anchor}` : null;
}

/** Caractère d'un `w:sym` (`w:char` hexadécimal), chaîne vide s'il est illisible. */
function symbolChar(sym: Element): string {
  const code = Number.parseInt(wordAttribute(sym, 'char'), 16);
  return Number.isFinite(code) ? String.fromCodePoint(code) : '';
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
  const state: WalkState = { writer: new InlineWriter(), fields: [], linkDepth: 0 };

  const withAnchor = async (href: string | null, body: () => Promise<void>): Promise<void> => {
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
      const href = hyperlinkTarget(top.instr.join(''));
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
        case 'ptab':
          if (!inInstruction()) state.writer.text(tags, TAB);
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
          const font = wordAttribute(child, 'font');
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
  return state.writer.result();
}
