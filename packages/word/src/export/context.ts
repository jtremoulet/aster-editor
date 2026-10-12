import type { DocxModule } from './docx-module';
import type { DocxExportWarning, DocxExportWarningCode, DocxImageFetcher } from './types';

/**
 * État partagé par toutes les passes de conversion d'un même document : le module
 * `docx` chargé dynamiquement, les options utiles et le collecteur d'avertissements.
 */
export interface ExportContext {
  readonly docx: DocxModule;
  readonly fetchImage: DocxImageFetcher | undefined;
  /** Largeur utile de la page en pixels, plafond des images. */
  readonly maxImageWidth: number;
  readonly warnings: DocxExportWarning[];
  /** Compteur d'instances de numérotation : chaque liste racine repart à 1. */
  nextListInstance: number;
}

/** Ajoute un avertissement typé au contexte. */
export function warn(ctx: ExportContext, code: DocxExportWarningCode, message: string): void {
  ctx.warnings.push({ code, message });
}
