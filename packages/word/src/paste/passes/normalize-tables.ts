import { collectTextNodes, isBlank, renameElement, selectAll, unwrap } from '../dom-utils';
import type { PastePass } from '../types';

/** Attributs de cellule conservés ; la fusion de cellules est la seule information de structure. */
const CELL_ATTRIBUTES: readonly string[] = ['colspan', 'rowspan'];

function stripAttributes(element: Element, kept: readonly string[] = []): void {
  for (const name of Array.from(element.attributes, (attribute) => attribute.name)) {
    if (!kept.includes(name)) {
      element.removeAttribute(name);
    }
  }
  for (const name of kept) {
    const value = element.getAttribute(name);
    if (value !== null && (!/^\d+$/.test(value) || Number.parseInt(value, 10) <= 1)) {
      element.removeAttribute(name);
    }
  }
}

/** Vrai si tout le texte visible de la cellule est sous `strong`/`b`. Une cellule vide ne compte pas. */
function isBoldCell(cell: Element): boolean {
  const texts = collectTextNodes(cell).filter((text) => !isBlank(text.data));
  if (texts.length === 0) {
    return false;
  }
  return texts.every((text) => text.parentElement?.closest('strong, b') !== null);
}

/**
 * Vrai si toutes les cellules de la ligne sont en gras : c'est le seul indice fiable.
 * `mso-yfti-firstrow:yes` n'en est pas un, Word le pose sur la première ligne de
 * n'importe quelle table, données comprises (W-3).
 */
function isHeaderRow(row: Element): boolean {
  const cells = Array.from(row.children).filter(
    (cell) => cell.localName === 'td' || cell.localName === 'th',
  );
  return cells.length > 0 && cells.every(isBoldCell);
}

/** Déplace la première ligne dans un `<thead>` avec des `<th>`, le gras implicite est retiré. */
function promoteHeaderRow(doc: Document, table: Element, row: Element): void {
  for (const cell of Array.from(row.children)) {
    if (cell.localName === 'td') {
      renameElement(doc, cell, 'th', CELL_ATTRIBUTES);
    }
  }
  for (const bold of selectAll(row, 'strong, b')) {
    unwrap(bold);
  }
  const thead = doc.createElement('thead');
  thead.appendChild(row);
  table.insertBefore(thead, table.firstChild);
}

/**
 * Déballe le paragraphe unique d'une cellule : `<td><p>x</p></td>` → `<td>x</td>`.
 * Un `<p>` qui porte encore un attribut (alignement conservé par `cleanInlineStyles`)
 * est gardé, sinon l'information serait perdue (W-9).
 */
function unwrapSingleParagraph(cell: Element): void {
  const children = Array.from(cell.childNodes).filter(
    (node) => node.nodeType === 1 || (node.nodeType === 3 && !isBlank(node.textContent)),
  );
  const [only] = children;
  if (
    children.length === 1 &&
    only &&
    only.nodeType === 1 &&
    (only as Element).localName === 'p' &&
    (only as Element).attributes.length === 0
  ) {
    unwrap(only as Element);
  }
}

/**
 * Normalise les tables Word : retire tout le layout (`border`, `cellspacing`, `width`,
 * `valign`, styles de bordure et de padding), conserve `colspan`/`rowspan`, détecte la
 * ligne d'en-tête (toutes les cellules en gras) et la déplace dans `<thead>` avec des
 * `<th>`, puis déballe le `<p>` unique et sans attribut de chaque cellule.
 * Une table à une seule ligne n'a pas d'en-tête : ce serait une table sans corps.
 */
export const normalizeTables: PastePass = (doc) => {
  for (const table of selectAll(doc.body, 'table')) {
    for (const element of selectAll(table, 'colgroup, col, caption')) {
      element.parentNode?.removeChild(element);
    }
    const rows = selectAll(table, 'tr').filter((row) => row.closest('table') === table);
    const [firstRow] = rows;
    const hasHeader = rows.length > 1 && firstRow !== undefined && isHeaderRow(firstRow);
    stripAttributes(table);
    for (const element of selectAll(table, 'thead, tbody, tfoot, tr')) {
      if (element.closest('table') === table) {
        stripAttributes(element);
      }
    }
    for (const row of rows) {
      for (const cell of Array.from(row.children)) {
        stripAttributes(cell, CELL_ATTRIBUTES);
      }
    }
    if (hasHeader && firstRow && !firstRow.closest('thead')) {
      promoteHeaderRow(doc, table, firstRow);
    }
    for (const section of selectAll(table, 'thead, tbody, tfoot')) {
      if (section.closest('table') === table && section.children.length === 0) {
        section.parentNode?.removeChild(section);
      }
    }
    for (const cell of selectAll(table, 'td, th')) {
      if (cell.closest('table') === table) {
        unwrapSingleParagraph(cell);
      }
    }
  }
};
