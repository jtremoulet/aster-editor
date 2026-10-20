import { mergeAttributes, type AnyExtension, type Attribute, type Node } from '@tiptap/core';
import {
  Table,
  TableCell,
  TableHeader,
  TableKit,
  TableView,
  createColGroup,
} from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import type { CellVerticalAlign } from '../api';
import { DOCX_STYLE_ATTRIBUTE } from './paragraph-layout';
import {
  borderDeclarations,
  formatPt,
  isFiniteNumber,
  joinDeclarations,
  normalizeColor,
  parsePt,
  parseSideBorders,
  parseStyleDeclarations,
  roundLayoutNumber,
  sanitizeBorders,
} from './layout-css';

/** Options de table partagées par le jeu d'Aster. */
export const TABLE_OPTIONS = { resizable: true, cellMinWidth: 48 } as const;

/** Alignements verticaux de cellule reconnus. */
export const CELL_VERTICAL_ALIGNS: readonly CellVerticalAlign[] = ['top', 'middle', 'bottom'];

/** Marges internes d'une cellule : `top right bottom left`, en points. */
export type CellPadding = readonly [number, number, number, number];

/** Vrai pour `top`, `middle` ou `bottom`. */
export function isCellVerticalAlign(value: unknown): value is CellVerticalAlign {
  return typeof value === 'string' && (CELL_VERTICAL_ALIGNS as readonly string[]).includes(value);
}

