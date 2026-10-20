import type { BlockBorder } from '@aster-editor/core';
import { highlightName } from '../../export/css';
import type { DocxExportWarning } from '../../export/types';
import { allNamed, childNamed, childrenNamed } from '../preprocess/xml-utils';
import type { DocxStyleResolver } from '../reader/styles';
import type { ResolvedParagraphProps, ResolvedRunProps } from '../reader/types';
import { createSibling, removeWordAttr, setWordAttr, wordAttr, type PartStore } from './xml-io';

/**
 * Styles du corps greffé. Un style référencé par le corps (`w:pStyle`, `w:rStyle`,
 * `w:tblStyle`) est **réutilisé** s'il existe dans le gabarit, **ajouté** depuis
 * `styles.xml` de l'export neuf sinon (`Quote`, `Code`, `ListParagraph`…), et retiré avec
 * avertissement `template-style-missing` s'il n'existe nulle part. Les styles du gabarit
 * ne sont jamais modifiés.
 *
 * Le corps généré porte en propriétés directes tout ce que l'éditeur affichait, y compris
 * ce qui venait du style (interligne du `Normal`, italique d'une `Citation`…). Pour que
 * le paragraphe ressorte comme dans l'original, `stripParagraph` résout le style avec le
 * `StyleResolver` du lecteur et **retire chaque propriété directe égale au style résolu** ;
 * ne restent que les vraies surcharges.
 */

export interface StyleMergerInput {
  readonly template: PartStore;
  readonly generated: PartStore;
  /** Chemin de `styles.xml` du gabarit (relation `/styles`). */
  readonly templatePath: string;
  readonly resolver: DocxStyleResolver;
  readonly warnings: DocxExportWarning[];
}

/** Issue d'`ensure` : où le style a été trouvé, et l'identifiant à écrire dans le corps. */
export interface EnsuredStyle {
  /**
   * `template` : défini dans le gabarit ; `renamed` : le gabarit définit un style de même
   * nom sous un autre identifiant (Word localise les identifiants : `Lienhypertexte` pour
   * « Hyperlink ») ; `added` : copié depuis l'export ; `missing` : introuvable.
   */
  readonly status: 'template' | 'renamed' | 'added' | 'missing';
  readonly id: string;
}

export interface StyleMerger {
  /** Identifiants définis dans le gabarit (styles ajoutés compris). */
  readonly ids: ReadonlySet<string>;
  /** Garantit la définition d'un style et rend l'identifiant à écrire (voir `EnsuredStyle`). */
  ensure(styleId: string): Promise<EnsuredStyle>;
  /**
   * Retire des `w:pPr` et `w:rPr` d'un paragraphe les propriétés directes égales à ce que
   * ses styles (et les défauts du document) donnent déjà. Rend le paragraphe résolu.
   */
  stripParagraph(paragraph: Element): ResolvedParagraphProps;
}

/** Références d'un `w:style` vers d'autres styles, à garantir avec lui. */
const STYLE_LINKS = ['basedOn', 'next', 'link'] as const;

