import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Selection, Transaction } from '@tiptap/pm/state';
import {
  PARAGRAPH_LAYOUT_ATTR_NAMES,
  type AsterCommand,
  type AsterEditor,
  type ParagraphLayoutAttrName,
} from '../api';
import { isLayoutNumber } from '../extensions/layout-css';
import {
  PARAGRAPH_LAYOUT_TYPES,
  normalizeParagraphLayoutValue,
} from '../extensions/paragraph-layout';
import { isCaps, type RunCaps } from '../extensions/run-layout';
import { TAB_NODE_NAME, canInsertTab, sanitizeTabStop } from '../extensions/tab';
import { defineStandardCommand, iconIdFor } from './define';

/** Arguments de `text.setLetterSpacing` : espacement en points, `null` pour retirer. */
export interface SetLetterSpacingArgs {
  pt: number | null;
}

/** Arguments de `text.setCaps` : `all` (majuscules) ou `small` (petites capitales). */
export interface SetCapsArgs {
  caps: RunCaps;
}

/** Arguments de `text.insertTab` : position du taquet en points, absente par défaut. */
export interface InsertTabArgs {
  stopPt?: number | null;
}

/** Identifiants des commandes de run de mise en page, enregistrées en plus de `STANDARD_COMMAND_IDS`. */
export const TEXT_LAYOUT_COMMAND_IDS = [
  'text.setLetterSpacing',
  'text.setCaps',
  'text.unsetCaps',
] as const;

export type TextLayoutCommandId = (typeof TEXT_LAYOUT_COMMAND_IDS)[number];

/** Identifiant de la commande de tabulation (session 4), enregistrée en plus, hors contrat. */
export const TAB_COMMAND_IDS = ['text.insertTab'] as const;

export type TabCommandId = (typeof TAB_COMMAND_IDS)[number];

const LAYOUT_TYPES: readonly string[] = PARAGRAPH_LAYOUT_TYPES;

/**
 * Parcourt chaque paragraphe et titre de la sélection, **plage par plage** : une
 * `CellSelection` (prosemirror-tables) n'a pour `from`/`to` que la cellule d'ancrage et
 * porte les autres cellules dans `selection.ranges` ; ne lire que `from`/`to` n'appliquerait
 * la commande qu'à une cellule sur quatre. Les plages peuvent se recouvrir (sélection de
 * texte simple : une seule plage ; cellules fusionnées) : chaque bloc n'est visité qu'une
 * fois, par position. Renvoyer `false` depuis `visit` arrête le parcours.
 */
function forEachLayoutBlock(
  doc: ProseMirrorNode,
  selection: Selection,
  visit: (node: ProseMirrorNode, pos: number) => boolean | undefined,
): void {
  const seen = new Set<number>();
  let stopped = false;
  for (const { $from, $to } of selection.ranges) {
    if (stopped) {
      return;
    }
    doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (stopped) {
        return false;
      }
      if (!LAYOUT_TYPES.includes(node.type.name)) {
        return true;
      }
      if (!seen.has(pos)) {
        seen.add(pos);
        if (visit(node, pos) === false) {
          stopped = true;
        }
      }
      return false;
    });
  }
}

/** Vrai si la sélection touche au moins un paragraphe ou un titre. */
export function hasLayoutBlockInSelection(editor: AsterEditor): boolean {
  const { selection, doc } = editor.tiptap.state;
  let found = false;
  forEachLayoutBlock(doc, selection, () => {
    found = true;
    return false;
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
  const targets: { pos: number; attrs: Record<string, unknown> }[] = [];
  forEachLayoutBlock(tr.doc, tr.selection, (node, pos) => {
    const attrs = update({ ...node.attrs });
    if (!sameAttrs(node.attrs, attrs)) {
      targets.push({ pos, attrs });
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

/**
 * Ne garde des arguments que les attributs du contrat, normalisés. Une valeur invalide
 * (`normalizeParagraphLayoutValue` → `undefined`) est **ignorée**, pas transformée en
 * effacement : seul `null` efface.
 */
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

/**
 * Vrai si les arguments de `setLayout` sont acceptables pour `canRun` : aucun argument
 * (la toolbar sonde la commande avec `{}` ou rien), ou au moins une valeur valide. Des
 * arguments non vides sans aucune valeur valide (`{ lineHeight: 'abc' }`) sont refusés.
 */
function hasUsableLayoutArgs(args: unknown): boolean {
  if (typeof args !== 'object' || args === null || Object.keys(args).length === 0) {
    return true;
  }
  return Object.keys(layoutChanges(args)).length > 0;
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
 *   la sélection ; `null` efface un attribut, un attribut absent est laissé tel quel, une
 *   valeur invalide est ignorée (et `run` rend `false` s'il ne reste rien de valide).
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
    canRun: (editor, args) => hasUsableLayoutArgs(args) && hasLayoutBlockInSelection(editor),
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
  id: TextLayoutCommandId | TabCommandId,
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
      // Borné comme tout nombre de mise en page : `1e307` donnerait `Infinitypt`.
      if (!isLayoutNumber(pt)) {
        return false;
      }
      return editor.tiptap.chain().focus().setMark('textStyle', { letterSpacingPt: pt }).run();
    },
    canRun: (editor, args) => {
      const pt: unknown = readArgs(args)['pt'];
      return (
        (pt === null || isLayoutNumber(pt)) &&
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

/**
 * Commande additive `text.insertTab { stopPt? }` (session 4) : insère un nœud `tab` à la
 * sélection, avec la position de taquet si elle est donnée et valide (nombre de mise en
 * page ≥ 0 ; une valeur invalide est ignorée, pas refusée). C'est l'équivalent de la
 * touche Tab dans un paragraphe, sans la réserve des listes et des tables, mais avec la
 * même garde (`canInsertTab`, R41-04) : refusée dans un bloc de code ou là où le nœud `tab`
 * n'est pas accepté, plutôt que de scinder le bloc.
 */
export const TAB_COMMANDS: readonly AsterCommand[] = [
  defineTextLayoutCommand('text.insertTab', {
    run: (editor, args) => {
      if (!canInsertTab(editor.tiptap.state)) {
        return false;
      }
      const stopPt = sanitizeTabStop(readArgs(args)['stopPt']);
      const content =
        stopPt === null ? { type: TAB_NODE_NAME } : { type: TAB_NODE_NAME, attrs: { stopPt } };
      return editor.tiptap.chain().focus().insertContent(content).run();
    },
    canRun: (editor) =>
      canInsertTab(editor.tiptap.state) &&
      editor.tiptap.can().insertContent({ type: TAB_NODE_NAME }),
  }),
];