/** Vrai pour un quadruplet de nombres finis. */
export function isCellPadding(value: unknown): value is CellPadding {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

/**
 * Lit une largeur de table : `100%` ou `450pt` (deux décimales au plus). Les pixels sont
 * volontairement ignorés : `width: 200px` est la largeur que Tiptap calcule lui-même
 * depuis les `colwidth`, la relire comme largeur de mise en page figerait les colonnes.
 * Tout le reste (`auto`) donne `null`.
 */
export function parseTableWidth(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(trimmed);
  if (percent?.[1] !== undefined) {
    const number = Number.parseFloat(percent[1]);
    return number > 0 ? `${roundLayoutNumber(number)}%` : null;
  }
  if (!/pt$/i.test(trimmed)) {
    return null;
  }
  const pt = parsePt(trimmed);
  return pt !== null && pt > 0 ? formatPt(pt) : null;
}

/** Largeur d'une table depuis son `style` (`width`), sinon son attribut `width="100%"`. */
function parseTableWidthFromElement(element: HTMLElement): string | null {
  return (
    parseTableWidth(parseStyleDeclarations(element.getAttribute('style')).get('width')) ??
    parseTableWidth(element.getAttribute('width'))
  );
}

/**
 * Lit un `padding` CSS (1 à 4 valeurs, règles CSS d'expansion) en quadruplet de points ;
 * `null` si une valeur n'est pas convertible.
 */
export function parseCellPadding(value: string | null | undefined): CellPadding | null {
  if (!value) {
    return null;
  }
  const parts = value.trim().split(/\s+/).map(parsePt);
  if (parts.some((part) => part === null)) {
    return null;
  }
  const [a, b, c, d] = parts as number[];
  if (a === undefined) {
    return null;
  }
  switch (parts.length) {
    case 1:
      return [a, a, a, a];
    case 2:
      return b === undefined ? null : [a, b, a, b];
    case 3:
      return b === undefined || c === undefined ? null : [a, b, c, b];
    case 4:
      return b === undefined || c === undefined || d === undefined ? null : [a, b, c, d];
    default:
      return null;
  }
}

/** Déclarations `style` d'une table : `width` puis `border-*`. */
export function tableLayoutDeclarations(attributes: Record<string, unknown>): string[] {
  const declarations: string[] = [];
  const width = parseTableWidth(
    typeof attributes['width'] === 'string' ? attributes['width'] : null,
  );
  if (width) {
    declarations.push(`width: ${width}`);
  }
  const borders = sanitizeBorders(attributes['borders']);
  if (borders) {
    declarations.push(...borderDeclarations(borders));
  }
  return declarations;
}

/** Déclarations `style` d'une cellule : `border-*`, `background-color`, `vertical-align`, `padding`. */
export function cellLayoutDeclarations(attributes: Record<string, unknown>): string[] {
  const declarations: string[] = [];
  const borders = sanitizeBorders(attributes['borders']);
  if (borders) {
    declarations.push(...borderDeclarations(borders));
  }
  const shading = normalizeColor(
    typeof attributes['shading'] === 'string' ? attributes['shading'] : null,
  );
  if (shading) {
    declarations.push(`background-color: ${shading}`);
  }
  const verticalAlign: unknown = attributes['verticalAlign'];
  if (isCellVerticalAlign(verticalAlign)) {
    declarations.push(`vertical-align: ${verticalAlign}`);
  }
  const padding: unknown = attributes['paddingPt'];
  if (isCellPadding(padding)) {
    declarations.push(`padding: ${padding.map(formatPt).join(' ')}`);
  }
  return declarations;
}

/** Attribut sans rendu propre : le `style` complet est émis par le premier attribut. */
function silentAttribute(parseHTML: (element: HTMLElement) => unknown): Attribute {
  return { default: null, parseHTML, renderHTML: () => ({}) };
}

/** Attributs HTML de mise en page d'une table : `style` (largeur puis bordures), `data-docx-style`. */
export function tableLayoutHtmlAttributes(
  attributes: Record<string, unknown>,
): Record<string, string> {
  const rendered: Record<string, string> = {};
  const style = joinDeclarations(tableLayoutDeclarations(attributes));
  if (style) {
    rendered['style'] = style;
  }
  const docxStyle: unknown = attributes['docxStyle'];
  if (typeof docxStyle === 'string' && docxStyle !== '') {
    rendered[DOCX_STYLE_ATTRIBUTE] = docxStyle;
  }
  return rendered;
}

/**
 * Attributs de `TableLayoutAttrs`. `width` émet tout le rendu (`style` puis
 * `data-docx-style`) ; les autres n'émettent rien, comme pour `ParagraphLayout`.
 */
function tableLayoutAttributes(): Record<string, Attribute> {
  return {
    width: {
      default: null,
      parseHTML: parseTableWidthFromElement,
      renderHTML: tableLayoutHtmlAttributes,
    },
    borders: silentAttribute((element) => {
      const borders = parseSideBorders(parseStyleDeclarations(element.getAttribute('style')));
      return borders.length > 0 ? borders : null;
    }),
    docxStyle: silentAttribute((element) => element.getAttribute(DOCX_STYLE_ATTRIBUTE) || null),
  };
}

/**
 * Vue de table en édition (mode redimensionnable) : celle de Tiptap, qui ne reçoit aucun
 * attribut rendu de `columnResizing`, complétée par le `style` et le `data-docx-style`
 * de mise en page, resynchronisés à chaque mise à jour du nœud. La largeur de mise en
 * page reste écrasée par celle que Tiptap calcule depuis les colonnes (`updateColumns`),
 * les bordures sont visibles.
 */
export class AsterTableView extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number, view?: EditorView) {
    super(node, cellMinWidth, view, tableLayoutHtmlAttributes(node.attrs));
  }

  override update(node: ProseMirrorNode): boolean {
    if (!super.update(node)) {
      return false;
    }
    const rendered = tableLayoutHtmlAttributes(node.attrs);
    const style = rendered['style'];
    const width = this.table.style.width;
    const minWidth = this.table.style.minWidth;
    this.table.style.cssText = style ?? '';
    // `updateColumns` vient de poser la largeur calculée : on la garde.
    this.table.style.width = width;
    this.table.style.minWidth = minWidth;
    const docxStyle = rendered[DOCX_STYLE_ATTRIBUTE];
    if (docxStyle === undefined) {
      this.table.removeAttribute(DOCX_STYLE_ATTRIBUTE);
    } else {
      this.table.setAttribute(DOCX_STYLE_ATTRIBUTE, docxStyle);
    }
    return true;
  }
}

