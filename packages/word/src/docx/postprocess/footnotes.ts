import { hasTag, isElement } from './dom-utils.js';
import type { PostprocessPass } from './types.js';

/** Préfixes d'ancres générés par mammoth pour les notes de bas de page et de fin. */
const NOTE_REF_PREFIXES = ['#footnote-ref-', '#endnote-ref-'] as const;
const NOTE_PREFIXES = ['#footnote-', '#endnote-'] as const;

function hrefStartsWith(anchor: Element, prefixes: readonly string[]): boolean {
  const href = anchor.getAttribute('href') ?? '';
  return prefixes.some((prefix) => href.startsWith(prefix));
}

/** Vrai pour un `<a>` qui pointe vers une note (appel de note dans le corps). */
function isNoteCall(anchor: Element): boolean {
  return hrefStartsWith(anchor, NOTE_PREFIXES) && !hrefStartsWith(anchor, NOTE_REF_PREFIXES);
}

/** Vrai pour un `<a>` de retour `↑` depuis la note vers son appel. */
function isBackLink(anchor: Element): boolean {
  return hrefStartsWith(anchor, NOTE_REF_PREFIXES);
}

/** Liste `<ol>` finale de mammoth contenant les notes (`<li id="footnote-1">`). */
function findNoteLists(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll('ol')).filter((ol) =>
    Array.from(ol.children).some((li) => {
      const id = li.getAttribute('id') ?? '';
      return hasTag(li, 'li') && (id.startsWith('footnote-') || id.startsWith('endnote-'));
    }),
  );
}

/** Retire les espaces de fin du dernier nœud texte, laissés par la suppression d'un lien. */
function trimTrailingWhitespace(parent: Node | null): void {
  const last = parent?.lastChild;
  if (last && last.nodeType === 3) {
    last.textContent = (last.textContent ?? '').trimEnd();
    if (last.textContent === '') parent?.removeChild(last);
  }
}

/** Remplace un élément par son contenu textuel, ex. `<a href="#footnote-1">[1]</a>` → `[1]`. */
function replaceWithText(doc: Document, element: Element): void {
  element.parentNode?.replaceChild(doc.createTextNode(element.textContent ?? ''), element);
}

/**
 * mammoth rend les notes en `<ol>` final, avec des ancres internes `#footnote-…` que
 * l'éditeur ne sait pas suivre. Si `footnotes` est vrai (défaut), on garde la liste en
 * remplaçant les ancres par leur texte (`[1]`), on retire les liens de retour `↑` et on
 * déplace l'identifiant de note dans un `data-footnote`. Sinon on supprime la liste et
 * les appels de note, avec un avertissement `footnotes-dropped`.
 */
export const footnotes: PostprocessPass = (doc, ctx) => {
  const lists = findNoteLists(doc);
  const calls = Array.from(doc.querySelectorAll('a[href]')).filter(isNoteCall);
  if (lists.length === 0 && calls.length === 0) return;

  if (!ctx.options.footnotes) {
    for (const call of calls) {
      const sup = call.parentElement;
      const target = sup && isElement(sup, 'sup') && sup.childNodes.length === 1 ? sup : call;
      target.parentNode?.removeChild(target);
    }
    for (const list of lists) list.parentNode?.removeChild(list);
    ctx.warnings.push({
      code: 'footnotes-dropped',
      message: `${String(calls.length)} note(s) de bas de page supprimée(s) (option footnotes: false)`,
    });
    return;
  }

  for (const call of calls) replaceWithText(doc, call);
  for (const list of lists) {
    list.setAttribute('data-footnotes', '');
    for (const item of Array.from(list.children)) {
      const id = item.getAttribute('id');
      if (id) {
        item.removeAttribute('id');
        item.setAttribute('data-footnote', id);
      }
    }
    for (const back of Array.from(list.querySelectorAll('a[href]')).filter(isBackLink)) {
      const previous = back.previousSibling;
      // mammoth précède le lien de retour d'un espace : on le retire aussi.
      if (previous && previous.nodeType === 3 && (previous.textContent ?? '').trim() === '') {
        previous.parentNode?.removeChild(previous);
      }
      const parent = back.parentNode;
      back.parentNode?.removeChild(back);
      trimTrailingWhitespace(parent);
    }
  }
};
