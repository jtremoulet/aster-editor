import { hasTag, isElement, isIgnorableNode } from './dom-utils.js';
import type { PostprocessPass } from './types.js';

/**
 * Vrai si la cellule ne contient que du texte en gras : `<td><strong>x</strong></td>`
 * ou `<td><p><strong>x</strong></p></td>`, éventuellement sur plusieurs paragraphes.
 */
function isBoldCell(cell: Element): boolean {
  const children = Array.from(cell.childNodes).filter((node) => !isIgnorableNode(node));
  if (children.length === 0) return false;
  return children.every((child) => {
    if (isElement(child, 'strong', 'b')) return true;
    if (isElement(child, 'p')) {
      const inner = Array.from(child.childNodes).filter((node) => !isIgnorableNode(node));
      return inner.length > 0 && inner.every((node) => isElement(node, 'strong', 'b'));
    }
    return false;
  });
}

/** Lignes directes d'une table, qu'elles soient nues ou déjà dans un `thead`/`tbody`. */
function directRows(table: Element): Element[] {
  return Array.from(table.children).flatMap((child) => {
    if (hasTag(child, 'tr')) return [child];
    if (hasTag(child, 'thead', 'tbody', 'tfoot')) {
      return Array.from(child.children).filter((row) => hasTag(row, 'tr'));
    }
    return [];
  });
}

/**
 * mammoth sort `<table><tr><td>` à plat. Le schéma Tiptap attend `tbody`, et une ligne
 * d'en-tête n'est produite que si Word l'a marquée (`w:tblHeader`). On complète donc :
 * - la première ligne devient `<thead><tr><th>` si toutes ses cellules sont en gras ;
 * - le reste est enveloppé dans `<tbody>` ;
 * - `colspan`/`rowspan` sont conservés tels quels.
 */
export const normalizeTables: PostprocessPass = (doc) => {
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = directRows(table);
    if (rows.length === 0) continue;

    const existingHead = Array.from(table.children).find((child) => hasTag(child, 'thead'));
    const [first, ...rest] = rows;
    const firstCells = first ? Array.from(first.children).filter((c) => hasTag(c, 'td', 'th')) : [];
    const promoteFirst =
      first !== undefined &&
      existingHead === undefined &&
      firstCells.length > 0 &&
      firstCells.every(isBoldCell);

    const headRows: Element[] = [];
    let bodyRows: Element[] = rows;
    if (existingHead) {
      headRows.push(...rows.filter((row) => row.parentNode === existingHead));
      bodyRows = rows.filter((row) => row.parentNode !== existingHead);
    } else if (promoteFirst && first) {
      headRows.push(first);
      bodyRows = rest;
    }

    for (const row of headRows) {
      for (const cell of Array.from(row.children)) {
        if (hasTag(cell, 'td')) {
          const th = doc.createElement('th');
          for (const attr of Array.from(cell.attributes)) th.setAttribute(attr.name, attr.value);
          while (cell.firstChild) th.appendChild(cell.firstChild);
          row.replaceChild(th, cell);
        }
      }
    }

    // On reconstruit les sections dans l'ordre thead → tbody, sans toucher aux attributs de la table.
    const colgroups = Array.from(table.children).filter((child) =>
      hasTag(child, 'caption', 'colgroup'),
    );
    while (table.firstChild) table.removeChild(table.firstChild);
    for (const extra of colgroups) table.appendChild(extra);
    if (headRows.length > 0) {
      const thead = doc.createElement('thead');
      for (const row of headRows) thead.appendChild(row);
      table.appendChild(thead);
    }
    if (bodyRows.length > 0) {
      const tbody = doc.createElement('tbody');
      for (const row of bodyRows) tbody.appendChild(row);
      table.appendChild(tbody);
    }
  }
};