/**
 * Attributs de `CellLayoutAttrs`, ajoutés après ceux de Tiptap (`colspan`, `rowspan`,
 * `colwidth`, `align`) : le `text-align` de Tiptap vient donc en premier dans le `style`.
 * `borders` émet tout le `style` de mise en page.
 */
function cellLayoutAttributes(): Record<string, Attribute> {
  return {
    borders: {
      default: null,
      parseHTML: (element) => {
        const borders = parseSideBorders(parseStyleDeclarations(element.getAttribute('style')));
        return borders.length > 0 ? borders : null;
      },
      renderHTML: (attributes) => {
        const style = joinDeclarations(cellLayoutDeclarations(attributes));
        return style ? { style } : {};
      },
    },
    shading: silentAttribute((element) =>
      normalizeColor(parseStyleDeclarations(element.getAttribute('style')).get('background-color')),
    ),
    verticalAlign: silentAttribute((element) => {
      const value = parseStyleDeclarations(element.getAttribute('style'))
        .get('vertical-align')
        ?.toLowerCase();
      return isCellVerticalAlign(value) ? value : null;
    }),
    paddingPt: silentAttribute((element) =>
      parseCellPadding(parseStyleDeclarations(element.getAttribute('style')).get('padding')),
    ),
  };
}

/**
 * `Table` d'Aster : celle de Tiptap plus `width`, `borders` et `docxStyle`. Le `renderHTML`
 * est réécrit pour combiner la largeur calculée par Tiptap depuis les `colwidth` (ou son
 * `min-width`) avec le `style` de mise en page : Tiptap abandonne la première dès qu'un
 * `style` utilisateur existe, ce qui aurait cassé le redimensionnement des colonnes sur
 * une table bordée. Une `width` explicite l'emporte sur la largeur calculée.
 */
export const AsterTable: Node = Table.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tableLayoutAttributes() };
  },

  renderHTML({ node, HTMLAttributes }) {
    const { colgroup, tableWidth, tableMinWidth } = createColGroup(node, this.options.cellMinWidth);
    const { style: layoutStyle, ...rest } = HTMLAttributes as Record<string, unknown>;
    const hasLayoutWidth = parseTableWidth(
      typeof node.attrs['width'] === 'string' ? node.attrs['width'] : null,
    );
    const computed = hasLayoutWidth
      ? ''
      : tableWidth
        ? `width: ${tableWidth}`
        : tableMinWidth
          ? `min-width: ${tableMinWidth}`
          : '';
    const style = [computed, typeof layoutStyle === 'string' ? layoutStyle : '']
      .filter((part) => part !== '')
      .join('; ');
    // `style` d'abord, puis `data-docx-style` : même ordre que sur les paragraphes.
    const attributes = mergeAttributes(
      this.options.HTMLAttributes,
      style === '' ? {} : { style },
      rest,
    );
    const children = colgroup ? [colgroup, ['tbody', 0] as const] : [['tbody', 0] as const];
    return ['table', attributes, ...children];
  },
});

/** `TableCell` d'Aster : celle de Tiptap plus les attributs de `CellLayoutAttrs`. */
export const AsterTableCell: Node = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellLayoutAttributes() };
  },
});

/** `TableHeader` d'Aster : celle de Tiptap plus les attributs de `CellLayoutAttrs`. */
export const AsterTableHeader: Node = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellLayoutAttributes() };
  },
});

/**
 * Jeu de tables d'Aster : `TableKit` pour la ligne (`tableRow`), les nœuds `table`,
 * `tableCell` et `tableHeader` remplacés par leurs versions étendues, mêmes options de
 * redimensionnement qu'avant.
 */
export function createTableExtensions(): AnyExtension[] {
  return [
    TableKit.configure({ table: false, tableCell: false, tableHeader: false }),
    AsterTable.configure({ ...TABLE_OPTIONS, View: AsterTableView }),
    AsterTableCell,
    AsterTableHeader,
  ];
}
