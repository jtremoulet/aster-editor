import {
  Node,
  isNodeActive,
  mergeAttributes,
  type NodeViewRenderer,
  type NodeViewRendererProps,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';
import type { TabAttrs } from '../api';
import { formatPt, isLayoutNumber, parsePt, roundLayoutNumber } from './layout-css';

/** Nom du nœud de tabulation. */
export const TAB_NODE_NAME = 'tab';
/** Attribut HTML marqueur : `<span data-tab=""></span>`. */
export const TAB_ATTRIBUTE = 'data-tab';
/** Attribut HTML de la position du taquet : `data-stop="36pt"`. */
export const TAB_STOP_ATTRIBUTE = 'data-stop';
/** Classe du `span` rendu par le NodeView. */
export const TAB_CLASS = 'aster-tab';
/** Variable CSS posée sur le NodeView quand le taquet est connu : `--aster-tab-stop: 36pt`. */
export const TAB_STOP_CSS_VARIABLE = '--aster-tab-stop';
/** Texte d'une tabulation dans `getText()`. */
export const TAB_TEXT = '\t';

/** Types d'item de liste dans lesquels la touche Tab reste `sinkListItem`. */
const LIST_ITEM_TYPES = ['listItem', 'taskItem'] as const;
/** Types de cellule dans lesquels la touche Tab reste la navigation de table. */
const CELL_TYPES = ['tableCell', 'tableHeader'] as const;

/** Position de taquet valide (nombre de mise en page positif ou nul, arrondi) ou `null`. */
export function sanitizeTabStop(value: unknown): number | null {
  return isLayoutNumber(value) && value >= 0 ? roundLayoutNumber(value) : null;
}

/** Vrai si le nœud est une tabulation. */
export function isTabNode(node: ProseMirrorNode | null | undefined): boolean {
  return node?.type.name === TAB_NODE_NAME;
}

/** Attributs typés d'un nœud `tab`. */
export function tabAttrs(node: ProseMirrorNode): TabAttrs {
  return { stopPt: sanitizeTabStop(node.attrs['stopPt']) };
}

/** Vrai si la sélection est dans un item de liste ou une cellule : la touche Tab leur appartient. */
function isTabReserved(state: EditorState): boolean {
  return [...LIST_ITEM_TYPES, ...CELL_TYPES].some((type) => isNodeActive(state, type));
}

/**
 * NodeView minimal d'une tabulation : `<span class="aster-tab" contenteditable="false"
 * data-tab="">` avec une largeur de repli inline (`display: inline-block; min-width: 2em`)
 * et, quand le taquet est connu, `data-stop` et `--aster-tab-stop`. La feuille `ui` fait
 * le rendu élastique ; le core garantit seulement qu'une tabulation occupe de la place.
 */
export class TabNodeView implements NodeView {
  readonly dom: HTMLElement;
  private node: ProseMirrorNode;

  constructor(props: NodeViewRendererProps) {
    this.node = props.node;
    this.dom = document.createElement('span');
    this.dom.className = TAB_CLASS;
    this.dom.setAttribute('contenteditable', 'false');
    this.dom.setAttribute(TAB_ATTRIBUTE, '');
    this.render();
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  private render(): void {
    const stop = sanitizeTabStop(this.node.attrs['stopPt']);
    this.dom.style.cssText = 'display: inline-block; min-width: 2em';
    if (stop === null) {
      this.dom.removeAttribute(TAB_STOP_ATTRIBUTE);
      return;
    }
    this.dom.setAttribute(TAB_STOP_ATTRIBUTE, formatPt(stop));
    this.dom.style.setProperty(TAB_STOP_CSS_VARIABLE, formatPt(stop));
  }
}

/** Fabrique de NodeView de tabulation, exposée pour les tests. */
export function renderTabNodeView(): NodeViewRenderer {
  return (props) => new TabNodeView(props);
}

/**
 * Nœud `tab` : inline, atomique, non sélectionnable (le curseur le franchit comme un
 * caractère), attribut `stopPt` (`null` par défaut). HTML figé :
 * `<span data-tab=""></span>` ou `<span data-tab="" data-stop="36pt"></span>` ;
 * `getText()` rend `\t`. La touche Tab insère une tabulation dans un paragraphe ou un
 * titre, mais reste `sinkListItem` dans une liste et la navigation de cellule dans une
 * table (l'extension est de priorité basse : ces keymaps passent avant). Backspace et
 * Delete effacent la tabulation adjacente d'un coup, comme un caractère.
 */
export const Tab = Node.create({
  name: TAB_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  // Les keymaps de liste et de table (priorité 100 par défaut) passent avant.
  priority: 50,

  addAttributes() {
    return {
      stopPt: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          sanitizeTabStop(parsePt(element.getAttribute(TAB_STOP_ATTRIBUTE))),
        renderHTML: (attributes: Record<string, unknown>) => {
          const stop = sanitizeTabStop(attributes['stopPt']);
          return stop === null ? {} : { [TAB_STOP_ATTRIBUTE]: formatPt(stop) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${TAB_ATTRIBUTE}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ [TAB_ATTRIBUTE]: '' }, HTMLAttributes)];
  },

  renderText() {
    return TAB_TEXT;
  },

  addNodeView() {
    return renderTabNodeView();
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { state } = editor;
        if (isTabReserved(state) || !state.selection.$from.parent.isTextblock) {
          return false;
        }
        return editor.commands.insertContent({ type: this.name });
      },
      Backspace: ({ editor }) =>
        editor.commands.command(({ tr, state, dispatch }) => {
          const { selection } = state;
          const before = selection.$from.nodeBefore;
          if (!selection.empty || !isTabNode(before) || !before) {
            return false;
          }
          if (dispatch) {
            tr.delete(selection.from - before.nodeSize, selection.from);
          }
          return true;
        }),
      Delete: ({ editor }) =>
        editor.commands.command(({ tr, state, dispatch }) => {
          const { selection } = state;
          const after = selection.$from.nodeAfter;
          if (!selection.empty || !isTabNode(after) || !after) {
            return false;
          }
          if (dispatch) {
            tr.delete(selection.from, selection.from + after.nodeSize);
          }
          return true;
        }),
    };
  },
});
