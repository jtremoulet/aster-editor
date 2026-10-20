import type { BlockBorder } from '@aster-editor/core';
import { highlightName } from '../../export/css';
import { paragraphBorderSpace } from '../../export/styles';
import { childNamed } from '../preprocess/xml-utils';
import type { ResolvedParagraphProps, ResolvedRunProps } from '../reader/types';
import { sameBorders, type ParagraphKey, type RunKey } from './style-strip';
import { createSibling, ensureChild, insertOrdered, setWordAttr, wordElement } from './xml-io';

/**
 * Réconciliation du corps greffé avec les styles du gabarit. Le lecteur n'écrit dans le
 * HTML que ce qui diffère des `docDefaults` du document, jamais ce que le style de
 * paragraphe apporte : un run sans `font-family` signifie « police des docDefaults », même
 * si le style du paragraphe en impose une autre (le run d'origine portait alors cette
 * police en propriété directe, que l'import a jugée redondante). Pour que le document
 * ressorte comme l'original, toute propriété **absente** du run ou du paragraphe généré
 * dont le style résolu diffère des `docDefaults` est réécrite en propriété directe à la
 * valeur des `docDefaults` (ou à « rien » : `w:b w:val="0"`, `w:u w:val="none"`, bordure
 * `nil`…).
 */

/** Ordre du schéma des enfants de `w:pPr` que la greffe peut écrire. */
export const PPR_ORDER: readonly string[] = [
  'pStyle',
  'keepNext',
  'keepLines',
  'pageBreakBefore',
  'framePr',
  'widowControl',
  'numPr',
  'suppressLineNumbers',
  'pBdr',
  'shd',
  'tabs',
  'suppressAutoHyphens',
  'kinsoku',
  'wordWrap',
  'overflowPunct',
  'topLinePunct',
  'autoSpaceDE',
  'autoSpaceDN',
  'bidi',
  'adjustRightInd',
  'snapToGrid',
  'spacing',
  'ind',
  'contextualSpacing',
  'mirrorIndents',
  'suppressOverlap',
  'jc',
  'textDirection',
  'textAlignment',
  'textboxTightWrap',
  'outlineLvl',
  'divId',
  'cnfStyle',
  'rPr',
  'sectPr',
  'pPrChange',
];

/** Ordre du schéma des enfants de `w:rPr` que la greffe peut écrire. */
export const RPR_ORDER: readonly string[] = [
  'rStyle',
  'rFonts',
  'b',
  'bCs',
  'i',
  'iCs',
  'caps',
  'smallCaps',
  'strike',
  'dstrike',
  'outline',
  'shadow',
  'emboss',
  'imprint',
  'noProof',
  'snapToGrid',
  'vanish',
  'webHidden',
  'color',
  'spacing',
  'w',
  'kern',
  'position',
  'sz',
  'szCs',
  'highlight',
  'u',
  'effect',
  'bdr',
  'shd',
  'fitText',
  'vertAlign',
  'rtl',
  'cs',
  'em',
  'lang',
  'eastAsianLayout',
  'specVanish',
  'oMath',
];

