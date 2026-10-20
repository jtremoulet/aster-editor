import type { AsterEditor } from './editor';
import type { ParagraphLayoutAttrName, ParagraphLayoutAttrs } from './layout';

/**
 * Identifiants des commandes standard fournies par le core. La toolbar et le wrapper
 * Angular s'appuient sur cette liste. Un identifiant pointé indique un domaine :
 * `table.insert`, `link.set`, `image.insert`.
 */
export const STANDARD_COMMAND_IDS = [
  // Marks
  'bold',
  'italic',
  'underline',
  'strike',
  'subscript',
  'superscript',
  'code',
  'highlight',
  'clearFormatting',
  // Blocs
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  // Listes
  'bulletList',
  'orderedList',
  'taskList',
  'indent',
  'outdent',
  // Alignement
  'alignLeft',
  'alignCenter',
  'alignRight',
  'alignJustify',
  // Liens
  'link.set',
  'link.unset',
  // Images
  'image.insert',
  'image.upload',
  'image.setAttributes',
  // Tables
  'table.insert',
  'table.delete',
  'table.addRowBefore',
  'table.addRowAfter',
  'table.deleteRow',
  'table.addColumnBefore',
  'table.addColumnAfter',
  'table.deleteColumn',
  'table.mergeCells',
  'table.splitCell',
  'table.toggleHeaderRow',
  'table.toggleHeaderColumn',
  // Style de texte
  'textColor',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  // Variables (champs de fusion)
  'variable.insert',
  'variable.remove',
  // Mise en page des paragraphes (session 3)
  'paragraph.setLayout',
  'paragraph.unsetLayout',
  // Historique et divers
  'undo',
  'redo',
  'selectAll',
] as const;

export type StandardCommandId = (typeof STANDARD_COMMAND_IDS)[number];

/** Identifiant de commande : standard ou custom. */
export type CommandId = StandardCommandId | (string & {});

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Arguments typés des commandes standard. Les commandes absentes de cette table
 * ne prennent pas d'argument.
 */
export interface StandardCommandArgs {
  heading: { level: HeadingLevel };
  'link.set': { href: string; target?: '_blank' | '_self'; title?: string };
  'image.insert': { src: string; alt?: string; title?: string; width?: number };
  'image.upload': { file: File };
  'image.setAttributes': {
    alt?: string;
    title?: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
  };
  'table.insert': { rows: number; cols: number; withHeaderRow?: boolean };
  textColor: { color: string | null };
  backgroundColor: { color: string | null };
  fontFamily: { family: string | null };
  fontSize: { size: string | null };
  'variable.insert': { name: string; label?: string };
  /** Fusionne les attributs donnés dans les paragraphes et titres de la sélection ; `null` efface un attribut. */
  'paragraph.setLayout': ParagraphLayoutAttrs;
  /** Efface les attributs nommés, ou tous sans argument. */
  'paragraph.unsetLayout': { attrs?: readonly ParagraphLayoutAttrName[] } | undefined;
}

/** Type d'argument d'une commande standard, `undefined` si elle n'en prend pas. */
export type CommandArgs<K extends CommandId> = K extends keyof StandardCommandArgs
  ? StandardCommandArgs[K]
  : undefined;

/**
 * Tuple d'arguments pour `run`/`canRun`/`isActive` : obligatoire si la commande
 * standard déclare des arguments, absent sinon.
 */
export type CommandRunArgs<K extends CommandId> = K extends keyof StandardCommandArgs
  ? [args: StandardCommandArgs[K]]
  : [];

/**
 * Une commande Aster. C'est l'unité que la toolbar affiche, que les raccourcis déclenchent
 * et que l'intégrateur appelle. Elle enveloppe une ou plusieurs commandes Tiptap.
 */
export interface AsterCommand<Args = unknown> {
  /** Identifiant unique, voir `STANDARD_COMMAND_IDS` pour la convention. */
  readonly id: CommandId;
  /** Clé i18n du libellé, par convention `command.<id>`. */
  readonly labelKey: string;
  /**
   * Identifiant d'icône, résolu par le paquet `ui`. Convention : `id` avec les points
   * remplacés par des tirets (`table.insert` → `table-insert`), `ui` sait aussi
   * convertir le camelCase (`bulletList` → `bullet-list`).
   */
  readonly icon?: string;
  /**
   * Raccourci principal au format Tiptap/ProseMirror : `Mod-b`, `Mod-Shift-7`. Affiché dans
   * le tooltip. Les commandes à liaisons multiples (`heading` avec `Mod-Alt-1..6`, `redo`
   * avec `Mod-y`) exposent leurs liaisons supplémentaires via `EXTRA_SHORTCUT_BINDINGS` du core.
   */
  readonly shortcut?: string;
  /** Exécute la commande. Retourne `false` si elle n'a rien fait. */
  run(editor: AsterEditor, args: Args): boolean;
  /** Vrai si la commande est exécutable dans l'état courant. Par défaut `true` hors lecture seule. */
  canRun?(editor: AsterEditor, args: Args): boolean;
  /** Vrai si la commande est « enfoncée » pour la sélection courante. Par défaut `false`. */
  isActive?(editor: AsterEditor, args: Args): boolean;
}

/**
 * Registre des commandes d'un éditeur. Seule porte d'entrée pour `ui` et `angular`.
 * `run`, `canRun` et `isActive` sont tolérants : identifiant inconnu → `false`, jamais d'exception.
 */
export interface CommandRegistry {
  register<Args>(command: AsterCommand<Args>): void;
  unregister(id: CommandId): void;
  get(id: CommandId): AsterCommand | undefined;
  has(id: CommandId): boolean;
  list(): readonly AsterCommand[];
  run<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean;
  run(id: string, args?: unknown): boolean;
  canRun<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean;
  canRun(id: string, args?: unknown): boolean;
  isActive<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean;
  isActive(id: string, args?: unknown): boolean;
}
