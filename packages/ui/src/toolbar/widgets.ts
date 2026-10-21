import type { AsterEditor } from '@aster-editor/core';
import { createCapsMenu } from '../components/caps.js';
import { createColorPicker } from '../components/color-picker.js';
import { createFontFamilyMenu, createFontSizeMenu } from '../components/font-menu.js';
import { createFormatPainterButton } from '../components/format-painter-button.js';
import { createFullscreenButton } from '../components/fullscreen.js';
import { createHeadingMenu } from '../components/heading-menu.js';
import { createImageDialog } from '../components/image-dialog.js';
import { createLineSpacingMenu } from '../components/line-spacing.js';
import { createLinkDialog } from '../components/link-dialog.js';
import { createOutlinePanel } from '../components/outline-panel.js';
import { createPageLayoutDialog } from '../components/page-layout-dialog.js';
import { createParagraphBordersDialog } from '../components/paragraph-borders-dialog.js';
import { createIndentButton } from '../components/paragraph-indent.js';
import { createParagraphSpacingDialog } from '../components/paragraph-spacing-dialog.js';
import { createPrintButton } from '../components/print.js';
import { createSearchPanel } from '../components/search-panel.js';
import { createSourceButton } from '../components/source-view.js';
import { createSpecialChars } from '../components/special-chars.js';
import { createTableGridPicker } from '../components/table-grid-picker.js';
import { createUnderlineStyleMenu } from '../components/underline-style.js';
import { createVariableMenu } from '../components/variable-menu.js';
import type { ToolbarWidget, WidgetFactory } from '../types.js';

/** Un widget connu : sa fabrique et les commandes dont il a besoin pour exister. */
interface WidgetDefinition {
  readonly factory: WidgetFactory;
  /** Au moins une de ces commandes doit être enregistrée pour que le widget soit rendu. Vide : aucune condition. */
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
  search: { factory: createSearchPanel, requires: ['search.open'] },
  variable: { factory: createVariableMenu, requires: ['variable.insert'] },
  // Sommaire (titres) et reproduction de mise en forme (commandes `formatPainter.*`,
  // hors contrat figé comme `search.*`).
  outline: { factory: createOutlinePanel, requires: ['heading'] },
  formatPainter: {
    factory: (editor) => createFormatPainterButton(editor),
    requires: ['formatPainter.copy'],
  },
  // Vue source, plein écran, caractères spéciaux et impression ne dépendent d'aucune
  // commande du core.
  source: { factory: createSourceButton, requires: [] },
  fullscreen: { factory: createFullscreenButton, requires: [] },
  specialChars: { factory: createSpecialChars, requires: [] },
  print: { factory: (editor) => createPrintButton(editor), requires: [] },
  // Mise en page (session 3, L26) : paragraphe (`paragraph.setLayout`), retraits (délèguent
  // à `indent` / `outdent` dans une liste), casse et style de souligné (marques de run,
  // commandes additives `text.*` de L23), mise en page du document (`setPageView`, détecté
  // à l'exécution : le widget se désactive si le core ne l'expose pas).
  lineSpacing: { factory: createLineSpacingMenu, requires: ['paragraph.setLayout'] },
  paragraphSpacing: { factory: createParagraphSpacingDialog, requires: ['paragraph.setLayout'] },
  indentIncrease: {
    factory: (editor) => createIndentButton(editor, 'increase'),
    requires: ['paragraph.setLayout', 'indent'],
  },
  indentDecrease: {
    factory: (editor) => createIndentButton(editor, 'decrease'),
    requires: ['paragraph.setLayout', 'outdent'],
  },
  paragraphBorders: { factory: createParagraphBordersDialog, requires: ['paragraph.setLayout'] },
  caps: { factory: createCapsMenu, requires: ['text.setCaps'] },
  underlineStyle: { factory: createUnderlineStyleMenu, requires: ['underline'] },
  pageLayout: { factory: createPageLayoutDialog, requires: [] },
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
  if (
    definition.requires.length > 0 &&
    !definition.requires.some((id) => editor.commands.has(id))
  ) {
    console.warn(
      `[aster-ui] widget "${name}" skipped: none of [${definition.requires.join(', ')}] is registered`,
    );
    return null;
  }
  return definition.factory(editor);
}
