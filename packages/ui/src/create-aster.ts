import { createEditor } from '@aster-editor/core';
import type { AsterTheme } from '@aster-editor/core';
import { getFullscreen } from './components/fullscreen';
import { getSourceView } from './components/source-view';
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
  // Vue source et plein écran : contrôleurs partagés avec les widgets `source` et
  // `fullscreen` de la toolbar (même instance via `getSourceView` / `getFullscreen`).
  const sourceView = getSourceView(editor);
  const fullscreen = getFullscreen(editor);

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
      sourceView.destroy();
      tableMenu?.destroy();
      toolbar?.destroy();
      if (!editor.isDestroyed()) editor.destroy();
      root.remove();
    },
  };
}
