import {
  Node,
  mergeAttributes,
  type NodeViewRenderer,
  type NodeViewRendererProps,
} from '@tiptap/core';
import type { Node as ProseMirrorNode, NodeType } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';
import type { AsterEditor, DocumentLayout, SectionBreakAttrs } from '../api';
import {
  PAGE_VIEW_CHANGE_EVENT,
  PAGE_VIEW_CSS_VARIABLES,
  SECTION_BREAKS_CHANGE_EVENT,
  getActivePageView,
  pageViewCssValues,
  resolvePageMetrics,
  resolveSectionLayout,
  sectionOpenedByBreak,
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
/**
 * Événement DOM (sans bulle) émis sur `view.dom` par le plugin quand la suite des sauts
 * de premier niveau change (insertion, suppression, remplacement) : chaque NodeView
 * recalcule alors son rang (R44-01), et la vue page rafraîchit le pied de l'hôte (L50).
 * Émis après la mise à jour complète de la vue, quand les positions sont exactes ;
 * pendant `update()`, ProseMirror peut encore porter des nœuds périmés avant le saut.
 * Défini dans `page-view.ts` (qui l'écoute) pour éviter un cycle d'imports.
 */
export { SECTION_BREAKS_CHANGE_EVENT } from './page-view';

/**
 * Numéro de section maximal (R41-06), même ordre de grandeur que `MAX_PAGE_MM`. Au-delà,
 * un nombre n'est plus garanti exactement représentable (`2 ** 53`) ni sérialisable sans
 * exposant (`1e21` → `"1e+21"`, relu `1`) : `setHTML(getHTML())` changerait le document.
 */
export const MAX_SECTION_NUMBER = 10_000;

/**
 * Méta de transaction posée par `replaceContent` (`setHTML` / `setJSON`) sur le pas de
 * remplacement complet. Le plugin la lit pour garder telle quelle la numérotation d'un
 * document chargé (`setHTML(getHTML())` reste strictement idempotent même sur des numéros
 * qui ne partent pas de 1). Toute autre transaction, y compris un collage qui remplace
 * tout le document (Ctrl+A puis Ctrl+V, `insertHTML`), est une édition et renumérote
 * (R41-02) : la forme des pas ne distingue pas un chargement d'un collage.
 */
export const SET_CONTENT_META = 'asterSetContent';

/** Clé du plugin de renumérotation. */
export const sectionBreakPluginKey = new PluginKey('asterSectionBreak');

/** Une section du corps : positions ProseMirror de ses blocs (`from` avant le premier, `to` après le dernier). */
export interface SectionRange {
  readonly from: number;
  readonly to: number;
  /** Numéro de la section, 1 pour la première, dans l'ordre du document (positionnel). */
  readonly section: number;
}

/**
 * Entier de 1 à `MAX_SECTION_NUMBER`, sinon `1` : un numéro de section invalide (`0`,
 * `NaN`, texte, hors borne) ne sort jamais du schéma.
 */
export function sanitizeSectionNumber(value: unknown): number {
  const number = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof number === 'number' &&
    Number.isInteger(number) &&
    number >= 1 &&
    number <= MAX_SECTION_NUMBER
    ? number
    : 1;
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
 * un autre bloc (citation, cellule) n'est pas une frontière de section ; le plugin le
 * ramène d'ailleurs à un `horizontalRule` dès la transaction suivante.
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
 * Rang (0-based) d'un saut parmi les sauts de premier niveau du document : par identité
 * du nœud d'abord (le document de `view.state` est déjà le nouveau pendant la mise à jour
 * des NodeViews), sinon par position (`getPos`), `null` si le saut n'est pas de premier
 * niveau (imbriqué, ramené à un `hr` à la transaction suivante). Positionnel, comme
 * `getSections` : l'attribut `section` n'entre pas en jeu (R44-01).
 */
export function sectionBreakRank(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  pos: number | undefined,
): number | null {
  const breaks = findSectionBreaks(doc);
  const byIdentity = breaks.findIndex((found) => found.node === node);
  if (byIdentity >= 0) {
    return byIdentity;
  }
  const byPosition = pos === undefined ? -1 : breaks.findIndex((found) => found.pos === pos);
  return byPosition >= 0 ? byPosition : null;
}

/** Suite ordonnée des numéros des sauts de premier niveau, telle que le HTML les émet. */
function sectionNumbers(doc: ProseMirrorNode): number[] {
  return findSectionBreaks(doc).map(({ node }) => sanitizeSectionNumber(node.attrs['section']));
}

/** Vrai si deux suites de numéros sont identiques, terme à terme. */
function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((number, index) => number === b[index]);
}

