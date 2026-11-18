import type { AsterEditor } from '@aster-editor/core';
import type { ReferenceElement } from '@floating-ui/dom';
import { el } from '../utils/dom.js';
import { isRecord } from '../utils/guards.js';
import { createBubble, selectionReference, type Bubble } from './bubble.js';
import { createPlainButton, resolveIcon, setDisabled } from './button.js';
import type { TableAction } from './table-grid-picker.js';

/** Action de la bulle : une commande `table.*`, avec ou sans texte à côté de l'icône. */
interface TableBubbleAction {
  readonly id: TableAction;
  /** Clé i18n du texte court affiché dans le bouton ; absente : icône seule. */
  readonly textKey?: string;
  readonly danger?: boolean;
}

/**
 * Actions de la bulle, dans l'ordre. Les deux gestes courants (ajouter une ligne, une
 * colonne) en icônes, puis « Vider » et « Supprimer » en clair : ce sont eux que les
 * utilisateurs ne trouvaient pas au fond du menu de la toolbar et du clic droit.
 */
export const TABLE_BUBBLE_ACTIONS: readonly (TableBubbleAction | 'separator')[] = [
  { id: 'table.addRowAfter' },
  { id: 'table.addColumnAfter' },
  'separator',
  { id: 'table.clear', textKey: 'ui.table.clear' },
  { id: 'table.delete', textKey: 'ui.table.delete', danger: true },
];

/** Vrai si `name` est actif dans la sélection, tolérant si l'extension manque. */
function isActive(editor: AsterEditor, name: string): boolean {
  try {
    return editor.tiptap.isActive(name);
  } catch {
    return false;
  }
}

/**
 * Position ProseMirror du tableau le plus proche qui contient la sélection, `-1` hors d'un
 * tableau ou sans état (éditeur de test).
 */
export function currentTablePos(editor: AsterEditor): number {
  try {
    const tiptap: unknown = editor.tiptap;
    if (!isRecord(tiptap) || !isRecord(tiptap['state'])) return -1;
    const { $from } = editor.tiptap.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === 'table') return $from.before(depth);
    }
  } catch {
    // État incomplet : pas de tableau connu.
  }
  return -1;
}

/**
 * Élément DOM du tableau courant (le `<table>` ou l'enveloppe de son NodeView) via
 * `view.nodeDOM`, sinon le rectangle de la sélection.
 */
function tableReference(editor: AsterEditor): ReferenceElement {
  try {
    const pos = currentTablePos(editor);
    const tiptap: unknown = editor.tiptap;
    if (pos >= 0 && isRecord(tiptap) && isRecord(tiptap['view'])) {
      const dom: unknown = editor.tiptap.view.nodeDOM(pos);
      if (dom instanceof HTMLElement) return dom;
    }
  } catch {
    // Vue démontée ou position hors document.
  }
  return selectionReference(editor);
}

/**
 * Bulle de tableau (retour utilisateurs 0.7 : « pouvoir supprimer ou vider un tableau comme
 * dans Word ») : dès que le curseur est dans un tableau, une petite barre apparaît
 * au-dessus de son coin droit avec ajouter une ligne, ajouter une colonne, **Vider**
 * (`table.clear`) et **Supprimer** (`table.delete`). Les commandes absentes du registre
 * sont omises, les non exécutables grisées. Cachée hors tableau, quand une image est
 * sélectionnée (sa propre bulle prend la place), en lecture seule et en vue source.
 * Montée par `createAster` (option `tableBubble`), utilisable seule.
 */
export function createTableBubble(editor: AsterEditor): Bubble {
  const t = (key: string): string => editor.i18n.t(key);

  /** Commandes de la bulle présentes dans le registre, avec leur état exécutable. */
  const available = (): { action: TableBubbleAction; enabled: boolean }[] =>
    TABLE_BUBBLE_ACTIONS.flatMap((action) =>
      action !== 'separator' && editor.commands.has(action.id)
        ? [{ action, enabled: editor.commands.canRun(action.id) }]
        : [],
    );

  const render = (body: HTMLElement, bubble: Bubble): void => {
    let pendingSeparator = false;
    for (const action of TABLE_BUBBLE_ACTIONS) {
      if (action === 'separator') {
        pendingSeparator = body.childElementCount > 0;
        continue;
      }
      const command = editor.commands.get(action.id);
      if (!command) continue;
      if (pendingSeparator) {
        body.append(el('span', { className: 'aster-bubble__separator' }));
        pendingSeparator = false;
      }
      const button = createPlainButton({
        className: `aster-bubble__button${action.danger ? ' aster-bubble__button--danger' : ''}`,
        icon: resolveIcon(action.id, undefined, command.icon),
        ...(action.textKey ? { text: t(action.textKey) } : {}),
      });
      button.dataset['command'] = action.id;
      const label = t(command.labelKey);
      button.setAttribute('aria-label', label);
      button.title = label;
      setDisabled(button, !editor.commands.canRun(action.id));
      button.addEventListener('click', () => {
        if (button.disabled) return;
        editor.commands.run(action.id);
        if (action.id === 'table.delete') bubble.hide();
        editor.focus();
        bubble.update();
      });
      body.append(button);
    }
  };

  return createBubble(editor, {
    className: 'aster-table-bubble',
    label: () => t('ui.table.actions'),
    placement: 'top-end',
    shouldShow: () =>
      isActive(editor, 'table') && !isActive(editor, 'image') && available().length > 0,
    reference: () => tableReference(editor),
    // Tableau courant + état des boutons : la bulle se reconstruit quand on change de
    // tableau ou qu'une action devient possible (« Vider » dès qu'une cellule a du contenu).
    key: () =>
      `${currentTablePos(editor)}|${available()
        .map(({ enabled }) => (enabled ? '1' : '0'))
        .join('')}|${editor.i18n.t('ui.table.clear')}`,
    render,
  });
}
