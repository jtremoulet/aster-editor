import type { AsterEditor, Unsubscribe } from '@aster-editor/core';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { Placement, ReferenceElement } from '@floating-ui/dom';
import type { ToolbarWidget } from '../types.js';
import { clear, el } from '../utils/dom.js';
import { isRecord } from '../utils/guards.js';

/** Espace entre l'élément de référence et la bulle, en pixels. */
const BUBBLE_OFFSET = 6;

/** Marge gardée entre la bulle et le bord du viewport, en pixels. */
const VIEWPORT_PADDING = 8;

/** Bulle contextuelle montée sur un éditeur. */
export interface Bubble extends ToolbarWidget {
  /** Vrai tant que la bulle est affichée. */
  isOpen(): boolean;
  /** Ferme la bulle sans toucher à la sélection. */
  hide(): void;
  /**
   * Recalcule la position depuis l'élément de référence. Résolue une fois les styles
   * `left`/`top` posés ; sans effet si la bulle est fermée.
   */
  reposition(): Promise<void>;
}

/** Options d'une bulle contextuelle. */
export interface BubbleOptions {
  /** Classe additionnelle à `aster-bubble`. */
  readonly className: string;
  /** Libellé accessible de la bulle, retraduit à chaque rendu. */
  readonly label: () => string;
  /** Côté de la référence où poser la bulle ; retournée (`flip`) si la place manque. */
  readonly placement: Placement;
  /** Vrai si la bulle doit être visible pour l'état courant de l'éditeur. */
  readonly shouldShow: () => boolean;
  /** Élément (ou rectangle virtuel) auquel la bulle est ancrée. */
  readonly reference: () => ReferenceElement;
  /**
   * Clé de l'état affiché (URL du lien, position de l'image…) : tant qu'elle ne change
   * pas, un `selectionChange` ne fait que repositionner la bulle, sans la reconstruire.
   * Une saisie en cours dans la bulle survit donc aux mouvements de sélection.
   */
  readonly key: () => string;
  /** Construit le contenu de la bulle, appelé à chaque changement de `key`. */
  readonly render: (body: HTMLElement, bubble: Bubble) => void;
}

/**
 * Élément de référence virtuel pour `@floating-ui/dom` à partir d'un rectangle : sert de
 * repli quand aucun élément DOM ne porte la sélection (vue absente dans les tests, position
 * sans nœud).
 */
export function virtualReference(getRect: () => DOMRect): ReferenceElement {
  return { getBoundingClientRect: getRect };
}

/**
 * Rectangle viewport de la sélection courante via `view.coordsAtPos`, sinon celui du
 * contenu éditable. Tolérant à l'absence de vue (éditeur de test).
 */
export function selectionReference(editor: AsterEditor): ReferenceElement {
  return virtualReference(() => {
    try {
      const tiptap: unknown = editor.tiptap;
      if (isRecord(tiptap) && isRecord(tiptap['view']) && isRecord(tiptap['state'])) {
        const { from, to } = editor.tiptap.state.selection;
        const start = editor.tiptap.view.coordsAtPos(from);
        const end = editor.tiptap.view.coordsAtPos(to);
        const left = Math.min(start.left, end.left);
        const right = Math.max(start.right, end.right);
        const top = Math.min(start.top, end.top);
        const bottom = Math.max(start.bottom, end.bottom);
        return new DOMRect(left, top, right - left, bottom - top);
      }
    } catch {
      // Vue démontée ou position hors document : repli sur le contenu.
    }
    return editor.contentElement.getBoundingClientRect();
  });
}

/**
 * Bulle contextuelle flottante : montée dans `editor.element` en `position: fixed`
 * (héritage des variables de thème), positionnée avec `@floating-ui/dom` contre un
 * élément de référence (`offset` + `flip` + `shift` dans le viewport), repositionnée
 * au défilement et à chaque `selectionChange`. Affichée quand `shouldShow` est vrai,
 * cachée sinon, en lecture seule (vue source comprise) et à la destruction.
 *
 * La bulle ne vole jamais le focus : ses boutons viennent de `createPlainButton`
 * (`mousedown` neutralisé) et rien n'est focalisé à l'ouverture. Seule une saisie
 * explicite (clic dans un champ de la bulle) déplace le focus.
 */
export function createBubble(editor: AsterEditor, options: BubbleOptions): Bubble {
  const element = el('div', {
    className: `aster-bubble ${options.className}`,
    attrs: { role: 'group', hidden: '' },
  });
  let opened = false;
  let renderedKey: string | null = null;
  let positioning: Promise<void> = Promise.resolve();

  const reposition = (): Promise<void> => {
    if (!opened) return Promise.resolve();
    const run = computePosition(options.reference(), element, {
      strategy: 'fixed',
      placement: options.placement,
      middleware: [offset(BUBBLE_OFFSET), flip(), shift({ padding: VIEWPORT_PADDING })],
    })
      .then(({ x, y }) => {
        if (!opened) return;
        element.style.left = `${Math.round(x)}px`;
        element.style.top = `${Math.round(y)}px`;
      })
      .catch(() => undefined);
    positioning = run;
    return run;
  };

  const onScroll = (): void => {
    void reposition();
  };

  const hide = (): void => {
    if (!opened) return;
    opened = false;
    renderedKey = null;
    element.setAttribute('hidden', '');
    clear(element);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
  };

  const render = (): void => {
    clear(element);
    element.setAttribute('aria-label', options.label());
    options.render(element, bubble);
  };

  const show = (): void => {
    const key = options.key();
    if (!opened) {
      opened = true;
      if (!element.isConnected) editor.element.append(element);
      element.removeAttribute('hidden');
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
    }
    if (key !== renderedKey) {
      renderedKey = key;
      render();
    }
    void reposition();
  };

  const update = (): void => {
    if (editor.isDestroyed() || editor.isReadOnly() || !options.shouldShow()) {
      hide();
      return;
    }
    show();
  };

  const subscriptions: Unsubscribe[] = [
    editor.on('selectionChange', update),
    editor.on('readOnlyChange', update),
  ];

  const bubble: Bubble = {
    element,
    isOpen: () => opened,
    hide,
    reposition: () => {
      void reposition();
      return positioning;
    },
    update,
    destroy: () => {
      hide();
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.length = 0;
      element.remove();
    },
  };
  update();
  return bubble;
}
