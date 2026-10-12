import type { AsterEditor, Unsubscribe } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el, setIcon } from '../utils/dom';
import { createPlainButton, setDisabled } from './button';
import { applyTooltip } from './tooltip';

/** Classe de la racine `.aster` pendant la vue source. */
export const SOURCE_VIEW_CLASS = 'aster--source';

/** Classe du `<textarea>` de la vue source. */
export const SOURCE_TEXTAREA_CLASS = 'aster-source';

/** Icône « code source » : chevrons et barre oblique. */
const SOURCE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" fill="none" ' +
  'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
  'aria-hidden="true" focusable="false"><path d="M6 6l-4 4 4 4M14 6l4 4-4 4M12 4l-4 12"/></svg>';

/** Contrôleur de la vue source d'un éditeur. Un seul par éditeur, voir `getSourceView`. */
export interface SourceView {
  /** `<textarea>` courant, `null` hors vue source. */
  readonly textarea: HTMLTextAreaElement | null;
  isActive(): boolean;
  /** Entre dans la vue source. Sans effet si déjà active, en lecture seule ou après `destroy`. */
  enter(): void;
  /** Revient à l'éditeur en appliquant le HTML modifié (`setHTML`). */
  exit(): void;
  toggle(): void;
  /** Appelé à chaque entrée / sortie. */
  onChange(listener: () => void): Unsubscribe;
  /** Quitte la vue source sans appliquer le HTML et libère les écouteurs. */
  destroy(): void;
}

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'blockquote',
  'pre',
  'div',
  'figure',
  'figcaption',
  'section',
  'article',
  'header',
  'footer',
  'details',
  'summary',
  'dl',
  'dt',
  'dd',
  'hr',
  'img',
]);

/** Balises sans contenu : une ligne à elles, sans changer la profondeur. */
const VOID_TAGS: ReadonlySet<string> = new Set(['hr', 'img']);

/** Balises dont les blancs comptent : rien n'est reformaté à l'intérieur. */
const RAW_TAGS: ReadonlySet<string> = new Set(['pre']);

const TAG_PATTERN = /<\/?([a-zA-Z][\w:-]*)[^>]*>/g;

/**
 * Indente un HTML sérialisé par bloc, pour le rendre lisible dans la vue source.
 * Une balise de bloc ouvre une ligne ; son contenu inline reste sur cette ligne ; la
 * fermeture s'y ajoute si la ligne est encore ouverte, sinon elle prend sa propre
 * ligne. Les blancs ajoutés ne sont qu'entre blocs, où ProseMirror les ignore au
 * retour, et l'intérieur de `<pre>` est copié tel quel.
 */
export function formatSourceHtml(html: string, indent = '  '): string {
  const lines: string[] = [];
  let line = '';
  let lineDepth = 0;
  let depth = 0;
  let rawDepth = 0;

  const flush = (): void => {
    if (line.length === 0) return;
    lines.push(indent.repeat(lineDepth) + line);
    line = '';
  };
  const append = (chunk: string): void => {
    if (line.length === 0) lineDepth = depth;
    line += chunk;
  };

  let last = 0;
  let found = TAG_PATTERN.exec(html);
  while (found !== null) {
    const text = html.slice(last, found.index);
    last = TAG_PATTERN.lastIndex;
    if (text.length > 0 && (rawDepth > 0 || text.trim().length > 0)) append(text);

    const tag = found[0];
    const name = (found[1] ?? '').toLowerCase();
    const closing = tag.startsWith('</');

    if (rawDepth > 0) {
      append(tag);
      if (RAW_TAGS.has(name)) {
        if (closing) {
          rawDepth -= 1;
          depth = Math.max(0, depth - 1);
          if (rawDepth === 0) flush();
        } else {
          rawDepth += 1;
        }
      }
    } else if (!BLOCK_TAGS.has(name)) {
      append(tag);
    } else if (VOID_TAGS.has(name)) {
      flush();
      append(tag);
      flush();
    } else if (closing) {
      depth = Math.max(0, depth - 1);
      if (line.length > 0) {
        line += tag;
      } else {
        append(tag);
      }
      flush();
    } else {
      flush();
      append(tag);
      depth += 1;
      if (RAW_TAGS.has(name)) rawDepth += 1;
    }
    found = TAG_PATTERN.exec(html);
  }
  const tail = html.slice(last);
  if (tail.trim().length > 0 || (rawDepth > 0 && tail.length > 0)) append(tail);
  flush();
  return lines.join('\n');
}

