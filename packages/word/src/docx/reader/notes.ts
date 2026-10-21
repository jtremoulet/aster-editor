import { childrenNamed, wordAttribute } from '../preprocess/xml-utils.js';
import { deriveContext } from './index.js';
import type { ConverterContext, DocxPackage, NoteRegistry, ReaderOptions } from './types.js';

/**
 * Notes de bas de page et de fin. Les parties `footnotes.xml` / `endnotes.xml` sont
 * indexées par identifiant à l'ouverture ; les appels de note sont numérotés dans l'ordre
 * d'apparition (une seule séquence pour les deux sortes, pour que `data-footnote` reste
 * unique) et la liste finale reprend la forme du chemin sémantique :
 * `<ol data-footnotes=""><li data-footnote="1">…</li></ol>`, appel `<sup data-footnote-ref="1">1</sup>`.
 */

type NoteKind = 'footnote' | 'endnote';

/** Notes techniques de Word, jamais référencées depuis le corps. */
const TECHNICAL_TYPES: ReadonlySet<string> = new Set([
  'separator',
  'continuationSeparator',
  'continuationNotice',
]);

interface NotePart {
  readonly path: string;
  readonly notes: ReadonlyMap<string, Element>;
}

interface Reference {
  readonly kind: NoteKind;
  readonly id: string;
  readonly number: number;
}

async function loadNotePart(pkg: DocxPackage, kind: NoteKind): Promise<NotePart | null> {
  const path = await pkg.related(pkg.mainPart, `/${kind}s`);
  if (!path) return null;
  const doc = await pkg.part(path);
  if (!doc) return null;
  const notes = new Map<string, Element>();
  for (const note of childrenNamed(doc.documentElement, kind)) {
    if (TECHNICAL_TYPES.has(wordAttribute(note, 'type'))) continue;
    const id = wordAttribute(note, 'id');
    if (id) notes.set(id, note);
  }
  return { path, notes };
}

/**
 * Copie de la note sans son appel initial (`w:footnoteRef` / `w:endnoteRef`) ni l'espace
 * que Word place juste après. Seul l'élément d'appel est retiré, jamais son run : un run
 * qui porte l'appel et du texte garde son texte. On clone : le document du paquet n'est
 * jamais modifié.
 */
function noteContentClone(note: Element, kind: NoteKind): Element {
  const clone = note.cloneNode(true) as Element;
  const ref = clone.getElementsByTagNameNS('*', `${kind}Ref`)[0];
  const run = ref?.parentElement;
  if (ref && run && run.localName === 'r') {
    const paragraph = run.parentElement;
    ref.remove();
    const firstText = paragraph?.getElementsByTagNameNS('*', 't')[0];
    if (firstText && (firstText.textContent ?? '').startsWith(' ')) {
      firstText.textContent = (firstText.textContent ?? '').slice(1);
    }
  }
  return clone;
}

/** Crée le registre des notes du document. Signature figée par `index.ts`. */
export async function createNoteRegistry(
  pkg: DocxPackage,
  options: ReaderOptions,
): Promise<NoteRegistry> {
  const parts: Record<NoteKind, NotePart | null> = {
    footnote: await loadNotePart(pkg, 'footnote'),
    endnote: await loadNotePart(pkg, 'endnote'),
  };
  const references: Reference[] = [];
  const numbers = new Map<string, number>();
  let droppedWarned = false;

  const warnDropped = (ctx: ConverterContext): void => {
    if (droppedWarned) return;
    droppedWarned = true;
    ctx.warnings.push({
      code: 'footnotes-dropped',
      message: 'Notes de bas de page et de fin supprimées (option footnotes: false)',
    });
  };

  return {
    reference(id, kind, ctx) {
      if (!options.footnotes) {
        warnDropped(ctx);
        return '';
      }
      const key = `${kind}:${id}`;
      let number = numbers.get(key);
      if (number === undefined) {
        number = references.length + 1;
        numbers.set(key, number);
        references.push({ kind, id, number });
      }
      return `<sup data-footnote-ref="${String(number)}">${String(number)}</sup>`;
    },

    async render(ctx) {
      if (!options.footnotes) {
        warnDropped(ctx);
        return '';
      }
      if (references.length === 0) return '';
      const items: string[] = [];
      for (const { kind, id, number } of references) {
        const part = parts[kind];
        const note = part?.notes.get(id);
        let html = '';
        if (part && note) {
          const derived = deriveContext(ctx, {
            part: part.path,
            where: kind,
            tableStyle: null,
          });
          const blocks = await ctx.convert.blocks(noteContentClone(note, kind), derived);
          html = ctx.convert.render(blocks, derived);
        } else {
          ctx.warnings.push({
            code: 'reader',
            message: `Note ${kind} ${id} référencée mais introuvable dans le paquet.`,
          });
        }
        items.push(`<li data-footnote="${String(number)}">${html || '<p></p>'}</li>`);
      }
      return `<ol data-footnotes="">${items.join('')}</ol>`;
    },
  };
}
