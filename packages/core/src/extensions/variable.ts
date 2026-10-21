import {
  Node,
  nodeInputRule,
  type NodeViewRenderer,
  type NodeViewRendererProps,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';
import type { AsterEditor, Unsubscribe } from '../api/index.js';
import {
  VARIABLE_NODE_NAME,
  isValidVariableName,
  variableLabel,
  variableName,
  variablePlaceholder,
} from '../editor/variable-store.js';

/** Nom de l'événement DOM émis au double-clic sur une puce, pour ouvrir le dialogue d'édition. */
export const VARIABLE_EDIT_EVENT = 'aster:variable-edit';

/** Attribut HTML qui porte le nom de la variable dans la sortie de `getHTML()`. */
export const VARIABLE_HTML_ATTRIBUTE = 'data-aster-variable';
/** Attribut HTML du libellé optionnel de la puce. */
export const VARIABLE_LABEL_ATTRIBUTE = 'data-label';

/** Classe CSS de la puce rendue par le NodeView. */
export const VARIABLE_CLASS = 'aster-variable';
/** Classe posée quand la valeur est connue : la puce affiche la valeur, `title` = `{{nom}}`. */
export const VARIABLE_RESOLVED_CLASS = 'aster-variable--resolved';
/** Classe posée quand la variable n'a pas de valeur : la puce affiche le libellé (ou le nom). */
export const VARIABLE_UNRESOLVED_CLASS = 'aster-variable--unresolved';
/** Classe posée tant que la puce est sélectionnée, en plus de `ProseMirror-selectednode`. */
export const VARIABLE_SELECTED_CLASS = 'aster-variable--selected';

/**
 * Règle de saisie : `{{nom}}` tapé au clavier devient une puce. Sans groupe capturant,
 * volontairement : `nodeInputRule` ne remplacerait alors que le groupe et laisserait
 * les accolades dans le texte. Le motif de nom est celui d'`isValidVariableName`, donc
 * un nom invalide (`{{a b}}`) reste du texte.
 */
export const VARIABLE_INPUT_RULE = /\{\{[\p{L}\p{N}_][\p{L}\p{N}_.-]*\}\}$/u;

/** Détail de l'événement `aster:variable-edit` : position ProseMirror de la puce et nom. */
export interface VariableEditEventDetail {
  readonly pos: number;
  readonly name: string;
}

/** Options de l'extension `Variable`. */
export interface VariableOptions {
  /**
   * Éditeur Aster propriétaire : magasin de valeurs, i18n, événements. `null` (défaut
   * hors `createAsterExtensions`) : les puces affichent le libellé et ne se rafraîchissent pas.
   */
  readonly aster: AsterEditor | null;
}

/**
 * NodeView vanilla d'une variable : `<span class="aster-variable" data-name="nom">`.
 *
 * - Valeur connue dans le magasin → texte = valeur, classe `--resolved`, `title` = `{{nom}}`.
 * - Sinon → texte = libellé (ou nom), classe `--unresolved`, `title` traduit.
 * - S'abonne à `variablesChange` (et `localeChange` pour le `title`) de l'éditeur Aster
 *   et se désabonne dans `destroy` : pas de fuite quand la puce quitte le document.
 * - Double-clic → sélection du nœud puis `aster:variable-edit` (bubbles) depuis `view.dom`,
 *   avec `{ pos, name }`, que `ui` écoute pour ouvrir son dialogue.
 * - Les mutations DOM internes sont ignorées : le NodeView est seul maître de son DOM.
 */
export class VariableNodeView implements NodeView {
  readonly dom: HTMLElement;
  private node: ProseMirrorNode;
  private readonly subscriptions: Unsubscribe[] = [];

  constructor(
    private readonly props: NodeViewRendererProps,
    private readonly aster: AsterEditor | null,
  ) {
    this.node = props.node;
    this.dom = document.createElement('span');
    this.dom.className = VARIABLE_CLASS;
    // Explicite plutôt que via le setter `contentEditable`, que jsdom ne reflète pas.
    this.dom.setAttribute('contenteditable', 'false');
    this.render();
    this.dom.addEventListener('dblclick', this.onDoubleClick);
    if (aster) {
      this.subscriptions.push(
        aster.on('variablesChange', this.refresh),
        aster.on('localeChange', this.refresh),
      );
    }
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    this.render();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add(VARIABLE_SELECTED_CLASS, 'ProseMirror-selectednode');
  }

  deselectNode(): void {
    this.dom.classList.remove(VARIABLE_SELECTED_CLASS, 'ProseMirror-selectednode');
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.dom.removeEventListener('dblclick', this.onDoubleClick);
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions.length = 0;
  }

  private readonly refresh = (): void => {
    this.render();
  };

  /** Reflète nom, libellé et valeur courante dans le DOM. */
  private render(): void {
    const name = variableName(this.node);
    const label = variableLabel(this.node) ?? name;
    this.dom.setAttribute('data-name', name);
    const value = this.aster?.variables.getValues()[name];
    if (value !== undefined) {
      this.dom.textContent = value;
      this.dom.classList.add(VARIABLE_RESOLVED_CLASS);
      this.dom.classList.remove(VARIABLE_UNRESOLVED_CLASS);
      this.dom.setAttribute('title', variablePlaceholder(name));
      return;
    }
    this.dom.textContent = label;
    this.dom.classList.add(VARIABLE_UNRESOLVED_CLASS);
    this.dom.classList.remove(VARIABLE_RESOLVED_CLASS);
    this.dom.setAttribute(
      'title',
      this.aster ? this.aster.i18n.t('variable.unresolved', { name }) : variablePlaceholder(name),
    );
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    const pos = this.props.getPos();
    if (pos === undefined || !this.props.editor.isEditable) {
      return;
    }
    event.preventDefault();
    const { view } = this.props;
    if (!(view.state.selection instanceof NodeSelection) || view.state.selection.from !== pos) {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    }
    const detail: VariableEditEventDetail = { pos, name: variableName(this.node) };
    view.dom.dispatchEvent(
      new CustomEvent<VariableEditEventDetail>(VARIABLE_EDIT_EVENT, { bubbles: true, detail }),
    );
  };
}

/** Fabrique de NodeView de variable liée à un éditeur Aster (ou à aucun), exposée pour les tests. */
export function renderVariableNodeView(aster: AsterEditor | null): NodeViewRenderer {
  return (props) => new VariableNodeView(props, aster);
}

/**
 * Nœud `variable` : inline, atomique, sélectionnable, non déplaçable. Attributs `name`
 * (obligatoire) et `label` (optionnel).
 *
 * HTML figé : `<span data-aster-variable="nom" data-label="Nom">{{nom}}</span>`. Le texte
 * `{{nom}}` est bien dans la sortie pour que `getHTML()` reste lisible hors éditeur ;
 * à la relecture il est ignoré (nœud atomique). Un `span` dont le nom est invalide n'est
 * pas reconnu et son texte reste du texte. `{{nom}}` en texte brut chargé ou collé n'est
 * **pas** converti (c'est le rôle du paquet `word`) ; seule la règle de saisie le fait.
 */
export const Variable = Node.create<VariableOptions>({
  name: VARIABLE_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { aster: null };
  },

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute(VARIABLE_HTML_ATTRIBUTE) ?? '',
        // Un nom invalide (nœud injecté via `setJSON`) n'est pas exporté : le `span` nu
        // est relu comme du texte, jamais comme une puce.
        renderHTML: (attributes: Record<string, unknown>) => {
          const name = attributes['name'];
          return typeof name === 'string' && isValidVariableName(name)
            ? { [VARIABLE_HTML_ATTRIBUTE]: name }
            : {};
        },
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute(VARIABLE_LABEL_ATTRIBUTE) || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const label = attributes['label'];
          return typeof label === 'string' && label !== ''
            ? { [VARIABLE_LABEL_ATTRIBUTE]: label }
            : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `span[${VARIABLE_HTML_ATTRIBUTE}]`,
        getAttrs: (element: HTMLElement) =>
          isValidVariableName(element.getAttribute(VARIABLE_HTML_ATTRIBUTE) ?? '') ? null : false,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', HTMLAttributes, variablePlaceholder(variableName(node))];
  },

  // Texte Tiptap (compteur de caractères, `generateText`) : la syntaxe canonique.
  renderText({ node }) {
    return variablePlaceholder(variableName(node));
  },

  addNodeView() {
    return renderVariableNodeView(this.options.aster);
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: VARIABLE_INPUT_RULE,
        type: this.type,
        getAttributes: (match) => ({ name: match[0].slice(2, -2) }),
      }),
    ];
  },
});