const registry = new WeakMap<AsterEditor, SourceView>();

/**
 * Crée le contrôleur de vue source d'un éditeur.
 *
 * Entrée : le conteneur de contenu est masqué, un `<textarea class="aster-source">`
 * contenant `getHTML()` formaté est ajouté dans `editor.element`, et l'éditeur passe
 * en lecture seule : c'est ce qui désactive toute la toolbar via `canRun`, sans que
 * celle-ci ait à connaître la vue source. Le bouton `source` reste actif par exception.
 * Sortie : lecture seule levée, puis `setHTML` seulement si le texte a changé.
 */
export function createSourceView(editor: AsterEditor): SourceView {
  const listeners = new Set<() => void>();
  let textarea: HTMLTextAreaElement | null = null;
  let hiddenTarget: HTMLElement | null = null;
  let formatted = '';
  let destroyed = false;

  const root = (): HTMLElement => editor.element.closest<HTMLElement>('.aster') ?? editor.element;

  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener();
  };

  /** Démonte le textarea et réaffiche le contenu, sans toucher au document. */
  const teardown = (): string | null => {
    if (!textarea) return null;
    const value = textarea.value;
    textarea.remove();
    textarea = null;
    hiddenTarget?.removeAttribute('hidden');
    hiddenTarget = null;
    root().classList.remove(SOURCE_VIEW_CLASS);
    return value;
  };

  const enter = (): void => {
    if (destroyed || textarea || editor.isReadOnly()) return;
    formatted = formatSourceHtml(editor.getHTML());
    textarea = el('textarea', {
      className: SOURCE_TEXTAREA_CLASS,
      attrs: { 'aria-label': editor.i18n.t('ui.source.label'), spellcheck: 'false', wrap: 'off' },
    });
    textarea.value = formatted;
    // Dans le core, le contenteditable vit dans un conteneur `.aster-content` enfant de
    // l'hôte ; on masque ce conteneur. S'il n'existe pas (hôte = conteneur), on masque
    // directement le contenteditable.
    const parent = editor.contentElement.parentElement;
    hiddenTarget = parent && parent !== editor.element ? parent : editor.contentElement;
    hiddenTarget.setAttribute('hidden', '');
    editor.element.append(textarea);
    root().classList.add(SOURCE_VIEW_CLASS);
    editor.setReadOnly(true);
    notify();
    textarea.focus();
  };

  const exit = (): void => {
    const value = teardown();
    if (value === null) return;
    editor.setReadOnly(false);
    if (value !== formatted) editor.setHTML(value);
    notify();
    editor.focus();
  };

  const view: SourceView = {
    get textarea() {
      return textarea;
    },
    isActive: () => textarea !== null,
    enter,
    exit,
    toggle: () => {
      if (textarea) exit();
      else enter();
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      const wasActive = teardown() !== null;
      if (wasActive) notify();
      listeners.clear();
      if (registry.get(editor) === view) registry.delete(editor);
    },
  };
  return view;
}

/** Contrôleur de vue source de l'éditeur, créé à la première demande et partagé ensuite. */
export function getSourceView(editor: AsterEditor): SourceView {
  let view = registry.get(editor);
  if (!view) {
    view = createSourceView(editor);
    registry.set(editor, view);
  }
  return view;
}

/**
 * Widget `source` : bouton `aria-pressed` qui bascule la vue source. Reste actif
 * pendant la vue source alors que le reste de la toolbar est désactivé par la lecture
 * seule ; désactivé si l'éditeur était déjà en lecture seule avant.
 */
export function createSourceButton(editor: AsterEditor): ToolbarWidget {
  const view = getSourceView(editor);
  const button = createPlainButton({ className: 'aster-source-button', toolbarItem: true });
  const icon = el('span', { className: 'aster-toolbar__icon' });
  setIcon(icon, SOURCE_ICON);
  button.append(icon);

  const update = (): void => {
    const active = view.isActive();
    applyTooltip(button, editor.i18n.t('ui.source.toggle'));
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle('aster-toolbar__button--active', active);
    setDisabled(button, !active && editor.isReadOnly());
  };

  const onClick = (): void => {
    if (button.disabled) return;
    view.toggle();
    update();
  };
  button.addEventListener('click', onClick);
  const unsubscribe = view.onChange(update);
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
