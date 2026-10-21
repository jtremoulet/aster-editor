import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { AsterEditor } from '../api/index.js';

/** Nom de l'extension. */
export const OUTLINE_EXTENSION_NAME = 'outline';

/** Préfixe des identifiants posés sur les titres : `aster-h-1`, `aster-h-2`… */
export const HEADING_ID_PREFIX = 'aster-h-';

/** Une entrée du sommaire : un titre du document. */
export interface OutlineEntry {
  readonly level: number;
  /** Texte du titre, vide pour un titre sans contenu. */
  readonly text: string;
  /** Position ProseMirror du nœud titre (avant son ouverture). */
  readonly pos: number;
  /** Identifiant stable, attribut `id` du `<hN>`, sérialisé dans `getHTML`. */
  readonly id: string;
}

const HEADING_ID_PATTERN = new RegExp(`^${HEADING_ID_PREFIX}(\\d+)$`);

/** Numéro d'un identifiant `aster-h-<n>`, `null` pour tout autre `id` (importé) ou absent. */
export function headingIdNumber(id: unknown): number | null {
  if (typeof id !== 'string') return null;
  const match = HEADING_ID_PATTERN.exec(id);
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Extension `outline` : ajoute aux titres un attribut `id` parsé depuis le HTML et
 * sérialisé tel quel, support des ancres internes et du sommaire. Aucun `id` n'est
 * posé automatiquement — un document qui n'utilise pas le sommaire garde un HTML nu —
 * c'est `ensureHeadingIds` (appelé par `getOutline`) qui attribue les manquants.
 */
export const Outline = Extension.create({
  name: OUTLINE_EXTENSION_NAME,

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute('id'),
            renderHTML: (attributes) => {
              const id: unknown = attributes['id'];
              return typeof id === 'string' && id !== '' ? { id } : {};
            },
          },
        },
      },
    ];
  },
});

/** Titres du document avec leur position, dans l'ordre. */
function headings(doc: ProseMirrorNode): { node: ProseMirrorNode; pos: number }[] {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') found.push({ node, pos });
    return true;
  });
  return found;
}

/**
 * Attribue un `id` stable `aster-h-<n>` à chaque titre qui n'en a pas, et renumérote un
 * doublon (titre copié-collé). Les `id` existants, y compris ceux venus d'un HTML importé
 * (`id="intro"`), sont conservés : `n` suit le plus grand numéro déjà utilisé. La
 * transaction n'entre pas dans l'historique. Vrai si le document a changé.
 */
export function ensureHeadingIds(editor: AsterEditor): boolean {
  if (editor.isDestroyed()) return false;
  const { state, view } = editor.tiptap;
  const entries = headings(state.doc);
  if (entries.length === 0) return false;
  let next = 1;
  for (const { node } of entries) {
    const number = headingIdNumber(node.attrs['id']);
    if (number !== null) next = Math.max(next, number + 1);
  }
  const seen = new Set<string>();
  const tr = state.tr;
  for (const { node, pos } of entries) {
    const current: unknown = node.attrs['id'];
    if (typeof current === 'string' && current !== '' && !seen.has(current)) {
      seen.add(current);
      continue;
    }
    const id = `${HEADING_ID_PREFIX}${next}`;
    next += 1;
    seen.add(id);
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
  }
  if (!tr.docChanged) return false;
  tr.setMeta('addToHistory', false);
  view.dispatch(tr);
  return true;
}

/**
 * Sommaire du document : un élément par titre, dans l'ordre, avec un `id` stable. Les
 * titres sans `id` en reçoivent un au passage (`ensureHeadingIds`), de sorte que le
 * HTML produit ensuite porte les ancres.
 */
export function getOutline(editor: AsterEditor): readonly OutlineEntry[] {
  if (editor.isDestroyed()) return [];
  ensureHeadingIds(editor);
  return headings(editor.tiptap.state.doc).map(({ node, pos }) => {
    const level: unknown = node.attrs['level'];
    const id: unknown = node.attrs['id'];
    return {
      level: typeof level === 'number' ? level : 1,
      text: node.textContent,
      pos,
      id: typeof id === 'string' ? id : '',
    };
  });
}

/**
 * Place le curseur au début du titre situé à `pos` et le fait défiler dans la vue.
 * Faux si la position ne porte pas un titre (document modifié depuis le sommaire).
 */
export function scrollToHeading(editor: AsterEditor, pos: number): boolean {
  if (editor.isDestroyed()) return false;
  const { state, view } = editor.tiptap;
  const node = pos >= 0 && pos < state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (!node || node.type.name !== 'heading') return false;
  const done = editor.tiptap
    .chain()
    .focus(undefined, { scrollIntoView: false })
    .setTextSelection(pos + 1)
    .scrollIntoView()
    .run();
  const dom: unknown = view.nodeDOM(pos);
  if (dom instanceof HTMLElement && typeof dom.scrollIntoView === 'function') {
    dom.scrollIntoView({ block: 'start' });
  }
  return done;
}
