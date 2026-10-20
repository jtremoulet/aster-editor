import type { Paragraph } from 'docx';
import type { NumberingResolver } from '../docx/reader/types';
import type { DocxModule } from './docx-module';
import type { HeadingNumbering, ListKind } from './styles';
import type {
  DocxExportWarning,
  DocxExportWarningCode,
  DocxImageFetcher,
  DocxVariableMode,
} from './types';
import type { VariableValues } from '@aster-editor/core';

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
  /**
   * `numId` du gabarit (`data-docx-num-id`, posé par l'import) que l'export dans le gabarit
   * réutilise à la place de la numérotation générée. Ignoré par l'export neuf.
   */
  readonly templateNumId?: string;
}

/** Options de variables résolues : mode effectif, valeurs et motif du texte brut. */
export interface VariableSettings {
  readonly mode: DocxVariableMode;
  readonly values: VariableValues;
  /** Motif global (`g`) dont le premier groupe de capture est le nom. */
  readonly pattern: RegExp;
}

/**
 * Note de bas de page collectée avant la conversion du corps : identifiant Word
 * (entier, séquentiel) et paragraphes déjà convertis.
 */
export interface FootnoteDefinition {
  readonly id: number;
  readonly children: readonly Paragraph[];
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
  readonly variables: VariableSettings;
  /**
   * Notes de bas de page indexées par la clé que le corps utilise pour y faire appel
   * (`1` pour `data-footnote="footnote-1"` ou `<sup data-footnote-ref="1">`).
   */
  readonly footnotes: Map<string, FootnoteDefinition>;
  /**
   * Clés des notes déjà appelées : Word n'accepte qu'un `w:footnoteReference` par note,
   * un second appel est dégradé en exposant `[n]`.
   */
  readonly footnoteCalls: Set<string>;
  /**
   * Identifiants de styles que le document final définit : ceux de l'export neuf, plus
   * ceux du gabarit en export dans le gabarit. Un `data-docx-style` / `data-docx-run-style`
   * hors de cet ensemble n'est pas écrit (ses propriétés directes suffisent).
   */
  readonly knownStyles: ReadonlySet<string>;
  /** Vrai en export dans le gabarit : un style inconnu y vaut un avertissement `template-style-missing`. */
  readonly template: boolean;
  /**
   * Numérotations du gabarit (export dans le gabarit), pour retrouver le niveau d'une
   * liste `data-docx-num-id` quand la profondeur HTML ne le donne pas (liste Word au
   * niveau 1 sans parent). `null` en export neuf.
   */
  readonly templateNumbering: NumberingResolver | null;
  /**
   * Numérotation des titres à poser en `w:numPr` direct sur chaque titre (export dans le
   * gabarit, dont les styles `Heading n` ne sont pas modifiés). `null` en export neuf,
   * où elle vit dans les styles de titres.
   */
  readonly headingNumbering: HeadingNumbering | null;
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
  templateNumId?: string,
): string {
  const reference = `aster-${kind}-${String(ctx.lists.length + 1)}`;
  ctx.lists.push({
    reference,
    kind,
    level,
    start,
    ...(templateNumId !== undefined ? { templateNumId } : {}),
  });
  return reference;
}

/**
 * Identifiant de style Word d'un attribut `data-docx-style` / `data-docx-run-style` :
 * tel quel s'il est défini dans le document final, sinon `null`, avec un avertissement
 * `template-style-missing` en export dans le gabarit (l'export neuf ne le promet pas).
 */
export function resolveDocxStyle(
  ctx: ExportContext,
  value: string | null,
  what: 'paragraphe' | 'run' | 'tableau',
): string | null {
  const id = value?.trim() ?? '';
  if (id === '') return null;
  if (ctx.knownStyles.has(id)) return id;
  if (ctx.template) {
    const message = `Style de ${what} « ${id} » absent du gabarit et de l'export : propriétés directes seules`;
    // Un style manquant revient à chaque bloc qui le porte : un seul avertissement suffit.
    if (!ctx.warnings.some((warning) => warning.message === message)) {
      warn(ctx, 'template-style-missing', message);
    }
  }
  return null;
}
