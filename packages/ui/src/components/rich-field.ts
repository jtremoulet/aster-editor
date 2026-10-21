import { sanitizeHeaderFooterHtml } from '@aster-editor/core';
import { el } from '../utils/dom.js';
import {
  SPLITTABLE_TAGS,
  isBlockNode,
  isEmptyElement,
  normalizeFieldHtml,
  tagOf,
  wrapInlineRuns,
} from './rich-field-html.js';

export { normalizeFieldHtml } from './rich-field-html.js';

/**
 * Champ de texte riche **minimal** des dialogues (session 5, L54) : une zone
 * `contenteditable` sans Tiptap, Entrée = nouveau paragraphe, Maj+Entrée = retour à la
 * ligne, collage en texte brut, dont la valeur est le HTML **assaini** par l'assainisseur
 * des en-têtes du core (`sanitizeHeaderFooterHtml`), normalisé par `rich-field-html.ts`
 * (`<p>`, `<strong>`, `<em>`, paragraphes vides aux bords retirés). Sert aux en-têtes et
 * pieds du dialogue « Mise en page » (`page-layout-headers.ts`).
 *
 * Variables : un `{{nom}}` tapé reste du **texte**. Le core n'expose pas de fonction qui
 * convertit un HTML en puces (`Variable` ne le fait qu'à la saisie, dans l'éditeur ; le
 * paquet `word` le fait à l'import) ; les puces `<span data-aster-variable>` déjà
 * présentes dans un en-tête importé sont conservées telles quelles par l'assainisseur.
 */
/** Classe de la zone éditable d'un champ. */
export const RICH_FIELD_CLASS = 'aster-page-layout__rich';

/** Événements qui marquent le champ comme modifié par l'utilisateur (R52-02). */
const MODIFYING_EVENTS: readonly string[] = ['input', 'keydown', 'paste'];

/** Champ riche monté : son conteneur, sa zone éditable et sa valeur normalisée. */
export interface RichField {
  readonly wrapper: HTMLElement;
  readonly field: HTMLElement;
  /** HTML normalisé et assaini de la saisie, `''` si le champ est vide. */
  getHtml(): string;
  /**
   * Vrai dès que l'utilisateur a touché au champ (`input`, `keydown` ou `paste`) : un champ
   * intact rend sa valeur lue telle quelle, sans la renormaliser (R52-02).
   */
  isModified(): boolean;
}

/** Options d'un champ riche. */
export interface RichFieldOptions {
  readonly id: string;
  readonly label: string;
  /** HTML initial, assaini avant injection. */
  readonly html: string;
  readonly placeholder?: string;
  readonly className?: string;
}

/** Plage de sélection courante si elle est dans le champ, sinon `null`. */
function selectionIn(field: HTMLElement): Range | null {
  const selection = field.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return field.contains(range.commonAncestorContainer) ? range : null;
}

/** Un bloc sans contenu reste saisissable : un `<br>` lui donne une hauteur. */
function keepEditable(block: Element): void {
  if (isEmptyElement(block) && block.querySelector('br') === null) {
    block.append(document.createElement('br'));
  }
}

/** Garantit des blocs de premier niveau : le contenu nu du champ est enveloppé dans un `<p>`. */
function ensureBlocks(field: HTMLElement): void {
  if (field.childNodes.length === 0) {
    const paragraph = document.createElement('p');
    keepEditable(paragraph);
    field.append(paragraph);
    return;
  }
  wrapInlineRuns(field);
}

/** Bloc de premier niveau du champ qui contient `node`, `null` si `node` est le champ lui-même. */
function blockOf(field: HTMLElement, node: Node): Element | null {
  let current: Node | null = node;
  while (current && current.parentNode !== field) current = current.parentNode;
  return current instanceof Element ? current : null;
}

/**
 * Plage réduite où insérer, toujours **dans un bloc** : la sélection du champ, son contenu
 * supprimé si elle s'étend (Entrée ou collage sur une sélection la remplacent), sinon la
 * fin du dernier bloc. Une sélection posée au niveau du champ lui-même (après « tout
 * sélectionner » puis suppression, ou par un navigateur qui vide le champ) est ramenée au
 * début du bloc qu'elle désigne, ou à la fin du bloc précédent.
 */
function insertionRange(field: HTMLElement): Range {
  const current = selectionIn(field);
  if (current && !current.collapsed) current.deleteContents();
  ensureBlocks(field);
  if (current && blockOf(field, current.startContainer)) {
    current.collapse(true);
    return current;
  }
  const range = field.ownerDocument.createRange();
  const offset = current ? current.startOffset : field.childNodes.length;
  const designated = field.childNodes[offset];
  if (designated && isBlockNode(designated)) {
    range.setStart(designated, 0);
  } else {
    const previous = field.childNodes[offset - 1];
    const target = previous instanceof Element ? previous : (field.lastElementChild ?? field);
    range.setStart(target, target.childNodes.length);
  }
  range.collapse(true);
  return range;
}

