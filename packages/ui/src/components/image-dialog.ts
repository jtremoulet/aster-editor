import type { AsterEditor } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el } from '../utils/dom';
import { createPlainButton } from './button';
import { createDropdown } from './dropdown';

/** Validation légère de l'URL d'image : non vide, pas de `javascript:`. */
function isAcceptableImageUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !/^\s*javascript:/i.test(trimmed);
}

/**
 * Widget `image` : panneau avec URL + texte alternatif, et bouton « Depuis un fichier »
 * qui ouvre un `<input type="file" accept="image/*">` et délègue à `image.upload`.
 * Le bouton fichier n'apparaît que si `image.upload` est enregistrée.
 */
export function createImageDialog(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'command.image.insert',
    icon: 'image-insert',
    panelRole: 'dialog',
    panelClass: 'aster-dialog aster-image-dialog',
    isEnabled: () => editor.commands.canRun('image.insert', { src: '' }),
    renderPanel: (panel, dropdown) => {
      const t = (key: string): string => editor.i18n.t(key);
      panel.setAttribute('aria-label', t('ui.image.title'));
      const suffix = Math.random().toString(36).slice(2, 8);

      const urlId = `aster-image-url-${suffix}`;
      const urlInput = el('input', {
        className: 'aster-dialog__input',
        attrs: {
          type: 'url',
          id: urlId,
          autocomplete: 'off',
          placeholder: 'https://',
          autofocus: '',
        },
      });
      const altId = `aster-image-alt-${suffix}`;
      const altInput = el('input', {
        className: 'aster-dialog__input',
        attrs: { type: 'text', id: altId, autocomplete: 'off' },
      });

      const submit = (): void => {
        const src = urlInput.value.trim();
        if (!isAcceptableImageUrl(src)) {
          urlInput.setAttribute('aria-invalid', 'true');
          urlInput.focus();
          return;
        }
        const alt = altInput.value.trim();
        editor.commands.run('image.insert', alt ? { src, alt } : { src });
        dropdown.close(false);
        editor.focus();
      };
      urlInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });

      const ok = createPlainButton({
        className: 'aster-dialog__button aster-dialog__button--primary',
        text: t('ui.image.ok'),
      });
      ok.addEventListener('click', submit);
      const cancel = createPlainButton({
        className: 'aster-dialog__button',
        text: t('ui.image.cancel'),
      });
      cancel.addEventListener('click', () => dropdown.close(true));

      const actions = el('div', { className: 'aster-dialog__actions' }, [cancel, ok]);

      if (editor.commands.has('image.upload')) {
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

      panel.append(
        el('div', { className: 'aster-dialog__field' }, [
          el('label', {
            className: 'aster-dialog__label',
            attrs: { for: urlId },
            text: t('ui.image.url'),
          }),
          urlInput,
        ]),
        el('div', { className: 'aster-dialog__field' }, [
          el('label', {
            className: 'aster-dialog__label',
            attrs: { for: altId },
            text: t('ui.image.alt'),
          }),
          altInput,
        ]),
        actions,
      );
    },
  });
}