/** Crée le fusionneur de styles du gabarit. */
export async function createStyleMerger(input: StyleMergerInput): Promise<StyleMerger> {
  const templateDoc = await input.template.dom(input.templatePath);
  const generatedDoc = await input.generated.dom('word/styles.xml');
  const ids = new Set<string>();
  /** Nom (`w:name`, minuscules) et type → identifiant du gabarit : Word localise les identifiants, pas les noms. */
  const templateByName = new Map<string, string>();
  const generatedStyles = new Map<string, Element>();
  let defaultParagraphStyle = '';
  const nameKey = (style: Element): string => {
    const name = childNamed(style, 'name');
    return `${wordAttr(style, 'type') || 'paragraph'}:${(name ? wordAttr(name, 'val') : '').trim().toLowerCase()}`;
  };
  if (templateDoc) {
    for (const style of childrenNamed(templateDoc.documentElement, 'style')) {
      const id = wordAttr(style, 'styleId');
      if (!id) continue;
      ids.add(id);
      const key = nameKey(style);
      if (!key.endsWith(':') && !templateByName.has(key)) templateByName.set(key, id);
      const isDefault = wordAttr(style, 'default') === '1' || wordAttr(style, 'default') === 'true';
      if (isDefault && wordAttr(style, 'type') === 'paragraph' && !defaultParagraphStyle) {
        defaultParagraphStyle = id;
      }
    }
  }
  if (generatedDoc) {
    for (const style of childrenNamed(generatedDoc.documentElement, 'style')) {
      const id = wordAttr(style, 'styleId');
      if (id) generatedStyles.set(id, style);
    }
  }
  const warned = new Set<string>();
  const renamed = new Map<string, string>();

  const ensure = async (styleId: string): Promise<EnsuredStyle> => {
    if (ids.has(styleId)) return { status: 'template', id: styleId };
    const known = renamed.get(styleId);
    if (known !== undefined) return { status: 'renamed', id: known };
    const generated = generatedStyles.get(styleId);
    if (!generated || !templateDoc) {
      if (!warned.has(styleId)) {
        warned.add(styleId);
        input.warnings.push({
          code: 'template-style-missing',
          message: `Style « ${styleId} » absent du gabarit et de l'export : propriétés directes seules`,
        });
      }
      return { status: 'missing', id: styleId };
    }
    const sameName = templateByName.get(nameKey(generated));
    if (sameName !== undefined) {
      renamed.set(styleId, sameName);
      return { status: 'renamed', id: sameName };
    }
    ids.add(styleId);
    templateDoc.documentElement.appendChild(templateDoc.importNode(generated, true));
    await input.template.markChanged(input.templatePath);
    // Un style copié peut en référencer un autre (`basedOn="Normal"`, `link`) : on le suit.
    for (const link of STYLE_LINKS) {
      const reference = childNamed(generated, link);
      const target = reference ? wordAttr(reference, 'val') : '';
      if (target && target !== styleId && generatedStyles.has(target)) await ensure(target);
    }
    return { status: 'added', id: styleId };
  };

  const resolver = input.resolver;

  return {
    ids,
    ensure,
    stripParagraph(paragraph) {
      const defaults = resolver.docDefaults();
      let pPr = childNamed(paragraph, 'pPr');
      // Le style de paragraphe par défaut (`Normal`) s'applique sans `w:pStyle` : Word ne l'écrit pas.
      const pStyle = pPr ? childNamed(pPr, 'pStyle') : null;
      if (pStyle && defaultParagraphStyle && wordAttr(pStyle, 'val') === defaultParagraphStyle) {
        pStyle.remove();
      }
      const full = resolver.paragraph(pPr);
      const base = resolver.paragraph(pPr ? styleOnly(pPr, 'pStyle') : null);
      const direct = pPr ? directParagraphKeys(pPr) : new Set<ParagraphKey>();
      if (pPr) stripParagraphProperties(pPr, full, base);
      pPr = reconcileParagraph(paragraph, pPr, direct, base, defaults.paragraph);
      if (pPr && pPr.children.length === 0) pPr.remove();
      for (const run of allNamed(paragraph, 'r')) {
        let rPr = childNamed(run, 'rPr');
        const styleOnlyRPr = rPr ? styleOnly(rPr, 'rStyle') : null;
        const baseRun = resolver.run(styleOnlyRPr, full);
        const directRun = rPr ? directRunKeys(rPr) : new Set<RunKey>();
        if (rPr) stripRunProperties(rPr, resolver.run(rPr, full), baseRun);
        // Ce que le style de caractère pose lui-même (couleur et souligné d'un lien, police
        // d'un code) est voulu et n'est pas réconcilié ; le reste vient du style de paragraphe.
        const owned = styleOnlyRPr ? resolver.run(styleOnlyRPr, defaults.paragraph) : defaults.run;
        for (const key of ownedRunKeys(owned, defaults.run)) directRun.add(key);
        rPr = reconcileRun(run, rPr, directRun, baseRun, defaults.run);
        if (rPr && rPr.children.length === 0) rPr.remove();
      }
      return full;
    },
  };
}

