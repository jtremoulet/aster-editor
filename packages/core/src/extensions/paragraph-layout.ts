import { Extension, type Attribute } from '@tiptap/core';
import {
  PARAGRAPH_LAYOUT_ATTR_NAMES,
  type BlockBorder,
  type ParagraphLayoutAttrName,
  type ParagraphLayoutAttrs,
} from '../api';
import {
  betweenBorder,
  borderDeclarations,
  formatBorderValue,
  formatNumber,
  formatPt,
  isFiniteNumber,
  joinDeclarations,
  normalizeColor,
  parseBorderValue,
  parsePt,
  parseSideBorders,
  parseStyleDeclarations,
  roundLayoutNumber,
  sanitizeBorders,
} from './layout-css';

/** Nom de l'extension, clé dans `editor.extensionManager`. */
export const PARAGRAPH_LAYOUT_EXTENSION_NAME = 'paragraphLayout';

/** Types de bloc qui portent les attributs de mise en page, alignés sur `TextAlign`. */
export const PARAGRAPH_LAYOUT_TYPES = ['paragraph', 'heading'] as const;

/** Attribut HTML du nom de style Word d'un bloc. */
export const DOCX_STYLE_ATTRIBUTE = 'data-docx-style';
/** Attribut HTML booléen « paragraphe solidaire du suivant ». */
export const KEEP_NEXT_ATTRIBUTE = 'data-keep-next';
/** Attribut HTML booléen « saut de page avant ». */
export const PAGE_BREAK_BEFORE_ATTRIBUTE = 'data-page-break-before';
/** Attribut HTML de la bordure `between` (pas d'équivalent CSS). */
export const BORDER_BETWEEN_ATTRIBUTE = 'data-border-between';

/** Attributs numériques (en points) et la propriété CSS qui les porte. */
const PT_PROPERTIES: readonly [ParagraphLayoutAttrName, string][] = [
  ['spacingBeforePt', 'margin-top'],
  ['spacingAfterPt', 'margin-bottom'],
  ['indentLeftPt', 'margin-left'],
  ['indentRightPt', 'margin-right'],
  ['indentFirstLinePt', 'text-indent'],
];

/** Nombre fini ou `null` : tout le reste (chaîne, `NaN`) est traité comme absent. */
function numberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? roundLayoutNumber(value) : null;
}

/** Chaîne non vide ou `null`. */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Lit un `line-height` : nombre sans unité ou pourcentage → multiple, longueur → points.
 * `normal` et les valeurs inconnues donnent deux `null`.
 */
