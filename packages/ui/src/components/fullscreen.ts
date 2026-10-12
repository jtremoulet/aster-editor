import type { AsterEditor, Unsubscribe } from '@aster-editor/core';
import { getIcon } from '../icons';
import type { ToolbarWidget } from '../types';
import { el, setIcon } from '../utils/dom';
import { createPlainButton } from './button';
import { applyTooltip } from './tooltip';

/** Classe posée sur la racine `.aster` en plein écran. */
export const FULLSCREEN_CLASS = 'aster--fullscreen';

/** Contrôleur du plein écran d'un éditeur. Un seul par éditeur, voir `getFullscreen`. */
export interface Fullscreen {
  isActive(): boolean;
  set(value: boolean): void;
  toggle(): void;
  /** Appelé à chaque changement d'état. */
  onChange(listener: () => void): Unsubscribe;
  /** Quitte le plein écran et libère les écouteurs. */
  destroy(): void;
}

const registry = new WeakMap<AsterEditor, Fullscreen>();

/**
 * Crée le contrôleur de plein écran. Il ajoute `aster--fullscreen` à la racine `.aster`
 * (ou à l'hôte de l'éditeur s'il n'y en a pas) : c'est le CSS qui la passe en
 * `position: fixed; inset: 0`. Échap, reçu sur la racine en phase de bouillonnement,
 * quitte le plein écran ; un menu ou un dialogue ouvert consomme Échap avant et n'est
 * donc pas court-circuité.
 */
export function createFullscreen(editor: AsterEditor): Fullscreen {
  const listeners = new Set<() => void>();
  let active = false;
  let destroyed = false;

  const root = (): HTMLElement => editor.element.closest<HTMLElement>('.aster') ?? editor.element;

  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    set(false);
  };

  const set = (value: boolean): void => {
    if (destroyed || value === active) return;
    active = value;
    const target = root();
    target.classList.toggle(FULLSCREEN_CLASS, value);
    if (value) target.addEventListener('keydown', onKeyDown);
    else target.removeEventListener('keydown', onKeyDown);
    notify();
  };

  const fullscreen: Fullscreen = {
    isActive: () => active,
    set,
    toggle: () => set(!active),
    onChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy: () => {
      if (destroyed) return;
      set(false);
      destroyed = true;
      listeners.clear();
      if (registry.get(editor) === fullscreen) registry.delete(editor);
    },
  };
  return fullscreen;
}

/** Contrôleur de plein écran de l'éditeur, créé à la première demande et partagé ensuite. */
export function getFullscreen(editor: AsterEditor): Fullscreen {
  let fullscreen = registry.get(editor);
  if (!fullscreen) {
    fullscreen = createFullscreen(editor);
    registry.set(editor, fullscreen);
  }
  return fullscreen;
}

/**
 * Widget `fullscreen` : bouton `aria-pressed` qui bascule le plein écran. Toujours
 * actif, lecture seule comprise : c'est une fonction d'affichage, pas d'édition.
 */
export function createFullscreenButton(editor: AsterEditor): ToolbarWidget {
  const fullscreen = getFullscreen(editor);
  const button = createPlainButton({ className: 'aster-fullscreen-button', toolbarItem: true });
  const icon = el('span', { className: 'aster-toolbar__icon' });
  button.append(icon);

  const update = (): void => {
    const active = fullscreen.isActive();
    setIcon(icon, getIcon(active ? 'fullscreen-exit' : 'fullscreen'));
    applyTooltip(button, editor.i18n.t(active ? 'ui.fullscreen.exit' : 'ui.fullscreen.enter'));
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle('aster-toolbar__button--active', active);
  };

  const onClick = (): void => {
    fullscreen.toggle();
  };
  button.addEventListener('click', onClick);
  const unsubscribe = fullscreen.onChange(update);
  update();

  return {
    element: button,
    update,
    destroy: () => {
      unsubscribe();
      button.removeEventListener('click', onClick);
    },
  };
}
