import {
  Node,
  mergeAttributes,
  type NodeViewRenderer,
  type NodeViewRendererProps,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import type { NodeView } from '@tiptap/pm/view';
import type { AsterEditor, DocumentLayout, SectionBreakAttrs } from '../api';
import {
  PAGE_VIEW_CHANGE_EVENT,
  PAGE_VIEW_CSS_VARIABLES,
  getActivePageView,
  pageViewCssValues,
  resolvePageMetrics,
  resolveSectionLayout,
} from './page-view';

/** Nom du nœud de saut de section. */
export const SECTION_BREAK_NODE_NAME = 'sectionBreak';
/** Attribut HTML qui porte le numéro de la section qui se termine : `<hr data-section-break="n">`. */
export const SECTION_BREAK_ATTRIBUTE = 'data-section-break';
/** Classe posée par le NodeView sur le `hr` d'édition. */
export const SECTION_BREAK_CLASS = 'aster-section-break';
/**
 * Attribut posé par le NodeView sur le `hr` quand la vue page a des sections : type de
 * saut (`SectionStart`) de la section **suivante** (`nextPage` par défaut), pour que la
 * pagination (L44) sache si la section commence une nouvelle feuille.
 */
export const SECTION_START_ATTRIBUTE = 'data-section-start';

/** Clé du plugin de renumérotation. */
export const sectionBreakPluginKey = new PluginKey('asterSectionBreak');

/** Une section du corps : positions ProseMirror de ses blocs (`from` avant le premier, `to` après le dernier). */
export interface SectionRange {
  readonly from: number;
  readonly to: number;
  /** Numéro de la section, 1 pour la première, dans l'ordre du document (positionnel). */
  readonly section: number;
}

/** Entier ≥ 1 ou `1` : un numéro de section invalide (`0`, `NaN`, texte) ne sort jamais du schéma. */
export function sanitizeSectionNumber(value: unknown): number {
  const number = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof number === 'number' && Number.isInteger(number) && number >= 1 ? number : 1;
}

/** Vrai si le nœud est un saut de section. */
export function isSectionBreak(node: ProseMirrorNode | null | undefined): boolean {
  return node?.type.name === SECTION_BREAK_NODE_NAME;
}

/** Positions et numéros des sauts de section de premier niveau, dans l'ordre du document. */
export function findSectionBreaks(doc: ProseMirrorNode): { pos: number; node: ProseMirrorNode }[] {
  const found: { pos: number; node: ProseMirrorNode }[] = [];
  doc.forEach((node, offset) => {
    if (isSectionBreak(node)) {
      found.push({ pos: offset, node });
    }
  });
  return found;
}

/**
 * Sections du document : les blocs de premier niveau entre deux sauts. Un document sans
 * saut est une seule section `{ from: 0, to: doc.content.size, section: 1 }`. Les numéros
 * sont **positionnels** (1..n dans l'ordre), indépendants de l'attribut `section` des
 * sauts, qui peut être désynchronisé par un HTML chargé tel quel. Un saut imbriqué dans
 * un autre bloc (citation, cellule) n'est pas une frontière de section.
 */
export function getSections(editor: AsterEditor): SectionRange[] {
  const { doc } = editor.tiptap.state;
  const sections: SectionRange[] = [];
  let from = 0;
  for (const { pos, node } of findSectionBreaks(doc)) {
    sections.push({ from, to: pos, section: sections.length + 1 });
    from = pos + node.nodeSize;
  }
  sections.push({ from, to: doc.content.size, section: sections.length + 1 });
  return sections;
}

/**
 * Renumérote les sauts de premier niveau 1..n dans l'ordre du document. `setNodeMarkup`
 * ne change pas les tailles : les positions lues avant restent valides. Retourne vrai
 * si au moins un attribut a changé.
 */
export function renumberSections(tr: Transaction): boolean {
  let changed = false;
  findSectionBreaks(tr.doc).forEach(({ pos, node }, index) => {
    const section = index + 1;
    if (node.attrs['section'] !== section) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, section });
      changed = true;
    }
  });
  return changed;
}

/**
 * Vrai si la transaction remplace tout le document (`setContent`, donc `setHTML` /
 * `setJSON`) : un seul pas de remplacement de 0 à la fin. La numérotation d'un document
 * chargé est alors gardée telle quelle, pour que `setHTML(getHTML())` reste strictement
 * idempotent même sur un HTML dont les numéros ne partent pas de 1.
 */
function isFullReplacement(tr: Transaction): boolean {
  return tr.steps.every(
    (step, index) =>
      step instanceof ReplaceStep && step.from === 0 && step.to === tr.docs[index]?.content.size,
  );
}

