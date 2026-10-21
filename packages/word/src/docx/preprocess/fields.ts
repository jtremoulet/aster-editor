import { toVariableName } from './names.js';
import {
  allNamed,
  childNamed,
  childrenNamed,
  createVariableRun,
  firstRunProperties,
  textOf,
  wordAttribute,
  type CollectedVariable,
  type PartCollector,
} from './xml-utils.js';

/**
 * Champs de fusion Word → runs `{{nom}}`. Deux formes existent dans le XML : le champ
 * simple `w:fldSimple w:instr="MERGEFIELD nom"` et le champ complexe, séquence de runs
 * `w:fldChar begin` / `w:instrText` / `w:fldChar separate` / résultat / `w:fldChar end`.
 * Toute autre instruction (`HYPERLINK`, `PAGE`, `TOC`, `IF`…) est laissée intacte. Le
 * résultat affiché du champ devient la valeur connue de la variable, sauf s'il est vide
 * ou n'est que le placeholder `«nom»` / `{{nom}}`.
 */

/** Instruction `MERGEFIELD nom` ou `MERGEFIELD "nom composé"`, options (`\* MERGEFORMAT`) ignorées. */
const MERGEFIELD_INSTR = /^\s*MERGEFIELD\s+(?:"([^"]*)"|(\S+))/iu;

/** Nœuds laissés en place quand on retire un champ : repères et marques de correction. */
const KEEP_WHEN_REMOVING: ReadonlySet<string> = new Set([
  'bookmarkStart',
  'bookmarkEnd',
  'proofErr',
]);

/** Nom de variable d'un `MERGEFIELD`, avec le nom brut de l'instruction. */
export interface MergeField {
  readonly name: string;
  readonly raw: string;
}

/**
 * Lit l'instruction : nom brut et nom de variable. `null` pour toute autre instruction.
 * Partagé avec le comparateur (`compare/model-paragraph.ts`), qui modélise les champs
 * par leur nom brut (R30-04) : une seule lecture de `MERGEFIELD` dans le paquet.
 */
export function parseMergeField(instruction: string): MergeField | null {
  const match = MERGEFIELD_INSTR.exec(instruction);
  if (!match) return null;
  const raw = (match[1] ?? match[2] ?? '').trim();
  const name = toVariableName(raw);
  return name === null ? null : { name, raw };
}

/** Nom de variable d'une instruction `MERGEFIELD`, `null` pour toute autre instruction. */
export function mergeFieldName(instruction: string): string | null {
  return parseMergeField(instruction)?.name ?? null;
}

/** Contenu de `«…»` ou `{{…}}` (blancs intérieurs tolérés), `null` si le texte n'a pas cette forme. */
function placeholderInner(text: string): string | null {
  if (text.startsWith('«') && text.endsWith('»')) return text.slice(1, -1).trim();
  if (text.startsWith('{{') && text.endsWith('}}')) return text.slice(2, -2).trim();
  return null;
}

/**
 * Valeur connue d'un champ d'après son résultat affiché : le texte tel quel, sauf s'il
 * est vide ou n'est que le placeholder du champ (`«nom»`, `« nom »`, `{{nom}}`, avec le
 * nom brut ou normalisé). C'est ce qui rend un export `fields` avec valeurs réimportable.
 */
function fieldResultInfo(result: string, _field: MergeField): CollectedVariable {
  const trimmed = result.trim();
  if (trimmed === '') return {};
  const inner = placeholderInner(trimmed);
  // Un résultat entièrement entre guillemets français est le placeholder Word du champ non fusionné, jamais une valeur.
  if (inner !== null) return {};
  return { value: result };
}

/** `w:fldSimple w:instr="MERGEFIELD nom"` → run `{{nom}}`. Les autres instructions restent. */
export function replaceSimpleFields(doc: Document, collector: PartCollector): boolean {
  let changed = false;
  for (const field of allNamed(doc, 'fldSimple')) {
    if (!field.isConnected) continue;
    const merge = parseMergeField(wordAttribute(field, 'instr'));
    if (merge === null) continue;
    const run = createVariableRun(field, merge.name, firstRunProperties(allNamed(field, 'r')));
    collector.add(field, merge.name, fieldResultInfo(textOf(field), merge), run);
    field.parentNode?.replaceChild(run, field);
    changed = true;
  }
  return changed;
}

