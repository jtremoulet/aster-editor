import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockEditor, type MockEditor } from '../testing/mock-editor';
import { registerUiTranslations } from '../toolbar/create-toolbar';
import { createWidget } from '../toolbar/widgets';
import {
  PRINT_CONTENT_CLASS,
  PRINT_CONTENT_STYLES,
  buildPrintDocument,
  createPrintButton,
  printEditor,
} from './print';

/** Fenêtre d'impression simulée : jsdom n'ouvre rien et n'imprime pas. */
interface FakeWindow {
  readonly document: { open: () => void; write: (html: string) => void; close: () => void };
  readonly listeners: Map<string, () => void>;
  addEventListener: (type: string, listener: () => void) => void;
  focus: () => void;
  print: () => void;
  close: () => void;
}

function fakeWindow(): FakeWindow & { written: string[] } {
  const written: string[] = [];
  const listeners = new Map<string, () => void>();
  return {
    written,
    listeners,
    document: {
      open: vi.fn(),
      write: vi.fn((html: string) => {
        written.push(html);
      }),
      close: vi.fn(),
    },
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    }),
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
  };
}

describe('buildPrintDocument', () => {
  it('produit un document complet avec titre et lang échappés, la feuille embarquée et le contenu', () => {
    const html = buildPrintDocument('<p>Bonjour <b>&amp;</b></p>', {
      title: 'A <b>"t"</b>',
      lang: 'fr"',
      styles: 'p{color:red}',
    });
    expect(html.startsWith('<!doctype html><html lang="fr&quot;">')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>A &lt;b&gt;&quot;t&quot;&lt;/b&gt;</title>');
    expect(html).toContain(PRINT_CONTENT_STYLES);
    expect(html).toContain('p{color:red}');
    expect(html).toContain(`<div class="${PRINT_CONTENT_CLASS}"><p>Bonjour <b>&amp;</b></p></div>`);
    expect(html.endsWith('</body></html>')).toBe(true);
  });
});

describe('printEditor', () => {
  let editor: MockEditor;

  beforeEach(() => {
    editor = createMockEditor({ locale: 'fr' });
    registerUiTranslations(editor);
    editor.contentElement.innerHTML = '<h1>Titre</h1><p>Texte</p>';
  });

  it('écrit le document dans la fenêtre, imprime et referme après impression', () => {
    const target = fakeWindow();
    const open = vi.fn(() => target as unknown as Window);
    expect(printEditor(editor, open)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(target.document.open).toHaveBeenCalledTimes(1);
    expect(target.written).toHaveLength(1);
    expect(target.written[0]).toContain('<html lang="fr">');
    expect(target.written[0]).toContain('<title>Document</title>');
    expect(target.written[0]).toContain('<h1>Titre</h1><p>Texte</p>');
    expect(target.document.close).toHaveBeenCalledTimes(1);
    expect(target.focus).toHaveBeenCalledTimes(1);
    expect(target.print).toHaveBeenCalledTimes(1);
    expect(target.close).not.toHaveBeenCalled();
    target.listeners.get('afterprint')?.();
    expect(target.close).toHaveBeenCalledTimes(1);
  });

  it('retourne false si la fenêtre est bloquée', () => {
    expect(printEditor(editor, () => null)).toBe(false);
  });

  it('utilise window.open par défaut', () => {
    const target = fakeWindow();
    const spy = vi.spyOn(window, 'open').mockReturnValue(target as unknown as Window);
    expect(printEditor(editor)).toBe(true);
    expect(spy).toHaveBeenCalledWith('', '_blank');
    expect(target.print).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('createPrintButton', () => {
  let editor: MockEditor;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('imprime au clic, reste actif en lecture seule et suit la locale', () => {
    const target = fakeWindow();
    const open = vi.fn(() => target as unknown as Window);
    const widget = createPrintButton(editor, open);
    const button = widget.element as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Print');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.hasAttribute('data-toolbar-item')).toBe(true);
    editor.setReadOnly(true);
    widget.update();
    expect(button.disabled).toBe(false);
    button.click();
    expect(target.print).toHaveBeenCalledTimes(1);
    editor.i18n.setLocale('fr');
    widget.update();
    expect(button.getAttribute('aria-label')).toBe('Imprimer');
    widget.destroy();
    button.click();
    expect(target.print).toHaveBeenCalledTimes(1);
  });

  it('est enregistré comme widget « print » sans condition de commande, sur window.open', () => {
    const target = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(target as unknown as Window);
    const widget = createWidget(createMockEditor({ commands: [] }), 'print');
    expect(widget).not.toBeNull();
    (widget!.element as HTMLButtonElement).click();
    expect(target.print).toHaveBeenCalledTimes(1);
  });
});
