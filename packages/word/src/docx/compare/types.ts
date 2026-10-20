import type { DocxInput, DocxLostObject } from '../types';

/**
 * Contrat du rapport de fidélité (session 3, figé en phase 0, implémenté par L28).
 * Compare un `.docx` d'origine et le `.docx` produit après import, édition éventuelle et
 * export dans le gabarit : propriété par propriété, pas à l'octet.
 */

/** Famille de propriétés comparées, pour agréger le score. */
export type FidelityPropertyGroup =
  | 'text'
  | 'paragraph-style'
  | 'paragraph-format'
  | 'run-format'
  | 'list'
  | 'table'
  | 'image'
  | 'note'
  | 'header-footer'
  | 'section'
  | 'package-part';

export interface FidelityProperty {
  /** Nom lisible, ex. `paragraph.lineHeight`, `run.fontFamily`, `part:word/styles.xml`. */
  readonly name: string;
  readonly group: FidelityPropertyGroup;
  /** Occurrences dans l'original. */
  readonly total: number;
  /** Occurrences retrouvées à l'identique dans le résultat. */
  readonly kept: number;
  /** `total - kept`. */
  readonly lost: number;
  /** Jusqu'à cinq exemples de pertes : où (index de paragraphe, chemin de partie) et quoi. */
  readonly examples: readonly FidelityExample[];
}

export interface FidelityExample {
  /** Localisation lisible, ex. `paragraphe 12`, `tableau 2 cellule (1,3)`, `word/header1.xml`. */
  readonly where: string;
  readonly expected: string;
  readonly actual: string;
}

export interface FidelityReport {
  /** Score pondéré entre 0 et 1 (1 = rien de perdu sur les propriétés comparées). */
  readonly score: number;
  readonly properties: readonly FidelityProperty[];
  /** Parties du paquet identiques à l'octet (styles, numérotation, thème, en-têtes…). */
  readonly identicalParts: readonly string[];
  /** Parties qui diffèrent, avec un résumé de la différence. */
  readonly changedParts: readonly { readonly path: string; readonly summary: string }[];
  /** Objets non représentables signalés par l'import du résultat ou de l'original. */
  readonly lost: readonly DocxLostObject[];
  /** Remarques libres (propriétés non comparées, approximations). */
  readonly notes: readonly string[];
}

export interface CompareDocxOptions {
  /**
   * Parties du paquet à comparer à l'octet, par préfixe de chemin. Par défaut tout sauf
   * `word/document.xml`, `docProps/core.xml` (dates) et les `.rels` du corps.
   */
  readonly binaryParts?: readonly string[];
  /** Ignorer les `w:rsid*` et autres identifiants de révision, vrai par défaut. */
  readonly ignoreRevisionIds?: boolean;
}

/** Signature de `compareDocx` (L28) : original, résultat, options. */
export type CompareDocx = (
  original: DocxInput,
  result: DocxInput,
  options?: CompareDocxOptions,
) => Promise<FidelityReport>;
