import { untracked } from '@angular/core';
import type {
  AsterEditor,
  AsterVariable,
  DocumentLayout,
  PasteTransformer,
  UploadHandler,
  VariableValues,
} from '@aster-editor/core';
import type {
  DocxExportOptions,
  DocxImportOptions,
  DocxImportResult,
  FidelityReport,
} from '@aster-editor/word';

/**
 * Logique Word du composant, hors de la classe pour la garder lisible : chaque fonction
 * charge `@aster-editor/word` par `import()` au moment de l'appel, le paquet reste donc
 * optionnel et hors du bundle initial (mammoth, la lib `docx` et le comparateur ne sont
 * téléchargés qu'au premier usage).
 */

/** Chemin de lecture d'un `.docx` : `styled` (lecteur OOXML d'Aster) ou `semantic` (mammoth). */
export type DocxImportFidelity = NonNullable<DocxImportOptions['fidelity']>;

/** Objet Word non représentable signalé par l'import (`DocxImportResult.lost`). */
export type DocxLostObject = DocxImportResult['lost'][number];

/**
 * Ce que le composant sait au moment d'importer : hook d'upload et chemin de lecture.
 * `fidelity` absent = défaut de la lib (`styled` depuis la 0.6) : le composant ne force
 * plus de valeur, seul un `importFidelity` explicite est transmis.
 */
export interface WordImportDefaults {
  readonly upload: UploadHandler | undefined;
  readonly fidelity: DocxImportFidelity | undefined;
}

/** Import d'un fichier avec le hook d'upload de l'éditeur et le chemin de lecture demandé. */
export async function importWord(
  file: File,
  defaults: WordImportDefaults,
): Promise<DocxImportResult> {
  const { importDocx } = await import('@aster-editor/word');
  return importDocx(file, {
    ...(defaults.upload ? { upload: defaults.upload } : {}),
    ...(defaults.fidelity ? { fidelity: defaults.fidelity } : {}),
  });
}

/** Ce que le composant conserve d'un import et qui complète les options d'export. */
export interface WordExportDefaults {
  /** Gabarit importé (`DocxImportResult.template`), `null` sans import. */
  readonly template: ArrayBuffer | null;
  /** Mise en page effective (import, input `layout` ou dialogue « Mise en page »). */
  readonly layout: DocumentLayout | null;
  /** Utiliser le gabarit importé quand `options.template` est absent. */
  readonly inTemplate: boolean;
}

/**
 * Complète les options d'export avec ce que le composant sait : les valeurs du magasin de
 * variables quand `options.variables.values` manque, le gabarit importé quand
 * `options.template` manque et que `inTemplate` l'autorise, la mise en page effective quand
 * `options.layout` manque. Avec un gabarit, `layout` ne sert qu'à régénérer un en-tête ou
 * un pied modifié (`layout.headers` / `footers` différents de ceux du gabarit) ; le reste
 * (format, marges, styles) vient du gabarit. Sans gabarit, `layout` pilote l'export neuf.
 */
export function resolveExportOptions(
  editor: AsterEditor,
  options: DocxExportOptions,
  defaults: WordExportDefaults,
): DocxExportOptions {
  const variables = {
    ...options.variables,
    values: options.variables?.values ?? editor.variables.getValues(),
  };
  const template =
    options.template ?? (defaults.inTemplate && defaults.template ? defaults.template : undefined);
  const layout = options.layout ?? defaults.layout ?? undefined;
  return {
    ...options,
    variables,
    ...(template !== undefined ? { template } : {}),
    ...(layout !== undefined ? { layout } : {}),
  };
}

/** Export du document courant avec des options déjà résolues. */
export async function exportWord(editor: AsterEditor, options: DocxExportOptions): Promise<Blob> {
  const { exportDocx } = await import('@aster-editor/word');
  return exportDocx(editor.getHTML(), options);
}

/** Rapport de fidélité entre le gabarit importé et un export produit dans ce gabarit. */
export async function compareWithTemplate(
  template: ArrayBuffer,
  exported: Blob,
): Promise<FidelityReport> {
  const { compareDocx } = await import('@aster-editor/word');
  return compareDocx(template, await exported.arrayBuffer());
}

/** Transformateur de collage Word, chargé à la demande. */
export async function loadWordPasteTransformer(): Promise<PasteTransformer> {
  const { wordPasteTransformer } = await import('@aster-editor/word');
  return wordPasteTransformer();
}

/**
 * Après un import : déclare les variables trouvées dans le `.docx` (libellé et valeur des
 * contrôles de contenu compris), puis réapplique les valeurs connues de l'application pour
 * les noms que Word a lui-même valorisés, l'application restant la source de vérité.
 */
export function declareImportedVariables(
  editor: AsterEditor,
  found: readonly AsterVariable[],
  known: () => VariableValues | undefined,
): void {
  if (found.length === 0) {
    return;
  }
  editor.variables.define(found);
  const values = untracked(known);
  if (!values) {
    return;
  }
  const overrides: Record<string, string> = {};
  for (const variable of found) {
    const value = values[variable.name];
    if (variable.value !== undefined && value !== undefined && value !== variable.value) {
      overrides[variable.name] = value;
    }
  }
  if (Object.keys(overrides).length > 0) {
    editor.variables.setValues(overrides);
  }
}
