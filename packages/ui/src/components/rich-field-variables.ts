import { isValidVariableName, variablePlaceholder } from '@aster-editor/core';

/**
 * Variables dans un champ riche minimal (`rich-field.ts`) : retour utilisateurs 0.7,
 * « mettre des variables dans les en-têtes et pieds de page ». Dans le champ, une variable
 * est un bloc insécable (`contenteditable="false"`) qui affiche son libellé ; dans la
 * **valeur** du champ, c'est la puce figée du core,
 * `<span data-aster-variable="nom">{{nom}}</span>`, celle que la vue page et l'export
 * `.docx` savent déjà lire.
 */

/** Attribut qui porte le nom de la variable (même contrat que le core). */
export const FIELD_VARIABLE_ATTRIBUTE = 'data-aster-variable';

/** Attribut du libellé propre à une puce. */
const FIELD_VARIABLE_LABEL_ATTRIBUTE = 'data-label';

/** Sélecteur des puces d'un champ. */
const FIELD_VARIABLE_SELECTOR = `span[${FIELD_VARIABLE_ATTRIBUTE}]`;

/** `{{nom}}` dans un texte : même motif de nom que `isValidVariableName`. */
const TYPED_VARIABLE_PATTERN = /\{\{([\p{L}\p{N}_][\p{L}\p{N}_.-]*)\}\}/gu;

/** Ce qu'un champ doit savoir des variables de l'éditeur. */
export interface RichFieldVariables {
  /** Vrai si l'éditeur accepte cette variable (syntaxe, et déclaration si elle est exigée). */
  accepts(name: string): boolean;
  /** Libellé déclaré pour ce nom, `null` s'il n'y en a pas. */
  labelOf(name: string): string | null;
}

/** Nom valide porté par une puce, `null` sinon. */
function chipName(chip: Element): string | null {
  const name = chip.getAttribute(FIELD_VARIABLE_ATTRIBUTE) ?? '';
  return isValidVariableName(name) ? name : null;
}

/** Texte affiché par une puce dans le champ : son libellé, le libellé déclaré, sinon son nom. */
function chipDisplayText(
  chip: Element,
  name: string,
  variables: RichFieldVariables | null,
): string {
  return chip.getAttribute(FIELD_VARIABLE_LABEL_ATTRIBUTE) || variables?.labelOf(name) || name;
}

/**
 * Habille les puces d'un champ pour la saisie : insécables, non éditables, libellé affiché
 * et `{{nom}}` en infobulle. Appelé après chaque injection de HTML dans le champ.
 */
export function decorateFieldChips(root: ParentNode, variables: RichFieldVariables | null): void {
  for (const chip of Array.from(root.querySelectorAll(FIELD_VARIABLE_SELECTOR))) {
    const name = chipName(chip);
    if (name === null) continue;
    chip.setAttribute('contenteditable', 'false');
    chip.setAttribute('title', variablePlaceholder(name));
    chip.textContent = chipDisplayText(chip, name, variables);
  }
}

/** Puce prête à insérer dans un champ, habillée comme `decorateFieldChips` le ferait. */
export function createFieldChip(
  doc: Document,
  name: string,
  variables: RichFieldVariables | null,
): HTMLElement {
  const chip = doc.createElement('span');
  chip.setAttribute(FIELD_VARIABLE_ATTRIBUTE, name);
  chip.setAttribute('contenteditable', 'false');
  chip.setAttribute('title', variablePlaceholder(name));
  chip.textContent = chipDisplayText(chip, name, variables);
  return chip;
}

/**
 * Ramène les puces à leur forme figée, celle de la valeur du champ : texte `{{nom}}`,
 * sans l'habillage de saisie (`contenteditable`, `title`). Une puce au nom invalide est
 * laissée telle quelle : ce n'est que du texte dans un `span`.
 */
export function canonicalizeFieldChips(root: ParentNode): void {
  for (const chip of Array.from(root.querySelectorAll(FIELD_VARIABLE_SELECTOR))) {
    const name = chipName(chip);
    if (name === null) continue;
    chip.removeAttribute('contenteditable');
    chip.removeAttribute('title');
    chip.textContent = variablePlaceholder(name);
  }
}

/** Nœuds texte d'un sous-arbre qui ne sont pas déjà dans une puce. */
function textNodesOutsideChips(root: Node): Text[] {
  const nodes: Text[] = [];
  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        nodes.push(child as Text);
      } else if (child instanceof Element && !child.matches(FIELD_VARIABLE_SELECTOR)) {
        visit(child);
      }
    }
  };
  visit(root);
  return nodes;
}

/**
 * Transforme chaque `{{nom}}` **tapé** en puce figée, quand l'éditeur accepte la variable.
 * Un nom refusé (variable non déclarée alors que la déclaration est exigée) reste du texte.
 * Rend le HTML tel quel, sans passer par le DOM, s'il ne contient aucune accolade double.
 */
export function chipTypedVariables(html: string, variables: RichFieldVariables): string {
  if (!html.includes('{{')) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const text of textNodesOutsideChips(template.content)) {
    const value = text.data;
    const pieces: Node[] = [];
    let last = 0;
    for (const match of value.matchAll(TYPED_VARIABLE_PATTERN)) {
      const name = match[1] ?? '';
      if (!variables.accepts(name)) continue;
      if (match.index > last) pieces.push(document.createTextNode(value.slice(last, match.index)));
      const chip = document.createElement('span');
      chip.setAttribute(FIELD_VARIABLE_ATTRIBUTE, name);
      chip.textContent = variablePlaceholder(name);
      pieces.push(chip);
      last = match.index + match[0].length;
    }
    if (pieces.length === 0) continue;
    if (last < value.length) pieces.push(document.createTextNode(value.slice(last)));
    text.replaceWith(...pieces);
  }
  return template.innerHTML;
}
