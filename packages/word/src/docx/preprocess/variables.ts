import JSZip from 'jszip';
import { replaceContentControls } from './content-controls';
import { replaceComplexFields, replaceSimpleFields } from './fields';
import { DEFAULT_VARIABLE_PATTERN, isVariableName } from './names';
import { allNamed, PartCollector, type CollectedVariable } from './xml-utils';

/**
 * Prétraitement du .docx **avant** mammoth : mammoth perd les champs de fusion
 * (`MERGEFIELD`) et traverse les contrôles de contenu (`w:sdt`) en gardant leur texte.
 * On réécrit donc le XML des parties texte (corps, en-têtes, pieds de page, notes) pour
 * remplacer chacun par un run `{{nom}}`, que le post-traitement HTML transformera
 * ensuite en puce. Tout le reste du XML (`HYPERLINK`, `PAGE`, `TOC`, `w:rPr`, mise en
 * page) est laissé intact. Les transformations elles-mêmes vivent dans `fields.ts` et
 * `content-controls.ts`. Les parties sont localisées par les relations du paquet
 * (`_rels/.rels`, puis `word/_rels/<corps>.rels`), avec repli sur les noms usuels.
 */

export type { CollectedVariable } from './xml-utils';
export { mergeFieldName } from './fields';

/** Ce que le prétraitement doit détecter. Sans aucune détection, le zip n'est pas ouvert. */
export interface PreprocessVariablesOptions {
  /** `w:fldSimple` et champs complexes `w:fldChar` portant `MERGEFIELD`. */
  readonly mergeFields: boolean;
  /** `w:sdt` avec `w:tag` ou `w:alias`. */
  readonly contentControls: boolean;
  /**
   * `{{nom}}` tapé dans les en-têtes et pieds de page, que mammoth ne rend pas : les noms
   * sont seulement collectés (aucune réécriture), avec `pattern` ou la syntaxe par défaut.
   */
  readonly braces?: boolean;
  /** Motif de la détection `braces`, groupe 1 = nom. `{{nom}}` par défaut. */
  readonly pattern?: RegExp;
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

/** Rôle d'une partie texte, qui fixe l'ordre de lecture et la recherche des `{{nom}}`. */
type PartKind = 'main' | 'header' | 'footer' | 'notes';

/** Partie texte à traiter : chemin dans le zip et rôle. */
interface TextPart {
  readonly name: string;
  readonly kind: PartKind;
}

/** Relation OPC lue dans un fichier `.rels`. */
interface Relationship {
  readonly type: string;
  readonly target: string;
}

/** Ordre de lecture : le corps d'abord, puis en-têtes, pieds de page, notes. */
const PART_ORDER: Readonly<Record<PartKind, number>> = { main: 0, header: 1, footer: 2, notes: 3 };

/** Nom usuel du corps, quand `_rels/.rels` ne le désigne pas. */
const DEFAULT_MAIN_PART = 'word/document.xml';

/** Repli sans relations : corps `document.xml` (ou `document2.xml`…) dans `word/`. */
const MAIN_PART_FALLBACK = /^word\/document\d*\.xml$/;

/** Repli sans relations du corps : parties secondaires par nom usuel, dans le dossier du corps. */
const SECONDARY_PART_FALLBACK = /^(header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/** Type de relation (suffixe) → rôle de la partie cible. */
const RELATED_KINDS: ReadonlyArray<readonly [string, PartKind]> = [
  ['/header', 'header'],
  ['/footer', 'footer'],
  ['/footnotes', 'notes'],
  ['/endnotes', 'notes'],
];

/** Marque d'ordre des octets qu'un éditeur peut avoir posée avant `<?xml`. */
const BOM = String.fromCharCode(0xfeff);

/** Fin de paragraphe dans le XML brut, pour ne pas recoller un `{{` sur deux paragraphes. */
const PARAGRAPH_END = /<\/(?:\w+:)?p>/;

/** Contenu d'un `w:t` dans le XML brut (`<w:t>`, `<w:t xml:space="preserve">`), groupe 1 = texte. */
const TEXT_ELEMENT = /<(?:\w+:)?t(?:\s[^>]*)?>([^<]*)<\/(?:\w+:)?t>/g;

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
 * Vrai si la partie contient au moins une balise à transformer selon les options. Un
 * simple test sur le texte évite le parse DOM, de loin le plus coûteux, des parties
 * (en-têtes, notes, corps sans champ) qui n'ont rien à y gagner.
 */
function hasVariableMarkers(xml: string, options: PreprocessVariablesOptions): boolean {
  const names: string[] = [];
  if (options.mergeFields) names.push('fldSimple', 'fldChar');
  if (options.contentControls) names.push('sdt');
  if (names.length === 0) return false;
  return new RegExp(`<(?:\\w+:)?(?:${names.join('|')})\\b`).test(xml);
}

/**
 * Transforme une partie XML. Renvoie le XML réécrit, ou `null` si rien n'a changé (y
 * compris sans balise de champ ni de contrôle : la partie n'est alors même pas parsée).
 * Lève si le XML est illisible ; l'appelant décide alors de passer outre.
 */
export function transformVariablesXml(
  xml: string,
  options: PreprocessVariablesOptions,
  variables: Map<string, CollectedVariable>,
  codec: XmlCodec = defaultCodec(),
): string | null {
  const source = xml.startsWith(BOM) ? xml.slice(BOM.length) : xml;
  if (!hasVariableMarkers(source, options)) return null;
  const doc = codec.parse(source);
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
  return xmlDeclaration(source) + codec.serialize(doc);
}

/** Entités XML prédéfinies, les seules qu'un `w:t` peut contenir. */
function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Collecte les `{{nom}}` tapés dans un en-tête ou un pied de page, paragraphe par
 * paragraphe, directement sur le XML brut (les `w:t` d'un paragraphe sont recollés, un
 * `{{` coupé sur deux runs est donc reconnu). Aucune réécriture : mammoth ne rend pas
 * ces parties, on informe seulement l'intégrateur.
 */
export function collectBracesInXml(
  xml: string,
  pattern: RegExp,
  variables: Map<string, CollectedVariable>,
): void {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  for (const paragraph of xml.split(PARAGRAPH_END)) {
    const text = Array.from(paragraph.matchAll(TEXT_ELEMENT), (m) => decodeXmlText(m[1] ?? ''))
      .join('')
      .trim();
    if (text === '') continue;
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text)) !== null) {
      if (match[0].length === 0) {
        matcher.lastIndex += 1;
        continue;
      }
      const name = (match[1] ?? '').trim();
      if (isVariableName(name) && !variables.has(name)) variables.set(name, {});
    }
  }
}

