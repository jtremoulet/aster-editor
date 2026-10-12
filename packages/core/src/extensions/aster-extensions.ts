import type { AnyExtension } from '@tiptap/core';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';
import type { AsterEditor, AsterOptions } from '../api';
import { createImageExtension } from './image';
import { createLinkExtension, type ResolvedLinkPolicy } from './link-safety';
import { Search } from './search';
import { createShortcutsExtension, type ShortcutsExtensionOptions } from './shortcuts';

/** Dépendances de l'assemblage, fournies par l'éditeur au montage. */
export interface AsterExtensionsContext {
  readonly editor: AsterEditor;
  readonly options: AsterOptions;
  readonly linkPolicy: ResolvedLinkPolicy;
  readonly shortcuts: ShortcutsExtensionOptions;
}

/**
 * Jeu d'extensions Tiptap d'Aster.
 *
 * `StarterKit` apporte déjà gras, italique, souligné, barré, code, titres, listes,
 * citation, règle, historique, curseurs et nœud de fin. On en retire `link` pour
 * le remplacer par la version sécurisée, et on ajoute tables, alignement, images,
 * indice/exposant, surlignage, styles de texte, tâches, placeholder et compteurs.
 * Les extensions de l'intégrateur viennent en dernier pour pouvoir surcharger.
 */
export function createAsterExtensions(context: AsterExtensionsContext): AnyExtension[] {
  const { editor, options } = context;
  return [
    StarterKit.configure({
      link: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      dropcursor: { width: 2 },
    }),
    createLinkExtension(context.linkPolicy),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 48 } }),
    // Pas de `defaultAlignment` : en v3 c'est un défaut d'attribut, donc chaque bloc
    // le porterait et sérialiserait `text-align: left` partout. On garde `null` pour
    // un HTML propre ; c'est la commande `alignLeft` qui traite « absent » comme gauche.
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    createImageExtension(context.linkPolicy),
    Subscript,
    Superscript,
    Highlight.configure({ multicolor: true }),
    TextStyleKit,
    Placeholder.configure({
      // Fonction, pas chaîne : le texte suit la locale courante après `setLocale`.
      placeholder: () => options.placeholder ?? editor.i18n.t('editor.placeholder'),
    }),
    CharacterCount,
    Search,
    createShortcutsExtension(context.shortcuts),
    ...(options.extensions ?? []),
  ];
}
