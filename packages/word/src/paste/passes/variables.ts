import { DEFAULT_VARIABLE_PATTERN, isVariableName } from '../../docx/preprocess/names';
import type { PastePass } from '../types';

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

/**
 * Remplace les occurrences de variables dans les nœuds texte sous `root`. Les textes
 * adjacents sont d'abord fusionnés (`normalize`) pour recoller un `{{` coupé sur deux
 * runs. Renvoie le nombre de puces posées.
 */
export function wrapVariablePlaceholders(
  doc: Document,
  root: Node,
  options: WrapVariablesOptions,
): number {
  if (options.patterns.length === 0) return 0;
  const matchers = options.patterns.map(toMatcher);
  root.normalize();
  let count = 0;
  for (const text of collectCandidateTexts(root)) {
    const data = text.data;
    const occurrences = findOccurrences(data, matchers);
    if (occurrences.length === 0) continue;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const { start, end, name } of occurrences) {
      if (start > cursor) fragment.appendChild(doc.createTextNode(data.slice(cursor, start)));
      fragment.appendChild(createChip(doc, name, options.labels));
      cursor = end;
      count += 1;
    }
    if (cursor < data.length) fragment.appendChild(doc.createTextNode(data.slice(cursor)));
    text.parentNode?.replaceChild(fragment, text);
  }
  return count;
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
