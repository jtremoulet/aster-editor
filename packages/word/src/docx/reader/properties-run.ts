import type { DecorationStyle } from '@aster-editor/core';
import { childNamed, wordAttribute } from '../preprocess/xml-utils.js';
import type { ResolvedRunProps } from './types.js';
import {
  bounded,
  boundedDistancePt,
  fontName,
  halfPointsToPt,
  hexColor,
  highlightColor,
  numberAttr,
  onOff,
  twipsToPt,
  WORD_LIMITS,
} from './units.js';

/**
 * Propriétés de run (`w:rPr`) : accumulateur, application d'un élément sur l'état hérité,
 * delta d'un style de caractère (bascules en XOR) et figeage. Module de `properties.ts`
 * (ré-exporté par lui) : découpage L45, aucune logique modifiée.
 */

/** Polices du thème (`theme1.xml`), pour `w:asciiTheme="minorHAnsi"` et consorts. */
export interface ThemeFonts {
  readonly major?: string;
  readonly minor?: string;
}

/** Accumulateur de run ; `underline`/`strike` à `null` = explicitement sans trait. */
export interface MutableRun {
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: DecorationStyle | null;
  strike?: DecorationStyle | null;
  color?: string;
  highlight?: string;
  superscript?: boolean;
  subscript?: boolean;
  letterSpacingPt?: number;
  caps?: 'all' | 'small';
  runStyle?: string;
  lang?: string;
}

/**
 * Fond d'un `w:shd` : la couleur `w:fill` en `#rrggbb`. `undefined` quand le fond est
 * absent, `auto` ou `nil` (ce qui efface un fond hérité). Les motifs (`pct25`…) sont
 * ignorés : seul le remplissage est représentable.
 */
export function readShadingFill(shd: Element): string | undefined {
  const val = wordAttribute(shd, 'val');
  if (val === 'nil') return undefined;
  return hexColor(wordAttribute(shd, 'fill'));
}

/** Distance en twips d'un attribut, bornée à ±1584 pt ; `undefined` si absente ou hors bornes. */
export function distanceAttr(value: string): number | undefined {
  const twips = numberAttr(value);
  return twips === undefined ? undefined : boundedDistancePt(twipsToPt(twips));
}

/**
 * Police d'un `w:rFonts` : l'attribut de thème prime sur le nom explicite, `ascii` sur
 * `hAnsi`. Un nom qui n'est pas un nom de police (`fontName`) est ignoré : il finirait
 * tel quel dans un attribut `style`.
 */
function readFont(rFonts: Element, theme: ThemeFonts): string | undefined {
  for (const attr of ['asciiTheme', 'hAnsiTheme']) {
    const value = wordAttribute(rFonts, attr);
    if (!value) continue;
    const font = fontName(value.startsWith('major') ? theme.major : theme.minor);
    if (font) return font;
  }
  return fontName(wordAttribute(rFonts, 'ascii')) ?? fontName(wordAttribute(rFonts, 'hAnsi'));
}

function readUnderline(u: Element): DecorationStyle | null {
  const val = wordAttribute(u, 'val') || 'single';
  switch (val) {
    case 'none':
      return null;
    case 'double':
    case 'wavyDouble':
      return 'double';
    case 'dotted':
    case 'dottedHeavy':
      return 'dotted';
    case 'wave':
    case 'wavyHeavy':
      return 'wavy';
    default:
      return /^dash|^dotDash|^dotDotDash/i.test(val) ? 'dashed' : 'solid';
  }
}

