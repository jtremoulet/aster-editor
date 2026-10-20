import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadDocx, normalizeDocxFilename } from './download-docx';

describe('normalizeDocxFilename', () => {
  it('garantit l’extension .docx et un nom par défaut', () => {
    expect(normalizeDocxFilename('rapport')).toBe('rapport.docx');
    expect(normalizeDocxFilename('rapport.DOCX')).toBe('rapport.docx');
    expect(normalizeDocxFilename('  ')).toBe('document.docx');
    expect(normalizeDocxFilename(undefined)).toBe('document.docx');
  });

  it('remplace les caractères interdits dans un nom de fichier', () => {
    expect(normalizeDocxFilename('a/b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i.docx');
  });
});

describe('downloadDocx', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { value: originalCreate, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: originalRevoke, configurable: true });
    vi.useRealTimers();
  });

  it('crée un lien de téléchargement éphémère, clique dessus puis révoque l’URL', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('export.docx');
      expect(this.href).toBe('blob:fake');
      expect(this.isConnected).toBe(true);
    });

    const blob = new Blob(['x']);
    downloadDocx(blob, 'export');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    click.mockRestore();
  });

  it('lève une erreur explicite hors navigateur', () => {
    Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true });
    expect(() => downloadDocx(new Blob(['x']))).toThrow(/navigateur/);
  });
});
