import type { DocxModule } from './docx-module';
import type { ListKind } from './styles';
import type { DocxExportWarning, DocxExportWarningCode, DocxImageFetcher } from './types';

/**
 * Numérotation dédiée à une liste HTML. Chaque `<ul>`/`<ol>` rencontré, racine ou
 * imbriqué, reçoit sa propre référence (donc son propre `abstractNum` dans
 * `numbering.xml`) : Word tient un compteur par `abstractNum`, et deux sous-listes
 * partageant le même en verraient leurs numéros se suivre (`c` rendu `3.` après
 * `a`, `b` dans un autre item). La référence porte aussi le `start` de l'`<ol>`.
 */
export interface ListDefinition {
  /** Référence `numbering` unique : `aster-<kind>-<n>`. */
  readonly reference: string;
  readonly kind: ListKind;
  /** Niveau Word (0-8) auquel cette liste est rendue. */
  readonly level: number;
  /** Premier numéro (`<ol start>`), 1 par défaut. */
  readonly start: number;
}

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
  /** Numérotations collectées pendant la conversion, une par liste, pour `buildNumbering`. */
  readonly lists: ListDefinition[];
}

/** Ajoute un avertissement typé au contexte. */
export function warn(ctx: ExportContext, code: DocxExportWarningCode, message: string): void {
  ctx.warnings.push({ code, message });
}

/** Enregistre une nouvelle liste et rend sa référence `numbering` dédiée. */
export function registerList(
  ctx: ExportContext,
  kind: ListKind,
  level: number,
  start: number,
): string {
  const reference = `aster-${kind}-${String(ctx.lists.length + 1)}`;
  ctx.lists.push({ reference, kind, level, start });
  return reference;
}
