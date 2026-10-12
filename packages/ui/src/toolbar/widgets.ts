import type { AsterEditor } from '@aster-editor/core';
import { createColorPicker } from '../components/color-picker';
import { createFontFamilyMenu, createFontSizeMenu } from '../components/font-menu';
import { createHeadingMenu } from '../components/heading-menu';
import { createImageDialog } from '../components/image-dialog';
import { createLinkDialog } from '../components/link-dialog';
import { createTableGridPicker } from '../components/table-grid-picker';
import type { ToolbarWidget, WidgetFactory } from '../types';

/** Un widget connu : sa fabrique et les commandes dont il a besoin pour exister. */
interface WidgetDefinition {
  readonly factory: WidgetFactory;
  /** Au moins une de ces commandes doit être enregistrée pour que le widget soit rendu. */
  readonly requires: readonly string[];
}

/**
 * Registre des widgets spécialisés référencés par `{ type: 'widget', widget }`. Les
 * identifiants suivent le contrat `ToolbarWidgetItem` du core.
 */
export const WIDGETS: Readonly<Record<string, WidgetDefinition>> = {
  heading: { factory: createHeadingMenu, requires: ['heading', 'paragraph'] },
  table: { factory: createTableGridPicker, requires: ['table.insert'] },
  link: { factory: createLinkDialog, requires: ['link.set'] },
  image: { factory: createImageDialog, requires: ['image.insert'] },
  textColor: {
    factory: (editor) => createColorPicker(editor, 'textColor'),
    requires: ['textColor'],
  },
  backgroundColor: {
    factory: (editor) => createColorPicker(editor, 'backgroundColor'),
    requires: ['backgroundColor'],
  },
  fontFamily: { factory: createFontFamilyMenu, requires: ['fontFamily'] },
  fontSize: { factory: createFontSizeMenu, requires: ['fontSize'] },
};

/**
 * Instancie un widget par nom. Retourne `null`, avec un avertissement, si le nom est
 * inconnu ou si aucune des commandes requises n'est enregistrée : la toolbar reste
 * utilisable même avec un core partiellement configuré.
 */
export function createWidget(editor: AsterEditor, name: string): ToolbarWidget | null {
  const definition = WIDGETS[name];
  if (!definition) {
    console.warn(`[aster-ui] unknown toolbar widget "${name}"`);
    return null;
  }
  if (!definition.requires.some((id) => editor.commands.has(id))) {
    console.warn(
      `[aster-ui] widget "${name}" skipped: none of [${definition.requires.join(', ')}] is registered`,
    );
    return null;
  }
  return definition.factory(editor);
}
