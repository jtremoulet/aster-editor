import type { AsterEditor, AsterOptions } from '../api/index.js';
import { AsterEditorImpl } from './aster-editor.js';

/**
 * Crée un éditeur Aster monté dans `options.element`. Fabrique plutôt que classe
 * exposée : le contrat public est l'interface `AsterEditor`, l'implémentation
 * reste libre d'évoluer sans casser `ui`, `word` ni `angular`.
 */
export function createEditor(options: AsterOptions): AsterEditor {
  return new AsterEditorImpl(options);
}
