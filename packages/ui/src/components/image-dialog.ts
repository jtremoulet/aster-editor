import type { AsterEditor, StandardCommandArgs } from '@aster-editor/core';
import { IMAGE_ALIGNMENTS, IMAGE_EDIT_EVENT } from '@aster-editor/core';
import type { ToolbarWidget } from '../types.js';
import { el } from '../utils/dom.js';
import { isRecord, readNumberOrString, readString } from '../utils/guards.js';
import { createPlainButton } from './button.js';
import { createDropdown, type Dropdown } from './dropdown.js';

/** Validation légère de l'URL d'image : non vide, pas de `javascript:`. */
function isAcceptableImageUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !/^\s*javascript:/i.test(trimmed);
}

/** Alignement d'image, tel que le contrat `image.setAttributes` l'attend. */
type ImageAlign = NonNullable<StandardCommandArgs['image.setAttributes']['align']>;

/**
 * Arguments d'édition : le contrat (`width`, et `height` depuis la session 4, L45b : le core
 * l'applique comme hauteur explicite ; `0` ou absente = hauteur automatique).
 */
type ImageEditArgs = StandardCommandArgs['image.setAttributes'] & { height?: number };

/** Attributs du nœud image tels que lus via `tiptap.getAttributes('image')`. */
export interface ImageAttributes {
  src: string | null;
  alt: string | null;
  title: string | null;
  width: number | string | null;
  height: number | string | null;
  align: string | null;
}

const NO_IMAGE: ImageAttributes = {
  src: null,
  alt: null,
  title: null,
  width: null,
  height: null,
  align: null,
};

/** Image sous la sélection, tolérant si l'extension manque (mock, core réduit). */
function currentImage(editor: AsterEditor): ImageAttributes {
  try {
    const attrs: unknown = editor.tiptap.getAttributes('image');
    if (!isRecord(attrs)) return NO_IMAGE;
    return {
      src: readString(attrs, 'src'),
      alt: readString(attrs, 'alt'),
      title: readString(attrs, 'title'),
      width: readNumberOrString(attrs, 'width'),
      height: readNumberOrString(attrs, 'height'),
      align: readString(attrs, 'align'),
    };
  } catch {
    return NO_IMAGE;
  }
}

/** Vrai si une image est sélectionnée : le dialogue passe alors en mode édition. */
function isImageSelected(editor: AsterEditor): boolean {
  try {
    return editor.tiptap.isActive('image');
  } catch {
    return false;
  }
}

/** Convertit une saisie de largeur ou de hauteur en nombre : vide ou invalide → `null`. */
function parseSizeInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Ratio largeur / hauteur de l'image sélectionnée : depuis ses attributs si les deux
 * sont connus, sinon depuis les dimensions naturelles de l'`<img>` rendu dans le contenu
 * (`figure.aster-image` sélectionnée). `null` si rien n'est mesurable (jsdom, image non
 * chargée) : le verrou n'a alors aucun effet.
 */
export function imageAspectRatio(editor: AsterEditor, current: ImageAttributes): number | null {
  const width = parseSizeInput(String(current.width ?? ''));
  const height = parseSizeInput(String(current.height ?? ''));
  if (width !== null && height !== null) return width / height;
  const img =
    editor.contentElement.querySelector<HTMLImageElement>(
      'figure.aster-image--selected img, figure.aster-image.ProseMirror-selectednode img, img.ProseMirror-selectednode',
    ) ?? null;
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return img.naturalWidth / img.naturalHeight;
  }
  return null;
}

/** Hauteur déduite d'une largeur par le ratio, arrondie au pixel. */
export function heightForWidth(width: number, ratio: number): number {
  return Math.max(1, Math.round(width / ratio));
}

/** Largeur déduite d'une hauteur par le ratio, arrondie au pixel. */
export function widthForHeight(height: number, ratio: number): number {
  return Math.max(1, Math.round(height * ratio));
}

function isImageAlign(value: unknown): value is ImageAlign {
  return typeof value === 'string' && (IMAGE_ALIGNMENTS as readonly string[]).includes(value);
}

/** Champ texte libellé du dialogue. */
function field(
  id: string,
  label: string,
  attrs: Readonly<Record<string, string | undefined>>,
): { wrapper: HTMLElement; input: HTMLInputElement } {
  const input = el('input', {
    className: 'aster-dialog__input',
    attrs: { id, autocomplete: 'off', ...attrs },
  });
  const wrapper = el('div', { className: 'aster-dialog__field' }, [
    el('label', { className: 'aster-dialog__label', attrs: { for: id }, text: label }),
    input,
  ]);
  return { wrapper, input };
}

