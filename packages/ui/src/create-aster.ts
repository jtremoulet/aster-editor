import { createEditor } from '@aster-editor/core';
import type { AsterTheme, Unsubscribe } from '@aster-editor/core';
import { getFullscreen } from './components/fullscreen';
import { createImageBubble } from './components/image-bubble';
import { createLinkBubble } from './components/link-bubble';
import { createSlashMenu, type SlashWidgetName } from './components/slash-menu';
import { releaseSourceView, retainSourceView } from './components/source-view';
import { createTableContextMenu } from './components/table-context-menu';
import { createVariableDialog } from './components/variable-dialog';
import { createVariableSuggestion } from './components/variable-suggestion';
import { createToolbar, registerUiTranslations } from './toolbar/create-toolbar';
import type { AsterInstance, AsterUiOptions, Toolbar } from './types';
import { el } from './utils/dom';

/** Classe du panneau de chaque dialogue de la toolbar que le menu `/` sait ouvrir. */
const WIDGET_PANEL_CLASSES: Readonly<Record<SlashWidgetName, string>> = {
  image: 'aster-image-dialog',
  link: 'aster-link-dialog',
};

/**
 * Ouvre un dialogue de la toolbar depuis le menu `/` : le déclencheur du dropdown
 * dont le panneau porte la classe attendue reçoit un clic. Faux si la toolbar n'a pas
 * ce widget ou si son déclencheur est désactivé (commande refusée).
 */
export function openToolbarWidget(toolbar: Toolbar, widget: SlashWidgetName): boolean {
  const panel = toolbar.element.querySelector(`.${WIDGET_PANEL_CLASSES[widget]}`);
  const trigger = panel?.parentElement?.querySelector<HTMLButtonElement>(
    '.aster-dropdown__trigger',
  );
  if (!trigger || trigger.disabled) return false;
  trigger.click();
  return true;
}

/**
 * Monte un éditeur complet (thème + toolbar + contenu) dans `host`.
 *
 * Structure créée :
 * ```html
 * <div class="aster" data-theme="light">
 *   <div class="aster__toolbar">…</div>
 *   <div class="aster__content">… (créé par le core)</div>
 * </div>
 * ```
 * C'est l'entrée recommandée pour une intégration vanilla, et celle que le wrapper
 * Angular utilise. `toolbar` vaut `'standard'` par défaut, `theme` vaut `'light'`.
 */
export function createAster(host: HTMLElement, options: AsterUiOptions = {}): AsterInstance {
  const {
    toolbar: toolbarConfig = 'standard',
    theme = 'light',
    variableSuggestion = true,
    linkBubble = true,
    imageBubble = true,
    slashMenu = true,
    ...editorOptions
  } = options;

  const root = el('div', { className: 'aster', attrs: { 'data-theme': theme } });
  const toolbarContainer = el('div', { className: 'aster__toolbar' });
  const contentContainer = el('div', { className: 'aster__content' });
  root.append(toolbarContainer, contentContainer);
  host.append(root);

  const editor = createEditor({ ...editorOptions, element: contentContainer });
  registerUiTranslations(editor);

  let toolbar: Toolbar | null = null;
  if (toolbarConfig !== false) {
    toolbar = createToolbar(editor, toolbarContainer, toolbarConfig);
  } else {
    toolbarContainer.remove();
  }
  // Menu contextuel de table (clic droit), indépendant de la toolbar : dès que le core
  // expose des commandes `table.*`. Il se ferme quand l'éditeur passe en lecture seule
  // (vue source comprise) ou que la sélection quitte le tableau. Détruit avec l'instance.
  const tableMenu = editor.commands.has('table.delete') ? createTableContextMenu(editor) : null;
  const subscriptions: Unsubscribe[] = tableMenu
    ? [
        editor.on('readOnlyChange', () => tableMenu.update()),
        editor.on('selectionChange', () => tableMenu.update()),
      ]
    : [];
  // Vue source et plein écran : contrôleurs partagés avec les widgets `source` et
  // `fullscreen` de la toolbar (même instance via `retainSourceView` / `getFullscreen`).
  const sourceView = retainSourceView(editor);
  const fullscreen = getFullscreen(editor);
  // Variables (champs de fusion), dès que le core expose `variable.insert` : édition de
  // puce au double-clic (`aster:variable-edit`) et suggestion `{{` (désactivable).
  const hasVariables = editor.commands.has('variable.insert');
  const variableDialog = hasVariables ? createVariableDialog(editor) : null;
  const suggestion = hasVariables && variableSuggestion ? createVariableSuggestion(editor) : null;
  if (variableDialog)
    subscriptions.push(editor.on('readOnlyChange', () => variableDialog.update()));
  // Bulles contextuelles (lien, image) et menu `/` : chacune s'abonne elle-même aux
  // événements de l'éditeur et se retire avec l'instance. Le menu `/` ouvre les dialogues
  // image et lien de la toolbar quand elle existe.
  const bubbles = [
    ...(linkBubble && editor.commands.has('link.set') ? [createLinkBubble(editor)] : []),
    ...(imageBubble && editor.commands.has('image.setAttributes')
      ? [createImageBubble(editor)]
      : []),
  ];
  const mountedToolbar = toolbar;
  const slash = slashMenu
    ? createSlashMenu(
        editor,
        mountedToolbar ? { openWidget: (widget) => openToolbarWidget(mountedToolbar, widget) } : {},
      )
    : null;

  let destroyed = false;

  return {
    editor,
    toolbar,
    element: root,
    setTheme: (next: AsterTheme) => {
      root.setAttribute('data-theme', next);
    },
    toggleSource: () => sourceView.toggle(),
    isSourceView: () => sourceView.isActive(),
    setFullscreen: (value: boolean) => fullscreen.set(value),
    isFullscreen: () => fullscreen.isActive(),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      fullscreen.destroy();
      releaseSourceView(sourceView);
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.length = 0;
      slash?.destroy();
      for (const bubble of bubbles) bubble.destroy();
      suggestion?.destroy();
      variableDialog?.destroy();
      tableMenu?.destroy();
      toolbar?.destroy();
      if (!editor.isDestroyed()) editor.destroy();
      root.remove();
    },
  };
}
