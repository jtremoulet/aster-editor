import type { Transaction } from '@tiptap/pm/state';
import {
  PARAGRAPH_LAYOUT_ATTR_NAMES,
  type AsterCommand,
  type AsterEditor,
  type ParagraphLayoutAttrName,
} from '../api';
import {
  PARAGRAPH_LAYOUT_TYPES,
  normalizeParagraphLayoutValue,
} from '../extensions/paragraph-layout';
import { isCaps, type RunCaps } from '../extensions/run-layout';
import { defineStandardCommand, iconIdFor } from './define';

/** Arguments de `text.setLetterSpacing` : espacement en points, `null` pour retirer. */
export interface SetLetterSpacingArgs {
  pt: number | null;
}

/** Arguments de `text.setCaps` : `all` (majuscules) ou `small` (petites capitales). */
export interface SetCapsArgs {
  caps: RunCaps;
}

/** Identifiants des commandes de run de mise en page, enregistrées en plus de `STANDARD_COMMAND_IDS`. */
export const TEXT_LAYOUT_COMMAND_IDS = [
  'text.setLetterSpacing',
  'text.setCaps',
  'text.unsetCaps',
] as const;

export type TextLayoutCommandId = (typeof TEXT_LAYOUT_COMMAND_IDS)[number];

const LAYOUT_TYPES: readonly string[] = PARAGRAPH_LAYOUT_TYPES;

/** Vrai si la sélection touche au moins un paragraphe ou un titre. */
export function hasLayoutBlockInSelection(editor: AsterEditor): boolean {
  const { selection, doc } = editor.tiptap.state;
  let found = false;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (found) {
      return false;
    }
    if (LAYOUT_TYPES.includes(node.type.name)) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Applique `update` à chaque paragraphe et titre de la sélection (cellules et items de
 * liste compris). `update` reçoit les attributs courants et rend les nouveaux ; un
 * résultat identique n'écrit rien. Retourne vrai si au moins un bloc a changé.
 */
function updateLayoutBlocks(
  tr: Transaction,
  update: (attrs: Record<string, unknown>) => Record<string, unknown>,
): boolean {
  const { selection } = tr;
  const targets: { pos: number; attrs: Record<string, unknown> }[] = [];
  tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (LAYOUT_TYPES.includes(node.type.name)) {
      const attrs = update({ ...node.attrs });
      if (!sameAttrs(node.attrs, attrs)) {
        targets.push({ pos, attrs });
      }
      return false;
    }
    return true;
  });
  // `setNodeMarkup` ne change pas les tailles : les positions restent valides.
  for (const { pos, attrs } of targets) {
    tr.setNodeMarkup(pos, undefined, attrs);
  }
  return targets.length > 0;
}

/** Égalité superficielle de deux jeux d'attributs (les bordures sont comparées en JSON). */
function sameAttrs(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null)) {
      return false;
    }
  }
  return true;
}

/** Ne garde des arguments que les attributs du contrat, normalisés ; `undefined` ignoré. */
function layoutChanges(args: unknown): Partial<Record<ParagraphLayoutAttrName, unknown>> {
  const changes: Partial<Record<ParagraphLayoutAttrName, unknown>> = {};
  if (typeof args !== 'object' || args === null) {
    return changes;
  }
  const source = args as Record<string, unknown>;
  for (const name of PARAGRAPH_LAYOUT_ATTR_NAMES) {
    if (name in source) {
      const value = normalizeParagraphLayoutValue(name, source[name]);
      if (value !== undefined) {
        changes[name] = value;
      }
    }
  }
  return changes;
}

/** Noms d'attributs à effacer d'après les arguments de `unsetLayout` : tous par défaut. */
function unsetNames(args: unknown): readonly ParagraphLayoutAttrName[] {
  if (typeof args !== 'object' || args === null) {
    return PARAGRAPH_LAYOUT_ATTR_NAMES;
  }
  const requested: unknown = (args as Record<string, unknown>)['attrs'];
  if (!Array.isArray(requested)) {
    return PARAGRAPH_LAYOUT_ATTR_NAMES;
  }
  const known: readonly string[] = PARAGRAPH_LAYOUT_ATTR_NAMES;
  return requested.filter(
    (name): name is ParagraphLayoutAttrName => typeof name === 'string' && known.includes(name),
  );
}

/**
 * Commandes standard de mise en page des paragraphes.
 *
 * - `paragraph.setLayout` fusionne les attributs donnés dans chaque paragraphe et titre de
 *   la sélection ; `null` efface un attribut, un attribut absent est laissé tel quel.
 *   Les valeurs sont normalisées (nombres arrondis, couleurs `#rrggbb`, bordures filtrées).
 * - `paragraph.unsetLayout` efface les attributs nommés dans `attrs`, ou tous sans argument.
 *
 * `canRun` est vrai dès que la sélection contient un bloc de texte éditable (la lecture
 * seule est filtrée par le registre). Pas de raccourci : ce sont des commandes de menu.
 */