/** Applique un `w:rPr` (de style ou direct) sur l'accumulateur. `w:rStyle` n'est pas lu ici. */
export function applyRunProperties(rPr: Element, acc: MutableRun, theme: ThemeFonts): void {
  for (const child of Array.from(rPr.children)) {
    const val = wordAttribute(child, 'val');
    switch (child.localName) {
      case 'rFonts': {
        const font = readFont(child, theme);
        if (font) acc.fontFamily = font;
        break;
      }
      case 'sz': {
        const halfPoints = numberAttr(val);
        const size =
          halfPoints === undefined
            ? undefined
            : bounded(
                halfPointsToPt(halfPoints),
                WORD_LIMITS.fontSizeMinPt,
                WORD_LIMITS.fontSizeMaxPt,
              );
        if (size !== undefined) acc.fontSizePt = size;
        break;
      }
      case 'b':
        acc.bold = onOff(val);
        break;
      case 'i':
        acc.italic = onOff(val);
        break;
      case 'u':
        acc.underline = readUnderline(child);
        break;
      case 'strike':
        acc.strike = onOff(val) ? 'solid' : null;
        break;
      case 'dstrike':
        acc.strike = onOff(val) ? 'double' : null;
        break;
      // `auto`/`none` posent `undefined` plutôt que de supprimer la clé : dans le delta d'un
      // style de caractère (`mergeRunDelta`), la clé présente efface la valeur héritée.
      case 'color':
        acc.color = hexColor(val);
        break;
      case 'highlight':
        acc.highlight = highlightColor(val);
        break;
      case 'shd': {
        // Fond de run : surlignage de repli, `w:highlight` garde la main s'il est posé.
        const fill = readShadingFill(child);
        if (fill && !childNamed(rPr, 'highlight')) acc.highlight = fill;
        break;
      }
      case 'vertAlign':
        acc.superscript = val === 'superscript';
        acc.subscript = val === 'subscript';
        break;
      case 'spacing': {
        const spacing = distanceAttr(val);
        if (spacing !== undefined) acc.letterSpacingPt = spacing;
        break;
      }
      case 'caps':
        if (onOff(val)) acc.caps = 'all';
        else if (acc.caps === 'all') delete acc.caps;
        break;
      case 'smallCaps':
        if (onOff(val)) acc.caps = 'small';
        else if (acc.caps === 'small') delete acc.caps;
        break;
      case 'lang':
        if (val) acc.lang = val;
        break;
      default:
        break;
    }
  }
}

/**
 * Applique le delta d'un style de caractère (ses `w:rPr` résolus sur un accumulateur
 * vide) sur les propriétés héritées du paragraphe. Les propriétés à bascule d'ECMA-376
 * §17.7.3 (`b`, `i`, `caps`, `smallCaps`, `strike`/`dstrike`) sont combinées en **XOR** :
 * un style `Strong` (gras) sur un titre déjà gras rend non gras, comme Word. Une bascule
 * explicitement désactivée dans le style (`w:b w:val="0"`) ne change rien (XOR avec
 * faux). Les autres propriétés remplacent l'héritée, y compris par `undefined`
 * (`w:color w:val="auto"` efface la couleur du paragraphe).
 */
export function mergeRunDelta(acc: MutableRun, delta: MutableRun): void {
  for (const key of Object.keys(delta) as (keyof MutableRun)[]) {
    switch (key) {
      case 'bold':
      case 'italic':
        if (delta[key]) acc[key] = !acc[key];
        break;
      case 'strike':
        if (delta.strike) acc.strike = acc.strike ? null : delta.strike;
        break;
      case 'caps':
        // `caps` et `smallCaps` sont deux bascules ; quand les deux finissent actives, la
        // casse du style de caractère l'emporte (un seul rendu possible dans le contrat).
        if (delta.caps) acc.caps = acc.caps === delta.caps ? undefined : delta.caps;
        break;
      default:
        (acc as Record<string, unknown>)[key] = delta[key];
        break;
    }
  }
}

/** Propriétés de run figées : les booléens faux, `null` et `undefined` disparaissent. */
export function finalizeRun(acc: MutableRun): ResolvedRunProps {
  const out: {
    -readonly [K in keyof ResolvedRunProps]: ResolvedRunProps[K];
  } = {};
  if (acc.fontFamily) out.fontFamily = acc.fontFamily;
  if (acc.fontSizePt !== undefined) out.fontSizePt = acc.fontSizePt;
  if (acc.bold) out.bold = true;
  if (acc.italic) out.italic = true;
  if (acc.underline) out.underline = acc.underline;
  if (acc.strike) out.strike = acc.strike;
  if (acc.color) out.color = acc.color;
  if (acc.highlight) out.highlight = acc.highlight;
  if (acc.superscript) out.superscript = true;
  if (acc.subscript) out.subscript = true;
  if (acc.letterSpacingPt !== undefined && acc.letterSpacingPt !== 0) {
    out.letterSpacingPt = acc.letterSpacingPt;
  }
  if (acc.caps) out.caps = acc.caps;
  if (acc.runStyle) out.runStyle = acc.runStyle;
  if (acc.lang) out.lang = acc.lang;
  return out;
}
