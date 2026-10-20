import type { AsterEditor } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el } from '../utils/dom';
import { isRecord, readString } from '../utils/guards';
import { createPlainButton } from './button';
import { createDropdown } from './dropdown';

/** Attributs du mark `link` tels que lus via `tiptap.getAttributes('link')`. */
interface LinkAttributes {
  href: string | null;
  target: string | null;
}

const NO_LINK: LinkAttributes = { href: null, target: null };

/** Lien courant sous la sélection, tolérant si l'extension manque ou renvoie autre chose. */
function currentLink(editor: AsterEditor): LinkAttributes {
  try {
    const attrs: unknown = editor.tiptap.getAttributes('link');
    if (!isRecord(attrs)) return NO_LINK;
    return { href: readString(attrs, 'href'), target: readString(attrs, 'target') };
  } catch {
    return NO_LINK;
  }
}

/** Vrai si un lien est actif sous la sélection. */
function hasLink(editor: AsterEditor): boolean {
  const href = currentLink(editor).href;
  return typeof href === 'string' && href.length > 0;
}

/**
 * Validation légère côté UI : URL absolue, relative, ancre ou `mailto:`/`tel:`. Le core
 * applique la vraie politique (`LinkPolicy`) ; ici on évite juste les saisies vides ou
 * manifestement dangereuses comme `javascript:`.
 */
export function isAcceptableUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return false;
  return true;
}

/**
 * Widget `link` : panneau avec champ URL, case « nouvel onglet », boutons OK / Annuler /
 * Supprimer le lien. Prérempli depuis le lien courant, Entrée valide, Échap ferme.
 */
export function createLinkDialog(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'command.link.set',
    icon: 'link-set',
    panelRole: 'dialog',
    panelClass: 'aster-dialog aster-link-dialog',
    // Le core refuse un href vide : on teste avec une URL valide fictive, le vrai href est validé à la soumission.
    isEnabled: () => editor.commands.canRun('link.set', { href: 'https://aster.invalid/' }),
    isActive: () => hasLink(editor),
    renderPanel: (panel, dropdown) => {
      const t = (key: string): string => editor.i18n.t(key);
      const current = currentLink(editor);
      panel.setAttribute('aria-label', t('ui.link.title'));

      const urlId = `aster-link-url-${Math.random().toString(36).slice(2, 8)}`;
      const urlLabel = el('label', {
        className: 'aster-dialog__label',
        attrs: { for: urlId },
        text: t('ui.link.url'),
      });
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
      urlInput.value = current.href ?? '';
      const error = el('div', {
        className: 'aster-dialog__error',
        attrs: { role: 'alert', hidden: '' },
      });

      const newTab = el('input', {
        className: 'aster-dialog__checkbox',
        attrs: { type: 'checkbox' },
      });
      newTab.checked = current.target === '_blank';
      const newTabLabel = el('label', { className: 'aster-dialog__check' }, [
        newTab,
        t('ui.link.newTab'),
      ]);

      const submit = (): void => {
        const href = urlInput.value.trim();
        if (!isAcceptableUrl(href)) {
          error.textContent = t('ui.link.invalid');
          error.removeAttribute('hidden');
          urlInput.setAttribute('aria-invalid', 'true');
          urlInput.focus();
          return;
        }
        editor.commands.run('link.set', { href, target: newTab.checked ? '_blank' : '_self' });
        dropdown.close(false);
        editor.focus();
      };

      const ok = createPlainButton({
        className: 'aster-dialog__button aster-dialog__button--primary',
        text: t('ui.link.ok'),
      });
      ok.addEventListener('click', submit);
      const cancel = createPlainButton({
        className: 'aster-dialog__button',
        text: t('ui.link.cancel'),
      });
      cancel.addEventListener('click', () => dropdown.close(true));
      const remove = createPlainButton({
        className: 'aster-dialog__button aster-dialog__button--danger',
        text: t('ui.link.remove'),
      });
      remove.disabled = !hasLink(editor) || !editor.commands.canRun('link.unset');
      remove.addEventListener('click', () => {
        editor.commands.run('link.unset');
        dropdown.close(false);
        editor.focus();
      });

      urlInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });

      panel.append(
        el('div', { className: 'aster-dialog__field' }, [urlLabel, urlInput, error]),
        el('div', { className: 'aster-dialog__field' }, [newTabLabel]),
        el('div', { className: 'aster-dialog__actions' }, [remove, cancel, ok]),
      );
    },
  });
}
