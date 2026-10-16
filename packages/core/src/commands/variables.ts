import type { AsterCommand } from '../api';
import { defineStandardCommand } from './define';

/**
 * Commandes des variables de document (champs de fusion). Socle de phase 0 : elles sont
 * enregistrées pour respecter le contrat, le lot L13 les branche sur le nœud `variable`.
 */
export const VARIABLE_COMMANDS: readonly AsterCommand[] = [
  defineStandardCommand('variable.insert', {
    run: () => false,
    canRun: () => false,
  }),
  defineStandardCommand('variable.remove', {
    run: () => false,
    canRun: () => false,
  }),
];
