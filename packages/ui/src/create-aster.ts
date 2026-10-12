import { createEditor } from '@aster-editor/core';
import type { AsterTheme } from '@aster-editor/core';
import { createTableContextMenu } from './components/table-context-menu';
import { createToolbar, registerUiTranslations } from './toolbar/create-toolbar';
import type { AsterInstance, AsterUiOptions, Toolbar } from './types';
import { el } from './utils/dom';

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
  const { toolbar: toolbarConfig = 'standard', theme = 'light', ...editorOptions } = options;

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
  // expose des commandes `table.*`. Détruit avec l'instance.
  const tableMenu = editor.commands.has('table.delete') ? createTableContextMenu(editor) : null;

  let destroyed = false;

  return {
    editor,
    toolbar,
    element: root,
    setTheme: (next: AsterTheme) => {
      root.setAttribute('data-theme', next);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      tableMenu?.destroy();
      toolbar?.destroy();
      if (!editor.isDestroyed()) editor.destroy();
      root.remove();
    },
  };
}