/** Relations d'un fichier `.rels`, liste vide s'il manque ou est illisible. */
async function readRelationships(
  zip: JSZip,
  path: string,
  codec: XmlCodec,
): Promise<Relationship[]> {
  const file = zip.file(path);
  if (!file) return [];
  try {
    const doc = codec.parse(await file.async('string'));
    if (doc.getElementsByTagName('parsererror').length > 0) return [];
    return allNamed(doc, 'Relationship')
      .filter((rel) => rel.getAttribute('TargetMode') !== 'External')
      .map((rel) => ({
        type: rel.getAttribute('Type') ?? '',
        target: rel.getAttribute('Target') ?? '',
      }));
  } catch {
    return [];
  }
}

/** Chemin d'une cible de relation dans le zip : absolu (`/word/x.xml`) ou relatif au dossier source. */
function resolveTarget(baseDir: string, target: string): string {
  const segments = (target.startsWith('/') ? target.slice(1) : baseDir + target).split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join('/');
}

/** Corps du document : cible `officeDocument` de `_rels/.rels`, sinon `word/document.xml`. */
async function locateMainPart(zip: JSZip, codec: XmlCodec): Promise<string | null> {
  const root = await readRelationships(zip, '_rels/.rels', codec);
  const office = root.find((rel) => rel.type.endsWith('/officeDocument'));
  if (office) {
    const target = resolveTarget('', office.target);
    if (zip.file(target)) return target;
  }
  if (zip.file(DEFAULT_MAIN_PART)) return DEFAULT_MAIN_PART;
  return zip.file(MAIN_PART_FALLBACK)[0]?.name ?? null;
}

/**
 * Parties texte du paquet, corps d'abord : en-têtes, pieds de page et notes sont lus dans
 * les relations du corps (`word/_rels/document.xml.rels`), ou, sans ce fichier, par leur
 * nom usuel dans le dossier du corps.
 */
async function locateTextParts(zip: JSZip, codec: XmlCodec): Promise<TextPart[]> {
  const main = await locateMainPart(zip, codec);
  if (main === null) return [];
  const dir = main.slice(0, main.lastIndexOf('/') + 1);
  const relsPath = `${dir}_rels/${main.slice(dir.length)}.rels`;
  const parts: TextPart[] = [{ name: main, kind: 'main' }];
  if (zip.file(relsPath)) {
    for (const rel of await readRelationships(zip, relsPath, codec)) {
      const kind = RELATED_KINDS.find(([suffix]) => rel.type.endsWith(suffix))?.[1];
      if (!kind) continue;
      const name = resolveTarget(dir, rel.target);
      if (zip.file(name) && !parts.some((part) => part.name === name)) parts.push({ name, kind });
    }
  } else {
    for (const file of zip.file(/\.xml$/)) {
      if (!file.name.startsWith(dir) || file.name === main) continue;
      const base = file.name.slice(dir.length);
      if (!SECONDARY_PART_FALLBACK.test(base)) continue;
      const kind: PartKind = base.startsWith('header')
        ? 'header'
        : base.startsWith('footer')
          ? 'footer'
          : 'notes';
      parts.push({ name: file.name, kind });
    }
  }
  return parts.sort((a, b) => PART_ORDER[a.kind] - PART_ORDER[b.kind]);
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
  const scanBraces = options.braces === true;
  if (!options.mergeFields && !options.contentControls && !scanBraces) {
    return { buffer, variables, changed: false };
  }
  const resolvedCodec = codec ?? defaultCodec();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { buffer, variables, changed: false };
  }
  let changed = false;
  for (const part of await locateTextParts(zip, resolvedCodec)) {
    const xml = await zip.file(part.name)?.async('string');
    if (xml === undefined) continue;
    const rewritten = transformVariablesXml(xml, options, variables, resolvedCodec);
    if (rewritten !== null) {
      zip.file(part.name, rewritten);
      changed = true;
    }
    if (scanBraces && (part.kind === 'header' || part.kind === 'footer')) {
      collectBracesInXml(xml, options.pattern ?? DEFAULT_VARIABLE_PATTERN, variables);
    }
  }
  if (!changed) return { buffer, variables, changed };
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  // Copie dans un `ArrayBuffer` neuf : la vue de jszip peut partager un pool plus large.
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return { buffer: output, variables, changed };
}
