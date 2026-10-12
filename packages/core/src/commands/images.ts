import type { AsterCommand, UploadHandler } from '../api';
import { insertImageFile, isImageFile } from '../extensions/image-upload';
import { isAllowedImageSrc, type ResolvedLinkPolicy } from '../extensions/link-safety';
import { defineStandardCommand } from './define';

/**
 * Commandes d'image. `image.upload` déclenche le traitement asynchrone et répond
 * tout de suite : `true` si le fichier est une image acceptée, le reste se joue
 * dans les événements `uploadStart`/`uploadDone`.
 */
export function createImageCommands(
  policy: ResolvedLinkPolicy,
  upload: UploadHandler | undefined,
): readonly AsterCommand[] {
  return [
    defineStandardCommand('image.insert', {
      run: (editor, args) => {
        if (!args || typeof args.src !== 'string' || !isAllowedImageSrc(args.src, policy)) {
          return false;
        }
        return editor.tiptap
          .chain()
          .focus()
          .setImage({ src: args.src, alt: args.alt, title: args.title, width: args.width })
          .run();
      },
      canRun: (editor, args) =>
        args !== undefined &&
        typeof args.src === 'string' &&
        isAllowedImageSrc(args.src, policy) &&
        editor.tiptap.can().setImage({ src: args.src }),
      isActive: (editor) => editor.tiptap.isActive('image'),
    }),
    defineStandardCommand('image.upload', {
      run: (editor, args) => {
        if (!args || !(args.file instanceof File) || !isImageFile(args.file)) {
          return false;
        }
        void insertImageFile(editor, args.file, upload);
        return true;
      },
      canRun: (_editor, args) =>
        args !== undefined && args.file instanceof File && isImageFile(args.file),
    }),
    defineStandardCommand('image.setAttributes', {
      run: (editor, args) => {
        if (!editor.tiptap.isActive('image')) {
          return false;
        }
        return editor.tiptap
          .chain()
          .focus()
          .updateAttributes('image', { ...args })
          .run();
      },
      canRun: (editor) => editor.tiptap.isActive('image'),
      isActive: (editor) => editor.tiptap.isActive('image'),
    }),
  ];
}
