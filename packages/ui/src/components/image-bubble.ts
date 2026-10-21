import type { AsterEditor, StandardCommandArgs } from '@aster-editor/core';
import { IMAGE_ALIGNMENTS, IMAGE_EDIT_EVENT } from '@aster-editor/core';
import type { ReferenceElement } from '@floating-ui/dom';
import { el } from '../utils/dom.js';
import { isRecord, readNumberOrString, readString } from '../utils/guards.js';
import { createBubble, selectionReference, type Bubble } from './bubble.js';
import { createPlainButton, setDisabled } from './button.js';

/** Alignement d'image, tel que le contrat `image.setAttributes` l'attend. */
type ImageAlign = NonNullable<StandardCommandArgs['image.setAttributes']['align']>;

/** Fractions de la largeur du contenu proposées par la bulle. */
export const IMAGE_BUBBLE_SIZES: readonly number[] = [0.25, 0.5, 1];

/** Attributs de l'image sélectionnée. */
interface ImageState {
  readonly align: string | null;
  readonly width: number | string | null;
}

const NO_IMAGE: ImageState = { align: null, width: null };

/** Vrai si une image est sélectionnée, tolérant si l'extension manque. */
function isImageSelected(editor: AsterEditor): boolean {
  try {
    return editor.tiptap.isActive('image');
  } catch {
    return false;
  }
}

/** Image sous la sélection, attributs lus champ par champ. */
function currentImage(editor: AsterEditor): ImageState {
  try {
    const attrs: unknown = editor.tiptap.getAttributes('image');
    if (!isRecord(attrs)) return NO_IMAGE;
    return { align: readString(attrs, 'align'), width: readNumberOrString(attrs, 'width') };
  } catch {
    return NO_IMAGE;
  }
}

/** Position ProseMirror du nœud sélectionné, `-1` sans vue (éditeur de test). */
function selectedPos(editor: AsterEditor): number {
  try {
    const tiptap: unknown = editor.tiptap;
    if (isRecord(tiptap) && isRecord(tiptap['state'])) return editor.tiptap.state.selection.from;
  } catch {
    // État indisponible.
  }
  return -1;
}

/**
 * Largeur en pixels pour une fraction de la largeur du contenu éditable, `null` si le
 * contenu n'a pas encore de largeur mesurable (hors document). Fonction pure.
 */
export function widthForRatio(containerWidth: number, ratio: number): number | null {
  if (!(containerWidth > 0) || !(ratio > 0)) return null;
  return Math.round(containerWidth * ratio);
}

/**
 * Élément DOM du nœud image sélectionné (`<figure>` du NodeView) via `view.nodeDOM`,
 * sinon la figure marquée sélectionnée, sinon le rectangle de la sélection.
 */
function imageReference(editor: AsterEditor): ReferenceElement {
  try {
    const tiptap: unknown = editor.tiptap;
    if (isRecord(tiptap) && isRecord(tiptap['view']) && isRecord(tiptap['state'])) {
      const dom: unknown = editor.tiptap.view.nodeDOM(editor.tiptap.state.selection.from);
      if (dom instanceof HTMLElement) return dom;
    }
  } catch {
    // Vue démontée ou position hors document.
  }
  return (
    editor.contentElement.querySelector<HTMLElement>('.aster-image--selected') ??
    selectionReference(editor)
  );
}

/**
 * Bulle d'image : image sélectionnée (`tiptap.isActive('image')`) → bulle au-dessus avec
 * l'alignement gauche / centre / droite (`image.setAttributes { align }`, bouton enfoncé
 * pour l'alignement courant), la largeur 25 / 50 / 100 % du contenu (convertie en pixels
 * depuis `contentElement.clientWidth`), « Modifier » (émet `aster:image-edit`, que le
 * dialogue image de la toolbar écoute) et « Supprimer » (`deleteSelection`). Cachée hors
 * image, en lecture seule et en vue source. Montée par `createAster` (option
 * `imageBubble`), utilisable seule.
 */
export function createImageBubble(editor: AsterEditor): Bubble {
  const t = (key: string): string => editor.i18n.t(key);

  const setAttributes = (args: StandardCommandArgs['image.setAttributes']): void => {
    editor.commands.run('image.setAttributes', args);
    editor.focus();
  };

  const render = (body: HTMLElement, bubble: Bubble): void => {
    const image = currentImage(editor);
    const canEdit = editor.commands.canRun('image.setAttributes', {});

    for (const align of IMAGE_ALIGNMENTS) {
      const button = createPlainButton({
        className: `aster-bubble__button aster-image-bubble__align aster-image-bubble__align--${align}`,
        icon: `align-${align}`,
      });
      const label = t(`ui.image.align.${align}`);
      button.setAttribute('aria-label', label);
      button.title = label;
      const active = image.align === align;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('aster-toolbar__button--active', active);
      setDisabled(button, !canEdit);
      button.addEventListener('click', () => setAttributes({ align: align as ImageAlign }));
      body.append(button);
    }

    body.append(el('span', { className: 'aster-bubble__separator' }));

    for (const ratio of IMAGE_BUBBLE_SIZES) {
      const percent = Math.round(ratio * 100);
      const button = createPlainButton({
        className: 'aster-bubble__button aster-image-bubble__size',
        text: `${percent}%`,
      });
      button.dataset['ratio'] = String(ratio);
      const label = editor.i18n.t('ui.image.sizePercent', { percent });
      button.setAttribute('aria-label', label);
      button.title = label;
      setDisabled(button, !canEdit);
      button.addEventListener('click', () => {
        const width = widthForRatio(editor.contentElement.clientWidth, ratio);
        if (width !== null) setAttributes({ width });
      });
      body.append(button);
    }

    body.append(el('span', { className: 'aster-bubble__separator' }));

    const edit = createPlainButton({
      className: 'aster-bubble__button',
      icon: 'edit',
      text: t('ui.image.edit'),
    });
    setDisabled(edit, !canEdit);
    edit.addEventListener('click', () => {
      editor.contentElement.dispatchEvent(
        new CustomEvent(IMAGE_EDIT_EVENT, { bubbles: true, detail: { pos: selectedPos(editor) } }),
      );
    });

    const remove = createPlainButton({
      className: 'aster-bubble__button aster-bubble__button--danger',
      icon: 'trash',
      text: t('ui.image.remove'),
    });
    setDisabled(remove, !canEdit);
    remove.addEventListener('click', () => {
      const commands: unknown = editor.tiptap.commands;
      if (!isRecord(commands) || typeof commands['deleteSelection'] !== 'function') return;
      if (editor.tiptap.commands.deleteSelection()) {
        bubble.hide();
        editor.focus();
      }
    });

    body.append(edit, remove);
  };

  return createBubble(editor, {
    className: 'aster-image-bubble',
    label: () => t('ui.image.bubble'),
    placement: 'top',
    shouldShow: () => isImageSelected(editor),
    reference: () => imageReference(editor),
    // Position + alignement + largeur : la bulle se reconstruit quand l'image change ou
    // qu'un de ses réglages est appliqué, pour refléter le bouton enfoncé.
    key: () => {
      const image = currentImage(editor);
      return `${selectedPos(editor)}|${image.align ?? ''}|${image.width ?? ''}`;
    },
    render,
  });
}
