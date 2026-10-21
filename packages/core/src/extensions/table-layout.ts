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
import type { CellVerticalAlign } from '../api/index.js';
import { DOCX_STYLE_ATTRIBUTE } from './paragraph-layout.js';
import {
  borderDeclarations,
  formatPt,
  isLayoutNumber,
  joinDeclarations,
  normalizeColor,
  parsePt,
  parseSideBorders,
  parseStyleDeclarations,
  roundLayoutNumber,
  sanitizeBorders,
} from './layout-css.js';
import { TABLE_LOOK_ATTRIBUTE, parseTableLook, tableLookValue } from './table-look.js';

/** Options de table partagées par le jeu d'Aster. */
export const TABLE_OPTIONS = { resizable: true, cellMinWidth: 48 } as const;

/** Attribut HTML de l'alignement horizontal d'une table : `data-align="center"`. */
export const TABLE_ALIGN_ATTRIBUTE = 'data-align';

/** Alignements horizontaux de table reconnus (`TableLayoutAttrs.align`). */
export const TABLE_ALIGNS = ['left', 'center', 'right'] as const;

export type TableAlign = (typeof TABLE_ALIGNS)[number];

/** Vrai pour `left`, `center` ou `right`. */
export function isTableAlign(value: unknown): value is TableAlign {
  return typeof value === 'string' && (TABLE_ALIGNS as readonly string[]).includes(value);
}

/**
 * Lit l'alignement d'une table : `data-align` d'abord, sinon l'ancienne forme CSS
 * `margin-left: auto; margin-right: auto` (centré) ou `margin-left: auto` seul (à
 * droite). `null` sans alignement (gauche implicite).
 */
export function parseTableAlign(element: HTMLElement): TableAlign | null {
  const attribute = element.getAttribute(TABLE_ALIGN_ATTRIBUTE)?.toLowerCase();
  if (isTableAlign(attribute)) {
    return attribute;
  }
  const declarations = parseStyleDeclarations(element.getAttribute('style'));
  const left = declarations.get('margin-left')?.toLowerCase() === 'auto';
  const right = declarations.get('margin-right')?.toLowerCase() === 'auto';
  if (left && right) {
    return 'center';
  }
  return left ? 'right' : null;
}

/**
 * CSS de repli d'un alignement de table, pour la vue d'édition (`AsterTableView`) :
 * `margin: 0 auto` au centre, `margin-left: auto` à droite, rien à gauche. `getHTML()`
 * n'émet que `data-align` ; c'est la feuille `ui` qui aligne à l'affichage.
 */
export function tableAlignFallbackStyle(align: unknown): string | null {
  if (align === 'center') {
    return 'margin: 0 auto';
  }
  return align === 'right' ? 'margin-left: auto' : null;
}

/**
 * Bornes de `colspan` et `rowspan` à l'analyse HTML : Word plafonne une table à 63
 * colonnes, et 1 000 lignes fusionnées couvrent tout usage réel. Au-delà, prosemirror-tables
 * alloue une grille proportionnelle au produit des fusions : un `colspan="1000000"` dans
 * un `.docx` (revue R25) tuait l'onglet à 4 Go de tas.
 */
export const MAX_COLSPAN = 63;
export const MAX_ROWSPAN = 1000;

/**
 * Lit un `colspan` / `rowspan` HTML : entier dans `[1, max]`, tout le reste (vide, texte,
 * zéro, négatif, trop grand) ramené à 1 ou à la borne.
 */
export function parseSpan(value: string | null, max: number): number {
  const span = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(span) || span < 1) {
    return 1;
  }
  return Math.min(span, max);
}

/** Alignements verticaux de cellule reconnus. */
export const CELL_VERTICAL_ALIGNS: readonly CellVerticalAlign[] = ['top', 'middle', 'bottom'];

/** Marges internes d'une cellule : `top right bottom left`, en points. */
export type CellPadding = readonly [number, number, number, number];

/** Vrai pour `top`, `middle` ou `bottom`. */
export function isCellVerticalAlign(value: unknown): value is CellVerticalAlign {
  return typeof value === 'string' && (CELL_VERTICAL_ALIGNS as readonly string[]).includes(value);
}

/** Vrai pour un quadruplet de nombres de mise en page (finis, bornés). */
export function isCellPadding(value: unknown): value is CellPadding {
  return Array.isArray(value) && value.length === 4 && value.every(isLayoutNumber);
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

/**
 * Déclarations `style` d'une cellule : `border-*` (suivis des `padding-<côté>` des
 * bordures à `spacePt`), `background-color`, `vertical-align`, `padding`.
 *
 * Arbitrage `spacePt` / `paddingPt` (session 4) : les deux sont lus et réécrits tels
 * quels, chacun à sa place, donc l'aller-retour est exact. Le raccourci `padding` vient
 * en dernier et l'emporte en CSS sur les `padding-<côté>` : à l'affichage et pour
 * l'export, `paddingPt` (les marges internes de la cellule, `w:tcMar`) prime sur le
 * `spacePt` des bordures, que Word ignore sur les cellules.
 */
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

/**
 * Attributs HTML de mise en page d'une table, dans l'ordre : `style` (largeur puis
 * bordures), `data-docx-style`, `data-align`, `data-docx-look` (drapeaux à vrai dans
 * l'ordre de `TABLE_LOOK_FLAGS`, omis sans drapeau). Le lecteur `.docx` émet le même ordre.
 */
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
  const align: unknown = attributes['align'];
  if (isTableAlign(align)) {
    rendered[TABLE_ALIGN_ATTRIBUTE] = align;
  }
  const look = tableLookValue(attributes['look']);
  if (look) {
    rendered[TABLE_LOOK_ATTRIBUTE] = look;
  }
  return rendered;
}

