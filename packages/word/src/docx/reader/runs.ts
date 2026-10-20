import type { DocxLostObject } from '../types';
import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import { escapeAttr, escapeHtml, pt, styleAttr } from './html';
import { detectLostInline } from './lost';
import { tabStopsOf } from './properties';
import { docDefaultsOf } from './styles';
import type { ConverterContext, ResolvedParagraphProps, ResolvedRunProps } from './types';
import { cssFontFamily, fontName } from './units';

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
  const fontFamily = differs('fontFamily');
  const spacing = differs('letterSpacingPt');
  const caps = differs('caps');
  const style = styleAttr([
    // Ordre des déclarations = celui que le core sérialise (attributs de `textStyle`), pour
    // que `setHTML(getHTML())` dans l'éditeur rende exactement ce HTML. La police est
    // citée quand elle contient un espace (`"Wingdings 2"`) : le core relit la valeur
    // telle quelle (`getStyleProperty`) et la ré-émet à l'identique, guillemets compris.
    ['background-color', differs('highlight')],
    ['color', differs('color')],
    ['font-family', fontFamily === undefined ? undefined : cssFontFamily(fontFamily)],
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
  /** Taquets du paragraphe et rang de la prochaine tabulation rendue. */
  readonly tabStops: readonly number[];
  tabIndex: number;
}

/** Jeton d'instruction de champ : chaîne entre guillemets ou mot. */
const FIELD_TOKEN = /"([^"]*)"|(\S+)/g;

/** Commutateurs de `HYPERLINK` qui prennent un argument, hors `\l` (traité à part). */
const HYPERLINK_SWITCHES_WITH_ARGUMENT: ReadonlySet<string> = new Set(['o', 't']);

/**
 * Cible d'une instruction `HYPERLINK` : la première chaîne (citée ou non) qui n'est pas
 * l'argument d'un commutateur est l'URL ; `\l "x"` ajoute le fragment `#x` (seul, c'est
 * un signet interne `#x`). `HYPERLINK "https://x.io/p" \l "sec2"` → `https://x.io/p#sec2`.
 * `null` pour un autre champ ou une instruction sans cible.
 */
export function hyperlinkTarget(instr: string): string | null {
  const tokens: { readonly value: string; readonly quoted: boolean }[] = [];
  for (const match of instr.matchAll(FIELD_TOKEN)) {
    tokens.push({ value: match[1] ?? match[2] ?? '', quoted: match[1] !== undefined });
  }
  const keyword = tokens[0];
  if (!keyword || keyword.quoted || keyword.value.toUpperCase() !== 'HYPERLINK') return null;
  let target: string | undefined;
  let fragment: string | undefined;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (!token.quoted && token.value.startsWith('\\')) {
      const name = token.value.slice(1).toLowerCase();
      if (name === 'l') {
        fragment = tokens[index + 1]?.value;
        index += 1;
      } else if (HYPERLINK_SWITCHES_WITH_ARGUMENT.has(name)) {
        index += 1;
      }
      continue;
    }
    target ??= token.value;
  }
  if (fragment) return `${target ?? ''}#${fragment}`;
  return target || null;
}

/** Protocoles autorisés dans un `href` produit par le lecteur. */
const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * `href` sûr hors de l'éditeur : `http`, `https`, `mailto`, `tel`, les ancres `#…` et les
 * URL relatives passent ; tout autre protocole (`javascript:`, `data:`, `vbscript:`…)
 * retire le lien, le texte est conservé. Le protocole est lu après suppression des
 * caractères de contrôle et espaces, comme un navigateur le ferait (`java\tscript:`).
 */
export function safeHref(href: string | null): string | null {
  if (href === null) return null;
  const trimmed = href.trim();
  if (trimmed === '') return null;
  // eslint-disable-next-line no-control-regex -- les contrôles C0 sont précisément la cible.
  const probe = trimmed.replace(/[\u0000- \u007f]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(probe);
  if (scheme && !SAFE_PROTOCOLS.has(scheme[1] ?? '')) return null;
  return trimmed;
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
