import JSZip from 'jszip';
import { replaceContentControls } from './content-controls';
import { replaceComplexFields, replaceSimpleFields } from './fields';
import { PartCollector, type CollectedVariable } from './xml-utils';

/**
 * Prétraitement du .docx **avant** mammoth : mammoth perd les champs de fusion
 * (`MERGEFIELD`) et traverse les contrôles de contenu (`w:sdt`) en gardant leur texte.
 * On réécrit donc le XML des parties texte (`document.xml`, en-têtes, pieds de page,
 * notes) pour remplacer chacun par un run `{{nom}}`, que le post-traitement HTML
 * transformera ensuite en puce. Tout le reste du XML (`HYPERLINK`, `PAGE`, `TOC`,
 * `w:rPr`, mise en page) est laissé intact. Les transformations elles-mêmes vivent dans
 * `fields.ts` et `content-controls.ts`.
 */

export type { CollectedVariable } from './xml-utils';
export { mergeFieldName } from './fields';

/** Ce que le prétraitement doit détecter. Sans aucun des deux, le zip n'est pas ouvert. */
export interface PreprocessVariablesOptions {
  /** `w:fldSimple` et champs complexes `w:fldChar` portant `MERGEFIELD`. */
  readonly mergeFields: boolean;
  /** `w:sdt` avec `w:tag` ou `w:alias`. */
  readonly contentControls: boolean;
}

/** Parseur et sérialiseur XML injectables. Par défaut `DOMParser` et `XMLSerializer` globaux. */
export interface XmlCodec {
  parse(xml: string): Document;
  serialize(doc: Document): string;
}

/** Résultat du prétraitement : le .docx (réécrit ou non) et les variables trouvées. */
export interface PreprocessVariablesResult {
  /** Octets du .docx à donner à mammoth. L'entrée d'origine si rien n'a changé. */
  readonly buffer: ArrayBuffer;
  /** Variables collectées, dans l'ordre de première apparition dans le document. */
  readonly variables: ReadonlyMap<string, CollectedVariable>;
  /** Vrai si au moins une partie XML a été réécrite. */
  readonly changed: boolean;
}

/** Parties XML porteuses de texte : corps, en-têtes, pieds de page, notes de bas de page et de fin. */
const TEXT_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/** Résout le codec XML sur les globaux, ou lève si l'environnement n'en a pas. */
function defaultCodec(): XmlCodec {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('prétraitement des variables : DOMParser ou XMLSerializer indisponible');
  }
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  return {
    parse: (xml) => parser.parseFromString(xml, 'application/xml'),
    serialize: (doc) => serializer.serializeToString(doc),
  };
}

/** Déclaration `<?xml …?>` d'origine, que `XMLSerializer` ne réémet pas. */
function xmlDeclaration(xml: string): string {
  if (!xml.startsWith('<?xml')) return '';
  const end = xml.indexOf('?>');
  return end === -1 ? '' : xml.slice(0, end + 2);
}

/**
 * Transforme une partie XML. Renvoie le XML réécrit, ou `null` si rien n'a changé.
 * Lève si le XML est illisible ; l'appelant décide alors de passer outre.
 */
export function transformVariablesXml(
  xml: string,
  options: PreprocessVariablesOptions,
  variables: Map<string, CollectedVariable>,
  codec: XmlCodec = defaultCodec(),
): string | null {
  const doc = codec.parse(xml);
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML Word illisible');
  }
  const collector = new PartCollector(doc);
  let changed = false;
  if (options.mergeFields) {
    changed = replaceSimpleFields(doc, collector) || changed;
    changed = replaceComplexFields(doc, collector) || changed;
  }
  if (options.contentControls) {
    changed = replaceContentControls(doc, collector) || changed;
  }
  collector.flushInto(variables);
  if (!changed) return null;
  return xmlDeclaration(xml) + codec.serialize(doc);
}

/** Le corps d'abord, pour que l'ordre des variables collectées suive la lecture. */
function partOrder(name: string): number {
  if (name === 'word/document.xml') return 0;
  if (name.startsWith('word/header')) return 1;
  if (name.startsWith('word/footer')) return 2;
  return 3;
}

/**
 * Ouvre le .docx, réécrit chaque partie texte et renvoie une archive neuve si quelque
 * chose a changé. Une archive que jszip ne sait pas ouvrir est rendue telle quelle,
 * sans bruit : c'est à mammoth de la rejeter (`invalid-docx`). Lève sur un XML
 * illisible ou un environnement sans DOM XML : `importDocx` reprend alors l'entrée
 * d'origine avec un avertissement.
 */
export async function preprocessVariables(
  buffer: ArrayBuffer,
  options: PreprocessVariablesOptions,
  codec?: XmlCodec,
): Promise<PreprocessVariablesResult> {
  const variables = new Map<string, CollectedVariable>();
  if (!options.mergeFields && !options.contentControls) {
    return { buffer, variables, changed: false };
  }
  const resolvedCodec = codec ?? defaultCodec();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { buffer, variables, changed: false };
  }
  const parts = zip.file(TEXT_PARTS).sort((a, b) => partOrder(a.name) - partOrder(b.name));
  let changed = false;
  for (const part of parts) {
    const xml = await part.async('string');
    const rewritten = transformVariablesXml(xml, options, variables, resolvedCodec);
    if (rewritten !== null) {
      zip.file(part.name, rewritten);
      changed = true;
    }
  }
  if (!changed) return { buffer, variables, changed };
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  // Copie dans un `ArrayBuffer` neuf : la vue de jszip peut partager un pool plus large.
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return { buffer: output, variables, changed };
}