/** Fait de `range` la sélection du document (curseur) et la rend. */
function select(field: HTMLElement, range: Range): Range {
  const selection = field.ownerDocument.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return range;
}

/** Curseur réduit juste après un nœud. */
function caretAfter(field: HTMLElement, node: Node): Range {
  const range = field.ownerDocument.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  return select(field, range);
}

/** Insère un `<br>` à la plage réduite (Maj+Entrée, ou Entrée hors d'un bloc scindable). */
function insertLineBreak(field: HTMLElement, range: Range): Range {
  const br = document.createElement('br');
  range.insertNode(br);
  return caretAfter(field, br);
}

/**
 * Entrée : scinde le bloc courant à la plage réduite, la suite devenant un nouveau `<p>`
 * qui reçoit le curseur. Hors d'un bloc scindable (cellule de tableau, liste) : un `<br>`.
 */
function splitBlock(field: HTMLElement, range: Range): Range {
  const block = blockOf(field, range.startContainer);
  if (!block || !SPLITTABLE_TAGS.has(tagOf(block))) {
    return insertLineBreak(field, range);
  }
  const tail = field.ownerDocument.createRange();
  tail.setStart(range.startContainer, range.startOffset);
  tail.setEnd(block, block.childNodes.length);
  const next = document.createElement('p');
  next.append(tail.extractContents());
  keepEditable(block);
  keepEditable(next);
  block.after(next);
  const caret = field.ownerDocument.createRange();
  caret.setStart(next, 0);
  caret.collapse(true);
  return select(field, caret);
}

/** Insère du texte brut à la plage réduite ; chaque saut de ligne ouvre un nouveau paragraphe. */
function insertText(field: HTMLElement, range: Range, text: string): void {
  let current = range;
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    if (index > 0) current = splitBlock(field, current);
    if (line === '') return;
    // Le `<br>` qui donnait sa hauteur à un bloc vide n'a plus lieu d'être une fois du texte posé.
    const block = blockOf(field, current.startContainer);
    const placeholder = block && isEmptyElement(block) ? block.querySelector('br') : null;
    const node = document.createTextNode(line);
    current.insertNode(node);
    placeholder?.remove();
    current = caretAfter(field, node);
  });
  select(field, current);
}

/**
 * Champ de texte riche minimal : `<div contenteditable role="textbox">` libellé, dont le
 * contenu initial est assaini (ses paragraphes vides reçoivent un `<br>` pour rester
 * saisissables), Entrée scinde le paragraphe, Maj+Entrée insère un retour à la ligne, le
 * collage n'insère que le texte brut (un paragraphe par ligne). `getHtml()` rend la valeur
 * normalisée (`normalizeFieldHtml`), `isModified()` dit si l'utilisateur a touché au champ.
 */
export function createRichField(options: RichFieldOptions): RichField {
  const labelId = `${options.id}-label`;
  const field = el('div', {
    className: [`aster-dialog__input ${RICH_FIELD_CLASS}`, options.className]
      .filter(Boolean)
      .join(' '),
    attrs: {
      id: options.id,
      // Attribut plutôt que la propriété `contentEditable`, que jsdom n'implémente pas.
      contenteditable: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-labelledby': labelId,
      'data-placeholder': options.placeholder,
    },
  });
  // Le HTML vient d'un `DocumentLayout` (import ou application) : assaini avant injection.
  field.innerHTML = sanitizeHeaderFooterHtml(options.html);
  for (const block of Array.from(field.children)) {
    if (SPLITTABLE_TAGS.has(tagOf(block))) keepEditable(block);
  }
  const label = el('label', {
    className: 'aster-dialog__label',
    attrs: { id: labelId, for: options.id },
    text: options.label,
  });
  // `for` ne focalise pas un `div` : le libellé le fait explicitement.
  label.addEventListener('click', () => field.focus());

  let modified = false;
  for (const type of MODIFYING_EVENTS) {
    field.addEventListener(type, () => {
      modified = true;
    });
  }
  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    const range = insertionRange(field);
    if (event.shiftKey) insertLineBreak(field, range);
    else splitBlock(field, range);
  });
  field.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text === '') return;
    insertText(field, insertionRange(field), text);
  });

  const wrapper = el('div', { className: 'aster-dialog__field aster-page-layout__rich-field' }, [
    label,
    field,
  ]);
  return {
    wrapper,
    field,
    getHtml: () => normalizeFieldHtml(field.innerHTML),
    isModified: () => modified,
  };
}