export const PARAGRAPH_LAYOUT_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('paragraph.setLayout', {
    run: (editor, args) => {
      const changes = layoutChanges(args);
      if (Object.keys(changes).length === 0) {
        return false;
      }
      return editor.tiptap
        .chain()
        .focus()
        .command(({ tr }) => updateLayoutBlocks(tr, (attrs) => ({ ...attrs, ...changes })))
        .run();
    },
    canRun: (editor) => hasLayoutBlockInSelection(editor),
  }),
  defineStandardCommand('paragraph.unsetLayout', {
    run: (editor, args) => {
      const names = unsetNames(args);
      if (names.length === 0) {
        return false;
      }
      return editor.tiptap
        .chain()
        .focus()
        .command(({ tr }) =>
          updateLayoutBlocks(tr, (attrs) => {
            const next = { ...attrs };
            for (const name of names) {
              next[name] = null;
            }
            return next;
          }),
        )
        .run();
    },
    canRun: (editor) => hasLayoutBlockInSelection(editor),
  }),
];

/** Lecture tolérante des arguments : la toolbar peut appeler `run` sans arguments. */
function readArgs(args: unknown): Record<string, unknown> {
  return typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
}

function defineTextLayoutCommand(
  id: TextLayoutCommandId,
  spec: Pick<AsterCommand, 'run' | 'canRun' | 'isActive'>,
): AsterCommand {
  const command: AsterCommand = {
    id,
    labelKey: `command.${id}`,
    icon: iconIdFor(id),
    run: spec.run,
  };
  if (spec.canRun) command.canRun = spec.canRun;
  if (spec.isActive) command.isActive = spec.isActive;
  return command;
}

/**
 * Commandes additives (hors `STANDARD_COMMAND_IDS`, comme `search.*`) des marques de run
 * de mise en page, portées par `textStyle` :
 *
 * - `text.setLetterSpacing { pt }` : espacement des caractères en points, `null` le retire ;
 * - `text.setCaps { caps }` : `all` (majuscules) ou `small` (petites capitales) ;
 * - `text.unsetCaps` : retire la casse forcée.
 *
 * Une marque `textStyle` vidée de tout attribut est retirée (`removeEmptyTextStyle`).
 */
export const TEXT_LAYOUT_COMMANDS: readonly AsterCommand[] = [
  defineTextLayoutCommand('text.setLetterSpacing', {
    run: (editor, args) => {
      const pt: unknown = readArgs(args)['pt'];
      if (pt === null) {
        return editor.tiptap
          .chain()
          .focus()
          .setMark('textStyle', { letterSpacingPt: null })
          .removeEmptyTextStyle()
          .run();
      }
      if (typeof pt !== 'number' || !Number.isFinite(pt)) {
        return false;
      }
      return editor.tiptap.chain().focus().setMark('textStyle', { letterSpacingPt: pt }).run();
    },
    canRun: (editor, args) => {
      const pt: unknown = readArgs(args)['pt'];
      return (
        (pt === null || (typeof pt === 'number' && Number.isFinite(pt))) &&
        editor.tiptap.can().setMark('textStyle', { letterSpacingPt: pt })
      );
    },
    isActive: (editor, args) => {
      const pt: unknown = readArgs(args)['pt'];
      return typeof pt === 'number'
        ? editor.tiptap.isActive('textStyle', { letterSpacingPt: pt })
        : false;
    },
  }),
  defineTextLayoutCommand('text.setCaps', {
    run: (editor, args) => {
      const caps: unknown = readArgs(args)['caps'];
      if (!isCaps(caps)) {
        return false;
      }
      return editor.tiptap.chain().focus().setMark('textStyle', { caps }).run();
    },
    canRun: (editor, args) =>
      isCaps(readArgs(args)['caps']) && editor.tiptap.can().setMark('textStyle', {}),
    isActive: (editor, args) => {
      const caps: unknown = readArgs(args)['caps'];
      return isCaps(caps) ? editor.tiptap.isActive('textStyle', { caps }) : false;
    },
  }),
  defineTextLayoutCommand('text.unsetCaps', {
    run: (editor) =>
      editor.tiptap
        .chain()
        .focus()
        .setMark('textStyle', { caps: null })
        .removeEmptyTextStyle()
        .run(),
    canRun: (editor) => editor.tiptap.can().setMark('textStyle', { caps: null }),
    isActive: (editor) => {
      const caps: unknown = editor.tiptap.getAttributes('textStyle')['caps'];
      return isCaps(caps);
    },
  }),
];