/**
 * Ramène les sauts imbriqués (cellule, citation, item de liste) à un `horizontalRule`
 * quand le parent l'accepte, sinon les retire (R41-08). Le contrat décrit un bloc de
 * premier niveau : un saut imbriqué n'est ni une frontière de section ni renuméroté, et
 * l'export Word ne saurait pas où le poser. Retourne vrai si le document a changé.
 */
function demoteNestedSectionBreaks(tr: Transaction): boolean {
  const nested: { pos: number; node: ProseMirrorNode; parent: ProseMirrorNode; index: number }[] =
    [];
  tr.doc.descendants((node, pos, parent, index) => {
    if (!isSectionBreak(node)) {
      return true;
    }
    if (parent && parent !== tr.doc) {
      nested.push({ pos, node, parent, index });
    }
    return false;
  });
  const rule: NodeType | undefined = tr.doc.type.schema.nodes['horizontalRule'];
  // De la fin vers le début : un retrait ne décale pas les positions encore à traiter.
  for (const { pos, node, parent, index } of nested.reverse()) {
    if (rule && parent.canReplaceWith(index, index + 1, rule)) {
      tr.replaceWith(pos, pos + node.nodeSize, rule.create());
    } else {
      tr.delete(pos, pos + node.nodeSize);
    }
  }
  return nested.length > 0;
}

/**
 * Garantit un bloc avant un saut en tête de document et entre deux sauts adjacents
 * (R41-03) : jamais de section vide. Un `w:sectPr` vit dans le dernier paragraphe de sa
 * section, une section sans bloc n'est donc pas exportable, et la vue page la rendrait
 * comme une feuille vide. Même rôle que `TrailingNode` après un saut final ; s'applique
 * aussi au chargement. Retourne vrai si un paragraphe a été inséré.
 */
function ensureSectionBlocks(tr: Transaction, paragraph: NodeType): boolean {
  const positions: number[] = [];
  let previous: ProseMirrorNode | null = null;
  tr.doc.forEach((node, offset) => {
    if (isSectionBreak(node) && (previous === null || isSectionBreak(previous))) {
      positions.push(offset);
    }
    previous = node;
  });
  // De la fin vers le début : une insertion ne décale pas les positions encore à traiter.
  for (const pos of positions.reverse()) {
    tr.insert(pos, paragraph.create());
  }
  return positions.length > 0;
}

