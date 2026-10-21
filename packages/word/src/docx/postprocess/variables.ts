import type { AsterVariable } from '@aster-editor/core';
import { DEFAULT_VARIABLE_PATTERN } from '../preprocess/names.js';
import type { CollectedVariable } from '../preprocess/variables.js';
import { wrapVariablePlaceholders, type VariableMatcher } from '../../paste/passes/variables.js';
import type { DocxVariableOptions, VariableDetection } from '../types.js';
import type { PostprocessPass } from './types.js';

/**
 * Post-traitement des variables après mammoth : `{{nom}}` dans le HTML (saisi tel quel
 * dans Word, ou produit par le prétraitement des champs et contrôles) devient une puce
 * `<span data-aster-variable>`. Le moteur de remplacement est celui de la passe de
 * collage ; ce module ajoute les libellés collectés et la construction de
 * `DocxImportResult.variables`.
 */

/** Options de variables résolues, valeurs par défaut appliquées. */
export interface ResolvedDocxVariableOptions {
  readonly braces: boolean;
  readonly mergeFields: boolean;
  readonly contentControls: boolean;
  readonly pattern?: RegExp;
}

/** Les trois détections sont actives par défaut. */
const ALL_DETECTIONS: readonly VariableDetection[] = ['braces', 'mergeFields', 'contentControls'];

/** Applique les valeurs par défaut de `DocxImportOptions.variables`. */
export function resolveDocxVariableOptions(
  options: DocxVariableOptions | undefined,
): ResolvedDocxVariableOptions {
  const detect = options?.detect ?? ALL_DETECTIONS;
  const resolved: ResolvedDocxVariableOptions = {
    braces: detect.includes('braces'),
    mergeFields: detect.includes('mergeFields'),
    contentControls: detect.includes('contentControls'),
  };
  return options?.pattern ? { ...resolved, pattern: options.pattern } : resolved;
}

/**
 * Motifs à reconnaître dans le HTML : le motif personnalisé (ou `{{nom}}`) si `braces`
 * est actif ; et, dès que le prétraitement a produit des runs `{{nom}}`, ce format
 * **restreint aux noms collectés**, pour que `braces` désactivé ou un motif
 * personnalisé n'entraînent pas la conversion d'un `{{texte}}` saisi librement.
 */
export function variablePatterns(
  options: ResolvedDocxVariableOptions,
  collected: ReadonlyMap<string, CollectedVariable>,
): VariableMatcher[] {
  const patterns: VariableMatcher[] = [];
  if (options.braces) patterns.push({ pattern: options.pattern ?? DEFAULT_VARIABLE_PATTERN });
  const bracesAlreadyFree = patterns.some(
    (matcher) => matcher.pattern === DEFAULT_VARIABLE_PATTERN,
  );
  if (collected.size > 0 && !bracesAlreadyFree) {
    patterns.push({ pattern: DEFAULT_VARIABLE_PATTERN, only: new Set(collected.keys()) });
  }
  return patterns;
}

/**
 * Passe de post-traitement : pose les puces sur tout le corps, hors `<pre>`/`<code>`,
 * avec les libellés connus. Sans motif (toutes détections désactivées), ne fait rien.
 */
export function createVariablesPass(
  patterns: readonly VariableMatcher[],
  collected: ReadonlyMap<string, CollectedVariable>,
): PostprocessPass {
  const labels = new Map<string, string>();
  for (const [name, info] of collected) {
    if (info.label !== undefined) labels.set(name, info.label);
  }
  return (doc) => {
    wrapVariablePlaceholders(doc, doc.body, { patterns, labels });
  };
}

/**
 * Liste finale des variables : celles présentes dans le HTML, dans l'ordre d'apparition,
 * enrichies des libellés et valeurs collectés ; puis celles collectées hors du corps
 * (en-têtes, pieds de page, que mammoth ne rend pas), pour que l'intégrateur les connaisse.
 */
export function collectResultVariables(
  doc: Document,
  collected: ReadonlyMap<string, CollectedVariable>,
): AsterVariable[] {
  const seen = new Set<string>();
  const result: AsterVariable[] = [];
  const push = (name: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    const info = collected.get(name);
    const variable: { name: string; label?: string; value?: string } = { name };
    if (info?.label !== undefined) variable.label = info.label;
    if (info?.value !== undefined) variable.value = info.value;
    result.push(variable);
  };
  for (const chip of Array.from(doc.body.querySelectorAll('span[data-aster-variable]'))) {
    const name = chip.getAttribute('data-aster-variable');
    if (name) push(name);
  }
  for (const name of collected.keys()) push(name);
  return result;
}