/**
 * Widget `image`, deux modes :
 *
 * - **insertion** (aucune image sélectionnée) : URL, texte alternatif, titre, largeur,
 *   alignement, et bouton « Depuis un fichier » si `image.upload` existe. OK →
 *   `image.insert` puis `image.setAttributes` pour l'alignement, que `image.insert`
 *   ne prend pas.
 * - **édition** (image sélectionnée, ou événement `aster:image-edit` émis par le core
 *   au double-clic) : mêmes champs sans l'URL, plus la hauteur et un verrou de
 *   proportions (coché par défaut : modifier l'un des deux champs recalcule l'autre selon
 *   le ratio de l'image). OK → `image.setAttributes({ alt, title, width, align })`, avec
 *   `height` seulement si le verrou est levé et une hauteur saisie (appliquée par le core
 *   depuis la session 4). Une largeur vide vaut `0`, que le core interprète comme
 *   « largeur automatique ».
 */
export function createImageDialog(editor: AsterEditor): ToolbarWidget {
  const dropdown: Dropdown = createDropdown({
    editor,
    labelKey: 'command.image.insert',
    icon: 'image-insert',
    panelRole: 'dialog',
    panelClass: 'aster-dialog aster-image-dialog',
    isEnabled: () =>
      editor.commands.canRun('image.insert', { src: '' }) ||
      editor.commands.canRun('image.setAttributes', {}),
    isActive: () => isImageSelected(editor),
    renderPanel: (panel, self) => renderImagePanel(editor, panel, self),
  });

  /** Double-clic sur une image dans le contenu : le core a sélectionné le nœud. */
  const onImageEdit = (): void => {
    if (!editor.commands.canRun('image.setAttributes', {})) return;
    dropdown.update();
    dropdown.close(false);
    dropdown.open();
  };
  editor.element.addEventListener(IMAGE_EDIT_EVENT, onImageEdit);

  return {
    element: dropdown.element,
    update: dropdown.update,
    destroy: () => {
      editor.element.removeEventListener(IMAGE_EDIT_EVENT, onImageEdit);
      dropdown.destroy();
    },
  };
}

