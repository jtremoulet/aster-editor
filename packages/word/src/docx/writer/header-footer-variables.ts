import type { VariableSettings } from '../../export/context';
import type { DocxExportWarning } from '../../export/types';
import { variableValue } from '../../export/variables';
import { transformVariablesXml, type CollectedVariable } from '../preprocess/variables';
import { allNamed, stripXmlDeclaration } from '../preprocess/xml-utils';
import type { DocxPackage } from '../reader/types';
import { xmlDeclarationOf, type PartStore, type XmlCodec } from './xml-io';

/**
 * Variables des en-têtes et pieds de page du gabarit en mode `resolve` : les champs de
 * fusion (`MERGEFIELD` simples et complexes) et contrôles de contenu deviennent des runs
 * texte (même prétraitement qu'à l'import, mise en forme du résultat conservée), puis
 * chaque `{{nom}}` d'un `w:t`, qu'il vienne d'un champ ou qu'il ait été tapé, est remplacé
 * par `values[nom]`. Sans valeur, `{{nom}}` reste avec `variable-unresolved`. Une partie
 * sans variable n'est pas réécrite ; en modes `fields` et `placeholders`, rien n'est touché.
 * Limite : un `{{nom}}` tapé à cheval sur deux runs n'est pas reconnu.
 */

/** Espace de noms de `xml:space`. */
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** Types de relations des parties d'en-tête et de pied. */
const HEADER_FOOTER_TYPES = ['/header', '/footer'] as const;

export interface HeaderFooterVariablesInput {
  readonly template: PartStore;
  readonly pkg: DocxPackage;
  readonly mainPart: string;
  readonly settings: VariableSettings;
  readonly codec: XmlCodec;
  readonly warnings: DocxExportWarning[];
}

/** Parties d'en-tête et de pied référencées par la partie principale (chemins du zip, dédoublonnés). */
export async function headerFooterParts(pkg: DocxPackage, mainPart: string): Promise<string[]> {
  const paths: string[] = [];
  for (const rel of (await pkg.rels(mainPart)).values()) {
    if (rel.external || !HEADER_FOOTER_TYPES.some((suffix) => rel.type.endsWith(suffix))) continue;
    if (!paths.includes(rel.target)) paths.push(rel.target);
  }
  return paths;
}

/**
 * Remplace les `{{nom}}` des `w:t` du document par leur valeur. Rend vrai si un texte a
 * changé. Les noms sans valeur sont signalés une fois chacun.
 */
export function resolveVariablesInTexts(
  doc: Document,
  settings: VariableSettings,
  warnings: DocxExportWarning[],
): boolean {
  let changed = false;
  const unresolved = new Set<string>();
  for (const text of allNamed(doc, 't')) {
    const original = text.textContent ?? '';
    const pattern = new RegExp(settings.pattern.source, settings.pattern.flags);
    const replaced = original.replace(pattern, (raw: string, ...groups: unknown[]) => {
      const name = typeof groups[0] === 'string' ? groups[0].trim() : '';
      if (name === '') return raw;
      const value = variableValue(name, settings);
      if (value === undefined) {
        unresolved.add(name);
        return raw;
      }
      // Un résultat de champ tient sur une ligne dans un en-tête : les sauts deviennent des espaces.
      return value.replace(/\r?\n/g, ' ');
    });
    if (replaced === original) continue;
    text.textContent = replaced;
    if (/^\s|\s$/.test(replaced)) text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    changed = true;
  }
  for (const name of unresolved) {
    const message = `Variable {{${name}}} sans valeur dans un en-tête ou un pied, laissée en texte`;
    if (!warnings.some((warning) => warning.message === message)) {
      warnings.push({ code: 'variable-unresolved', message });
    }
  }
  return changed;
}

/**
 * Résout les variables des en-têtes et pieds du gabarit (mode `resolve` seulement). Les
 * parties modifiées sont réécrites dans le paquet, les autres restent intactes.
 */
export async function resolveHeaderFooterVariables(
  input: HeaderFooterVariablesInput,
): Promise<void> {
  if (input.settings.mode !== 'resolve') return;
  for (const path of await headerFooterParts(input.pkg, input.mainPart)) {
    const xml = await input.template.text(path);
    if (xml === null) continue;
    let rewritten: string | null;
    try {
      const collected = new Map<string, CollectedVariable>();
      rewritten = transformVariablesXml(
        xml,
        { mergeFields: true, contentControls: true },
        collected,
        input.codec,
      );
    } catch {
      // XML illisible pour le prétraitement : la partie est laissée telle quelle.
      rewritten = null;
    }
    let doc: Document;
    try {
      doc = input.codec.parse(rewritten ?? xml);
    } catch {
      continue;
    }
    if (doc.documentElement.localName === 'parsererror') continue;
    const changed = resolveVariablesInTexts(doc, input.settings, input.warnings);
    if (rewritten === null && !changed) continue;
    input.template.write(
      path,
      xmlDeclarationOf(xml) + stripXmlDeclaration(input.codec.serialize(doc)),
    );
  }
}
