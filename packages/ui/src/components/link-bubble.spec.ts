import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import type { Bubble } from './bubble';
import { selectionReference, virtualReference } from './bubble';
import { LINK_BUBBLE_URL_MAX_LENGTH, createLinkBubble, truncateUrl } from './link-bubble';

describe('truncateUrl', () => {
  it('laisse une URL courte intacte et tronque au milieu une URL longue', () => {
    expect(truncateUrl('https://a.b/')).toBe('https://a.b/');
    const long = `https://example.org/${'x'.repeat(80)}/page.html`;
    const short = truncateUrl(long);
    expect(Array.from(short).length).toBeLessThanOrEqual(LINK_BUBBLE_URL_MAX_LENGTH);
    expect(short.startsWith('https://example.org/')).toBe(true);
    expect(short.endsWith('page.html')).toBe(true);
    expect(short).toContain('…');
    expect(truncateUrl('abcdefghij', 5)).toBe('abcd…');
    expect(truncateUrl('abcdefghijklmnop', 12)).toBe('abcdefg…mnop');
  });
});

describe('références de positionnement', () => {
  it('virtualReference expose le rectangle fourni, selectionReference retombe sur le contenu', () => {
    const rect = new DOMRect(10, 20, 30, 40);
    expect(virtualReference(() => rect).getBoundingClientRect()).toBe(rect);
    const editor = createMockEditor();
    const fallback = selectionReference(editor).getBoundingClientRect();
    expect(fallback.width).toBe(editor.contentElement.getBoundingClientRect().width);
  });
});

describe('createLinkBubble', () => {
  let editor: MockEditor;
  let host: HTMLElement;
  let bubble: Bubble;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    document.body.append(host);
    host.append(editor.element);
    bubble = createLinkBubble(editor);
  });

  afterEach(() => {
    bubble.destroy();
    host.remove();
  });

  const select = (href: string | null, target = '_self'): void => {
    if (href === null) {
      editor.activeNodes.delete('link');
      editor.attributes.delete('link');
    } else {
      editor.activeNodes.add('link');
      editor.attributes.set('link', { href, target });
    }
    editor.emit('selectionChange', { editor });
  };
  const query = <T extends HTMLElement>(selector: string): T | null =>
    bubble.element.querySelector<T>(selector);
  const buttons = (): HTMLButtonElement[] =>
    Array.from(bubble.element.querySelectorAll<HTMLButtonElement>('button'));

  it('reste cachée hors lien et apparaît sous le lien sur selectionChange', async () => {
    expect(bubble.isOpen()).toBe(false);
    expect(bubble.element.hasAttribute('hidden')).toBe(true);
    select('https://aster.dev/docs');
    expect(bubble.isOpen()).toBe(true);
    expect(editor.element.contains(bubble.element)).toBe(true);
    expect(bubble.element.classList.contains('aster-link-bubble')).toBe(true);
    expect(bubble.element.getAttribute('role')).toBe('group');
    expect(bubble.element.getAttribute('aria-label')).toBe('Link');
    const anchor = query<HTMLAnchorElement>('.aster-bubble__url');
    expect(anchor?.getAttribute('href')).toBe('https://aster.dev/docs');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(anchor?.textContent).toBe('https://aster.dev/docs');
    await bubble.reposition();
    expect(bubble.element.style.left).toMatch(/px$/);
    expect(bubble.element.style.top).toMatch(/px$/);
    select(null);
    expect(bubble.isOpen()).toBe(false);
    expect(bubble.element.hasAttribute('hidden')).toBe(true);
    expect(bubble.element.childElementCount).toBe(0);
  });

  it('se reconstruit quand le lien change, pas quand la sélection bouge dans le même lien', () => {
    select('https://a.dev/');
    const first = query('.aster-bubble__url');
    select('https://a.dev/');
    expect(query('.aster-bubble__url')).toBe(first);
    select('https://b.dev/');
    expect(query('.aster-bubble__url')).not.toBe(first);
    expect(query('.aster-bubble__url')?.textContent).toBe('https://b.dev/');
  });

  it('ne vole pas le focus : mousedown neutralisé sur l’URL et les boutons', () => {
    select('https://a.dev/');
    for (const target of [query('.aster-bubble__url'), ...buttons()]) {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      target?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('Supprimer lance link.unset, ferme la bulle et rend le focus', () => {
    select('https://a.dev/');
    const remove = buttons().find((button) =>
      button.classList.contains('aster-bubble__button--danger'),
    );
    expect(remove?.textContent).toBe('Remove link');
    remove?.click();
    expect(editor.calls).toEqual([{ id: 'link.unset', args: undefined }]);
    expect(bubble.isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('Modifier ouvre un champ inline prérempli ; Entrée applique link.set en gardant la cible', () => {
    select('https://a.dev/', '_blank');
    buttons()[0]?.click();
    const input = query<HTMLInputElement>('.aster-bubble__input');
    expect(input?.value).toBe('https://a.dev/');
    expect(document.activeElement).toBe(input);
    expect(query('.aster-bubble__url')).toBeNull();
    input!.value = 'javascript:alert(1)';
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(editor.calls).toEqual([]);
    input!.value = 'https://b.dev/page';
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(editor.calls).toEqual([
      { id: 'link.set', args: { href: 'https://b.dev/page', target: '_blank' } },
    ]);
    expect(bubble.isOpen()).toBe(false);
    expect(editor.focusCalls).toBe(1);
  });

  it('Échap ou Annuler dans le champ revient à la vue sans rien changer', () => {
    select('https://a.dev/');
    buttons()[0]?.click();
    query<HTMLInputElement>('.aster-bubble__input')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(query('.aster-bubble__url')?.textContent).toBe('https://a.dev/');
    expect(bubble.isOpen()).toBe(true);
    buttons()[0]?.click();
    buttons()
      .find((button) => button.textContent === 'Cancel')
      ?.click();
    expect(query('.aster-bubble__url')).not.toBeNull();
    expect(editor.calls).toEqual([]);
  });

  it('se cache en lecture seule et grise les actions refusées par le registre', () => {
    editor.disabled.add('link.unset');
    select('https://a.dev/');
    const remove = buttons().find((button) =>
      button.classList.contains('aster-bubble__button--danger'),
    );
    expect(remove?.disabled).toBe(true);
    editor.setReadOnly(true);
    expect(bubble.isOpen()).toBe(false);
    editor.setReadOnly(false);
    expect(bubble.isOpen()).toBe(true);
  });

  it('destroy retire la bulle et ses abonnements', () => {
    select('https://a.dev/');
    bubble.destroy();
    expect(editor.element.contains(bubble.element)).toBe(false);
    expect(editor.listenerCount()).toBe(0);
    select('https://b.dev/');
    expect(bubble.isOpen()).toBe(false);
  });
});