function renderImagePanel(editor: AsterEditor, panel: HTMLElement, dropdown: Dropdown): void {
  const t = (key: string): string => editor.i18n.t(key);
  const editing = isImageSelected(editor) && editor.commands.canRun('image.setAttributes', {});
  const current = editing ? currentImage(editor) : NO_IMAGE;
  panel.setAttribute('aria-label', t(editing ? 'ui.image.edit' : 'ui.image.title'));
  panel.classList.toggle('aster-image-dialog--editing', editing);
  const suffix = Math.random().toString(36).slice(2, 8);

  const url = field(`aster-image-url-${suffix}`, t('ui.image.url'), {
    type: 'url',
    placeholder: 'https://',
    autofocus: '',
  });
  const alt = field(`aster-image-alt-${suffix}`, t('ui.image.alt'), {
    type: 'text',
    autofocus: editing ? '' : undefined,
  });
  const title = field(`aster-image-title-${suffix}`, t('ui.image.titleAttr'), { type: 'text' });
  const width = field(`aster-image-width-${suffix}`, t('ui.image.width'), {
    type: 'number',
    min: '1',
    step: '1',
    placeholder: t('ui.image.widthAuto'),
  });
  const height = field(`aster-image-height-${suffix}`, t('ui.image.height'), {
    type: 'number',
    min: '1',
    step: '1',
    placeholder: t('ui.image.widthAuto'),
  });
  alt.input.value = current.alt ?? '';
  title.input.value = current.title ?? '';
  const currentWidth = parseSizeInput(String(current.width ?? ''));
  width.input.value = currentWidth === null ? '' : String(currentWidth);

  // Hauteur et verrou de proportions, en édition seulement : le ratio vient de l'image.
  const ratio = editing ? imageAspectRatio(editor, current) : null;
  const currentHeight = parseSizeInput(String(current.height ?? ''));
  height.input.value =
    currentHeight !== null
      ? String(currentHeight)
      : currentWidth !== null && ratio !== null
        ? String(heightForWidth(currentWidth, ratio))
        : '';
  const lock = el('input', {
    className: 'aster-dialog__checkbox aster-image-dialog__lock',
    attrs: { type: 'checkbox' },
  });
  lock.checked = true;
  const lockLabel = el('label', { className: 'aster-dialog__check' }, [
    lock,
    t('ui.image.lockRatio'),
  ]);
  width.input.addEventListener('input', () => {
    if (!lock.checked || ratio === null) return;
    const value = parseSizeInput(width.input.value);
    height.input.value = value === null ? '' : String(heightForWidth(value, ratio));
  });
  height.input.addEventListener('input', () => {
    if (!lock.checked || ratio === null) return;
    const value = parseSizeInput(height.input.value);
    width.input.value = value === null ? '' : String(widthForHeight(value, ratio));
  });
  const sizeRow = el('div', { className: 'aster-dialog__row aster-image-dialog__size' }, [
    width.wrapper,
    ...(editing ? [height.wrapper] : []),
  ]);

  const alignGroup = el('div', {
    className: 'aster-dialog__field aster-image-dialog__align',
    attrs: { role: 'radiogroup', 'aria-label': t('ui.image.align') },
  });
  alignGroup.append(el('span', { className: 'aster-dialog__label', text: t('ui.image.align') }));
  const radios = el('div', { className: 'aster-image-dialog__radios' });
  const alignName = `aster-image-align-${suffix}`;
  const alignInputs: HTMLInputElement[] = [];
  for (const value of IMAGE_ALIGNMENTS) {
    const id = `${alignName}-${value}`;
    const radio = el('input', {
      className: 'aster-image-dialog__radio',
      attrs: { type: 'radio', name: alignName, id, value },
    });
    radio.checked = current.align === value;
    alignInputs.push(radio);
    radios.append(
      el('label', { className: 'aster-image-dialog__radio-label', attrs: { for: id } }, [
        radio,
        t(`ui.image.align.${value}`),
      ]),
    );
  }
  alignGroup.append(radios);

  const selectedAlign = (): ImageAlign | undefined => {
    const value = alignInputs.find((radio) => radio.checked)?.value;
    return isImageAlign(value) ? value : undefined;
  };

  const submit = (): void => {
    const altValue = alt.input.value.trim();
    const titleValue = title.input.value.trim();
    const widthValue = parseSizeInput(width.input.value);
    const heightValue = parseSizeInput(height.input.value);
    const align = selectedAlign();

    if (editing) {
      const args: ImageEditArgs = {
        alt: altValue,
        title: titleValue,
        width: widthValue ?? 0,
        ...(align ? { align } : {}),
        ...(!lock.checked && heightValue !== null ? { height: heightValue } : {}),
      };
      editor.commands.run('image.setAttributes', args);
    } else {
      const src = url.input.value.trim();
      if (!isAcceptableImageUrl(src)) {
        url.input.setAttribute('aria-invalid', 'true');
        url.input.focus();
        return;
      }
      const inserted = editor.commands.run('image.insert', {
        src,
        ...(altValue ? { alt: altValue } : {}),
        ...(titleValue ? { title: titleValue } : {}),
        ...(widthValue !== null ? { width: widthValue } : {}),
      });
      if (inserted && align) {
        editor.commands.run('image.setAttributes', { align });
      }
    }
    dropdown.close(false);
    editor.focus();
  };
  // Sur les inputs, pas sur `panel` : celui-ci est réutilisé à chaque ouverture et
  // accumulerait des écouteurs liés à des champs détachés.
  for (const { input } of [url, alt, title, width, height]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  }

  const ok = createPlainButton({
    className: 'aster-dialog__button aster-dialog__button--primary',
    text: t(editing ? 'ui.image.apply' : 'ui.image.ok'),
  });
  ok.addEventListener('click', submit);
  const cancel = createPlainButton({
    className: 'aster-dialog__button',
    text: t('ui.image.cancel'),
  });
  cancel.addEventListener('click', () => dropdown.close(true));
  const actions = el('div', { className: 'aster-dialog__actions' }, [cancel, ok]);

  if (!editing && editor.commands.has('image.upload')) {
    const fileInput = el('input', {
      className: 'aster-image-dialog__file',
      attrs: {
        type: 'file',
        accept: 'image/*',
        hidden: '',
        'aria-hidden': 'true',
        tabindex: '-1',
      },
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      editor.commands.run('image.upload', { file });
      dropdown.close(false);
      editor.focus();
    });
    const fromFile = createPlainButton({
      className: 'aster-dialog__button aster-image-dialog__from-file',
      icon: 'image-upload',
      text: t('ui.image.fromFile'),
    });
    fromFile.disabled = !editor.commands.canRun('image.upload', { file: new File([], '') });
    fromFile.addEventListener('click', () => fileInput.click());
    panel.append(el('div', { className: 'aster-dialog__field' }, [fromFile, fileInput]));
  }

  if (!editing) panel.append(url.wrapper);
  panel.append(alt.wrapper, title.wrapper, sizeRow);
  if (editing) panel.append(el('div', { className: 'aster-dialog__field' }, [lockLabel]));
  panel.append(alignGroup, actions);
}
