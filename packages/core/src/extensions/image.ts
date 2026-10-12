import type { Node, NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';

/** Alignements d'image reconnus, sérialisés en `data-align`. */
export const IMAGE_ALIGNMENTS = ['left', 'center', 'right'] as const;

/** Alignement d'une image. */
export type ImageAlignment = (typeof IMAGE_ALIGNMENTS)[number];

/** Largeur minimale d'une image redimensionnée, en pixels. */
export const IMAGE_MIN_WIDTH = 40;

/** Largeur de départ d'un drag quand ni l'attribut ni le layout n'en donnent une. */
export const IMAGE_DEFAULT_DRAG_WIDTH = 300;

/** Nom de l'événement DOM émis au double-clic sur une image, pour ouvrir le dialogue d'édition. */
export const IMAGE_EDIT_EVENT = 'aster:image-edit';

/** Classes CSS du NodeView d'image. */
export const IMAGE_CLASS = 'aster-image';
export const IMAGE_SELECTED_CLASS = 'aster-image--selected';
export const IMAGE_HANDLE_CLASS = 'aster-image__handle';

/** Détail de l'événement `aster:image-edit` : position ProseMirror du nœud image. */
export interface ImageEditEventDetail {
  readonly pos: number;
}

/** Vrai si la valeur est un alignement d'image reconnu. */
export function isImageAlignment(value: unknown): value is ImageAlignment {
  return typeof value === 'string' && (IMAGE_ALIGNMENTS as readonly string[]).includes(value);
}

/**
 * Lit la largeur d'un `<img>` : attribut `width` d'abord, sinon `style="width: Npx"`.
 * On accepte les deux à la lecture (HTML venant d'ailleurs) mais on ne sérialise
 * que l'attribut, pour une sortie stable.
 */
export function parseImageWidth(element: HTMLElement): number | null {
  const attribute = element.getAttribute('width');
  if (attribute) {
    const parsed = Number.parseInt(attribute, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const match = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(
    element.getAttribute('style') ?? '',
  );
  if (match?.[1]) {
    const parsed = Math.round(Number.parseFloat(match[1]));
    return parsed > 0 ? parsed : null;
  }
  return null;
}

/** Borne une largeur entre le minimum et la largeur du conteneur (illimitée si inconnue). */
export function clampImageWidth(width: number, containerWidth: number): number {
  const max = containerWidth > 0 ? containerWidth : Number.POSITIVE_INFINITY;
  return Math.round(Math.min(Math.max(width, IMAGE_MIN_WIDTH), max));
}

/** Largeur d'un nœud image telle que stockée, `null` si automatique. */
function widthOf(node: ProseMirrorNode): number | null {
  const value: unknown = node.attrs['width'];
  return typeof value === 'number' && value > 0 ? value : null;
}

/** Copie un attribut texte du nœud vers l'élément, en le retirant s'il est vide. */
function syncAttribute(target: HTMLElement, name: string, value: unknown): void {
  if (typeof value === 'string' && value !== '') {
    if (target.getAttribute(name) !== value) {
      target.setAttribute(name, value);
    }
  } else {
    target.removeAttribute(name);
  }
}

/**
 * NodeView vanilla d'une image : `<figure class="aster-image"><img><div class="aster-image__handle">`.
 *
 * - La poignée en bas à droite redimensionne à la souris : on lit les deltas de
 *   `clientX` depuis la largeur courante, borné à `[40, largeur du conteneur]`, et on
 *   n'écrit l'attribut `width` qu'au `mouseup` pour n'avoir qu'une étape d'historique.
 * - Le double-clic sélectionne le nœud puis émet `aster:image-edit` (bubbles) avec
 *   `{ pos }`, que `ui` écoute sur `editor.element` pour ouvrir son dialogue.
 * - Les mutations DOM internes (classe, style pendant le drag) sont ignorées par
 *   ProseMirror : le NodeView est seul maître de son DOM.
 */
export class ImageNodeView implements NodeView {
  readonly dom: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly handle: HTMLElement;
  private node: ProseMirrorNode;
  private dragStartX = 0;
  private dragStartWidth = 0;
  private dragging = false;

  constructor(private readonly props: NodeViewRendererProps) {
    this.node = props.node;
    this.dom = document.createElement('figure');
    this.dom.className = IMAGE_CLASS;
    // ProseMirror le pose aussi sur les feuilles, mais via le setter `contentEditable`
    // que jsdom ne reflète pas : explicite ici pour un DOM identique partout.
    this.dom.setAttribute('contenteditable', 'false');
    this.img = document.createElement('img');
    this.img.draggable = false;
    this.handle = document.createElement('div');
    this.handle.className = IMAGE_HANDLE_CLASS;
    this.handle.setAttribute('aria-hidden', 'true');
    this.dom.append(this.img, this.handle);
    this.render();

    this.handle.addEventListener('mousedown', this.onHandleMouseDown);
    this.img.addEventListener('dblclick', this.onDoubleClick);
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    this.render();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add(IMAGE_SELECTED_CLASS, 'ProseMirror-selectednode');
  }

  deselectNode(): void {
    this.dom.classList.remove(IMAGE_SELECTED_CLASS, 'ProseMirror-selectednode');
  }

  /** Les événements de la poignée et du drag en cours n'appartiennent pas à ProseMirror. */
  stopEvent(event: Event): boolean {
    if (event.target === this.handle) {
      return true;
    }
    return this.dragging && (event.type === 'mousemove' || event.type === 'mouseup');
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.handle.removeEventListener('mousedown', this.onHandleMouseDown);
    this.img.removeEventListener('dblclick', this.onDoubleClick);
    this.stopDrag();
  }

  /** Reflète les attributs du nœud dans le DOM, sans toucher à ce qui n'a pas changé. */
  private render(): void {
    const { attrs } = this.node;
    syncAttribute(this.img, 'src', attrs['src']);
    syncAttribute(this.img, 'alt', attrs['alt']);
    syncAttribute(this.img, 'title', attrs['title']);
    const width = widthOf(this.node);
    if (width !== null) {
      this.img.setAttribute('width', String(width));
      this.img.style.width = `${width}px`;
    } else {
      this.img.removeAttribute('width');
      this.img.style.removeProperty('width');
    }
    const align: unknown = attrs['align'];
    if (isImageAlignment(align)) {
      this.dom.setAttribute('data-align', align);
    } else {
      this.dom.removeAttribute('data-align');
    }
  }

  private readonly onHandleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !this.props.editor.isEditable) {
      return;
    }
    event.preventDefault();
    this.dragging = true;
    this.dragStartX = event.clientX;
    // jsdom n'a pas de layout : `offsetWidth` vaut 0, on part alors de 300 px.
    const measured = this.img.offsetWidth;
    this.dragStartWidth =
      widthOf(this.node) ?? (measured > 0 ? measured : IMAGE_DEFAULT_DRAG_WIDTH);
    this.dom.classList.add(`${IMAGE_CLASS}--resizing`);
    document.addEventListener('mousemove', this.onDocumentMouseMove);
    document.addEventListener('mouseup', this.onDocumentMouseUp);
  };

  private widthFor(event: MouseEvent): number {
    const containerWidth = this.props.view.dom.clientWidth;
    return clampImageWidth(this.dragStartWidth + (event.clientX - this.dragStartX), containerWidth);
  }

  private readonly onDocumentMouseMove = (event: MouseEvent): void => {
    if (!this.dragging) {
      return;
    }
    this.img.style.width = `${this.widthFor(event)}px`;
  };

  private readonly onDocumentMouseUp = (event: MouseEvent): void => {
    if (!this.dragging) {
      return;
    }
    const width = this.widthFor(event);
    this.stopDrag();
    const pos = this.props.getPos();
    if (pos === undefined) {
      return;
    }
    const { view } = this.props;
    const current = view.state.doc.nodeAt(pos);
    if (!current || current.type !== this.node.type) {
      return;
    }
    // `height` est effacée : l'image garde son ratio via `height: auto` en CSS.
    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
      ...current.attrs,
      width,
      height: null,
    });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    view.dispatch(tr);
  };

  private stopDrag(): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.dom.classList.remove(`${IMAGE_CLASS}--resizing`);
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
    document.removeEventListener('mouseup', this.onDocumentMouseUp);
    this.render();
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    const pos = this.props.getPos();
    if (pos === undefined || !this.props.editor.isEditable) {
      return;
    }
    event.preventDefault();
    const { view } = this.props;
    if (!(view.state.selection instanceof NodeSelection) || view.state.selection.from !== pos) {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    }
    const detail: ImageEditEventDetail = { pos };
    view.dom.dispatchEvent(
      new CustomEvent<ImageEditEventDetail>(IMAGE_EDIT_EVENT, { bubbles: true, detail }),
    );
  };
}

/** Fabrique de NodeView d'image, exposée pour les tests et les intégrateurs. */
export const renderImageNodeView: NodeViewRenderer = (props) => new ImageNodeView(props);

/**
 * Extension Image d'Aster : celle de Tiptap plus un attribut `align` (`data-align`),
 * une largeur numérique lue depuis `width` ou `style="width"`, et un NodeView avec
 * poignée de redimensionnement. Le HTML produit reste un `<img>` nu : `getHTML()`
 * passe par `renderHTML`, pas par le NodeView, donc la sortie est stable.
 */
export function createImageExtension(): Node {
  return Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        width: {
          default: null,
          parseHTML: parseImageWidth,
          renderHTML: (attributes: Record<string, unknown>) => {
            const value = attributes['width'];
            return typeof value === 'number' && value > 0 ? { width: String(value) } : {};
          },
        },
        align: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const value = element.getAttribute('data-align');
            return isImageAlignment(value) ? value : null;
          },
          renderHTML: (attributes: Record<string, unknown>) =>
            isImageAlignment(attributes['align']) ? { 'data-align': attributes['align'] } : {},
        },
      };
    },
    addNodeView() {
      return renderImageNodeView;
    },
  }).configure({
    inline: false,
    allowBase64: true,
  });
}
