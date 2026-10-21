import { DEFAULT_VARIABLE_PATTERN, isVariableName } from '../../docx/preprocess/names.js';
import type { PastePass } from '../types.js';

/**
 * Détection des variables `{{nom}}` dans un HTML déjà nettoyé : chaque occurrence dans un
 * nœud texte devient une puce `<span data-aster-variable="nom">{{nom}}</span>`, le
 * contrat d'import du core. Moteur partagé par la passe de collage (Word, Google Docs)
 * et le post-traitement de l'import .docx.
 */

/**
 * Motif à reconnaître, groupe 1 = nom. Avec `only`, seules les occurrences dont le nom
 * est dans l'ensemble sont converties : c'est ainsi que l'import .docx ne reconnaît en
 * `{{nom}}` que les variables issues de ses champs de fusion quand l'intégrateur a
 * choisi une autre syntaxe pour le texte libre.
 */
export interface VariableMatcher {
  readonly pattern: RegExp;
  readonly only?: ReadonlySet<string>;
}

/** Options du moteur de remplacement. */
export interface WrapVariablesOptions {
  /** Motifs à reconnaître, groupe 1 = nom. Le drapeau `g` est ajouté s'il manque. */
  readonly patterns: readonly (RegExp | VariableMatcher)[];
  /** Libellés connus par nom, posés en `data-label`. */
  readonly labels?: ReadonlyMap<string, string>;
}

/** Sous-arbres où une accolade est du code, pas une variable. */
const SKIPPED_TAGS: ReadonlySet<string> = new Set(['pre', 'code', 'script', 'style', 'textarea']);

/** Attribut de la puce, celui que le schéma du core lit à l'insertion. */
const VARIABLE_ATTRIBUTE = 'data-aster-variable';

/** Occurrence reconnue dans un texte : bornes et nom validé. */
interface Occurrence {
  readonly start: number;
  readonly end: number;
  readonly name: string;
}

/** Forme normalisée d'un motif, avec le drapeau global, sans muter le motif de l'appelant. */
function toMatcher(entry: RegExp | VariableMatcher): VariableMatcher {
  const source = entry instanceof RegExp ? { pattern: entry } : entry;
  const flags = source.pattern.flags.includes('g')
    ? source.pattern.flags
    : `${source.pattern.flags}g`;
  const pattern = new RegExp(source.pattern.source, flags);
  return source.only ? { pattern, only: source.only } : { pattern };
}

/**
 * Nœuds texte sous `root` hors `<pre>`, `<code>` et puces déjà posées (idempotence),
 * en liste statique : le DOM est muté ensuite.
 */
function collectCandidateTexts(root: Node): Text[] {
  const result: Text[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      result.push(node as Text);
      return;
    }
    if (node.nodeType === 1) {
      const element = node as Element;
      if (SKIPPED_TAGS.has(element.localName) || element.hasAttribute(VARIABLE_ATTRIBUTE)) {
        return;
      }
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  visit(root);
  return result;
}

/**
 * Occurrences de tous les motifs dans un texte, triées par position, sans
 * chevauchement. Un motif sans groupe capturant ou dont le nom est invalide est ignoré
 * pour cette occurrence ; une correspondance vide fait avancer d'un caractère.
 */
function findOccurrences(text: string, matchers: readonly VariableMatcher[]): Occurrence[] {
  const found: Occurrence[] = [];
  for (const { pattern, only } of matchers) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      const name = (match[1] ?? '').trim();
      if (isVariableName(name) && (only === undefined || only.has(name))) {
        found.push({ start: match.index, end: match.index + match[0].length, name });
      }
    }
  }
  found.sort((a, b) => a.start - b.start);
  const kept: Occurrence[] = [];
  let cursor = 0;
  for (const occurrence of found) {
    if (occurrence.start >= cursor) {
      kept.push(occurrence);
      cursor = occurrence.end;
    }
  }
  return kept;
}

/** Construit la puce d'une variable : texte canonique `{{nom}}`, libellé si connu. */
function createChip(doc: Document, name: string, labels?: ReadonlyMap<string, string>): Element {
  const span = doc.createElement('span');
  span.setAttribute(VARIABLE_ATTRIBUTE, name);
  const label = labels?.get(name);
  if (label !== undefined && label !== '') span.setAttribute('data-label', label);
  span.textContent = `{{${name}}}`;
  return span;
}

/** Premier passage : chaque occurrence contenue dans un seul nœud texte devient une puce. */
function wrapWithinTexts(
  doc: Document,
  root: Node,
  matchers: readonly VariableMatcher[],
  labels: ReadonlyMap<string, string> | undefined,
): number {
  let count = 0;
  for (const text of collectCandidateTexts(root)) {
    const data = text.data;
    const occurrences = findOccurrences(data, matchers);
    if (occurrences.length === 0) continue;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const { start, end, name } of occurrences) {
      if (start > cursor) fragment.appendChild(doc.createTextNode(data.slice(cursor, start)));
      fragment.appendChild(createChip(doc, name, labels));
      cursor = end;
      count += 1;
    }
    if (cursor < data.length) fragment.appendChild(doc.createTextNode(data.slice(cursor)));
    text.parentNode?.replaceChild(fragment, text);
  }
  return count;
}

