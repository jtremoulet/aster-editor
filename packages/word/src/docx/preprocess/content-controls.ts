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
 * bibliographie, sections répétées, case à cocher (`w14:checkbox`, dont le symbole
 * coché / décoché est du texte, pas une valeur).
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
  'checkbox',
]);

/**
 * Conteneurs transparents entre un contrôle et son paragraphe : un `w:sdt` dont le
 * parent, à travers ces éléments, est un `w:p` est un contrôle de ligne (inline).
 */
const TRANSPARENT_ANCESTORS: ReadonlySet<string> = new Set([
  'sdt',
  'sdtContent',
  'hyperlink',
  'ins',
  'del',
  'moveFrom',
  'moveTo',
  'smartTag',
  'customXml',
  'fldSimple',
  'dir',
  'bdo',
]);

/** Marqueurs tolérés comme frères des paragraphes d'un contrôle de bloc remplaçable. */
const BLOCK_MARKERS: ReadonlySet<string> = new Set(['bookmarkStart', 'bookmarkEnd', 'proofErr']);

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
 * Inline ou bloc se décide par le **parent** du contrôle, pas par son contenu : un
 * `w:sdt` qui, à travers les conteneurs transparents, descend d'un `w:p` est inline ;
 * tout autre (corps, cellule, en-tête, zone de texte) est un contrôle de bloc.
 */
function isInlineControl(sdt: Element): boolean {
  let ancestor = sdt.parentElement;
  while (ancestor && TRANSPARENT_ANCESTORS.has(ancestor.localName)) {
    ancestor = ancestor.parentElement;
  }
  return ancestor?.localName === 'p';
}

/**
 * Un contrôle de bloc n'est remplaçable que s'il ne contient que des paragraphes (et
 * des marqueurs) : une table, une ligne, une cellule, un contrôle structurel resté en
 * place ne doivent jamais être jetés. Renvoie les paragraphes, ou `null` pour laisser
 * le contrôle intact.
 */
function replaceableBlockParagraphs(content: Element): Element[] | null {
  const paragraphs = childrenNamed(content, 'p');
  if (paragraphs.length === 0) return null;
  const onlyParagraphs = Array.from(content.children).every(
    (child) => child.localName === 'p' || BLOCK_MARKERS.has(child.localName),
  );
  return onlyParagraphs ? paragraphs : null;
}

/**
 * `w:sdt` avec `w:tag` (sinon `w:alias` normalisé) → run `{{nom}}`. Un contrôle inline
 * (sous un paragraphe) devient un run ; un contrôle de bloc fait de paragraphes devient
 * un paragraphe unique qui garde le `w:pPr` du premier ; un contrôle de bloc contenant
 * autre chose (table, ligne, cellule) est laissé intact. Parcours en ordre inverse pour
 * traiter les contrôles imbriqués avant leur conteneur.
 */
export function replaceContentControls(doc: Document, collector: PartCollector): boolean {
  let changed = false;
  for (const sdt of allNamed(doc, 'sdt').reverse()) {
    const sdtPr = childNamed(sdt, 'sdtPr');
    const content = childNamed(sdt, 'sdtContent');
    if (!sdtPr || !content) continue;
    const identity = contentControlIdentity(sdtPr);
    if (!identity) continue;
    const inline = isInlineControl(sdt);
    const paragraphs = inline ? null : replaceableBlockParagraphs(content);
    if (!inline && paragraphs === null) continue;
    // Le texte de remplissage porte le style `PlaceholderText`, qu'on ne reprend pas.
    const showingPlaceholder = childNamed(sdtPr, 'showingPlcHdr') !== null;
    const rPr = showingPlaceholder
      ? childNamed(sdtPr, 'rPr')
      : (firstRunProperties(allNamed(content, 'r')) ?? childNamed(sdtPr, 'rPr'));
    const run = createVariableRun(sdt, identity.name, rPr);
    let replacement = run;
    if (paragraphs !== null) {
      replacement = createParagraphLike(paragraphs[0], sdt);
      replacement.appendChild(run);
    }
    const info: CollectedVariable = {};
    if (identity.label !== undefined) info.label = identity.label;
    if (!showingPlaceholder) {
      info.value = paragraphs ? paragraphs.map((p) => textOf(p)).join('\n') : textOf(content);
    }
    collector.add(sdt, identity.name, info, run);
    sdt.parentNode?.replaceChild(replacement, sdt);
    changed = true;
  }
  return changed;
}