/** Nombre de sauts de premier niveau. */
function countSectionBreaks(doc: ProseMirrorNode): number {
  return findSectionBreaks(doc).length;
}

/**
 * NodeView d'un saut de section : `<hr class="aster-section-break" data-section-break="n">`.
 * Quand la vue page est active avec `layout.sections`, le `hr` porte en plus, en style
 * inline, les variables `--aster-page-*` (mêmes noms que sur l'hôte) de la section
 * **suivante** (`n + 1`, `resolveSectionLayout`), et `data-section-start` avec son type de
 * saut. La feuille `ui/themes/page.css` et la pagination (L44) changent de feuille à ce
 * point ; le core ne fait que poser les valeurs. Le NodeView écoute `aster:page-view-change`
 * sur `view.dom` pour suivre `setPageView` sans transaction.
 */
export class SectionBreakNodeView implements NodeView {
  readonly dom: HTMLElement;
  private node: ProseMirrorNode;

  constructor(private readonly props: NodeViewRendererProps) {
    this.node = props.node;
    this.dom = document.createElement('hr');
    this.dom.className = SECTION_BREAK_CLASS;
    this.render();
    props.view.dom.addEventListener(PAGE_VIEW_CHANGE_EVENT, this.refresh);
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.props.view.dom.removeEventListener(PAGE_VIEW_CHANGE_EVENT, this.refresh);
  }

  private readonly refresh = (): void => {
    this.render();
  };

  /** Reflète le numéro de section et, si la vue page a des sections, la feuille suivante. */
  private render(): void {
    const section = sanitizeSectionNumber(this.node.attrs['section']);
    this.dom.setAttribute(SECTION_BREAK_ATTRIBUTE, String(section));
    const layout: DocumentLayout | undefined = getActivePageView(this.props.view.dom)?.layout;
    const sections = layout?.sections;
    if (!layout || !sections || sections.length === 0) {
      this.dom.removeAttribute('style');
      this.dom.removeAttribute(SECTION_START_ATTRIBUTE);
      return;
    }
    const next = resolveSectionLayout(layout, section + 1);
    const values = pageViewCssValues(resolvePageMetrics(next));
    PAGE_VIEW_CSS_VARIABLES.forEach((name, index) => {
      this.dom.style.setProperty(name, values[index] ?? '');
    });
    this.dom.setAttribute(SECTION_START_ATTRIBUTE, next.start ?? 'nextPage');
  }
}

/** Fabrique de NodeView de saut de section, exposée pour les tests. */
export function renderSectionBreakNodeView(): NodeViewRenderer {
  return (props) => new SectionBreakNodeView(props);
}

/**
 * Nœud `sectionBreak` : bloc atomique, sélectionnable, non déplaçable, attribut `section`
 * (entier ≥ 1). HTML figé : `<hr data-section-break="n">`, lu avant le `hr` ordinaire
 * (`priority` de règle supérieure). Backspace et Delete le suppriment comme un
 * `horizontalRule` (`joinBackward` efface l'atome précédent, `deleteSelection` l'atome
 * sélectionné). Après toute insertion ou suppression d'un saut hors remplacement complet
 * du document, le plugin renumérote les sauts 1..n (`renumberSections`). Le `TrailingNode`
 * de `StarterKit` garantit qu'un paragraphe suit toujours un saut final.
 */
export const SectionBreak = Node.create({
  name: SECTION_BREAK_NODE_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      section: {
        default: 1,
        parseHTML: (element: HTMLElement) =>
          sanitizeSectionNumber(element.getAttribute(SECTION_BREAK_ATTRIBUTE)),
        renderHTML: (attributes: Record<string, unknown>) => ({
          [SECTION_BREAK_ATTRIBUTE]: String(sanitizeSectionNumber(attributes['section'])),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `hr[${SECTION_BREAK_ATTRIBUTE}]`, priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return renderSectionBreakNodeView();
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: sectionBreakPluginKey,
        appendTransaction: (transactions, oldState, newState) => {
          const edits = transactions.filter((tr) => tr.docChanged && !isFullReplacement(tr));
          if (edits.length === 0) {
            return null;
          }
          if (countSectionBreaks(oldState.doc) === countSectionBreaks(newState.doc)) {
            return null;
          }
          const tr = newState.tr;
          return renumberSections(tr) ? tr : null;
        },
      }),
    ];
  },
});

/** Attributs typés d'un nœud `sectionBreak`, pour les lecteurs du document. */
export function sectionBreakAttrs(node: ProseMirrorNode): SectionBreakAttrs {
  return { section: sanitizeSectionNumber(node.attrs['section']) };
}