/** Blocs feuilles où une occurrence peut être répartie sur plusieurs éléments inline. */
const LEAF_BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, td, th, dd, dt, caption, figcaption, blockquote, div';

/**
 * Séparateur inséré dans le texte recollé d'un bloc là où une occurrence ne doit pas
 * enjamber : saut de ligne, puce existante, sous-arbre ignoré. Jamais dans un nom.
 */
const SEGMENT_BOUNDARY = '\u0000';

/** Nœud texte d'un bloc avec son décalage dans le texte recollé. */
interface Segment {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
}

/** Texte recollé d'un bloc feuille et ses nœuds texte candidats, dans l'ordre. */
function collectSegments(block: Element): { text: string; segments: Segment[] } {
  const segments: Segment[] = [];
  let text = '';
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const data = (node as Text).data;
      segments.push({ node: node as Text, start: text.length, end: text.length + data.length });
      text += data;
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (
      element.localName === 'br' ||
      SKIPPED_TAGS.has(element.localName) ||
      element.hasAttribute(VARIABLE_ATTRIBUTE)
    ) {
      text += SEGMENT_BOUNDARY;
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  for (const child of Array.from(block.childNodes)) visit(child);
  return { text, segments };
}

/** Retire un nœud et les éléments inline que ce retrait a vidés, sans dépasser `block`. */
function removeAndPrune(node: Node, block: Element): void {
  let element: Element | null = node.parentElement;
  node.parentNode?.removeChild(node);
  while (element && element !== block && element.childNodes.length === 0) {
    const parent: Element | null = element.parentElement;
    element.parentNode?.removeChild(element);
    element = parent;
  }
}

/**
 * Second passage : une occurrence répartie sur plusieurs éléments inline d'un même bloc
 * (`<strong>{{</strong>nom}}`, après une correction dans Word) devient une puce posée à
 * la place du premier fragment, dans ses marques ; les fragments suivants sont retirés.
 * Les occurrences sont traitées de la dernière à la première pour garder les décalages
 * valides, et jamais à travers un `<br>`, une puce ou un bloc.
 */
function wrapAcrossInlines(
  doc: Document,
  root: Node,
  matchers: readonly VariableMatcher[],
  labels: ReadonlyMap<string, string> | undefined,
): number {
  if (root.nodeType !== 1 && root.nodeType !== 9) return 0;
  const scope = root as ParentNode;
  let count = 0;
  for (const block of Array.from(scope.querySelectorAll(LEAF_BLOCK_SELECTOR))) {
    if (block.querySelector(LEAF_BLOCK_SELECTOR)) continue;
    const { text, segments } = collectSegments(block);
    if (segments.length < 2) continue;
    const occurrences = findOccurrences(text, matchers).filter((occurrence) => {
      const first = segments.find((segment) => segment.end > occurrence.start);
      return first !== undefined && first.end < occurrence.end;
    });
    for (const occurrence of occurrences.reverse()) {
      const covered = segments.filter(
        (segment) => segment.end > occurrence.start && segment.start < occurrence.end,
      );
      const first = covered[0];
      const last = covered[covered.length - 1];
      if (!first || !last || first === last) continue;
      const chip = createChip(doc, occurrence.name, labels);
      first.node.parentNode?.insertBefore(chip, first.node.nextSibling);
      first.node.data = first.node.data.slice(0, occurrence.start - first.start);
      if (first.node.data === '') first.node.parentNode?.removeChild(first.node);
      for (const segment of covered.slice(1, -1)) removeAndPrune(segment.node, block);
      last.node.data = last.node.data.slice(occurrence.end - last.start);
      if (last.node.data === '') removeAndPrune(last.node, block);
      count += 1;
    }
  }
  return count;
}

/**
 * Remplace les occurrences de variables dans les nœuds texte sous `root`. Les textes
 * adjacents sont d'abord fusionnés (`normalize`) pour recoller un `{{` coupé sur deux
 * runs ; une occurrence répartie sur plusieurs éléments inline d'un même bloc est
 * recollée dans un second passage. Renvoie le nombre de puces posées.
 */
export function wrapVariablePlaceholders(
  doc: Document,
  root: Node,
  options: WrapVariablesOptions,
): number {
  if (options.patterns.length === 0) return 0;
  const matchers = options.patterns.map(toMatcher);
  root.normalize();
  const within = wrapWithinTexts(doc, root, matchers, options.labels);
  return within + wrapAcrossInlines(doc, root, matchers, options.labels);
}

/**
 * Dernière passe du collage : `{{nom}}` tapé ou collé depuis Word ou Google Docs
 * devient une puce. Désactivable par `WordPasteOptions.variables: false`, motif
 * remplaçable par `{ pattern }`.
 */
export const wrapVariables: PastePass = (doc, options) => {
  const config = options.variables;
  if (config && !config.enabled) return;
  wrapVariablePlaceholders(doc, doc.body, {
    patterns: [config?.pattern ?? DEFAULT_VARIABLE_PATTERN],
  });
};
