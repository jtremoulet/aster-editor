import type { AnyExtension } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';
import type { AsterEditor, AsterOptions } from '../api';
import { createImageExtension } from './image';
import { createLinkExtension, type ResolvedLinkPolicy } from './link-safety';
import { ListLayout } from './list-layout';
import { Outline } from './outline';
import { ParagraphLayout } from './paragraph-layout';
import {
  AsterHighlight,
  AsterStrike,
  AsterTextStyle,
  AsterUnderline,
  RunLayout,
} from './run-layout';
import { AsterHorizontalRule } from './page-break';
import { Pagination } from './pagination';
import { Search } from './search';
import { createShortcutsExtension, type ShortcutsExtensionOptions } from './shortcuts';
import { createTableExtensions } from './table-layout';
import { Variable } from './variable';

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
 * La mise en page (session 3) s'ajoute par-dessus : attributs de paragraphe après
 * `TextAlign` (son `text-align` reste en tête du `style`), marques de run après
 * `TextStyleKit`, tables et souligné remplacés par leurs versions étendues.
 * Les extensions de l'intégrateur viennent en dernier pour pouvoir surcharger.
 */
export function createAsterExtensions(context: AsterExtensionsContext): AnyExtension[] {
  const { editor, options } = context;
  return [
    StarterKit.configure({
      link: false,
      underline: false,
      strike: false,
      horizontalRule: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      dropcursor: { width: 2 },
    }),
    AsterStrike,
    AsterUnderline,
    AsterHorizontalRule,
    createLinkExtension(context.linkPolicy),
    TaskList,
    TaskItem.configure({ nested: true }),
    ...createTableExtensions(),
    // Pas de `defaultAlignment` : en v3 c'est un défaut d'attribut, donc chaque bloc
    // le porterait et sérialiserait `text-align: left` partout. On garde `null` pour
    // un HTML propre ; c'est la commande `alignLeft` qui traite « absent » comme gauche.
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ParagraphLayout,
    ListLayout,
    createImageExtension(context.linkPolicy),
    Subscript,
    Superscript,
    AsterHighlight.configure({ multicolor: true }),
    TextStyleKit.configure({ textStyle: false }),
    AsterTextStyle,
    RunLayout,
    // Lié à l'éditeur Aster : les puces lisent le magasin de valeurs et l'i18n.
    Variable.configure({ aster: editor }),
    Placeholder.configure({
      // Fonction, pas chaîne : le texte suit la locale courante après `setLocale`.
      placeholder: () => options.placeholder ?? editor.i18n.t('editor.placeholder'),
    }),
    CharacterCount,
    Search,
    // Attribut `id` des titres (ancres, sommaire) ; aucun `id` posé sans `getOutline`.
    Outline,
    // Pagination approximative de la vue page (L30) : inactive tant que la vue page l'est.
    Pagination.configure({ aster: editor }),
    createShortcutsExtension(context.shortcuts),
    ...(options.extensions ?? []),
  ];
}