/*
 * Réconciliation. Le lecteur n'écrit dans le HTML que ce qui diffère des `docDefaults`
 * du document, jamais de ce que le style de paragraphe apporte : un run sans
 * `font-family` signifie « police des docDefaults », même si le style du paragraphe en
 * impose une autre (le run d'origine portait alors cette police en propriété directe,
 * que l'import a jugée redondante). Pour que le document ressorte comme l'original, toute
 * propriété **absente** du run ou du paragraphe généré dont le style résolu diffère des
 * `docDefaults` est réécrite en propriété directe à la valeur des `docDefaults` (ou à
 * « rien » : `w:b w:val="0"`, `w:u w:val="none"`, bordure `nil`…).
 */

type ParagraphKey =
  | 'align'
  | 'before'
  | 'after'
  | 'line'
  | 'left'
  | 'right'
  | 'first'
  | 'borders'
  | 'shading'
  | 'keepNext'
  | 'pageBreakBefore';

type RunKey =
  | 'fontFamily'
  | 'fontSizePt'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'color'
  | 'highlight'
  | 'superscript'
  | 'letterSpacing'
  | 'caps';

/** Ordre du schéma des enfants de `w:pPr` que la greffe peut écrire. */
const PPR_ORDER: readonly string[] = [
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
const RPR_ORDER: readonly string[] = [
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

/** Clés de paragraphe portées en propriété directe par un `w:pPr`. */
function directParagraphKeys(pPr: Element): Set<ParagraphKey> {
  const keys = new Set<ParagraphKey>();
  for (const child of Array.from(pPr.children)) {
    switch (child.localName) {
      case 'jc':
        keys.add('align');
        break;
      case 'spacing':
        if (wordAttr(child, 'before')) keys.add('before');
        if (wordAttr(child, 'after')) keys.add('after');
        if (wordAttr(child, 'line')) keys.add('line');
        break;
      case 'ind':
        if (wordAttr(child, 'left') || wordAttr(child, 'start')) keys.add('left');
        if (wordAttr(child, 'right') || wordAttr(child, 'end')) keys.add('right');
        if (wordAttr(child, 'hanging') || wordAttr(child, 'firstLine')) keys.add('first');
        break;
      case 'pBdr':
        keys.add('borders');
        break;
      case 'shd':
        keys.add('shading');
        break;
      case 'keepNext':
        keys.add('keepNext');
        break;
      case 'pageBreakBefore':
        keys.add('pageBreakBefore');
        break;
      default:
        break;
    }
  }
  return keys;
}

/** Clés de run portées en propriété directe par un `w:rPr`. */
function directRunKeys(rPr: Element): Set<RunKey> {
  const keys = new Set<RunKey>();
  for (const child of Array.from(rPr.children)) {
    switch (child.localName) {
      case 'rFonts':
        keys.add('fontFamily');
        break;
      case 'sz':
        keys.add('fontSizePt');
        break;
      case 'b':
        keys.add('bold');
        break;
      case 'i':
        keys.add('italic');
        break;
      case 'u':
        keys.add('underline');
        break;
      case 'strike':
      case 'dstrike':
        keys.add('strike');
        break;
      case 'color':
        keys.add('color');
        break;
      case 'highlight':
      case 'shd':
        keys.add('highlight');
        break;
      case 'vertAlign':
        keys.add('superscript');
        break;
      case 'spacing':
        keys.add('letterSpacing');
        break;
      case 'caps':
      case 'smallCaps':
        keys.add('caps');
        break;
      default:
        break;
    }
  }
  return keys;
}

/** Clés de run qu'un style de caractère pose lui-même (sa résolution sur les `docDefaults` en diffère). */
function ownedRunKeys(owned: ResolvedRunProps, defaults: ResolvedRunProps): RunKey[] {
  const keys: RunKey[] = [];
  if (owned.fontFamily !== defaults.fontFamily) keys.push('fontFamily');
  if (owned.fontSizePt !== defaults.fontSizePt) keys.push('fontSizePt');
  if (Boolean(owned.bold) !== Boolean(defaults.bold)) keys.push('bold');
  if (Boolean(owned.italic) !== Boolean(defaults.italic)) keys.push('italic');
  if ((owned.underline ?? null) !== (defaults.underline ?? null)) keys.push('underline');
  if ((owned.strike ?? null) !== (defaults.strike ?? null)) keys.push('strike');
  if (owned.color !== defaults.color) keys.push('color');
  if (owned.highlight !== defaults.highlight) keys.push('highlight');
  if (
    Boolean(owned.superscript) !== Boolean(defaults.superscript) ||
    Boolean(owned.subscript) !== Boolean(defaults.subscript)
  ) {
    keys.push('superscript');
  }
  if (owned.letterSpacingPt !== defaults.letterSpacingPt) keys.push('letterSpacing');
  if (owned.caps !== defaults.caps) keys.push('caps');
  return keys;
}

/** Insère `element` dans `container` à la place que lui donne `order` (après les éléments inconnus). */
function insertOrdered(container: Element, element: Element, order: readonly string[]): void {
  const rank = order.indexOf(element.localName);
  const anchor = Array.from(container.children).find((child) => {
    const childRank = order.indexOf(child.localName);
    return childRank >= 0 && childRank > rank;
  });
  container.insertBefore(element, anchor ?? null);
}

/** Élément `w:<localName>` avec ses attributs `w:…`, dans l'espace de noms de `reference`. */
function wordElement(
  reference: Element,
  localName: string,
  attributes: Readonly<Record<string, string>> = {},
): Element {
  const element = createSibling(reference, localName);
  for (const [name, value] of Object.entries(attributes)) setWordAttr(element, name, value);
  return element;
}

/** Enfant `w:<localName>` existant ou créé à sa place dans l'ordre du schéma. */
function ensureChild(container: Element, localName: string, order: readonly string[]): Element {
  const existing = childNamed(container, localName);
  if (existing) return existing;
  const element = createSibling(container, localName);
  insertOrdered(container, element, order);
  return element;
}

/** `#rrggbb` → `RRGGBB` ; absent → `auto`. */
function wordColor(css: string | undefined): string {
  return css ? css.replace(/^#/, '').toUpperCase() : 'auto';
}

function twips(points: number | undefined): string {
  return String(Math.round((points ?? 0) * 20));
}

/** Bordure du contrat → `w:val`, `w:sz` (huitièmes de point), `w:color`. */
function borderAttributes(border: BlockBorder): Record<string, string> {
  return {
    val: border.style === 'solid' ? 'single' : border.style,
    sz: String(Math.max(2, Math.round(border.widthPt * 8))),
    space: border.side === 'left' || border.side === 'right' ? '4' : '1',
    color: wordColor(border.color),
  };
}

/**
 * Propriétés de paragraphe absentes du `w:pPr` dont le style résolu (`base`) diffère des
 * `docDefaults` : réécrites à la valeur des `docDefaults`. Rend le `w:pPr`, créé au besoin.
 */
function reconcileParagraph(
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
    for (const border of base.borders ?? []) {
      sides.set(border.side, wordElement(paragraph, border.side, { val: 'nil' }));
    }
    for (const border of defaults.borders ?? []) {
      sides.set(border.side, wordElement(paragraph, border.side, borderAttributes(border)));
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
function reconcileRun(
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

/** Copie d'un conteneur de propriétés réduite à sa référence de style (`w:pStyle` / `w:rStyle`). */
function styleOnly(properties: Element, styleElement: string): Element | null {
  const style = childNamed(properties, styleElement);
  if (!style) return null;
  const clone = properties.cloneNode(false) as Element;
  clone.appendChild(style.cloneNode(true));
  return clone;
}

function sameBorders(
  a: readonly BlockBorder[] | undefined,
  b: readonly BlockBorder[] | undefined,
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Retire les attributs `names` ; rend vrai s'il ne reste aucun attribut `w:`. */
function dropAttributes(element: Element, names: readonly string[]): boolean {
  for (const name of names) removeWordAttr(element, name);
  return element.attributes.length === 0;
}

/**
 * Propriétés de paragraphe (`w:pPr`) : chaque élément dont la valeur résolue avec lui
 * (`full`) égale la valeur résolue sans lui (`base`) est retiré. `w:spacing` et `w:ind`
 * sont traités attribut par attribut.
 */
function stripParagraphProperties(
  pPr: Element,
  full: ResolvedParagraphProps,
  base: ResolvedParagraphProps,
): void {
  for (const child of Array.from(pPr.children)) {
    switch (child.localName) {
      case 'jc':
        if (full.align === base.align) child.remove();
        break;
      case 'spacing': {
        const drop: string[] = [];
        if (wordAttr(child, 'before') && full.spacingBeforePt === base.spacingBeforePt) {
          drop.push('before');
        }
        if (wordAttr(child, 'after') && full.spacingAfterPt === base.spacingAfterPt) {
          drop.push('after');
        }
        if (
          wordAttr(child, 'line') &&
          full.lineHeight === base.lineHeight &&
          full.lineHeightPt === base.lineHeightPt
        ) {
          drop.push('line', 'lineRule');
        }
        if (dropAttributes(child, drop)) child.remove();
        break;
      }
      case 'ind': {
        const drop: string[] = [];
        if (
          (wordAttr(child, 'left') || wordAttr(child, 'start')) &&
          full.indentLeftPt === base.indentLeftPt
        ) {
          drop.push('left', 'start');
        }
        if (
          (wordAttr(child, 'right') || wordAttr(child, 'end')) &&
          full.indentRightPt === base.indentRightPt
        ) {
          drop.push('right', 'end');
        }
        if (
          (wordAttr(child, 'hanging') || wordAttr(child, 'firstLine')) &&
          full.indentFirstLinePt === base.indentFirstLinePt
        ) {
          drop.push('hanging', 'firstLine');
        }
        if (dropAttributes(child, drop)) child.remove();
        break;
      }
      case 'pBdr':
        if (sameBorders(full.borders, base.borders)) child.remove();
        break;
      case 'shd':
        if (full.shading === base.shading) child.remove();
        break;
      case 'keepNext':
        if (Boolean(full.keepWithNext) === Boolean(base.keepWithNext)) child.remove();
        break;
      case 'pageBreakBefore':
        if (Boolean(full.pageBreakBefore) === Boolean(base.pageBreakBefore)) child.remove();
        break;
      default:
        break;
    }
  }
}

/** Propriétés de run (`w:rPr`) : même principe, élément par élément. */
function stripRunProperties(rPr: Element, full: ResolvedRunProps, base: ResolvedRunProps): void {
  const hasHighlight = childNamed(rPr, 'highlight') !== null;
  for (const child of Array.from(rPr.children)) {
    let redundant = false;
    switch (child.localName) {
      case 'rFonts':
        redundant = full.fontFamily === base.fontFamily;
        break;
      case 'b':
      case 'bCs':
        redundant = Boolean(full.bold) === Boolean(base.bold);
        break;
      case 'i':
      case 'iCs':
        redundant = Boolean(full.italic) === Boolean(base.italic);
        break;
      case 'u':
        redundant = (full.underline ?? null) === (base.underline ?? null);
        break;
      case 'strike':
      case 'dstrike':
        redundant = (full.strike ?? null) === (base.strike ?? null);
        break;
      case 'color':
        redundant = full.color === base.color;
        break;
      case 'sz':
      case 'szCs':
        redundant = full.fontSizePt === base.fontSizePt;
        break;
      case 'highlight':
        redundant = full.highlight === base.highlight;
        break;
      case 'shd':
        redundant = !hasHighlight && full.highlight === base.highlight;
        break;
      case 'vertAlign':
        redundant =
          Boolean(full.superscript) === Boolean(base.superscript) &&
          Boolean(full.subscript) === Boolean(base.subscript);
        break;
      case 'spacing':
        redundant = full.letterSpacingPt === base.letterSpacingPt;
        break;
      case 'caps':
      case 'smallCaps':
        redundant = full.caps === base.caps;
        break;
      case 'lang':
        redundant = full.lang === base.lang;
        break;
      default:
        break;
    }
    if (redundant) child.remove();
  }
}