export function parseLineHeight(value: string | null): {
  lineHeight: number | null;
  lineHeightPt: number | null;
} {
  if (!value) {
    return { lineHeight: null, lineHeightPt: null };
  }
  const trimmed = value.trim();
  const multiple = /^(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (multiple?.[1] !== undefined) {
    return { lineHeight: roundLayoutNumber(Number.parseFloat(multiple[1])), lineHeightPt: null };
  }
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(trimmed);
  if (percent?.[1] !== undefined) {
    return {
      lineHeight: roundLayoutNumber(Number.parseFloat(percent[1]) / 100),
      lineHeightPt: null,
    };
  }
  const pt = parsePt(trimmed);
  return { lineHeight: null, lineHeightPt: pt !== null && pt > 0 ? pt : null };
}

/**
 * Lit tous les attributs de mise en page d'un élément de bloc : `style` inline et
 * attributs `data-*`. Un attribut absent vaut `null`.
 */
export function parseParagraphLayout(element: HTMLElement): Required<ParagraphLayoutAttrs> {
  const declarations = parseStyleDeclarations(element.getAttribute('style'));
  const { lineHeight, lineHeightPt } = parseLineHeight(declarations.get('line-height') ?? null);
  const borders: BlockBorder[] = parseSideBorders(declarations);
  const between = parseBorderValue('between', element.getAttribute(BORDER_BETWEEN_ATTRIBUTE));
  if (between) {
    borders.push(between);
  }
  return {
    lineHeight,
    lineHeightPt,
    spacingBeforePt: parsePt(declarations.get('margin-top')),
    spacingAfterPt: parsePt(declarations.get('margin-bottom')),
    indentLeftPt: parsePt(declarations.get('margin-left')),
    indentRightPt: parsePt(declarations.get('margin-right')),
    indentFirstLinePt: parsePt(declarations.get('text-indent')),
    borders: borders.length > 0 ? borders : null,
    shading: normalizeColor(declarations.get('background-color')),
    keepWithNext: element.hasAttribute(KEEP_NEXT_ATTRIBUTE) ? true : null,
    pageBreakBefore: element.hasAttribute(PAGE_BREAK_BEFORE_ATTRIBUTE) ? true : null,
    docxStyle: stringOrNull(element.getAttribute(DOCX_STYLE_ATTRIBUTE)),
  };
}

/**
 * Déclarations CSS d'un jeu d'attributs, dans l'ordre figé du contrat : `line-height`,
 * `margin-top`, `margin-bottom`, `margin-left`, `margin-right`, `text-indent`,
 * `border-*`, `background-color`. `lineHeightPt` l'emporte sur `lineHeight`.
 */
export function paragraphLayoutDeclarations(attributes: Record<string, unknown>): string[] {
  const declarations: string[] = [];
  const lineHeightPt = numberOrNull(attributes['lineHeightPt']);
  const lineHeight = numberOrNull(attributes['lineHeight']);
  if (lineHeightPt !== null) {
    declarations.push(`line-height: ${formatPt(lineHeightPt)}`);
  } else if (lineHeight !== null) {
    declarations.push(`line-height: ${formatNumber(lineHeight)}`);
  }
  for (const [name, property] of PT_PROPERTIES) {
    const value = numberOrNull(attributes[name]);
    if (value !== null) {
      declarations.push(`${property}: ${formatPt(value)}`);
    }
  }
  const borders = sanitizeBorders(attributes['borders']);
  if (borders) {
    declarations.push(...borderDeclarations(borders));
  }
  const shading = normalizeColor(stringOrNull(attributes['shading']));
  if (shading) {
    declarations.push(`background-color: ${shading}`);
  }
  return declarations;
}

/** Valeur `data-border-between` d'un jeu d'attributs, `null` sans bordure `between`. */
export function paragraphBorderBetween(attributes: Record<string, unknown>): string | null {
  const borders = sanitizeBorders(attributes['borders']);
  const between = borders ? betweenBorder(borders) : null;
  return between ? formatBorderValue(between) : null;
}

/**
 * Attributs HTML complets d'un jeu d'attributs de mise en page, dans l'ordre : `style`,
 * `data-border-between`, `data-docx-style`, `data-keep-next`, `data-page-break-before`.
 * C'est ce que `renderHTML` émet et ce que les tests d'idempotence comparent.
 */
export function renderParagraphLayout(attributes: Record<string, unknown>): Record<string, string> {
  const rendered: Record<string, string> = {};
  const style = joinDeclarations(paragraphLayoutDeclarations(attributes));
  if (style) {
    rendered['style'] = style;
  }
  const between = paragraphBorderBetween(attributes);
  if (between) {
    rendered[BORDER_BETWEEN_ATTRIBUTE] = between;
  }
  const docxStyle = stringOrNull(attributes['docxStyle']);
  if (docxStyle) {
    rendered[DOCX_STYLE_ATTRIBUTE] = docxStyle;
  }
  if (attributes['keepWithNext'] === true) {
    rendered[KEEP_NEXT_ATTRIBUTE] = '';
  }
  if (attributes['pageBreakBefore'] === true) {
    rendered[PAGE_BREAK_BEFORE_ATTRIBUTE] = '';
  }
  return rendered;
}

/**
 * Normalise une valeur d'attribut telle que `setLayout` la reçoit : nombres arrondis,
 * bordures filtrées, couleurs normalisées, booléens stricts. `undefined` = inchangé.
 */
export function normalizeParagraphLayoutValue(
  name: ParagraphLayoutAttrName,
  value: unknown,
): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  switch (name) {
    case 'borders':
      return sanitizeBorders(value);
    case 'shading':
      return normalizeColor(stringOrNull(value));
    case 'docxStyle':
      return stringOrNull(value);
    case 'keepWithNext':
    case 'pageBreakBefore':
      return value === true ? true : null;
    default:
      return numberOrNull(value);
  }
}

/**
 * Définition d'un attribut de mise en page. Tous sont `default: null`. Le premier
 * (`lineHeight`) émet **tout** le rendu (`style` puis `data-*`, voir
 * `renderParagraphLayout`) en lisant le jeu complet ; les autres n'émettent rien. C'est le
 * seul moyen de garantir l'ordre des déclarations et des attributs, puisque Tiptap
 * fusionne les rendus attribut par attribut dans l'ordre d'enregistrement.
 */
function layoutAttribute(name: ParagraphLayoutAttrName): Attribute {
  const parseHTML = (element: HTMLElement): unknown => parseParagraphLayout(element)[name];
  if (name === 'lineHeight') {
    return { default: null, parseHTML, renderHTML: renderParagraphLayout };
  }
  return { default: null, parseHTML, renderHTML: () => ({}) };
}

/**
 * Extension `ParagraphLayout` : ajoute à `paragraph` et `heading` les attributs de
 * `ParagraphLayoutAttrs`, lus dans le `style` inline et les `data-*`, et sérialisés
 * exactement comme le contrat le fige. Déclarée après `TextAlign` dans le jeu d'Aster :
 * son `text-align` vient en premier dans le `style`, les déclarations de mise en page
 * ensuite. Aucune commande Tiptap : les commandes Aster `paragraph.setLayout` /
 * `paragraph.unsetLayout` manipulent les attributs directement.
 */
export const ParagraphLayout = Extension.create({
  name: PARAGRAPH_LAYOUT_EXTENSION_NAME,

  addGlobalAttributes() {
    const attributes: Record<string, Attribute> = {};
    for (const name of PARAGRAPH_LAYOUT_ATTR_NAMES) {
      attributes[name] = layoutAttribute(name);
    }
    return [{ types: [...PARAGRAPH_LAYOUT_TYPES], attributes }];
  },
});
