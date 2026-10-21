import type { BlockBorder } from '@aster-editor/core';
import { childNamed } from '../preprocess/xml-utils.js';
import type { ResolvedParagraphProps, ResolvedRunProps } from '../reader/types.js';
import { removeWordAttr, wordAttr } from './xml-io.js';

/**
 * Retrait des propriétés directes redondantes du corps greffé. Le corps généré porte en
 * propriétés directes tout ce que l'éditeur affichait, y compris ce qui venait du style
 * (interligne du `Normal`, italique d'une `Citation`…). Chaque élément de `w:pPr` /
 * `w:rPr` dont la valeur résolue **avec** lui (`full`) égale la valeur résolue **sans** lui
 * (`base`, le style seul) est retiré ; ne restent que les vraies surcharges. Ce fichier ne
 * fait que retirer ; `style-reconcile.ts` réécrit ce qui manque.
 */

/** Propriétés de paragraphe que la greffe sait retirer ou réécrire. */
export type ParagraphKey =
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

/** Propriétés de run que la greffe sait retirer ou réécrire. */
export type RunKey =
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

/** Clés de paragraphe portées en propriété directe par un `w:pPr`. */
export function directParagraphKeys(pPr: Element): Set<ParagraphKey> {
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
export function directRunKeys(rPr: Element): Set<RunKey> {
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
export function ownedRunKeys(owned: ResolvedRunProps, defaults: ResolvedRunProps): RunKey[] {
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

/** Copie d'un conteneur de propriétés réduite à sa référence de style (`w:pStyle` / `w:rStyle`). */
export function styleOnly(properties: Element, styleElement: string): Element | null {
  const style = childNamed(properties, styleElement);
  if (!style) return null;
  const clone = properties.cloneNode(false) as Element;
  clone.appendChild(style.cloneNode(true));
  return clone;
}

/**
 * Égalité d'un interligne à la valeur rendue : un paragraphe qui ne dit rien et un qui
 * écrit `w:line="240" w:lineRule="auto"` ont le même interligne simple (R53-01, même
 * tolérance que le comparateur). `lineHeightPt` reste comparé tel quel.
 */
export function sameLineHeight(a: ResolvedParagraphProps, b: ResolvedParagraphProps): boolean {
  return a.lineHeightPt === b.lineHeightPt && (a.lineHeight ?? 1) === (b.lineHeight ?? 1);
}

/** Égalité d'un espacement à la valeur rendue : absent vaut 0 pt. */
export function sameSpacing(a: number | undefined, b: number | undefined): boolean {
  return (a ?? 0) === (b ?? 0);
}

/** Égalité structurelle de deux jeux de bordures du contrat. */
export function sameBorders(
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
export function stripParagraphProperties(
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
        if (wordAttr(child, 'before') && sameSpacing(full.spacingBeforePt, base.spacingBeforePt)) {
          drop.push('before');
        }
        if (wordAttr(child, 'after') && sameSpacing(full.spacingAfterPt, base.spacingAfterPt)) {
          drop.push('after');
        }
        if (wordAttr(child, 'line') && sameLineHeight(full, base)) {
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
export function stripRunProperties(
  rPr: Element,
  full: ResolvedRunProps,
  base: ResolvedRunProps,
): void {
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