/**
 * Attributs de `TableLayoutAttrs`. `width` émet tout le rendu (`style`, `data-docx-style`,
 * `data-align` puis `data-docx-look`) ; les autres n'émettent rien, comme pour
 * `ParagraphLayout`. Aucune commande de table ne pose `look` (pas de `table.setLayout`
 * au contrat) : l'attribut vient de l'import Word ou de `setHTML`.
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
    align: silentAttribute(parseTableAlign),
    look: silentAttribute((element) => parseTableLook(element.getAttribute(TABLE_LOOK_ATTRIBUTE))),
  };
}

/** Vrai si au moins une cellule de la première ligne porte un `colwidth` (colonne redimensionnée). */
function hasResizedColumn(node: ProseMirrorNode): boolean {
  const row = node.firstChild;
  if (!row) {
    return false;
  }
  for (let index = 0; index < row.childCount; index += 1) {
    const colwidth: unknown = row.child(index).attrs['colwidth'];
    if (Array.isArray(colwidth) && colwidth.some((width) => width !== null)) {
      return true;
    }
  }
  return false;
}

/**
 * Vue de table en édition (mode redimensionnable) : celle de Tiptap, qui ne reçoit aucun
 * attribut rendu de `columnResizing`, complétée par le `style` et le `data-docx-style`
 * de mise en page, resynchronisés à la construction et à chaque mise à jour du nœud.
 *
 * Largeur : tant qu'aucune colonne n'est redimensionnée, la largeur du contrat
 * (`width: 100%`, `width: 450pt`) est celle affichée, comme dans `getHTML()` ; dès qu'une
 * colonne porte un `colwidth`, c'est la largeur que Tiptap calcule depuis les colonnes
 * (`updateColumns`) qui prime, sinon le redimensionnement ne se verrait pas. Le
 * `min-width` de Tiptap est conservé dans les deux cas.
 */
export class AsterTableView extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number, view?: EditorView) {
    super(node, cellMinWidth, view, tableLayoutHtmlAttributes(node.attrs));
    this.syncLayout(node);
  }

  override update(node: ProseMirrorNode): boolean {
    if (!super.update(node)) {
      return false;
    }
    this.syncLayout(node);
    return true;
  }

  /**
   * Réapplique `style`, `data-docx-style`, `data-align` et `data-docx-look` de mise en
   * page après `updateColumns`. L'alignement reçoit son CSS de repli
   * (`tableAlignFallbackStyle`) dans la vue d'édition seulement : `getHTML()` n'émet que
   * `data-align`.
   */
  private syncLayout(node: ProseMirrorNode): void {
    const rendered = tableLayoutHtmlAttributes(node.attrs);
    const style = rendered['style'];
    const computedWidth = this.table.style.width;
    const minWidth = this.table.style.minWidth;
    const layoutWidth = parseTableWidth(
      typeof node.attrs['width'] === 'string' ? node.attrs['width'] : null,
    );
    const alignStyle = tableAlignFallbackStyle(node.attrs['align']);
    this.table.style.cssText = [style, alignStyle].filter((part) => part).join('; ');
    if (!layoutWidth || hasResizedColumn(node)) {
      // `updateColumns` vient de poser la largeur calculée : on la garde.
      this.table.style.width = computedWidth;
    }
    this.table.style.minWidth = minWidth;
    for (const name of [DOCX_STYLE_ATTRIBUTE, TABLE_ALIGN_ATTRIBUTE, TABLE_LOOK_ATTRIBUTE]) {
      const value = rendered[name];
      if (value === undefined) {
        this.table.removeAttribute(name);
      } else {
        this.table.setAttribute(name, value);
      }
    }
  }
}

/**
 * Attributs de `CellLayoutAttrs`, ajoutés après ceux de Tiptap (`colspan`, `rowspan`,
 * `colwidth`, `align`) : le `text-align` de Tiptap vient donc en premier dans le `style`.
 * `borders` émet tout le `style` de mise en page. `colspan` et `rowspan` remplacent ceux de
 * Tiptap (qui lisait l'attribut tel quel) pour les borner à l'analyse ; leur rendu reste
 * celui de Tiptap, qui omet la valeur par défaut `1`.
 */
function cellLayoutAttributes(): Record<string, Attribute> {
  return {
    colspan: {
      default: 1,
      parseHTML: (element) => parseSpan(element.getAttribute('colspan'), MAX_COLSPAN),
    },
    rowspan: {
      default: 1,
      parseHTML: (element) => parseSpan(element.getAttribute('rowspan'), MAX_ROWSPAN),
    },
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
