import type { AnyExtension } from '@tiptap/core';
import type { AsterCommand } from './commands.js';
import type { AsterDocument } from './document.js';
import type { AsterLocale } from './i18n.js';
import type { PageViewOptions } from './layout.js';
import type { PasteTransformer } from './paste.js';
import type { VariableSource } from './variables.js';

/** Politique de sécurité et de comportement des liens. */
export interface LinkPolicy {
  /** Protocoles acceptés. Tout le reste est rejeté, `javascript:` en premier lieu. */
  allowedProtocols?: readonly string[];
  /** Cible par défaut des liens créés. */
  defaultTarget?: '_blank' | '_self';
  /** Attribut `rel` appliqué aux liens avec `target="_blank"`. */
  rel?: string;
  /** Transformer automatiquement les URLs tapées ou collées en liens. */
  autolink?: boolean;
}

/**
 * Hook d'upload d'image fourni par l'intégrateur. Reçoit le fichier, retourne l'URL
 * finale. En son absence, l'image est insérée en data URL base64.
 */
export type UploadHandler = (file: File) => Promise<string>;

/** Options de création d'un éditeur. Seul `element` est obligatoire. */
export interface AsterOptions {
  /** Élément hôte. Le core y crée le conteneur `.aster-content` et le contenteditable. */
  element: HTMLElement;
  /** Contenu initial, HTML ou document JSON. */
  content?: string | AsterDocument;
  /** Texte affiché quand le document est vide. */
  placeholder?: string;
  readOnly?: boolean;
  /** Locale initiale, `fr` par défaut. */
  locale?: AsterLocale;
  /** Donner le focus au montage. */
  autofocus?: boolean;
  /** Extensions Tiptap additionnelles, ajoutées après le jeu standard. */
  extensions?: readonly AnyExtension[];
  /** Commandes custom enregistrées au montage. */
  commands?: readonly AsterCommand[];
  /** Transformateurs de collage, dans l'ordre d'application. */
  pasteTransformers?: readonly PasteTransformer[];
  upload?: UploadHandler;
  linkPolicy?: LinkPolicy;
  /** Variables de document (champs de fusion) : déclarations, valeurs, résolveur. */
  variables?: VariableSource;
  /**
   * Vue page : feuille aux dimensions et marges de `layout.page`, en-têtes et pieds
   * affichés en lecture seule. `true` = A4 portrait par défaut. Pagination approximative, désactivable par `pagination: false`.
   */
  pageView?: boolean | PageViewOptions;
  /**
   * Touche Tab dans un paragraphe ou un titre (session 4). `'focus'` (défaut) : la touche
   * n'est pas consommée, le focus quitte l'éditeur comme dans n'importe quel champ de
   * formulaire (pas de piège clavier, WCAG 2.1.2 ; comportement de la 0.5). `'insert'` :
   * insère un nœud `tab` (édition type Word). Dans les listes et les cellules, Tab garde
   * toujours l'indentation et la navigation ; `text.insertTab` fonctionne dans les deux modes.
   */
  tabKey?: 'focus' | 'insert';
  /**
   * Désactive des commandes standard par identifiant. Utile pour une toolbar réduite
   * qui veut aussi bloquer le raccourci clavier correspondant.
   */
  disabledCommands?: readonly string[];
}
