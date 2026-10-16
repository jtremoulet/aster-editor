import { toVariableName } from './names';
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
} from './xml-utils';

/**
 * Contrôles de contenu Word (`w:sdt`) → runs `{{nom}}`. Le `w:tag` donne le nom, le
 * `w:alias` le libellé ; le texte saisi par l'utilisateur est la valeur connue, sauf si
 * le contrôle affiche encore son texte de remplissage (`w:showingPlcHdr`).
 */

/**
 * Propriétés `w:sdtPr` qui désignent un contrôle structurel, jamais une variable :
 * table des matières et blocs de construction (`docPartObj`), groupes, images,
 * bibliographie, sections répétées.
 */
const STRUCTURAL_SDT: ReadonlySet<string> = new Set([
  'docPartObj',
  'docPartList',
  'group',
  'picture',
  'bibliography',
  'citation',
  'equation',
  'repeatingSection',
  'repeatingSectionItem',
]);

/** Nom et libellé d'un contrôle de contenu, `null` s'il n'est pas une variable. */
function contentControlIdentity(sdtPr: Element): { name: string; label?: string } | null {
  if (Array.from(sdtPr.children).some((child) => STRUCTURAL_SDT.has(child.localName))) {
    return null;
  }
  const tag = childNamed(sdtPr, 'tag');
  const alias = childNamed(sdtPr, 'alias');
  const label = alias ? wordAttribute(alias, 'val') : '';
  const name = (tag ? toVariableName(wordAttribute(tag, 'val')) : null) ?? toVariableName(label);
  if (name === null) return null;
  return label.length > 0 ? { name, label } : { name };
}

/** Paragraphe neuf qui reprend les propriétés `w:pPr` du modèle, pour un contrôle de bloc. */
function createParagraphLike(model: Element | undefined, reference: Element): Element {
  const prefix = reference.prefix ? `${reference.prefix}:` : '';
  const paragraph = reference.ownerDocument.createElementNS(reference.namespaceURI, `${prefix}p`);
  const pPr = model ? childNamed(model, 'pPr') : null;
  if (pPr) paragraph.appendChild(pPr.cloneNode(true));
  return paragraph;
}

/**
 * `w:sdt` avec `w:tag` (sinon `w:alias` normalisé) → run `{{nom}}`. Un contrôle de
 * bloc (paragraphes) devient un paragraphe unique qui garde le `w:pPr` du premier ; un
 * contrôle de ligne ou de cellule de table est laissé intact. Parcours en ordre inverse
 * pour traiter les contrôles imbriqués avant leur conteneur.
 */
export function replaceContentControls(doc: Document, collector: PartCollector): boolean {
  let changed = false;
  for (const sdt of allNamed(doc, 'sdt').reverse()) {
    const sdtPr = childNamed(sdt, 'sdtPr');
    const content = childNamed(sdt, 'sdtContent');
    if (!sdtPr || !content) continue;
    const identity = contentControlIdentity(sdtPr);
    if (!identity) continue;
    const paragraphs = childrenNamed(content, 'p');
    const isBlock = paragraphs.length > 0;
    if (
      !isBlock &&
      (childrenNamed(content, 'tr').length > 0 || childrenNamed(content, 'tc').length > 0)
    ) {
      continue;
    }
    const rPr = firstRunProperties(allNamed(content, 'r')) ?? childNamed(sdtPr, 'rPr');
    const run = createVariableRun(sdt, identity.name, rPr);
    let replacement = run;
    if (isBlock) {
      replacement = createParagraphLike(paragraphs[0], sdt);
      replacement.appendChild(run);
    }
    const info: CollectedVariable = {};
    if (identity.label !== undefined) info.label = identity.label;
    if (childNamed(sdtPr, 'showingPlcHdr') === null) {
      info.value = isBlock ? paragraphs.map((p) => textOf(p)).join('\n') : textOf(content);
    }
    sdt.parentNode?.replaceChild(replacement, sdt);
    collector.add(sdt, identity.name, info);
    changed = true;
  }
  return changed;
}
