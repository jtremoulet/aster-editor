import type { ParagraphChild } from 'docx';
import { warn, type ExportContext, type VariableSettings } from './context.js';
import { sanitizeXmlText } from './sanitize.js';
import type { DocxExportVariableOptions } from './types.js';

/** Attribut HTML qui marque une puce de variable, convention du core. */
export const VARIABLE_ATTRIBUTE = 'data-aster-variable';

/**
 * Motif par défaut des variables en texte brut : `{{nom}}`, nom en lettres, chiffres,
 * `_`, `.`, `-` (alphabet d'`AsterVariable.name`), blancs tolérés autour du nom.
 */
export const DEFAULT_VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

/**
 * Motif global à `lastIndex` neutre : un `RegExp` fourni par l'intégrateur peut être
 * partagé entre appels ou dépourvu du drapeau `g`, on en recompile toujours une copie.
 * Le drapeau `y` (sticky) est retiré : il n'autoriserait une occurrence qu'à `lastIndex`
 * exactement et ferait manquer toute variable précédée de texte.
 */
function globalPattern(pattern: RegExp | undefined): RegExp {
  const source = pattern ?? DEFAULT_VARIABLE_PATTERN;
  const flags = source.flags.replace('y', '');
  return new RegExp(source.source, flags.includes('g') ? flags : `${flags}g`);
}

/** Options effectives à partir de `DocxExportOptions.variables`. */
export function resolveVariableSettings(
  options: DocxExportVariableOptions | undefined,
): VariableSettings {
  return {
    mode: options?.mode ?? 'placeholders',
    values: options?.values ?? {},
    pattern: globalPattern(options?.pattern),
  };
}

/** Nom lu sur une puce `<span data-aster-variable>`, `null` si absent ou vide. */
export function variableNameOf(element: Element): string | null {
  const raw = element.getAttribute(VARIABLE_ATTRIBUTE);
  if (raw === null) return null;
  const name = sanitizeXmlText(raw).trim();
  return name === '' ? null : name;
}

/** Segment d'un texte brut après découpe sur le motif : texte simple ou variable. */
export type TextSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'variable'; readonly name: string; readonly raw: string };

/**
 * Découpe un texte brut sur le motif des variables. En mode `placeholders` le texte est
 * rendu d'un bloc : rien à substituer. Un motif sans groupe de capture ou qui capture
 * une chaîne vide est ignoré pour cette occurrence, le texte reste tel quel.
 */
export function splitVariables(text: string, settings: VariableSettings): TextSegment[] {
  if (settings.mode === 'placeholders' || text === '') return [{ kind: 'text', text }];
  const pattern = settings.pattern;
  pattern.lastIndex = 0;
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const raw = match[0];
    // Un motif qui peut capturer la chaîne vide ferait boucler `exec` : on avance d'un cran.
    if (raw === '') {
      pattern.lastIndex += 1;
      continue;
    }
    const name = match[1]?.trim() ?? '';
    if (name === '') continue;
    if (match.index > cursor)
      segments.push({ kind: 'text', text: text.slice(cursor, match.index) });
    segments.push({ kind: 'variable', name, raw });
    cursor = match.index + raw.length;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

/**
 * Valeur connue d'une variable, assainie pour le XML, `undefined` sinon. `values` est
 * typé `Record<string, string>` mais vient souvent d'un JSON ou d'un formulaire : un
 * nombre ou un booléen (`42`, `true`) est converti plutôt que de faire échouer l'export.
 */
export function variableValue(name: string, settings: VariableSettings): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(settings.values, name)) return undefined;
  const value: unknown = settings.values[name];
  if (value === undefined || value === null) return undefined;
  return sanitizeXmlText(typeof value === 'string' ? value : String(value));
}

/**
 * Valeur à écrire pour une variable en mode `resolve` : la valeur connue, sinon
 * `undefined` avec un avertissement `variable-unresolved` (l'appelant garde alors le
 * texte d'origine, `{{nom}}`).
 */
export function resolvedValue(name: string, ctx: ExportContext): string | undefined {
  const value = variableValue(name, ctx.variables);
  if (value === undefined) {
    warn(ctx, 'variable-unresolved', `Variable {{${name}}} sans valeur, laissée en texte`);
  }
  return value;
}

/** Caractères qui imposent de citer le nom d'un champ : blanc, guillemet, backslash. */
const FIELD_NAME_NEEDS_QUOTES = /[\s"\\]/;

/**
 * Nom de champ tel que Word le lit dans une instruction `MERGEFIELD` : nu quand il n'a
 * ni blanc, ni guillemet, ni backslash ; sinon entre guillemets, `\` et `"` échappés
 * (`"Nom \"long\""`). Sans cela, `MERGEFIELD Nom du client` ne désignerait que `Nom`.
 */
export function quoteFieldName(name: string): string {
  if (!FIELD_NAME_NEEDS_QUOTES.test(name)) return name;
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Champ de fusion Word pour une variable en mode `fields` : `MERGEFIELD nom`, avec la
 * valeur connue comme résultat de champ (ce que Word affiche tant qu'il n'a pas
 * fusionné), sinon le `«nom»` conventionnel de `SimpleMailMergeField`. Un résultat de
 * champ tient sur une ligne : les sauts de ligne de la valeur deviennent des espaces.
 * `fldSimple` ne porte pas de propriétés de run : les marques du span ne survivent pas
 * en ce mode.
 */
export function mergeField(name: string, ctx: ExportContext): ParagraphChild {
  const { SimpleField } = ctx.docx;
  const value = variableValue(name, ctx.variables);
  const instruction = ` MERGEFIELD ${quoteFieldName(name)} `;
  if (value === undefined) return new SimpleField(instruction, `«${name}»`);
  return new SimpleField(instruction, value.replace(/\r?\n/g, ' '));
}
