import { childNamed } from '../preprocess/xml-utils';
import type { DocxPackage } from '../reader/types';
import { PART_CONTENT_TYPES } from './content-types';
import { REL_TYPE, type RelationshipTable } from './relationships';
import {
  directoryOf,
  insertOrdered,
  removeWordAttr,
  wordAttr,
  wordElement,
  type PartStore,
} from './xml-io';

/**
 * Réglages du document (`settings.xml`) que la greffe doit poser pour que Word honore le
 * corps greffé : `w:updateFields` avec une table des matières (sinon le champ `TOC` reste
 * vide, sans numéros de page) et `w:evenAndOddHeaders` quand un en-tête ou un pied de
 * pages paires est greffé (sinon Word ne l'affiche jamais). Rien d'autre n'est touché ;
 * un réglage déjà actif laisse la partie intacte à l'octet, un réglage à `false` est
 * basculé, une partie absente est créée (relation et type de contenu compris).
 */

/** Espace de noms principal de WordprocessingML, pour une partie créée. */
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const SETTINGS_FILE = 'settings.xml';

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Valeurs de `w:val` qui désactivent un réglage booléen (`ST_OnOff`). */
const OFF_VALUES: ReadonlySet<string> = new Set(['false', '0', 'off']);

/** Ordre du schéma (`CT_Settings`) des enfants que la greffe peut avoir à insérer, et de leurs voisins. */
const SETTINGS_ORDER: readonly string[] = [
  'writeProtection',
  'view',
  'zoom',
  'removePersonalInformation',
  'removeDateAndTime',
  'doNotDisplayPageBoundaries',
  'displayBackgroundShape',
  'printPostScriptOverText',
  'printFractionalCharacterWidth',
  'printFormsData',
  'embedTrueTypeFonts',
  'embedSystemFonts',
  'saveSubsetFonts',
  'saveFormsData',
  'mirrorMargins',
  'alignBordersAndEdges',
  'bordersDoNotSurroundHeader',
  'bordersDoNotSurroundFooter',
  'gutterAtTop',
  'hideSpellingErrors',
  'hideGrammaticalErrors',
  'activeWritingStyle',
  'proofState',
  'formsDesign',
  'attachedTemplate',
  'linkStyles',
  'stylePaneFormatFilter',
  'stylePaneSortMethod',
  'documentType',
  'mailMerge',
  'revisionView',
  'trackRevisions',
  'doNotTrackMoves',
  'doNotTrackFormatting',
  'documentProtection',
  'autoFormatOverride',
  'styleLockTheme',
  'styleLockQFSet',
  'defaultTabStop',
  'autoHyphenation',
  'consecutiveHyphenLimit',
  'hyphenationZone',
  'doNotHyphenateCaps',
  'showEnvelope',
  'summaryLength',
  'clickAndTypeStyle',
  'defaultTableStyle',
  'evenAndOddHeaders',
  'bookFoldRevPrinting',
  'bookFoldPrinting',
  'bookFoldPrintingSheets',
  'drawingGridHorizontalSpacing',
  'drawingGridVerticalSpacing',
  'displayHorizontalDrawingGridEvery',
  'displayVerticalDrawingGridEvery',
  'doNotUseMarginsForDrawingGridOrigin',
  'drawingGridHorizontalOrigin',
  'drawingGridVerticalOrigin',
  'doNotShadeFormData',
  'noPunctuationKerning',
  'characterSpacingControl',
  'printTwoOnOne',
  'strictFirstAndLastChars',
  'noLineBreaksAfter',
  'noLineBreaksBefore',
  'savePreviewPicture',
  'doNotValidateAgainstSchema',
  'saveInvalidXml',
  'ignoreMixedContent',
  'alwaysShowPlaceholderText',
  'doNotDemarcateInvalidXml',
  'saveXmlDataOnly',
  'useXSLTWhenSaving',
  'saveThroughXslt',
  'showXMLTags',
  'alwaysMergeEmptyNamespace',
  'updateFields',
  'hdrShapeDefaults',
  'footnotePr',
  'endnotePr',
  'compat',
  'docVars',
  'rsids',
  'mathPr',
  'attachedSchema',
  'themeFontLang',
  'clrSchemeMapping',
  'doNotIncludeSubdocsInStats',
  'doNotAutoCompressPictures',
  'forceUpgrade',
  'captions',
  'readModeInkLockDown',
  'smartTagType',
  'schemaLibrary',
  'shapeDefaults',
  'doNotEmbedSmartTags',
  'decimalSymbol',
  'listSeparator',
];

export interface SettingsMergeInput {
  readonly template: PartStore;
  readonly pkg: DocxPackage;
  readonly mainPart: string;
  readonly relationships: RelationshipTable;
  /** `Override` à ajouter à `[Content_Types].xml` si la partie est créée. */
  readonly overrides: Map<string, string>;
  /** Poser `<w:updateFields w:val="true"/>` (table des matières). */
  readonly updateFields?: boolean;
  /** Poser `<w:evenAndOddHeaders/>` (en-tête ou pied de pages paires greffé). */
  readonly evenAndOddHeaders?: boolean;
}

/**
 * Active un réglage booléen : créé à sa place dans l'ordre du schéma s'il manque (avec
 * les attributs donnés), `w:val` désactivant retiré s'il est à `false` (sans `w:val`,
 * `ST_OnOff` vaut vrai). Rend vrai si la partie a changé.
 */
function switchOn(
  root: Element,
  localName: string,
  attributes: Readonly<Record<string, string>> = {},
): boolean {
  const existing = childNamed(root, localName);
  if (!existing) {
    insertOrdered(root, wordElement(root, localName, attributes), SETTINGS_ORDER);
    return true;
  }
  if (!OFF_VALUES.has(wordAttr(existing, 'val').trim().toLowerCase())) return false;
  removeWordAttr(existing, 'val');
  return true;
}

/**
 * Pose les réglages demandés dans `settings.xml` du gabarit. Rend le chemin de la partie
 * si elle a été réécrite ou créée, `null` sinon.
 */
export async function ensureSettings(input: SettingsMergeInput): Promise<string | null> {
  if (!input.updateFields && !input.evenAndOddHeaders) return null;
  let path = await input.pkg.related(input.mainPart, '/settings');
  let doc = path ? await input.template.dom(path) : null;
  let created = false;
  if (!doc) {
    path = `${directoryOf(input.mainPart)}${SETTINGS_FILE}`;
    doc = input.template.parse(`<w:settings xmlns:w="${W_NS}"/>`);
    input.template.create(path, doc, DECLARATION);
    await input.relationships.ensure(REL_TYPE.settings, path, false);
    input.overrides.set(path, PART_CONTENT_TYPES.settings);
    created = true;
  }
  const root = doc.documentElement;
  let changed = created;
  if (input.updateFields) changed = switchOn(root, 'updateFields', { val: 'true' }) || changed;
  if (input.evenAndOddHeaders) changed = switchOn(root, 'evenAndOddHeaders') || changed;
  if (!changed || !path) return null;
  await input.template.markChanged(path);
  return path;
}