/** `#rrggbb` → `RRGGBB` ; absent → `auto`. */
function wordColor(css: string | undefined): string {
  return css ? css.replace(/^#/, '').toUpperCase() : 'auto';
}

function twips(points: number | undefined): string {
  return String(Math.round((points ?? 0) * 20));
}

/**
 * Bordure du contrat → `w:val`, `w:sz` (huitièmes de point), `w:space`, `w:color`. Le
 * contrat `BlockBorder` ne porte pas l'espace texte-trait : il est déduit de la
 * composition de l'encadré (voir `paragraphBorderSpace`).
 */
function borderAttributes(border: BlockBorder, sides: ReadonlySet<string>): Record<string, string> {
  return {
    val: border.style === 'solid' ? 'single' : border.style,
    sz: String(Math.max(2, Math.round(border.widthPt * 8))),
    space: String(paragraphBorderSpace(border.side, sides)),
    color: wordColor(border.color),
  };
}

/**
 * Propriétés de paragraphe absentes du `w:pPr` dont le style résolu (`base`) diffère des
 * `docDefaults` : réécrites à la valeur des `docDefaults`. Rend le `w:pPr`, créé au besoin.
 */
export function reconcileParagraph(
  paragraph: Element,
  existing: Element | null,
  direct: ReadonlySet<ParagraphKey>,
  base: ResolvedParagraphProps,
  defaults: ResolvedParagraphProps,
): Element | null {
  let pPr = existing;
  const container = (): Element => {
    if (!pPr) {
      pPr = createSibling(paragraph, 'pPr');
      paragraph.insertBefore(pPr, paragraph.firstChild);
    }
    return pPr;
  };
  const missing = (key: ParagraphKey): boolean => !direct.has(key);
  const align = (value: string | undefined): string | undefined =>
    value === undefined || value === 'left' ? undefined : value;
  // Une numérotation portée par le style sans liste dans le HTML : annulée (`w:numId` 0),
  // comme Word l'écrit quand on retire la puce d'un paragraphe de style numéroté.
  if (base.numbering && !(existing && childNamed(existing, 'numPr'))) {
    const numPr = wordElement(paragraph, 'numPr');
    numPr.appendChild(wordElement(paragraph, 'ilvl', { val: '0' }));
    numPr.appendChild(wordElement(paragraph, 'numId', { val: '0' }));
    insertOrdered(container(), numPr, PPR_ORDER);
  }
  if (missing('align') && align(base.align) !== align(defaults.align)) {
    const value = defaults.align === 'justify' ? 'both' : (defaults.align ?? 'left');
    insertOrdered(container(), wordElement(paragraph, 'jc', { val: value }), PPR_ORDER);
  }
  const spacing: Record<string, string> = {};
  if (missing('before') && base.spacingBeforePt !== defaults.spacingBeforePt) {
    spacing.before = twips(defaults.spacingBeforePt);
  }
  if (missing('after') && base.spacingAfterPt !== defaults.spacingAfterPt) {
    spacing.after = twips(defaults.spacingAfterPt);
  }
  if (
    missing('line') &&
    (base.lineHeight !== defaults.lineHeight || base.lineHeightPt !== defaults.lineHeightPt)
  ) {
    if (defaults.lineHeightPt !== undefined) {
      spacing.line = twips(defaults.lineHeightPt);
      spacing.lineRule = 'exact';
    } else {
      spacing.line = String(Math.round((defaults.lineHeight ?? 1) * 240));
      spacing.lineRule = 'auto';
    }
  }
  if (Object.keys(spacing).length > 0) {
    const element = ensureChild(container(), 'spacing', PPR_ORDER);
    for (const [name, value] of Object.entries(spacing)) setWordAttr(element, name, value);
  }
  const indent: Record<string, string> = {};
  // Dans une liste, le niveau de numérotation porte le retrait et l'import l'a retiré du
  // HTML : un paragraphe numéroté sans `margin-left` garde celui de sa numérotation.
  const numbered = existing !== null && childNamed(existing, 'numPr') !== null;
  if (!numbered && missing('left') && base.indentLeftPt !== defaults.indentLeftPt) {
    indent.left = twips(defaults.indentLeftPt);
  }
  if (!numbered && missing('right') && base.indentRightPt !== defaults.indentRightPt) {
    indent.right = twips(defaults.indentRightPt);
  }
  if (!numbered && missing('first') && base.indentFirstLinePt !== defaults.indentFirstLinePt) {
    const first = defaults.indentFirstLinePt ?? 0;
    if (first < 0) indent.hanging = twips(-first);
    else indent.firstLine = twips(first);
  }
  if (Object.keys(indent).length > 0) {
    const element = ensureChild(container(), 'ind', PPR_ORDER);
    for (const [name, value] of Object.entries(indent)) setWordAttr(element, name, value);
  }
  if (missing('borders') && !sameBorders(base.borders, defaults.borders)) {
    const pBdr = wordElement(paragraph, 'pBdr');
    const sides = new Map<string, Element>();
    const defaultSides = new Set((defaults.borders ?? []).map((border) => border.side));
    for (const border of base.borders ?? []) {
      sides.set(border.side, wordElement(paragraph, border.side, { val: 'nil' }));
    }
    for (const border of defaults.borders ?? []) {
      sides.set(
        border.side,
        wordElement(paragraph, border.side, borderAttributes(border, defaultSides)),
      );
    }
    for (const side of ['top', 'left', 'bottom', 'right', 'between']) {
      const element = sides.get(side);
      if (element) pBdr.appendChild(element);
    }
    insertOrdered(container(), pBdr, PPR_ORDER);
  }
  if (missing('shading') && base.shading !== defaults.shading) {
    insertOrdered(
      container(),
      wordElement(paragraph, 'shd', {
        val: 'clear',
        color: 'auto',
        fill: wordColor(defaults.shading),
      }),
      PPR_ORDER,
    );
  }
  if (missing('keepNext') && Boolean(base.keepWithNext) !== Boolean(defaults.keepWithNext)) {
    insertOrdered(
      container(),
      wordElement(paragraph, 'keepNext', { val: defaults.keepWithNext ? '1' : '0' }),
      PPR_ORDER,
    );
  }
  if (
    missing('pageBreakBefore') &&
    Boolean(base.pageBreakBefore) !== Boolean(defaults.pageBreakBefore)
  ) {
    insertOrdered(
      container(),
      wordElement(paragraph, 'pageBreakBefore', { val: defaults.pageBreakBefore ? '1' : '0' }),
      PPR_ORDER,
    );
  }
  return pPr;
}

/** `w:u w:val` d'un style de trait du contrat. */
function underlineValue(style: NonNullable<ResolvedRunProps['underline']>): string {
  switch (style) {
    case 'double':
      return 'double';
    case 'dotted':
      return 'dotted';
    case 'dashed':
      return 'dash';
    case 'wavy':
      return 'wave';
    default:
      return 'single';
  }
}

/**
 * Propriétés de run absentes du `w:rPr` dont le style de paragraphe résolu (`base`)
 * diffère des `docDefaults` : réécrites à la valeur des `docDefaults`. Rend le `w:rPr`,
 * créé au besoin.
 */
export function reconcileRun(
  run: Element,
  existing: Element | null,
  direct: ReadonlySet<RunKey>,
  base: ResolvedRunProps,
  defaults: ResolvedRunProps,
): Element | null {
  let rPr = existing;
  const add = (localName: string, attributes: Readonly<Record<string, string>> = {}): void => {
    if (!rPr) {
      rPr = createSibling(run, 'rPr');
      run.insertBefore(rPr, run.firstChild);
    }
    insertOrdered(rPr, wordElement(run, localName, attributes), RPR_ORDER);
  };
  const missing = (key: RunKey): boolean => !direct.has(key);
  if (missing('fontFamily') && base.fontFamily !== defaults.fontFamily && defaults.fontFamily) {
    const family = defaults.fontFamily;
    add('rFonts', { ascii: family, hAnsi: family, cs: family, eastAsia: family });
  }
  if (missing('bold') && Boolean(base.bold) !== Boolean(defaults.bold)) {
    const val = defaults.bold ? '1' : '0';
    add('b', { val });
    add('bCs', { val });
  }
  if (missing('italic') && Boolean(base.italic) !== Boolean(defaults.italic)) {
    const val = defaults.italic ? '1' : '0';
    add('i', { val });
    add('iCs', { val });
  }
  if (missing('caps') && base.caps !== defaults.caps) {
    if (base.caps === 'all' && defaults.caps !== 'all') add('caps', { val: '0' });
    if (base.caps === 'small' && defaults.caps !== 'small') add('smallCaps', { val: '0' });
    if (defaults.caps === 'all') add('caps');
    if (defaults.caps === 'small') add('smallCaps');
  }
  if (missing('strike') && (base.strike ?? null) !== (defaults.strike ?? null)) {
    if (defaults.strike === 'double') add('dstrike');
    else if (defaults.strike) add('strike');
    else {
      add('strike', { val: '0' });
      if (base.strike === 'double') add('dstrike', { val: '0' });
    }
  }
  if (missing('color') && base.color !== defaults.color) {
    add('color', { val: wordColor(defaults.color) });
  }
  if (missing('letterSpacing') && base.letterSpacingPt !== defaults.letterSpacingPt) {
    add('spacing', { val: twips(defaults.letterSpacingPt) });
  }
  if (missing('fontSizePt') && base.fontSizePt !== defaults.fontSizePt) {
    const val = String(Math.round((defaults.fontSizePt ?? 10) * 2));
    add('sz', { val });
    add('szCs', { val });
  }
  if (missing('highlight') && base.highlight !== defaults.highlight) {
    const name = defaults.highlight ? highlightName(wordColor(defaults.highlight)) : 'none';
    if (name) add('highlight', { val: name });
  }
  if (missing('underline') && (base.underline ?? null) !== (defaults.underline ?? null)) {
    add('u', { val: defaults.underline ? underlineValue(defaults.underline) : 'none' });
  }
  if (
    missing('superscript') &&
    (Boolean(base.superscript) !== Boolean(defaults.superscript) ||
      Boolean(base.subscript) !== Boolean(defaults.subscript))
  ) {
    const val = defaults.superscript
      ? 'superscript'
      : defaults.subscript
        ? 'subscript'
        : 'baseline';
    add('vertAlign', { val });
  }
  return rPr;
}
