import type { AsterEditor } from '@aster-editor/core';
import { FORMAT_PAINTER_CHANGE_EVENT, clearFormatClipboard } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { BUTTON_CLASS, createPlainButton, setDisabled } from './button';
import { applyTooltip } from './tooltip';

/** Classe posée sur le bouton quand le presse-papier est verrouillé (double-clic). */
export const FORMAT_PAINTER_LOCKED_CLASS = 'aster-format-painter--locked';

/** Bouton de reproduction de mise en forme monté dans la toolbar. */
export interface FormatPainterButton extends ToolbarWidget {
  /** Vrai si le presse-papier de format est chargé (`formatPainter.copy` actif). */
  isLoaded(): boolean;
  /** Vrai si le presse-papier reste chargé après chaque application. */
  isLocked(): boolean;
}

/**
 * Widget `formatPainter`, bouton à état comme le pinceau de Word :
 *
 * - presse-papier vide → un clic copie la mise en forme de la sélection
 *   (`formatPainter.copy`), le bouton passe « enfoncé » ;
 * - presse-papier chargé → un clic l'applique (`formatPainter.paste`) puis le vide ;
 * - un double-clic copie et **verrouille** : chaque clic applique sans vider, jusqu'au
 *   prochain double-clic qui déverrouille et vide.
 *
 * L'état suit `isActive('formatPainter.copy')` du core et l'événement
 * `aster:format-painter-change`, pour refléter aussi les raccourcis clavier.
 */
export function createFormatPainterButton(editor: AsterEditor): FormatPainterButton {
  const button = createPlainButton({ icon: 'format-painter', toolbarItem: true });
  button.dataset['widget'] = 'formatPainter';
  let locked = false;

  const isLoaded = (): boolean => editor.commands.isActive('formatPainter.copy');

  const update = (): void => {
    const loaded = isLoaded();
    if (!loaded) locked = false;
    const key = locked
      ? 'ui.formatPainter.locked'
      : loaded
        ? 'ui.formatPainter.loaded'
        : 'ui.formatPainter.label';
    applyTooltip(button, editor.i18n.t(key), editor.commands.get('formatPainter.copy')?.shortcut);
    button.setAttribute('aria-pressed', loaded ? 'true' : 'false');
    button.classList.toggle(`${BUTTON_CLASS}--active`, loaded);
    button.classList.toggle(FORMAT_PAINTER_LOCKED_CLASS, locked);
    setDisabled(
      button,
      !(
        editor.commands.canRun('formatPainter.copy') ||
        editor.commands.canRun('formatPainter.paste')
      ),
    );
  };

  const onClick = (): void => {
    if (button.disabled) return;
    if (!isLoaded()) {
      editor.commands.run('formatPainter.copy');
    } else {
      editor.commands.run('formatPainter.paste');
      if (!locked) clearFormatClipboard(editor);
    }
    editor.focus();
    update();
  };

  // Un double-clic a déjà produit deux clics (copie puis application + vidage) : on
  // recopie la mise en forme de la sélection, inchangée, et on verrouille.
  const onDoubleClick = (): void => {
    if (button.disabled) return;
    if (locked) {
      locked = false;
      clearFormatClipboard(editor);
    } else {
      editor.commands.run('formatPainter.copy');
      locked = isLoaded();
    }
    editor.focus();
    update();
  };

  const onChange = (): void => update();

  button.addEventListener('click', onClick);
  button.addEventListener('dblclick', onDoubleClick);
  editor.element.addEventListener(FORMAT_PAINTER_CHANGE_EVENT, onChange);
  update();

  return {
    element: button,
    isLoaded,
    isLocked: () => locked,
    update,
    destroy: () => {
      button.removeEventListener('click', onClick);
      button.removeEventListener('dblclick', onDoubleClick);
      editor.element.removeEventListener(FORMAT_PAINTER_CHANGE_EVENT, onChange);
    },
  };
}
