import type { Attrs, Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type { AsterCommand, AsterEditor } from '../api/index.js';

/** Identifiants des commandes de reproduction de mise en forme, hors `STANDARD_COMMAND_IDS`. */
export const FORMAT_PAINTER_COMMAND_IDS = ['formatPainter.copy', 'formatPainter.paste'] as const;

export type FormatPainterCommandId = (typeof FORMAT_PAINTER_COMMAND_IDS)[number];

/**
 * Nom de l'événement DOM émis sur `editor.element` quand le presse-papier de format est
 * chargé (`formatPainter.copy`) ou vidé (`clearFormatClipboard`) ; `ui` l'écoute pour
 * refléter l'état du bouton, le raccourci clavier ne passant pas par la toolbar.
 */
export const FORMAT_PAINTER_CHANGE_EVENT = 'aster:format-painter-change';

/** Icône du jeu `ui` pour les deux commandes. */
const FORMAT_PAINTER_ICON = 'format-painter';

/** Bloc mémorisé : type de textblock et attributs (niveau de titre, alignement). */
export interface FormatClipboardBlock {
  readonly type: string;
  readonly attrs: Attrs;
}

/** Mise en forme mémorisée par `formatPainter.copy`. */
export interface FormatClipboard {
  /** Marques du texte source (gras, couleur, police…), hors lien. */
  readonly marks: readonly Mark[];
  /** Bloc source, `null` si la sélection n'était pas dans un bloc de texte. */
  readonly block: FormatClipboardBlock | null;
}

/** Marques qui ne sont pas de la mise en forme : jamais copiées ni retirées. */
const PRESERVED_MARKS: ReadonlySet<string> = new Set(['link']);

/** Attributs de bloc qui identifient le nœud plutôt que sa mise en forme. */
const IDENTITY_ATTRS: ReadonlySet<string> = new Set(['id']);

/** Un presse-papier par éditeur, libéré avec lui. */
const clipboards = new WeakMap<AsterEditor, FormatClipboard>();

function emitChange(editor: AsterEditor): void {
  if (editor.isDestroyed()) return;
  editor.element.dispatchEvent(new CustomEvent(FORMAT_PAINTER_CHANGE_EVENT, { bubbles: true }));
}

/** Presse-papier de format de l'éditeur, `null` s'il est vide. */
export function getFormatClipboard(editor: AsterEditor): FormatClipboard | null {
  return clipboards.get(editor) ?? null;
}

/** Vrai si une mise en forme est mémorisée. */
export function hasFormatClipboard(editor: AsterEditor): boolean {
  return clipboards.has(editor);
}

/** Vide le presse-papier de format et le signale (`aster:format-painter-change`). */
export function clearFormatClipboard(editor: AsterEditor): void {
  if (!clipboards.delete(editor)) return;
  emitChange(editor);
}

/** Attributs de mise en forme d'un bloc : tout sauf son identité (`id`). */
function formattingAttrs(node: ProseMirrorNode): Attrs {
  const attrs: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!IDENTITY_ATTRS.has(name)) attrs[name] = value;
  }
  return attrs;
}

/**
 * Mise en forme de la sélection courante : marques du texte au curseur (marques en
 * attente comprises) ou du premier texte sélectionné, et bloc parent s'il est un bloc
 * de texte. Fonction pure sur l'état, exportée pour les tests.
 */
export function readFormat(editor: AsterEditor): FormatClipboard {
  const { selection, storedMarks } = editor.tiptap.state;
  const { $from, empty } = selection;
  const source = empty ? (storedMarks ?? $from.marks()) : ($from.nodeAfter?.marks ?? $from.marks());
  const marks = source.filter((mark) => !PRESERVED_MARKS.has(mark.type.name));
  const parent = $from.parent;
  const block: FormatClipboardBlock | null = parent.isTextblock
    ? { type: parent.type.name, attrs: formattingAttrs(parent) }
    : null;
  return { marks, block };
}

/** Plage de positions absolues. */
interface PositionRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Mot autour d'une position dans son bloc de texte (suite de caractères non blancs),
 * `null` sur un blanc, hors bloc de texte ou dans un bloc vide. Les nœuds inline sans
 * texte (image, variable) comptent pour un caractère, comme dans le document.
 */
export function wordRangeAt(tr: Transaction, pos: number): PositionRange | null {
  const $pos = tr.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const text = Array.from(parent.textBetween(0, parent.content.size, '￼', '￼'));
  const offset = $pos.parentOffset;
  let start = offset;
  while (start > 0 && !/\s/u.test(text[start - 1] ?? ' ')) start -= 1;
  let end = offset;
  while (end < text.length && !/\s/u.test(text[end] ?? ' ')) end += 1;
  if (start === end) return null;
  return { from: $pos.start() + start, to: $pos.start() + end };
}

