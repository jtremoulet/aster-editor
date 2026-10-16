import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_EDIT_EVENT } from '@aster-editor/core';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { Bubble } from './bubble';
import { IMAGE_BUBBLE_SIZES, createImageBubble, widthForRatio } from './image-bubble';

describe('widthForRatio', () => {
  it('arrondit la fraction de la largeur du contenu, null sans largeur mesurable', () => {
    expect(widthForRatio(801, 0.5)).toBe(401);
    expect(widthForRatio(800, 0.25)).toBe(200);
    expect(widthForRatio(800, 1)).toBe(800);
    expect(widthForRatio(0, 0.5)).toBeNull();
    expect(widthForRatio(800, 0)).toBeNull();
  });
});

describe('createImageBubble', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let bubble: Bubble;
  let deleteSelection: ReturnType<typeof vi.fn<() => boolean>>;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    deleteSelection = vi.fn<() => boolean>(() => true);
    Object.assign(editor.tiptap.commands as unknown as Record<string, unknown>, {
      deleteSelection,
    });
    Object.defineProperty(editor.contentElement, 'clientWidth', { value: 800 });
    host = document.createElement('div');
    document.body.append(host);
    host.append(editor.element);
    bubble = createImageBubble(editor);
  });

  afterEach(() => {
    bubble.destroy();
    host.remove();
  });

  const selectImage = (attrs: Record<string, unknown> | null): void => {
    if (attrs === null) {
      editor.activeNodes.delete('image');
      editor.attributes.delete('image');
    } else {
      editor.activeNodes.add('image');
      editor.attributes.set('image', attrs);
    }
    editor.emit('selectionChange', { editor });
  };
  const buttons = (): HTMLButtonElement[] =>
    Array.from(bubble.element.querySelectorAll<HTMLButtonElement>('button'));
  const aligns = (): HTMLButtonElement[] =>
    buttons().filter((button) => button.classList.contains('aster-image-bubble__align'));
  const sizes = (): HTMLButtonElement[] =>
    buttons().filter((button) => button.classList.contains('aster-image-bubble__size'));

  it('apparaît au-dessus d’une image sélectionnée avec alignement, tailles, modifier et supprimer', async () => {
    expect(bubble.isOpen()).toBe(false);
    selectImage({ src: 'a.png', align: 'center' });
    expect(bubble.isOpen()).toBe(true);
    expect(bubble.element.classList.contains('aster-image-bubble')).toBe(true);
    expect(bubble.element.getAttribute('aria-label')).toBe('Image');
    expect(aligns().map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(aligns()[1]?.classList.contains('aster-toolbar__button--active')).toBe(true);
    expect(sizes().map((button) => button.textContent)).toEqual(['25%', '50%', '100%']);
    expect(sizes().length).toBe(IMAGE_BUBBLE_SIZES.length);
    expect(sizes()[0]?.getAttribute('aria-label')).toBe('Width: 25% of the content');
    expect(buttons().map((button) => button.textContent)).toContain('Edit image');
    expect(buttons().map((button) => button.textContent)).toContain('Delete');
    await bubble.reposition();
    expect(bubble.element.style.top).toMatch(/px$/);
    selectImage(null);
    expect(bubble.isOpen()).toBe(false);
  });

  it('aligne via image.setAttributes et reflète le nouvel alignement', () => {
    selectImage({ src: 'a.png', align: null });
    aligns()[2]?.click();
    expect(editor.calls).toEqual([{ id: 'image.setAttributes', args: { align: 'right' } }]);
    expect(editor.focusCalls).toBe(1);
    selectImage({ src: 'a.png', align: 'right' });
    expect(aligns()[2]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('applique une largeur en pixels calculée depuis la largeur du contenu', () => {
    selectImage({ src: 'a.png' });
    sizes()[0]?.click();
    sizes()[2]?.click();
    expect(editor.calls).toEqual([
      { id: 'image.setAttributes', args: { width: 200 } },
      { id: 'image.setAttributes', args: { width: 800 } },
    ]);
  });

  it('Modifier émet aster:image-edit sur le contenu, Supprimer appelle deleteSelection', () => {
    selectImage({ src: 'a.png' });
    const onEdit = vi.fn();
    editor.element.addEventListener(IMAGE_EDIT_EVENT, onEdit);
    buttons()
      .find((button) => button.textContent === 'Edit image')
      ?.click();
    expect(onEdit).toHaveBeenCalledTimes(1);
    buttons()
      .find((button) => button.textContent === 'Delete')
      ?.click();
    expect(deleteSelection).toHaveBeenCalledTimes(1);
    expect(bubble.isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('grise tout quand image.setAttributes est refusée, et se cache en lecture seule', () => {
    editor.disabled.add('image.setAttributes');
    selectImage({ src: 'a.png' });
    expect(buttons().every((button) => button.disabled)).toBe(true);
    editor.setReadOnly(true);
    expect(bubble.isOpen()).toBe(false);
  });

  it('ne vole pas le focus et se retire au destroy', () => {
    selectImage({ src: 'a.png' });
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    buttons()[0]?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    bubble.destroy();
    expect(editor.element.contains(bubble.element)).toBe(false);
    expect(editor.listenerCount()).toBe(0);
  });
});