/**
 * NodeView d'un saut de section : `<hr class="aster-section-break" data-section-break="n">`.
 * Quand la vue page est active avec `layout.sections`, le `hr` porte en plus, en style
 * inline, les variables `--aster-page-*` (mêmes noms que sur l'hôte) de la section que ce
 * saut **ouvre**, et `data-section-start` avec son type de saut. Cette section est
 * **positionnelle** (`sectionOpenedByBreak`, R44-01 : le k-ième saut ouvre la section
 * k + 1), la même que la pagination lit pour la coupure qui suit ; l'attribut `section`
 * n'y entre pas (un document chargé peut porter des numéros hors ordre). La feuille
 * `ui/themes/page.css` et la pagination (L44) changent de feuille à ce point ; le core
 * ne fait que poser les valeurs. Le NodeView écoute `aster:page-view-change` (suivre
 * `setPageView` sans transaction) et `aster:section-breaks-change` (suite des sauts
 * modifiée) sur `view.dom`.
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
    props.view.dom.addEventListener(SECTION_BREAKS_CHANGE_EVENT, this.refresh);
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
    this.props.view.dom.removeEventListener(SECTION_BREAKS_CHANGE_EVENT, this.refresh);
  }

  private readonly refresh = (): void => {
    this.render();
  };

  /**
   * Section que ce saut ouvre : positionnelle (`sectionBreakRank`), avec l'attribut
   * `section + 1` en repli si le saut n'est pas (encore) de premier niveau.
   */
  private openedSection(): number {
    const rank = sectionBreakRank(this.props.view.state.doc, this.node, this.props.getPos());
    return rank === null
      ? sanitizeSectionNumber(this.node.attrs['section']) + 1
      : sectionOpenedByBreak(rank);
  }

  /** Reflète le numéro de section et, si la vue page a des sections, la feuille suivante. */
  private render(): void {
    const section = sanitizeSectionNumber(this.node.attrs['section']);
    this.dom.setAttribute(SECTION_BREAK_ATTRIBUTE, String(section));
    const layout: DocumentLayout | undefined = getActivePageView(this.props.view.dom)?.layout;
    const sections = layout?.sections;
    if (!layout || !Array.isArray(sections) || sections.length === 0) {
      this.dom.removeAttribute('style');
      this.dom.removeAttribute(SECTION_START_ATTRIBUTE);
      return;
    }
    const next = resolveSectionLayout(layout, this.openedSection());
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
 * (entier de 1 à `MAX_SECTION_NUMBER`). HTML figé : `<hr data-section-break="n">`, lu avant
 * le `hr` ordinaire (`priority` de règle supérieure). Backspace et Delete le suppriment
 * comme un `horizontalRule` (`joinBackward` efface l'atome précédent, `deleteSelection`
 * l'atome sélectionné).
 *
 * Le plugin maintient trois invariants du corps après chaque transaction qui change le
 * document : un saut imbriqué redevient un `horizontalRule` (`demoteNestedSectionBreaks`) ;
 * un paragraphe précède toujours un saut en tête et sépare deux sauts adjacents
 * (`ensureSectionBlocks`, le `TrailingNode` de `StarterKit` couvrant le saut final) ; hors
 * chargement complet (`SET_CONTENT_META`), dès que la suite ordonnée des numéros de premier
 * niveau diffère de celle d'avant (insertion, suppression, collage, déplacement, changement
 * d'attribut), les sauts sont renumérotés 1..n (`renumberSections`). Sa vue émet
 * `aster:section-breaks-change` dès que la suite des nœuds de saut change, pour que chaque
 * NodeView recalcule la section qu'il ouvre (R44-01).
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
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          const tr = newState.tr;
          let changed = demoteNestedSectionBreaks(tr);
          const paragraph: NodeType | undefined = newState.schema.nodes['paragraph'];
          if (paragraph) {
            changed = ensureSectionBlocks(tr, paragraph) || changed;
          }
          const edited = transactions.some(
            (transaction) =>
              transaction.docChanged && transaction.getMeta(SET_CONTENT_META) !== true,
          );
          if (edited && !sameNumbers(sectionNumbers(oldState.doc), sectionNumbers(newState.doc))) {
            changed = renumberSections(tr) || changed;
          }
          return changed ? tr : null;
        },
        view: () => ({
          update: (view, prevState) => {
            if (view.state.doc === prevState.doc) {
              return;
            }
            const before = findSectionBreaks(prevState.doc);
            const after = findSectionBreaks(view.state.doc);
            const same =
              before.length === after.length &&
              before.every((found, index) => found.node === after[index]?.node);
            if (!same) {
              view.dom.dispatchEvent(new CustomEvent(SECTION_BREAKS_CHANGE_EVENT));
            }
          },
        }),
      }),
    ];
  },
});

/** Attributs typés d'un nœud `sectionBreak`, pour les lecteurs du document. */
export function sectionBreakAttrs(node: ProseMirrorNode): SectionBreakAttrs {
  return { section: sanitizeSectionNumber(node.attrs['section']) };
}
