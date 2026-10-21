import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeSelection } from '@tiptap/pm/state';
import {
  IMAGE_DEFAULT_DRAG_WIDTH,
  IMAGE_EDIT_EVENT,
  IMAGE_HANDLE_CLASS,
  IMAGE_MIN_WIDTH,
  IMAGE_SELECTED_CLASS,
  clampImageWidth,
  isImageAlignment,
  parseImageHeight,
  parseImageWidth,
  type ImageEditEventDetail,
} from './image.js';
import { mountEditor, selectRange, type MountedEditor } from '../testing/mount.js';

const SRC = 'https://example.com/a.png';

/** Position du premier nœud image du document, -1 s'il n'y en a pas. */
function imagePos(mounted: MountedEditor): number {
  let found = -1;
  mounted.editor.tiptap.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === 'image') {
      found = pos;
    }
    return found < 0;
  });
  return found;
}

function figure(mounted: MountedEditor): HTMLElement {
  const node = mounted.editor.contentElement.querySelector<HTMLElement>('figure.aster-image');
  if (!node) {
    throw new Error('figure.aster-image introuvable');
  }
  return node;
}

function handle(mounted: MountedEditor): HTMLElement {
  const node = figure(mounted).querySelector<HTMLElement>(`.${IMAGE_HANDLE_CLASS}`);
  if (!node) {
    throw new Error('poignée introuvable');
  }
  return node;
}

function mouse(type: string, clientX: number, button = 0): MouseEvent {
  return new MouseEvent(type, { clientX, clientY: 0, button, bubbles: true, cancelable: true });
}

/** Simule un drag de la poignée de `from` à `to` pixels (clientX). */
function drag(mounted: MountedEditor, from: number, to: number): void {
  handle(mounted).dispatchEvent(mouse('mousedown', from));
  document.dispatchEvent(mouse('mousemove', (from + to) / 2));
  document.dispatchEvent(mouse('mousemove', to));
  document.dispatchEvent(mouse('mouseup', to));
}

function imageAttrs(mounted: MountedEditor): Record<string, unknown> {
  const node = mounted.editor.tiptap.state.doc.nodeAt(imagePos(mounted));
  return node ? node.attrs : {};
}

describe('helpers purs', () => {
  it('isImageAlignment ne reconnaît que gauche, centre et droite', () => {
    expect(isImageAlignment('left')).toBe(true);
    expect(isImageAlignment('center')).toBe(true);
    expect(isImageAlignment('right')).toBe(true);
    expect(isImageAlignment('justify')).toBe(false);
    expect(isImageAlignment(null)).toBe(false);
  });

  it('parseImageWidth lit l’attribut width puis le style, sinon null', () => {
    const img = document.createElement('img');
    expect(parseImageWidth(img)).toBeNull();
    img.setAttribute('style', 'width: 320px; height: auto');
    expect(parseImageWidth(img)).toBe(320);
    img.setAttribute('style', 'max-width: 100px; width:12.6px');
    expect(parseImageWidth(img)).toBe(13);
    img.setAttribute('width', '200');
    expect(parseImageWidth(img)).toBe(200);
    img.setAttribute('width', 'abc');
    expect(parseImageWidth(img)).toBe(13);
    img.setAttribute('style', 'width: 0px');
    expect(parseImageWidth(img)).toBeNull();
  });

  it('parseImageHeight lit l’attribut height en entier positif, jamais le style', () => {
    const img = document.createElement('img');
    expect(parseImageHeight(img)).toBeNull();
    img.setAttribute('style', 'height: 120px');
    expect(parseImageHeight(img)).toBeNull();
    img.setAttribute('height', '200');
    expect(parseImageHeight(img)).toBe(200);
    img.setAttribute('height', '12.7');
    expect(parseImageHeight(img)).toBe(12);
    img.setAttribute('height', 'abc');
    expect(parseImageHeight(img)).toBeNull();
    img.setAttribute('height', '0');
    expect(parseImageHeight(img)).toBeNull();
  });

  it('clampImageWidth borne entre le minimum et la largeur du conteneur', () => {
    expect(clampImageWidth(10, 800)).toBe(IMAGE_MIN_WIDTH);
    expect(clampImageWidth(900, 800)).toBe(800);
    expect(clampImageWidth(500.4, 800)).toBe(500);
    // Conteneur sans layout (jsdom) : pas de borne haute.
    expect(clampImageWidth(5000, 0)).toBe(5000);
  });
});