/** Vrai si le nœud est un run `w:r`. */
function isRun(node: Node): node is Element {
  return node.nodeType === 1 && (node as Element).localName === 'r';
}

/** Type du `w:fldChar` porté par un run (`begin`, `separate`, `end`), `null` sinon. */
function fieldCharType(run: Element): string | null {
  const fldChar = childNamed(run, 'fldChar');
  return fldChar ? wordAttribute(fldChar, 'fldCharType') : null;
}

/** Champ complexe en cours de lecture : indices dans la liste des enfants du paragraphe. */
interface OpenField {
  readonly beginIndex: number;
  instruction: string;
  separateIndex: number;
}

/** Champ complexe fermé dans son paragraphe : bornes `begin` … `end` et instruction lue. */
interface ComplexField {
  readonly beginRun: Element;
  readonly instruction: string;
  readonly beginIndex: number;
  readonly separateIndex: number;
  readonly endIndex: number;
}

/**
 * Délimite tous les champs complexes d'un paragraphe en **une seule passe**, avec une
 * pile des `begin` ouverts : l'instruction n'est lue que pour le champ le plus interne,
 * avant son `separate`. Un `begin` jamais fermé reste sur la pile et ne coûte rien de
 * plus (un parcours par `begin` serait quadratique sur un document hostile). Les
 * champs rendus sont triés par position du `begin`, l'englobant avant l'imbriqué.
 */
function readComplexFields(children: readonly Node[]): ComplexField[] {
  const fields: ComplexField[] = [];
  const open: OpenField[] = [];
  children.forEach((node, index) => {
    if (!isRun(node)) return;
    const type = fieldCharType(node);
    if (type === 'begin') {
      open.push({ beginIndex: index, instruction: '', separateIndex: -1 });
      return;
    }
    const top = open[open.length - 1];
    if (!top) return;
    if (type === 'end') {
      open.pop();
      fields.push({
        beginRun: children[top.beginIndex] as Element,
        instruction: top.instruction,
        beginIndex: top.beginIndex,
        separateIndex: top.separateIndex,
        endIndex: index,
      });
      return;
    }
    if (type === 'separate') {
      if (top.separateIndex === -1) top.separateIndex = index;
      return;
    }
    if (top.separateIndex === -1) {
      top.instruction += childrenNamed(node, 'instrText')
        .map((t) => t.textContent ?? '')
        .join('');
    }
  });
  return fields.sort((a, b) => a.beginIndex - b.beginIndex);
}

/** Parents (paragraphes) contenant au moins un `w:fldChar begin`, dans l'ordre du document. */
function fieldParents(doc: Document): Element[] {
  const parents = new Set<Element>();
  for (const fldChar of allNamed(doc, 'fldChar')) {
    const parent = fldChar.parentElement?.parentElement;
    if (parent && wordAttribute(fldChar, 'fldCharType') === 'begin') parents.add(parent);
  }
  return [...parents];
}

/**
 * Champs complexes `w:fldChar begin … w:instrText … separate … résultat … end` →
 * un seul run `{{nom}}` portant la mise en forme du résultat (sinon celle du `begin`).
 * Un champ qui ne se ferme pas dans son paragraphe n'est pas touché.
 */
export function replaceComplexFields(doc: Document, collector: PartCollector): boolean {
  let changed = false;
  for (const parent of fieldParents(doc)) {
    const children = Array.from(parent.childNodes);
    for (const field of readComplexFields(children)) {
      // Un champ imbriqué dans un MERGEFIELD déjà remplacé a disparu avec lui.
      if (!field.beginRun.isConnected) continue;
      const merge = parseMergeField(field.instruction);
      if (merge === null) continue;
      const resultRuns =
        field.separateIndex === -1
          ? []
          : children.slice(field.separateIndex + 1, field.endIndex).filter(isRun);
      const rPr = firstRunProperties(resultRuns) ?? firstRunProperties([field.beginRun]);
      const run = createVariableRun(field.beginRun, merge.name, rPr);
      const result = resultRuns.map((candidate) => textOf(candidate)).join('');
      collector.add(field.beginRun, merge.name, fieldResultInfo(result, merge), run);
      parent.insertBefore(run, field.beginRun);
      for (const node of children.slice(field.beginIndex, field.endIndex + 1)) {
        if (node.nodeType === 1 && KEEP_WHEN_REMOVING.has((node as Element).localName)) continue;
        node.parentNode?.removeChild(node);
      }
      changed = true;
    }
  }
  return changed;
}
