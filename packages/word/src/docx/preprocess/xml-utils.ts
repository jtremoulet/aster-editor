/**
 * Helpers DOM XML partagés par le prétraitement des variables. Tout se fait par nom
 * local (`getElementsByTagNameNS('*', …)`) : le préfixe `w:` et l'espace de noms exact
 * (transitional ou strict OOXML) n'ont pas d'importance.
 */

/** Libellé et valeur connus d'une variable, collectés dans le document. */
export interface CollectedVariable {
  label?: string;
  value?: string;
}

/** Espace de noms des attributs `xml:space`. */
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** Enfants directs d'un élément ayant le nom local donné, quel que soit l'espace de noms. */
export function childrenNamed(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

/** Premier enfant direct nommé, ou `null`. */
export function childNamed(parent: Element, localName: string): Element | null {
  return childrenNamed(parent, localName)[0] ?? null;
}

/** Attribut `w:…` (même espace de noms que l'élément), chaîne vide si absent. */
export function wordAttribute(element: Element, name: string): string {
  return element.getAttributeNS(element.namespaceURI, name) ?? element.getAttribute(name) ?? '';
}

/** Tous les éléments d'un nom local donné sous `root`, dans l'ordre du document, en liste statique. */
export function allNamed(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', localName));
}

/** Texte des `w:t` descendants, concaténé dans l'ordre. */
export function textOf(element: Element): string {
  return allNamed(element, 't')
    .map((t) => t.textContent ?? '')
    .join('');
}

/**
 * Crée le run `{{nom}}` qui remplace un champ ou un contrôle, dans l'espace de noms de
 * l'élément de référence, en clonant la mise en forme `w:rPr` fournie.
 */
export function createVariableRun(reference: Element, name: string, rPr: Element | null): Element {
  const doc = reference.ownerDocument;
  const ns = reference.namespaceURI;
  const prefix = reference.prefix ? `${reference.prefix}:` : '';
  const run = doc.createElementNS(ns, `${prefix}r`);
  if (rPr) run.appendChild(rPr.cloneNode(true));
  const text = doc.createElementNS(ns, `${prefix}t`);
  text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  text.textContent = `{{${name}}}`;
  run.appendChild(text);
  return run;
}

/** Première mise en forme `w:rPr` trouvée dans les runs listés, dans l'ordre. */
export function firstRunProperties(runs: readonly Element[]): Element | null {
  for (const run of runs) {
    const rPr = childNamed(run, 'rPr');
    if (rPr) return rPr;
  }
  return null;
}

/** Complète libellé et valeur d'une entrée existante avec ceux d'une nouvelle apparition. */
function mergeInto(existing: CollectedVariable, info: CollectedVariable): void {
  if (existing.label === undefined && info.label !== undefined) existing.label = info.label;
  if (existing.value === undefined && info.value !== undefined) existing.value = info.value;
}

/** Entrée du collecteur : infos, position de première apparition, runs posés dans le document. */
interface CollectorEntry {
  info: CollectedVariable;
  position: number;
  readonly anchors: Element[];
}

/**
 * Collecte d'une partie XML : les variables avec la position de leur première
 * apparition, pour restituer l'ordre de lecture quel que soit l'ordre de traitement
 * (champs d'abord, contrôles ensuite en ordre inverse). Quand un même nom apparaît
 * plusieurs fois, le libellé et la valeur de la **première** apparition priment, les
 * suivantes ne comblent que ce qui manque.
 *
 * L'index des positions n'est construit qu'au premier `add`, et doit l'être avant toute
 * mutation du DOM : les transformations appellent donc `add` **avant** de détacher
 * l'élément d'origine.
 */
export class PartCollector {
  private readonly entries = new Map<string, CollectorEntry>();
  private positions: Map<Element, number> | null = null;

  constructor(private readonly doc: Document) {}

  /** Position d'un élément dans l'ordre du document, index construit à la demande. */
  private positionOf(element: Element): number {
    if (this.positions === null) {
      const positions = new Map<Element, number>();
      allNamed(this.doc, '*').forEach((candidate, index) => positions.set(candidate, index));
      this.positions = positions;
    }
    return this.positions.get(element) ?? Number.MAX_SAFE_INTEGER;
  }

  /**
   * Enregistre une variable : `origin` est l'élément remplacé (encore attaché), `anchor`
   * le run `{{nom}}` qui le remplace. Un anchor détaché au moment du `flushInto`
   * (contrôle de bloc englobant remplacé à son tour) ne compte pas : la variable n'est
   * plus dans le document.
   */
  add(origin: Element, name: string, info: CollectedVariable, anchor: Element): void {
    const position = this.positionOf(origin);
    const existing = this.entries.get(name);
    if (!existing) {
      this.entries.set(name, { info: { ...info }, position, anchors: [anchor] });
      return;
    }
    existing.anchors.push(anchor);
    if (position < existing.position) {
      const first: CollectedVariable = { ...info };
      mergeInto(first, existing.info);
      existing.info = first;
      existing.position = position;
      return;
    }
    mergeInto(existing.info, info);
  }

  /**
   * Verse les variables de la partie dans la table globale, dans l'ordre du document,
   * en ignorant celles dont aucun run n'est plus attaché.
   */
  flushInto(variables: Map<string, CollectedVariable>): void {
    const sorted = [...this.entries].sort((a, b) => a[1].position - b[1].position);
    for (const [name, { info, anchors }] of sorted) {
      if (!anchors.some((anchor) => anchor.isConnected)) continue;
      const existing = variables.get(name);
      if (existing) mergeInto(existing, info);
      else variables.set(name, info);
    }
  }
}
