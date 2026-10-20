import type { AsterCommand, AsterEditor, CommandArgs, StandardCommandId } from '../api';

/** Spécification d'une commande standard : tout sauf ce que la convention déduit. */
export interface StandardCommandSpec<K extends StandardCommandId> {
  readonly shortcut?: string;
  run(editor: AsterEditor, args: CommandArgs<K>): boolean;
  canRun?(editor: AsterEditor, args: CommandArgs<K>): boolean;
  isActive?(editor: AsterEditor, args: CommandArgs<K>): boolean;
}

/**
 * Identifiant d'icône d'une commande : l'id avec les points remplacés par des
 * tirets (`table.insert` → `table-insert`), pour rester un nom de fichier SVG sûr.
 */
export function iconIdFor(commandId: string): string {
  return commandId.replace(/\./g, '-');
}

/**
 * Fabrique une commande standard en appliquant les conventions du contrat :
 * `labelKey = command.<id>`, `icon` dérivé de l'id. Centralisé pour qu'aucun
 * fichier de domaine ne puisse dévier de la convention que `ui` attend.
 */
export function defineStandardCommand<K extends StandardCommandId>(
  id: K,
  spec: StandardCommandSpec<K>,
): AsterCommand<CommandArgs<K>> {
  const command: AsterCommand<CommandArgs<K>> = {
    id,
    labelKey: `command.${id}`,
    icon: iconIdFor(id),
    run: spec.run,
  };
  if (spec.shortcut) {
    Object.assign(command, { shortcut: spec.shortcut });
  }
  if (spec.canRun) {
    command.canRun = spec.canRun;
  }
  if (spec.isActive) {
    command.isActive = spec.isActive;
  }
  return command;
}
