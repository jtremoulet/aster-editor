import type { AsterEditor } from '@aster-editor/core';

/**
 * Réglages appliqués à chaud sur l'éditeur monté (nom accessible, placeholder), hors de la
 * classe du composant pour la garder centrée sur le cycle de vie et les inputs.
 */

/** Vue minimale des options de l'extension Tiptap `Placeholder`, pour la changer à chaud. */
interface PlaceholderExtensionOptions {
  placeholder?: unknown;
}

type TiptapEditor = AsterEditor['tiptap'];
type ProseMirrorPlugin = Parameters<TiptapEditor['registerPlugin']>[0];

/** Signature de `addProseMirrorPlugins` d'une extension Tiptap (hors nœud et marque). */
type ExtensionPluginFactory = (this: {
  name: string;
  options: PlaceholderExtensionOptions;
  storage: unknown;
  editor: TiptapEditor;
  type: null;
  parent: undefined;
}) => ProseMirrorPlugin[];

/** Pose l'attribut quand une valeur est fournie, le retire sinon. */
function setOrRemoveAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined || value === '') {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

/** Nom accessible du contenteditable : `aria-label` et/ou `aria-labelledby`, retirés si vides. */
export function applyAriaAttributes(
  editor: AsterEditor,
  label: string | undefined,
  labelledBy: string | undefined,
): void {
  setOrRemoveAttribute(editor.contentElement, 'aria-label', label);
  setOrRemoveAttribute(editor.contentElement, 'aria-labelledby', labelledBy);
}

/**
 * Change le placeholder à chaud. L'extension `Placeholder` lit ses options au moment où
 * son plugin ProseMirror est créé (et `extension.options` est une copie à chaque accès),
 * donc on refabrique le plugin via `addProseMirrorPlugins` avec un `placeholder` surchargé
 * et on le substitue à l'ancien par `unregisterPlugin`/`registerPlugin`, API publiques de
 * Tiptap. Le repli sur la chaîne i18n `editor.placeholder` est conservé.
 */
export function applyPlaceholder(editor: AsterEditor, placeholder: string | undefined): void {
  const tiptap = editor.tiptap;
  const extension = tiptap.extensionManager.extensions.find(
    (candidate) => candidate.name === 'placeholder',
  );
  if (extension?.type !== 'extension') {
    return;
  }
  const factory = extension.config.addProseMirrorPlugins as ExtensionPluginFactory | undefined;
  if (!factory) {
    return;
  }
  const options: PlaceholderExtensionOptions = {
    ...extension.options,
    placeholder: (): string => placeholder ?? editor.i18n.t('editor.placeholder'),
  };
  const plugins = factory.call({
    name: extension.name,
    options,
    storage: extension.storage,
    editor: tiptap,
    type: null,
    parent: undefined,
  });
  for (const plugin of plugins) {
    tiptap.unregisterPlugin(plugin.spec.key ?? extension.name);
    tiptap.registerPlugin(plugin);
  }
}
