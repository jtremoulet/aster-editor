import type { AsterEditor } from '@aster-editor/core';
import type { ReferenceElement } from '@floating-ui/dom';
import { clear, el } from '../utils/dom';
import { isRecord, readString } from '../utils/guards';
import { createBubble, selectionReference, type Bubble } from './bubble';
import { createPlainButton, setDisabled } from './button';
import { isAcceptableUrl } from './link-dialog';

/** Longueur maximale de l'URL affichée dans la bulle, en caractères. */
export const LINK_BUBBLE_URL_MAX_LENGTH = 48;

/** Attributs du lien courant, `href` nul hors lien. */
interface LinkState {
  readonly href: string | null;
  readonly target: string | null;
}

const NO_LINK: LinkState = { href: null, target: null };

/** Lien sous la sélection, tolérant si l'extension manque ou renvoie autre chose. */
function currentLink(editor: AsterEditor): LinkState {
  try {
    if (!editor.tiptap.isActive('link')) return NO_LINK;
    const attrs: unknown = editor.tiptap.getAttributes('link');
    if (!isRecord(attrs)) return NO_LINK;
    return { href: readString(attrs, 'href'), target: readString(attrs, 'target') };
  } catch {
    return NO_LINK;
  }
}

/**
 * Tronque une URL pour l'affichage en gardant son début et sa fin (`https://exem…/page`),
 * l'ellipse au milieu étant la partie la moins informative. Fonction pure.
 */
export function truncateUrl(href: string, maxLength = LINK_BUBBLE_URL_MAX_LENGTH): string {
  const chars = Array.from(href);
  if (chars.length <= maxLength) return href;
  const tail = Math.max(4, Math.floor(maxLength / 3));
  const head = maxLength - tail - 1;
  if (head < 1) return `${chars.slice(0, Math.max(1, maxLength - 1)).join('')}…`;
  return `${chars.slice(0, head).join('')}…${chars.slice(chars.length - tail).join('')}`;
}

/**
 * Élément `<a>` qui porte la sélection : via `view.domAtPos` puis `closest('a')`, en
 * regardant le nœud à l'offset et son prédécesseur (curseur en fin de lien). `null`
 * sans vue (éditeur de test) ou hors lien.
 */
function linkElement(editor: AsterEditor): HTMLElement | null {
  try {
    const tiptap: unknown = editor.tiptap;
    if (!isRecord(tiptap) || !isRecord(tiptap['view']) || !isRecord(tiptap['state'])) return null;
    const { node, offset } = editor.tiptap.view.domAtPos(editor.tiptap.state.selection.from);
    const candidates: (Node | null | undefined)[] =
      node instanceof Element
        ? [node.childNodes[offset], node.childNodes[offset - 1], node]
        : [node];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const base = candidate instanceof Element ? candidate : candidate.parentElement;
      const anchor = base?.closest('a');
      if (anchor instanceof HTMLElement && editor.contentElement.contains(anchor)) return anchor;
    }
  } catch {
    // Vue démontée ou position hors document.
  }
  return null;
}

/** Référence de positionnement : le `<a>` du lien, sinon le rectangle de la sélection. */
function linkReference(editor: AsterEditor): ReferenceElement {
  return linkElement(editor) ?? selectionReference(editor);
}

/**
 * Bulle de lien : dès que la sélection est dans un lien (`tiptap.isActive('link')`), une
 * bulle sous le lien affiche l'URL tronquée (cliquable, nouvel onglet), un bouton
 * « Modifier » qui ouvre un mini-champ inline (Entrée applique via `link.set`, Échap
 * revient à la bulle) et un bouton « Supprimer » (`link.unset`). Cachée hors lien, en
 * lecture seule et en vue source ; repositionnée sur `selectionChange`. Montée par
 * `createAster` (option `linkBubble`), utilisable seule.
 */
export function createLinkBubble(editor: AsterEditor): Bubble {
  const t = (key: string): string => editor.i18n.t(key);

  const renderView = (body: HTMLElement, bubble: Bubble): void => {
    const link = currentLink(editor);
    const href = link.href ?? '';
    const anchor = el('a', {
      className: 'aster-bubble__url',
      attrs: {
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: `${t('ui.link.openLink')} — ${href}`,
      },
      text: truncateUrl(href),
    });
    // Comme les boutons : un clic sur l'URL ne doit pas déplacer le focus ni la sélection.
    anchor.addEventListener('mousedown', (event) => event.preventDefault());

    const edit = createPlainButton({
      className: 'aster-bubble__button',
      icon: 'edit',
      text: t('ui.link.edit'),
    });
    setDisabled(edit, !editor.commands.canRun('link.set', { href: 'https://aster.invalid/' }));
    edit.addEventListener('click', () => renderEdit(body, bubble));

    const remove = createPlainButton({
      className: 'aster-bubble__button aster-bubble__button--danger',
      icon: 'link-unset',
      text: t('ui.link.remove'),
    });
    setDisabled(remove, !editor.commands.canRun('link.unset'));
    remove.addEventListener('click', () => {
      editor.commands.run('link.unset');
      bubble.hide();
      editor.focus();
    });

    body.append(anchor, el('span', { className: 'aster-bubble__separator' }), edit, remove);
  };

  const renderEdit = (body: HTMLElement, bubble: Bubble): void => {
    const link = currentLink(editor);
    clear(body);
    const input = el('input', {
      className: 'aster-dialog__input aster-bubble__input',
      attrs: {
        type: 'url',
        autocomplete: 'off',
        placeholder: 'https://',
        'aria-label': t('ui.link.url'),
      },
    });
    input.value = link.href ?? '';

    const cancel = (): void => {
      clear(body);
      renderView(body, bubble);
      editor.focus();
    };
    const apply = (): void => {
      const href = input.value.trim();
      if (!isAcceptableUrl(href)) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      const target = link.target === '_blank' ? '_blank' : '_self';
      editor.commands.run('link.set', { href, target });
      bubble.hide();
      editor.focus();
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        apply();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    });

    const ok = createPlainButton({
      className: 'aster-bubble__button aster-bubble__button--primary',
      icon: 'check',
      text: t('ui.link.ok'),
    });
    ok.addEventListener('click', apply);
    const back = createPlainButton({
      className: 'aster-bubble__button',
      icon: 'close',
      text: t('ui.link.cancel'),
    });
    back.addEventListener('click', cancel);

    body.append(input, ok, back);
    input.focus();
    input.select();
  };

  const bubble = createBubble(editor, {
    className: 'aster-link-bubble',
    label: () => t('ui.link.bubble'),
    placement: 'bottom-start',
    shouldShow: () => currentLink(editor).href !== null,
    reference: () => linkReference(editor),
    // L'URL identifie le lien affiché : passer d'un lien à l'autre reconstruit la bulle,
    // bouger dans le même lien la repositionne seulement (le mini-champ survit).
    key: () => currentLink(editor).href ?? '',
    render: renderView,
  });
  return bubble;
}
