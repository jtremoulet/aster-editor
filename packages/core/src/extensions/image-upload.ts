import type { EditorView } from '@tiptap/pm/view';
import type { AsterEditor, UploadHandler } from '../api';

/** Vrai si le fichier est une image exploitable par `<img>`. SVG exclu : vecteur de script. */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') && file.type !== 'image/svg+xml';
}

/** Lit un fichier en data URL base64, repli quand aucun hook d'upload n'est fourni. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader: unexpected result type'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader: read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Insère une image à la position courante. Isolé pour que l'insertion après un
 * upload asynchrone vérifie que l'éditeur existe toujours : un composant Angular
 * détruit pendant l'upload ne doit pas provoquer d'exception sur une vue morte.
 */
function insertImageSrc(editor: AsterEditor, src: string, alt: string): void {
  if (editor.isDestroyed()) {
    return;
  }
  editor.tiptap.chain().focus().setImage({ src, alt }).run();
}

/**
 * Traite un fichier image : upload via le hook s'il existe (avec `uploadStart` et
 * `uploadDone` pour que l'UI affiche l'attente), sinon data URL. Résout à `true`
 * si une image a été insérée. Un fichier non-image est ignoré sans événement.
 */
export async function insertImageFile(
  editor: AsterEditor,
  file: File,
  upload?: UploadHandler,
): Promise<boolean> {
  if (!isImageFile(file)) {
    return false;
  }
  if (!upload) {
    const dataUrl = await readFileAsDataUrl(file);
    insertImageSrc(editor, dataUrl, file.name);
    return true;
  }
  editor.emit('uploadStart', { editor, file });
  try {
    const src = await upload(file);
    insertImageSrc(editor, src, file.name);
    if (!editor.isDestroyed()) {
      editor.emit('uploadDone', { editor, file, src });
    }
    return true;
  } catch (error) {
    if (!editor.isDestroyed()) {
      editor.emit('uploadDone', { editor, file, error });
    }
    return false;
  }
}

/** Extrait les images d'une `FileList`, dans l'ordre. */
export function collectImageFiles(files: FileList | null | undefined): File[] {
  if (!files) {
    return [];
  }
  return Array.from(files).filter(isImageFile);
}

/** Handlers ProseMirror à brancher dans `editorProps`. */
export interface ImageUploadProps {
  handlePaste: (view: EditorView, event: ClipboardEvent) => boolean;
  handleDrop: (view: EditorView, event: DragEvent, slice: unknown, moved: boolean) => boolean;
}

/**
 * Crée les handlers de collage et de dépôt de fichiers image. Ils ne consomment
 * l'événement que si au moins une image est présente, pour laisser ProseMirror
 * gérer le collage de texte et le déplacement interne de nœuds.
 */
export function createImageUploadProps(
  editor: AsterEditor,
  upload: UploadHandler | undefined,
): ImageUploadProps {
  const insertAll = (files: File[]): boolean => {
    if (files.length === 0) {
      return false;
    }
    for (const file of files) {
      void insertImageFile(editor, file, upload);
    }
    return true;
  };

  return {
    handlePaste(_view, event) {
      return insertAll(collectImageFiles(event.clipboardData?.files));
    },
    handleDrop(view, event, _slice, moved) {
      if (moved) {
        return false;
      }
      const files = collectImageFiles(event.dataTransfer?.files);
      if (files.length === 0) {
        return false;
      }
      // Place le curseur à l'endroit du dépôt quand le navigateur sait le calculer.
      // `posAtCoords` passe par `document.elementFromPoint`, absent de jsdom et de
      // certains contextes : l'appel lui-même peut lever, pas seulement rendre null.
      // On insère alors à la sélection courante plutôt que de perdre le dépôt.
      try {
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (coords) {
          editor.tiptap.commands.setTextSelection(coords.pos);
        }
      } catch {
        // Position indisponible : sélection courante.
      }
      return insertAll(files);
    },
  };
}
