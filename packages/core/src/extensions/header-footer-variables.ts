import type { AsterEditor } from '../api/index.js';
import {
  declaredVariableLabel,
  isValidVariableName,
  variablePlaceholder,
} from '../editor/variable-store.js';
import {
  VARIABLE_CLASS,
  VARIABLE_HTML_ATTRIBUTE,
  VARIABLE_LABEL_ATTRIBUTE,
  VARIABLE_RESOLVED_CLASS,
  VARIABLE_UNRESOLVED_CLASS,
} from './variable.js';

/**
 * Variables dans les en-têtes et pieds de page (retour utilisateurs 0.7, « axe plus loin »).
 * La mise en page porte l'en-tête en HTML, où une variable est la même puce figée que dans
 * le corps : `<span data-aster-variable="nom" data-label="…">{{nom}}</span>`. Le HTML
 * **stocké** (`getLayout()`, export) n'est jamais modifié ; seul le HTML **affiché** par la
 * vue page l'est : chaque puce y prend la valeur de la variable, sinon son libellé, sinon
 * le libellé déclaré, sinon son nom, avec les classes des puces du corps. Un `{{nom}}` en
 * texte (champ de fusion d'un en-tête importé de Word) est affiché de la même façon.
 */

/** Éditeur propriétaire de chaque hôte : la vue page y lit valeurs et libellés. */
const EDITORS = new WeakMap<HTMLElement, AsterEditor>();

/**
 * Associe un hôte à son éditeur (`null` l'oublie). La vue page et les sauts de section ne
 * reçoivent que des éléments du DOM : ce registre leur donne le magasin de variables sans
 * changer leurs signatures.
 */
export function registerHeaderFooterVariables(host: HTMLElement, editor: AsterEditor | null): void {
  if (editor === null) EDITORS.delete(host);
  else EDITORS.set(host, editor);
}

/** Éditeur associé à l'hôte, `null` s'il n'y en a pas (vue page montée hors d'un éditeur). */
export function headerFooterVariablesOf(host: HTMLElement | null): AsterEditor | null {
  return (host ? EDITORS.get(host) : undefined) ?? null;
}

/** `{{nom}}` en texte : même motif de nom que `isValidVariableName`. */
const TYPED_VARIABLE_PATTERN = /\{\{([\p{L}\p{N}_][\p{L}\p{N}_.-]*)\}\}/gu;

/**
 * Vrai si un HTML d'en-tête ou de pied peut contenir une variable : une puce, ou un
 * `{{nom}}` en texte (ce que l'import `.docx` rend pour un champ de fusion d'en-tête).
 */
export function hasHeaderFooterVariables(html: string): boolean {
  return html.includes(VARIABLE_HTML_ATTRIBUTE) || html.includes('{{');
}

/** Nœuds texte d'un sous-arbre, hors puces de variables (leur texte est déjà `{{nom}}`). */
function textNodesOutsideChips(root: Node, selector: string): Text[] {
  const nodes: Text[] = [];
  const pending: Node[] = [root];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) nodes.push(child as Text);
      else if (child instanceof Element && !child.matches(selector)) pending.push(child);
    }
  }
  return nodes;
}

/** Remplace chaque `{{nom}}` d'un nœud texte par une puce nue, à habiller ensuite. */
function chipTypedVariables(text: Text): void {
  const value = text.data;
  const pieces: Node[] = [];
  let last = 0;
  for (const match of value.matchAll(TYPED_VARIABLE_PATTERN)) {
    if (match.index > last) pieces.push(document.createTextNode(value.slice(last, match.index)));
    const chip = document.createElement('span');
    chip.setAttribute(VARIABLE_HTML_ATTRIBUTE, match[1] ?? '');
    pieces.push(chip);
    last = match.index + match[0].length;
  }
  if (pieces.length === 0) return;
  if (last < value.length) pieces.push(document.createTextNode(value.slice(last)));
  text.replaceWith(...pieces);
}

/**
 * HTML **affiché** d'un en-tête ou d'un pied déjà assaini : chaque variable (puce au nom
 * valide, ou `{{nom}}` en texte) affiche sa valeur (classe `aster-variable--resolved`,
 * `title` = `{{nom}}`), sinon son libellé, le libellé déclaré ou son nom
 * (`aster-variable--unresolved`). Le texte est posé en nœud texte, jamais en HTML : une
 * valeur ne peut rien injecter. Sans éditeur ou sans variable, le HTML est rendu tel quel,
 * sans passer par le DOM.
 */
export function displayHeaderFooterHtml(html: string, editor: AsterEditor | null): string {
  if (editor === null || !hasHeaderFooterVariables(html)) {
    return html;
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  const selector = `span[${VARIABLE_HTML_ATTRIBUTE}]`;
  if (html.includes('{{')) {
    for (const text of textNodesOutsideChips(template.content, selector)) {
      chipTypedVariables(text);
    }
  }
  const values = editor.variables.getValues();
  for (const chip of Array.from(template.content.querySelectorAll(selector))) {
    const name = chip.getAttribute(VARIABLE_HTML_ATTRIBUTE) ?? '';
    if (!isValidVariableName(name)) continue;
    const value = values[name];
    const resolved = value !== undefined;
    chip.classList.add(
      VARIABLE_CLASS,
      resolved ? VARIABLE_RESOLVED_CLASS : VARIABLE_UNRESOLVED_CLASS,
    );
    chip.setAttribute('data-name', name);
    chip.setAttribute(
      'title',
      resolved ? variablePlaceholder(name) : editor.i18n.t('variable.unresolved', { name }),
    );
    chip.textContent = resolved
      ? value
      : chip.getAttribute(VARIABLE_LABEL_ATTRIBUTE) ||
        declaredVariableLabel(editor.variables, name) ||
        name;
  }
  return template.innerHTML;
}
