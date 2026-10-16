import type { ParagraphChild } from 'docx';
import { warn, type ExportContext, type VariableSettings } from './context';
import { sanitizeXmlText } from './sanitize';
import type { DocxExportVariableOptions } from './types';

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
 */
function globalPattern(pattern: RegExp | undefined): RegExp {
  const source = pattern ?? DEFAULT_VARIABLE_PATTERN;
  const flags = source.flags.includes('g') ? source.flags : `${source.flags}g`;
  return new RegExp(source.source, flags);
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

/** Valeur connue d'une variable, `undefined` sinon. */
export function variableValue(name: string, settings: VariableSettings): string | undefined {
  return Object.prototype.hasOwnProperty.call(settings.values, name)
    ? settings.values[name]
    : undefined;
}

/**
 * Texte à écrire pour une variable en mode `resolve` : la valeur connue, sinon le
 * texte d'origine (`{{nom}}`) avec un avertissement `variable-unresolved`.
 */
export function resolvedText(name: string, raw: string, ctx: ExportContext): string {
  const value = variableValue(name, ctx.variables);
  if (value !== undefined) return sanitizeXmlText(value);
  warn(ctx, 'variable-unresolved', `Variable {{${name}}} sans valeur, laissée en texte`);
  return raw;
}

/**
 * Champ de fusion Word pour une variable en mode `fields` : `MERGEFIELD nom`, avec la
 * valeur connue comme résultat de champ (ce que Word affiche tant qu'il n'a pas
 * fusionné), sinon le `«nom»` conventionnel de `SimpleMailMergeField`. `fldSimple` ne
 * porte pas de propriétés de run : les marques du span ne survivent pas en ce mode.
 */
export function mergeField(name: string, ctx: ExportContext): ParagraphChild {
  const { SimpleField, SimpleMailMergeField } = ctx.docx;
  const value = variableValue(name, ctx.variables);
  if (value === undefined) return new SimpleMailMergeField(name);
  return new SimpleField(` MERGEFIELD ${name} `, sanitizeXmlText(value));
}