/**
 * Applique le presse-papier à une transaction. Les marques remplacent celles de chaque
 * plage sélectionnée (le lien est conservé) ; sur une sélection vide, elles s'appliquent
 * au mot sous le curseur, comme le pinceau de Word, ou deviennent les marques en attente
 * de la frappe suivante s'il n'y a pas de mot. Chaque bloc de texte couvert prend le
 * type et les attributs mémorisés, en gardant son `id`. Vrai si quelque chose change.
 */
export function applyFormat(tr: Transaction, clipboard: FormatClipboard): boolean {
  const { schema } = tr.doc.type;
  const { selection } = tr;
  let changed = false;

  const word = selection.empty ? wordRangeAt(tr, selection.from) : null;
  const ranges: readonly PositionRange[] = selection.empty
    ? word
      ? [word]
      : []
    : selection.ranges.map((range) => ({ from: range.$from.pos, to: range.$to.pos }));

  // Bloc d'abord : `setNodeMarkup` garde les positions, mais chaque étape ajoutée à la
  // transaction efface ses marques en attente, qui doivent donc être posées en dernier.
  const block = clipboard.block;
  const type = block ? schema.nodes[block.type] : undefined;
  if (block && type) {
    const targets: { pos: number; node: ProseMirrorNode }[] = [];
    for (const range of selection.ranges) {
      tr.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
        if (node.isTextblock) targets.push({ pos, node });
        return !node.isTextblock;
      });
    }
    for (const { pos, node } of targets) {
      // `type.create` complète et filtre les attributs selon le type cible (un paragraphe
      // ignore `level`), pour que `hasMarkup` compare des attributs complets.
      const attrs: Attrs = type.create({ ...block.attrs, id: node.attrs['id'] }).attrs;
      const resolved = tr.doc.resolve(pos);
      const index = resolved.index();
      if (!resolved.parent.canReplaceWith(index, index + 1, type)) continue;
      if (node.hasMarkup(type, attrs)) continue;
      tr.setNodeMarkup(pos, type, attrs);
      changed = true;
    }
  }

  if (ranges.length === 0) {
    tr.setStoredMarks([...clipboard.marks]);
    changed = true;
  } else {
    const removable = Object.values(schema.marks).filter((mark) => !PRESERVED_MARKS.has(mark.name));
    for (const { from, to } of ranges) {
      for (const mark of removable) tr.removeMark(from, to, mark);
      for (const mark of clipboard.marks) tr.addMark(from, to, mark);
      changed = true;
    }
  }
  return changed;
}

function defineFormatPainterCommand(
  id: FormatPainterCommandId,
  spec: Pick<AsterCommand<undefined>, 'run' | 'canRun' | 'isActive'> & { shortcut: string },
): AsterCommand<undefined> {
  const command: AsterCommand<undefined> = {
    id,
    labelKey: `command.${id}`,
    icon: FORMAT_PAINTER_ICON,
    shortcut: spec.shortcut,
    run: spec.run,
  };
  if (spec.canRun) command.canRun = spec.canRun;
  if (spec.isActive) command.isActive = spec.isActive;
  return command;
}

/**
 * Reproduction de la mise en forme, à la manière du pinceau de Word :
 *
 * - `formatPainter.copy` (`Mod-Shift-c`) : mémorise marques et bloc de la sélection
 *   (`readFormat`), actif tant que le presse-papier est chargé ;
 * - `formatPainter.paste` (`Mod-Shift-v`) : applique le presse-papier à la sélection
 *   (`applyFormat`), exécutable seulement s'il est chargé. Le presse-papier reste
 *   chargé après l'application : c'est le widget `formatPainter` de `ui` qui le vide
 *   après un clic simple et le garde après un double-clic (verrou).
 *
 * Sans presse-papier, `paste` répond `false` et `Mod-Shift-v` suit son cours (collage
 * sans mise en forme du navigateur).
 */
export const FORMAT_PAINTER_COMMANDS: readonly AsterCommand[] = [
  defineFormatPainterCommand('formatPainter.copy', {
    shortcut: 'Mod-Shift-c',
    run: (editor) => {
      clipboards.set(editor, readFormat(editor));
      emitChange(editor);
      return true;
    },
    isActive: (editor) => hasFormatClipboard(editor),
  }),
  defineFormatPainterCommand('formatPainter.paste', {
    shortcut: 'Mod-Shift-v',
    run: (editor) => {
      const clipboard = getFormatClipboard(editor);
      if (!clipboard) return false;
      return editor.tiptap
        .chain()
        .focus()
        .command(({ tr }) => applyFormat(tr, clipboard))
        .run();
    },
    canRun: (editor) => hasFormatClipboard(editor),
  }),
];
