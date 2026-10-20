import type { AnyExtension } from '@tiptap/core';
import type { AsterCommand } from './commands';
import type { AsterDocument } from './document';
import type { AsterLocale } from './i18n';
import type { PasteTransformer } from './paste';
import type { VariableSource } from './variables';

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
   * Désactive des commandes standard par identifiant. Utile pour une toolbar réduite
   * qui veut aussi bloquer le raccourci clavier correspondant.
   */
  disabledCommands?: readonly string[];
}