describe('extension Image', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: `<p>a</p><img src="${SRC}" alt="Alt">` });
    selectRange(mounted.editor, 1, 1);
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('NodeView', () => {
    it('rend figure.aster-image > img + poignée, avec les attributs du nœud', () => {
      const fig = figure(mounted);
      const img = fig.querySelector('img');
      expect(img?.getAttribute('src')).toBe(SRC);
      expect(img?.getAttribute('alt')).toBe('Alt');
      expect(img?.draggable).toBe(false);
      expect(fig.hasAttribute('data-align')).toBe(false);
      expect(handle(mounted).getAttribute('aria-hidden')).toBe('true');
      expect(fig.getAttribute('contenteditable')).toBe('false');
    });

    it('reflète une mise à jour d’attributs sans recréer le DOM', () => {
      const fig = figure(mounted);
      mounted.editor.tiptap.commands.setNodeSelection(imagePos(mounted));
      mounted.editor.commands.run('image.setAttributes', {
        alt: 'Nouveau',
        title: 'T',
        width: 120,
        align: 'right',
      });
      expect(figure(mounted)).toBe(fig);
      const img = fig.querySelector('img');
      expect(img?.getAttribute('alt')).toBe('Nouveau');
      expect(img?.getAttribute('title')).toBe('T');
      expect(img?.getAttribute('width')).toBe('120');
      expect(img?.style.width).toBe('120px');
      expect(fig.getAttribute('data-align')).toBe('right');
      mounted.editor.commands.run('image.setAttributes', { width: 0, title: '' });
      expect(img?.hasAttribute('width')).toBe(false);
      expect(img?.style.width).toBe('');
      expect(img?.hasAttribute('title')).toBe(false);
    });

    it('applique height en attribut et en style inline, et le retire avec une largeur seule (L45b)', () => {
      const img = figure(mounted).querySelector('img');
      mounted.editor.tiptap.commands.setNodeSelection(imagePos(mounted));
      mounted.editor.commands.run('image.setAttributes', { width: 200, height: 80 });
      expect(img?.getAttribute('height')).toBe('80');
      // La feuille `ui` pose `height: auto` : seul le style inline l'emporte.
      expect(img?.style.height).toBe('80px');
      expect(img?.style.width).toBe('200px');
      mounted.editor.commands.run('image.setAttributes', { width: 100 });
      expect(img?.hasAttribute('height')).toBe(false);
      expect(img?.style.height).toBe('');
      expect(img?.style.width).toBe('100px');
    });

    it('le drag lève la hauteur inline dès le mousedown et l’efface au relâchement', () => {
      const img = figure(mounted).querySelector('img');
      mounted.editor.tiptap.commands.setNodeSelection(imagePos(mounted));
      mounted.editor.commands.run('image.setAttributes', { width: 200, height: 80 });
      handle(mounted).dispatchEvent(mouse('mousedown', 0));
      expect(img?.style.height).toBe('');
      document.dispatchEvent(mouse('mouseup', 50));
      expect(imageAttrs(mounted)['width']).toBe(250);
      expect(imageAttrs(mounted)['height']).toBeNull();
      expect(img?.hasAttribute('height')).toBe(false);
    });

    it('pose aster-image--selected quand le nœud est sélectionné, et le retire ensuite', () => {
      const fig = figure(mounted);
      expect(fig.classList.contains(IMAGE_SELECTED_CLASS)).toBe(false);
      mounted.editor.tiptap.commands.setNodeSelection(imagePos(mounted));
      expect(fig.classList.contains(IMAGE_SELECTED_CLASS)).toBe(true);
      selectRange(mounted.editor, 1, 1);
      expect(fig.classList.contains(IMAGE_SELECTED_CLASS)).toBe(false);
    });

    it('le drag de la poignée écrit width en partant de 300 px sans attribut', () => {
      drag(mounted, 100, 150);
      expect(imageAttrs(mounted)['width']).toBe(IMAGE_DEFAULT_DRAG_WIDTH + 50);
      expect(mounted.editor.getHTML()).toContain(`width="${IMAGE_DEFAULT_DRAG_WIDTH + 50}"`);
      // La sélection est posée sur l'image après le drag.
      expect(mounted.editor.tiptap.state.selection).toBeInstanceOf(NodeSelection);
      expect(figure(mounted).classList.contains(IMAGE_SELECTED_CLASS)).toBe(true);
    });

    it('le drag part de la largeur courante et respecte le minimum', () => {
      mounted.editor.tiptap.commands.setNodeSelection(imagePos(mounted));
      mounted.editor.commands.run('image.setAttributes', { width: 200 });
      drag(mounted, 300, 240);
      expect(imageAttrs(mounted)['width']).toBe(140);
      drag(mounted, 300, -1000);
      expect(imageAttrs(mounted)['width']).toBe(IMAGE_MIN_WIDTH);
    });

    it('le drag est borné par la largeur du conteneur quand elle est connue', () => {
      Object.defineProperty(mounted.editor.contentElement, 'clientWidth', {
        value: 320,
        configurable: true,
      });
      drag(mounted, 0, 500);
      expect(imageAttrs(mounted)['width']).toBe(320);
    });

    it('pendant le drag, la largeur visuelle suit la souris et la classe --resizing est posée', () => {
      const fig = figure(mounted);
      const img = fig.querySelector('img');
      handle(mounted).dispatchEvent(mouse('mousedown', 0));
      expect(fig.classList.contains('aster-image--resizing')).toBe(true);
      document.dispatchEvent(mouse('mousemove', 20));
      expect(img?.style.width).toBe(`${IMAGE_DEFAULT_DRAG_WIDTH + 20}px`);
      document.dispatchEvent(mouse('mouseup', 20));
      expect(fig.classList.contains('aster-image--resizing')).toBe(false);
    });

    it('un drag n’ajoute qu’une étape d’historique', () => {
      drag(mounted, 0, 60);
      expect(imageAttrs(mounted)['width']).toBe(IMAGE_DEFAULT_DRAG_WIDTH + 60);
      expect(mounted.editor.commands.run('undo')).toBe(true);
      expect(imageAttrs(mounted)['width']).toBeNull();
    });

    it('ignore le bouton droit et la lecture seule', () => {
      handle(mounted).dispatchEvent(mouse('mousedown', 0, 2));
      document.dispatchEvent(mouse('mousemove', 50));
      document.dispatchEvent(mouse('mouseup', 50));
      expect(imageAttrs(mounted)['width']).toBeNull();
      mounted.editor.setReadOnly(true);
      drag(mounted, 0, 50);
      expect(imageAttrs(mounted)['width']).toBeNull();
    });

    it('le double-clic sélectionne l’image et émet aster:image-edit sur l’hôte', () => {
      const received: ImageEditEventDetail[] = [];
      const listener = (event: Event): void => {
        received.push((event as CustomEvent<ImageEditEventDetail>).detail);
      };
      mounted.editor.element.addEventListener(IMAGE_EDIT_EVENT, listener);
      figure(mounted)
        .querySelector('img')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      mounted.editor.element.removeEventListener(IMAGE_EDIT_EVENT, listener);
      expect(received).toEqual([{ pos: imagePos(mounted) }]);
      expect(mounted.editor.tiptap.state.selection).toBeInstanceOf(NodeSelection);
      expect(mounted.editor.commands.canRun('image.setAttributes', { alt: 'x' })).toBe(true);
    });

    it('n’émet pas aster:image-edit en lecture seule', () => {
      let count = 0;
      const listener = (): void => {
        count += 1;
      };
      mounted.editor.element.addEventListener(IMAGE_EDIT_EVENT, listener);
      mounted.editor.setReadOnly(true);
      figure(mounted)
        .querySelector('img')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      mounted.editor.element.removeEventListener(IMAGE_EDIT_EVENT, listener);
      expect(count).toBe(0);
    });

    it('destroy retire les écouteurs document d’un drag en cours', () => {
      handle(mounted).dispatchEvent(mouse('mousedown', 0));
      mounted.editor.setHTML('<p>vide</p>');
      // Le NodeView est détruit : un mousemove/mouseup orphelin ne doit rien faire ni lever.
      document.dispatchEvent(mouse('mousemove', 50));
      document.dispatchEvent(mouse('mouseup', 50));
      expect(mounted.editor.getHTML()).toBe('<p>vide</p>');
    });
  });

  describe('sérialisation', () => {
    // Le paragraphe final évite le nœud de fin ajouté par StarterKit après un bloc image.
    it('sérialise src, alt, title, width et data-align, et reste idempotent', () => {
      const html = `<img src="${SRC}" alt="Alt" title="T" width="240" data-align="center"><p>fin</p>`;
      mounted.editor.setHTML(html);
      expect(mounted.editor.getHTML()).toBe(html);
      mounted.editor.setHTML(mounted.editor.getHTML());
      expect(mounted.editor.getHTML()).toBe(html);
    });

    it('accepte style="width: Npx" en entrée et le sérialise en attribut width', () => {
      mounted.editor.setHTML(`<img src="${SRC}" style="width: 180px"><p>fin</p>`);
      expect(mounted.editor.getHTML()).toBe(`<img src="${SRC}" width="180"><p>fin</p>`);
    });

    it('sérialise height en entier et ignore une hauteur invalide (L45b)', () => {
      const html = `<img src="${SRC}" width="240" height="120"><p>fin</p>`;
      mounted.editor.setHTML(html);
      expect(mounted.editor.getHTML()).toBe(html);
      expect(figure(mounted).querySelector('img')?.style.height).toBe('120px');
      mounted.editor.setHTML(`<img src="${SRC}" height="abc"><p>fin</p>`);
      expect(mounted.editor.getHTML()).toBe(`<img src="${SRC}"><p>fin</p>`);
    });

    it('ignore un data-align inconnu et une largeur invalide', () => {
      mounted.editor.setHTML(`<img src="${SRC}" width="abc" data-align="top"><p>fin</p>`);
      expect(mounted.editor.getHTML()).toBe(`<img src="${SRC}"><p>fin</p>`);
    });

    it('survit à setHTML(getHTML()) après un redimensionnement à la souris', () => {
      drag(mounted, 0, 100);
      const html = mounted.editor.getHTML();
      expect(html).toContain(`width="${IMAGE_DEFAULT_DRAG_WIDTH + 100}"`);
      mounted.editor.setHTML(html);
      expect(mounted.editor.getHTML()).toBe(html);
      expect(figure(mounted).querySelector('img')?.style.width).toBe(
        `${IMAGE_DEFAULT_DRAG_WIDTH + 100}px`,
      );
    });
  });
});
