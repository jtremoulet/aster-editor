import type { AsterCommand, StandardCommandArgs, UploadHandler } from '../api';
import { isImageAlignment } from '../extensions/image';
import { insertImageFile, isImageFile } from '../extensions/image-upload';
import { isAllowedImageSrc, type ResolvedLinkPolicy } from '../extensions/link-safety';
import { defineStandardCommand } from './define';

/** Attributs effectivement écrits sur le nœud image par `image.setAttributes`. */
export interface ImageAttributeUpdate {
  alt?: string | null;
  title?: string | null;
  width?: number | null;
  height?: number | null;
  align?: 'left' | 'center' | 'right' | null;
}

/**
 * Traduit les arguments publics en attributs de nœud. Une clé absente est laissée
 * telle quelle ; une chaîne vide efface `alt`/`title` ; une largeur nulle ou
 * négative efface `width` (retour à la taille naturelle) et `height` avec elle ;
 * un alignement inconnu est ignoré. Le contrat (`width?: number`) ne prévoit pas
 * `null` : c'est ce qui permet à l'UI de revenir à la largeur automatique.
 *
 * `height` (L45b) : une largeur seule efface la hauteur, l'image garde son ratio
 * (`height: auto` en CSS) ; une hauteur positive est écrite telle quelle, après la
 * largeur, et casse le ratio — c'est ce que le dialogue envoie quand son verrou de
 * proportions est levé ; `0` ou négative efface la hauteur seule.
 */
export function toImageAttributes(
  args: StandardCommandArgs['image.setAttributes'] | undefined,
): ImageAttributeUpdate {
  const update: ImageAttributeUpdate = {};
  if (!args) {
    return update;
  }
  if (typeof args.alt === 'string') {
    update.alt = args.alt === '' ? null : args.alt;
  }
  if (typeof args.title === 'string') {
    update.title = args.title === '' ? null : args.title;
  }
  if (typeof args.width === 'number' && Number.isFinite(args.width)) {
    update.width = args.width > 0 ? Math.round(args.width) : null;
    update.height = null;
  }
  if (typeof args.height === 'number' && Number.isFinite(args.height)) {
    update.height = args.height > 0 ? Math.round(args.height) : null;
  }
  if (args.align !== undefined) {
    update.align = isImageAlignment(args.align) ? args.align : null;
  }
  return update;
}

/**
 * Commandes d'image. `image.upload` déclenche le traitement asynchrone et répond
 * tout de suite : `true` si le fichier est une image acceptée, le reste se joue
 * dans les événements `uploadStart`/`uploadDone`. `image.setAttributes` n'est
 * exécutable que si une image est sélectionnée.
 */
export function createImageCommands(
  policy: ResolvedLinkPolicy,
  upload: UploadHandler | undefined,
): readonly AsterCommand[] {
  return [
    // Pas d'`isActive` : insérer n'est pas une bascule, le bouton ne s'enfonce jamais.
    // Dans un bloc de code, `insertContent` collerait du texte : refusé explicitement.
    defineStandardCommand('image.insert', {
      run: (editor, args) => {
        if (
          !args ||
          typeof args.src !== 'string' ||
          !isAllowedImageSrc(args.src, policy) ||
          editor.tiptap.isActive('codeBlock')
        ) {
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
        !editor.tiptap.isActive('codeBlock') &&
        editor.tiptap.can().setImage({ src: args.src }),
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
        const attributes = toImageAttributes(args);
        if (Object.keys(attributes).length === 0) {
          return false;
        }
        return editor.tiptap.chain().focus().updateAttributes('image', attributes).run();
      },
      canRun: (editor) => editor.tiptap.isActive('image'),
      isActive: (editor) => editor.tiptap.isActive('image'),
    }),
  ];
}
