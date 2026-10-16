import { toVariableName } from './names';
import {
  allNamed,
  childNamed,
  childrenNamed,
  createVariableRun,
  firstRunProperties,
  wordAttribute,
  type PartCollector,
} from './xml-utils';

/**
 * Champs de fusion Word → runs `{{nom}}`. Deux formes existent dans le XML : le champ
 * simple `w:fldSimple w:instr="MERGEFIELD nom"` et le champ complexe, séquence de runs
 * `w:fldChar begin` / `w:instrText` / `w:fldChar separate` / résultat / `w:fldChar end`.
 * Toute autre instruction (`HYPERLINK`, `PAGE`, `TOC`, `IF`…) est laissée intacte.
 */

/** Instruction `MERGEFIELD nom` ou `MERGEFIELD "nom composé"`, options (`\* MERGEFORMAT`) ignorées. */
const MERGEFIELD_INSTR = /^\s*MERGEFIELD\s+(?:"([^"]*)"|(\S+))/iu;

/** Nœuds laissés en place quand on retire un champ : repères et marques de correction. */
const KEEP_WHEN_REMOVING: ReadonlySet<string> = new Set([
  'bookmarkStart',
  'bookmarkEnd',
  'proofErr',
]);

/** Nom de variable d'une instruction `MERGEFIELD`, `null` pour toute autre instruction. */
export function mergeFieldName(instruction: string): string | null {
  const match = MERGEFIELD_INSTR.exec(instruction);
  if (!match) return null;
  return toVariableName(match[1] ?? match[2] ?? '');
}

/** `w:fldSimple w:instr="MERGEFIELD nom"` → run `{{nom}}`. Les autres instructions restent. */
export function replaceSimpleFields(doc: Document, collector: PartCollector): boolean {
  let changed = false;
  for (const field of allNamed(doc, 'fldSimple')) {
    if (!field.isConnected) continue;
    const name = mergeFieldName(wordAttribute(field, 'instr'));
    if (name === null) continue;
    const run = createVariableRun(field, name, firstRunProperties(allNamed(field, 'r')));
    field.parentNode?.replaceChild(run, field);
    collector.add(field, name, {});
    changed = true;
  }
  return changed;
}

/** Type du `w:fldChar` porté par un run (`begin`, `separate`, `end`), `null` sinon. */
function fieldCharType(run: Element): string | null {
  const fldChar = childNamed(run, 'fldChar');
  return fldChar ? wordAttribute(fldChar, 'fldCharType') : null;
}

/** Portée d'un champ complexe : du run `begin` au run `end`, dans le même paragraphe. */
interface ComplexField {
  readonly instruction: string;
  readonly nodes: Node[];
  readonly runs: Element[];
}

/**
 * Délimite le champ complexe ouvert par `beginRun` en parcourant ses frères : les
 * champs imbriqués sont traversés sans être lus, l'instruction n'est lue qu'à la
 * profondeur zéro, avant `separate`. `null` si le champ ne se ferme pas dans le
 * paragraphe (champ enjambant plusieurs paragraphes : on ne touche à rien).
 */
function readComplexField(beginRun: Element): ComplexField | null {
  const nodes: Node[] = [beginRun];
  const runs: Element[] = [beginRun];
  let instruction = '';
  let depth = 0;
  let separated = false;
  let node: Node | null = beginRun.nextSibling;
  while (node !== null) {
    nodes.push(node);
    if (node.nodeType === 1 && (node as Element).localName === 'r') {
      const run = node as Element;
      runs.push(run);
      const type = fieldCharType(run);
      if (type === 'begin') depth += 1;
      else if (type === 'end' && depth > 0) depth -= 1;
      else if (type === 'end') return { instruction, nodes, runs };
      else if (type === 'separate' && depth === 0) separated = true;
      else if (depth === 0 && !separated) {
        instruction += childrenNamed(run, 'instrText')
          .map((t) => t.textContent ?? '')
          .join('');
      }
    }
    node = node.nextSibling;
  }
  return null;
}

/**
 * Champs complexes `w:fldChar begin … w:instrText … separate … résultat … end` →
 * un seul run `{{nom}}` portant la mise en forme du résultat (sinon celle du `begin`).
 */
export function replaceComplexFields(doc: Document, collector: PartCollector): boolean {
  let changed = false;
  for (const fldChar of allNamed(doc, 'fldChar')) {
    const beginRun = fldChar.parentElement;
    if (!beginRun || !beginRun.isConnected || wordAttribute(fldChar, 'fldCharType') !== 'begin') {
      continue;
    }
    const field = readComplexField(beginRun);
    if (!field) continue;
    const name = mergeFieldName(field.instruction);
    if (name === null) continue;
    const separateIndex = field.runs.findIndex((run) => fieldCharType(run) === 'separate');
    const resultRuns = separateIndex === -1 ? [] : field.runs.slice(separateIndex + 1, -1);
    const rPr = firstRunProperties(resultRuns) ?? firstRunProperties([beginRun]);
    beginRun.parentNode?.insertBefore(createVariableRun(beginRun, name, rPr), beginRun);
    for (const node of field.nodes) {
      if (node.nodeType === 1 && KEEP_WHEN_REMOVING.has((node as Element).localName)) continue;
      node.parentNode?.removeChild(node);
    }
    collector.add(beginRun, name, {});
    changed = true;
  }
  return changed;
}
