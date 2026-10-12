import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectImageFiles,
  createImageUploadProps,
  insertImageFile,
  isImageFile,
  readFileAsDataUrl,
} from './image-upload';
import { mountEditor, type MountedEditor } from '../testing/mount';

const png = (): File =>
  new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' });
const pdf = (): File => new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });

/** jsdom n'a pas de DataTransfer : une liste de fichiers minimale suffit à nos handlers. */
function fileList(files: File[]): FileList {
  return Object.assign([...files], {
    item: (i: number) => files[i] ?? null,
  }) as unknown as FileList;
}

/** Laisse les promesses d'upload et de lecture se résoudre. */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('upload d’image', () => {
  describe('helpers purs', () => {
    it('isImageFile accepte les images raster et refuse le reste, SVG compris', () => {
      expect(isImageFile(png())).toBe(true);
      expect(isImageFile(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
      expect(isImageFile(new File([''], 'a.svg', { type: 'image/svg+xml' }))).toBe(false);
      expect(isImageFile(pdf())).toBe(false);
    });

    it('collectImageFiles filtre les non-images et tolère l’absence de liste', () => {
      expect(collectImageFiles(null)).toEqual([]);
      expect(collectImageFiles(undefined)).toEqual([]);
      const image = png();
      expect(collectImageFiles(fileList([pdf(), image]))).toEqual([image]);
    });

    it('readFileAsDataUrl produit une data URL base64', async () => {
      const url = await readFileAsDataUrl(png());
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
    });
  });

  describe('insertImageFile', () => {
    let mounted: MountedEditor;

    afterEach(() => {
      mounted.cleanup();
    });

    it('avec hook : émet uploadStart puis uploadDone et insère l’URL retournée', async () => {
      const upload = vi.fn(async () => 'https://cdn.example.com/a.png');
      mounted = mountEditor({ content: '<p></p>', upload });
      const events: string[] = [];
      mounted.editor.on('uploadStart', ({ file }) => events.push(`start:${file.name}`));
      mounted.editor.on('uploadDone', ({ file, src, error }) =>
        events.push(`done:${file.name}:${src ?? ''}:${error === undefined ? 'ok' : 'err'}`),
      );
      const file = png();
      await expect(insertImageFile(mounted.editor, file, upload)).resolves.toBe(true);
      expect(upload).toHaveBeenCalledWith(file);
      expect(events).toEqual(['start:a.png', 'done:a.png:https://cdn.example.com/a.png:ok']);
      expect(mounted.editor.getHTML()).toContain('src="https://cdn.example.com/a.png"');
      expect(mounted.editor.getHTML()).toContain('alt="a.png"');
    });

    it('avec hook en échec : émet uploadDone avec l’erreur et n’insère rien', async () => {
      const failure = new Error('réseau');
      const upload = vi.fn(async () => {
        throw failure;
      });
      mounted = mountEditor({ content: '<p></p>', upload });
      const done = vi.fn();
      mounted.editor.on('uploadDone', done);
      await expect(insertImageFile(mounted.editor, png(), upload)).resolves.toBe(false);
      expect(done).toHaveBeenCalledTimes(1);
      expect(done.mock.calls[0]?.[0]?.error).toBe(failure);
      expect(done.mock.calls[0]?.[0]?.src).toBeUndefined();
      expect(mounted.editor.getHTML()).not.toContain('<img');
    });

    it('sans hook : insère une data URL sans événement d’upload', async () => {
      mounted = mountEditor({ content: '<p></p>' });
      const start = vi.fn();
      const done = vi.fn();
      mounted.editor.on('uploadStart', start);
      mounted.editor.on('uploadDone', done);
      await expect(insertImageFile(mounted.editor, png())).resolves.toBe(true);
      expect(start).not.toHaveBeenCalled();
      expect(done).not.toHaveBeenCalled();
      expect(mounted.editor.getHTML()).toContain('src="data:image/png;base64,');
    });

    it('ignore un fichier non-image sans événement', async () => {
      const upload = vi.fn(async () => 'x');
      mounted = mountEditor({ content: '<p></p>', upload });
      const start = vi.fn();
      mounted.editor.on('uploadStart', start);
      await expect(insertImageFile(mounted.editor, pdf(), upload)).resolves.toBe(false);
      expect(upload).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    });

    it('n’insère rien si l’éditeur est détruit pendant l’upload', async () => {
      let resolveUpload: (src: string) => void = () => undefined;
      const upload = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveUpload = resolve;
          }),
      );
      mounted = mountEditor({ content: '<p></p>', upload });
      const done = vi.fn();
      mounted.editor.on('uploadDone', done);
      const pending = insertImageFile(mounted.editor, png(), upload);
      mounted.editor.destroy();
      resolveUpload('https://x/a.png');
      await expect(pending).resolves.toBe(true);
      expect(done).not.toHaveBeenCalled();
    });
  });

  describe('commande image.upload', () => {
    let mounted: MountedEditor;

    afterEach(() => {
      mounted.cleanup();
    });

    it('déclenche l’upload et répond true immédiatement', async () => {
      const upload = vi.fn(async () => 'https://x/a.png');
      mounted = mountEditor({ content: '<p></p>', upload });
      const file = png();
      expect(mounted.editor.commands.canRun('image.upload', { file })).toBe(true);
      expect(mounted.editor.commands.run('image.upload', { file })).toBe(true);
      await flush();
      expect(upload).toHaveBeenCalledWith(file);
      expect(mounted.editor.getHTML()).toContain('src="https://x/a.png"');
    });
  });

  describe('handlers de collage et de dépôt', () => {
    let mounted: MountedEditor;

    afterEach(() => {
      mounted.cleanup();
    });

    it('handlePaste consomme l’événement et insère les images collées', async () => {
      mounted = mountEditor({ content: '<p></p>' });
      const props = createImageUploadProps(mounted.editor, undefined);
      const event = { clipboardData: { files: fileList([png()]) } } as unknown as ClipboardEvent;
      expect(props.handlePaste(mounted.editor.tiptap.view, event)).toBe(true);
      await flush();
      expect(mounted.editor.getHTML()).toContain('<img src="data:image/png;base64,');
    });

    it('handlePaste laisse passer un collage sans image', () => {
      mounted = mountEditor({ content: '<p></p>' });
      const props = createImageUploadProps(mounted.editor, undefined);
      const noFiles = { clipboardData: { files: fileList([pdf()]) } } as unknown as ClipboardEvent;
      expect(props.handlePaste(mounted.editor.tiptap.view, noFiles)).toBe(false);
      const noData = {} as ClipboardEvent;
      expect(props.handlePaste(mounted.editor.tiptap.view, noData)).toBe(false);
    });

    it('handleDrop insère les images déposées depuis l’extérieur', async () => {
      const upload = vi.fn(async () => 'https://x/dropped.png');
      mounted = mountEditor({ content: '<p></p>', upload });
      const props = createImageUploadProps(mounted.editor, upload);
      const event = {
        dataTransfer: { files: fileList([png()]) },
        clientX: 0,
        clientY: 0,
      } as unknown as DragEvent;
      expect(props.handleDrop(mounted.editor.tiptap.view, event, null, false)).toBe(true);
      await flush();
      expect(mounted.editor.getHTML()).toContain('src="https://x/dropped.png"');
    });

    it('handleDrop ignore un déplacement interne et un dépôt sans image', () => {
      mounted = mountEditor({ content: '<p></p>' });
      const props = createImageUploadProps(mounted.editor, undefined);
      const withImage = { dataTransfer: { files: fileList([png()]) } } as unknown as DragEvent;
      expect(props.handleDrop(mounted.editor.tiptap.view, withImage, null, true)).toBe(false);
      const withoutImage = { dataTransfer: { files: fileList([pdf()]) } } as unknown as DragEvent;
      expect(props.handleDrop(mounted.editor.tiptap.view, withoutImage, null, false)).toBe(false);
    });
  });
});
