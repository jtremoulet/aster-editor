import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { AsterCommand, AsterEditor } from '../api/index.js';
import { defineStandardCommand } from './define.js';

/** Une cellule du tableau courant et sa position dans le document. */
interface TableCell {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/**
 * Cellules (en-têtes compris) du tableau le plus proche qui contient la sélection, vide
 * hors d'un tableau. Une table imbriquée dans une cellule n'est pas parcourue : elle
 * appartient au contenu de sa cellule.
 */
function currentTableCells(state: EditorState): readonly TableCell[] {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const table = $from.node(depth);
    if (table.type.name !== 'table') continue;
    const start = $from.start(depth);
    const cells: TableCell[] = [];
    table.descendants((node, offset) => {
      const role: unknown = node.type.spec['tableRole'];
      if (role !== 'cell' && role !== 'header_cell') return true;
      cells.push({ pos: start + offset, node });
      return false;
    });
    return cells;
  }
  return [];
}

/**
 * Vrai si la cellule ne contient qu'un bloc de texte vide. Test direct, sans rien
 * construire : `canRun` l'appelle pour chaque cellule à chaque mouvement du curseur.
 */
function isEmptyCell(cell: ProseMirrorNode): boolean {
  const only = cell.childCount === 1 ? cell.firstChild : null;
  return only !== null && only.isTextblock && only.content.size === 0;
}

/**
 * Transaction qui vide chaque cellule du tableau courant (structure, fusions et largeurs
 * conservées), `null` s'il n'y a rien à vider : hors d'un tableau ou tableau déjà vide.
 * Les cellules sont remplacées de la dernière à la première pour que les positions
 * restent valides.
 */
function clearTableTransaction(state: EditorState): Transaction | null {
  const tr = state.tr;
  const cells = currentTableCells(state);
  for (const cell of [...cells].reverse()) {
    if (isEmptyCell(cell.node)) continue;
    const empty = cell.node.type.createAndFill(cell.node.attrs);
    if (!empty) continue;
    tr.replaceWith(cell.pos + 1, cell.pos + cell.node.nodeSize - 1, empty.content);
  }
  if (!tr.docChanged) return null;
  // Le curseur reste dans sa cellule (sinon la première) : la position d'origine, effacée
  // avec le contenu, serait sinon reportée hors du tableau.
  const cursor = state.selection.from;
  const home =
    cells.find((cell) => cursor > cell.pos && cursor < cell.pos + cell.node.nodeSize) ?? cells[0];
  if (home) {
    tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(home.pos, -1) + 1), 1));
  }
  return tr;
}

/** Vide le tableau courant en une seule étape d'historique. Faux s'il n'y a rien à vider. */
function clearTable(editor: AsterEditor): boolean {
  if (editor.isReadOnly()) return false;
  const tr = clearTableTransaction(editor.tiptap.state);
  if (!tr) return false;
  editor.tiptap.view.dispatch(tr);
  editor.tiptap.commands.focus();
  return true;
}

/**
 * Tables. Toutes les commandes d'édition de table s'appuient sur `can()` : hors
 * d'une table, Tiptap répond `false` et la toolbar les grise naturellement.
 * `table.insert` est la seule exécutable depuis un paragraphe, et seulement hors
 * d'une table : pas de tables imbriquées en V1, même si le schéma les tolère.
 */
export const TABLE_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('table.insert', {
    run: (editor, args) =>
      !editor.tiptap.isActive('table') &&
      editor.tiptap
        .chain()
        .focus()
        .insertTable({
          rows: args.rows,
          cols: args.cols,
          withHeaderRow: args.withHeaderRow ?? true,
        })
        .run(),
    canRun: (editor, args) =>
      args !== undefined &&
      args.rows > 0 &&
      args.cols > 0 &&
      !editor.tiptap.isActive('table') &&
      editor.tiptap.can().insertTable({ rows: args.rows, cols: args.cols }),
    isActive: (editor) => editor.tiptap.isActive('table'),
  }),
  defineStandardCommand('table.delete', {
    run: (editor) => editor.tiptap.chain().focus().deleteTable().run(),
    canRun: (editor) => editor.tiptap.can().deleteTable(),
  }),
  // « Vider » (retour utilisateurs 0.7) : comme dans Word, effacer le contenu sans perdre
  // la grille. Grisée quand le tableau est déjà vide.
  defineStandardCommand('table.clear', {
    run: (editor) => clearTable(editor),
    canRun: (editor) =>
      !editor.isReadOnly() &&
      currentTableCells(editor.tiptap.state).some((cell) => !isEmptyCell(cell.node)),
  }),
  defineStandardCommand('table.addRowBefore', {
    run: (editor) => editor.tiptap.chain().focus().addRowBefore().run(),
    canRun: (editor) => editor.tiptap.can().addRowBefore(),
  }),
  defineStandardCommand('table.addRowAfter', {
    run: (editor) => editor.tiptap.chain().focus().addRowAfter().run(),
    canRun: (editor) => editor.tiptap.can().addRowAfter(),
  }),
  defineStandardCommand('table.deleteRow', {
    run: (editor) => editor.tiptap.chain().focus().deleteRow().run(),
    canRun: (editor) => editor.tiptap.can().deleteRow(),
  }),
  defineStandardCommand('table.addColumnBefore', {
    run: (editor) => editor.tiptap.chain().focus().addColumnBefore().run(),
    canRun: (editor) => editor.tiptap.can().addColumnBefore(),
  }),
  defineStandardCommand('table.addColumnAfter', {
    run: (editor) => editor.tiptap.chain().focus().addColumnAfter().run(),
    canRun: (editor) => editor.tiptap.can().addColumnAfter(),
  }),
  defineStandardCommand('table.deleteColumn', {
    run: (editor) => editor.tiptap.chain().focus().deleteColumn().run(),
    canRun: (editor) => editor.tiptap.can().deleteColumn(),
  }),
  defineStandardCommand('table.mergeCells', {
    run: (editor) => editor.tiptap.chain().focus().mergeCells().run(),
    canRun: (editor) => editor.tiptap.can().mergeCells(),
  }),
  defineStandardCommand('table.splitCell', {
    run: (editor) => editor.tiptap.chain().focus().splitCell().run(),
    canRun: (editor) => editor.tiptap.can().splitCell(),
  }),
  defineStandardCommand('table.toggleHeaderRow', {
    run: (editor) => editor.tiptap.chain().focus().toggleHeaderRow().run(),
    canRun: (editor) => editor.tiptap.can().toggleHeaderRow(),
  }),
  defineStandardCommand('table.toggleHeaderColumn', {
    run: (editor) => editor.tiptap.chain().focus().toggleHeaderColumn().run(),
    canRun: (editor) => editor.tiptap.can().toggleHeaderColumn(),
  }),
];
