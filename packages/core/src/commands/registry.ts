import type { AsterCommand, AsterEditor, CommandRegistry } from '../api/index.js';

/**
 * Registre concret. Tolérant par contrat : un identifiant inconnu, un éditeur
 * détruit ou une commande qui lève donnent `false`, jamais d'exception. La
 * toolbar appelle `canRun`/`isActive` à chaque changement de sélection, elle ne
 * doit pas pouvoir casser l'éditeur sur une commande custom mal écrite.
 */
export function createCommandRegistry(editor: AsterEditor): CommandRegistry {
  const commands = new Map<string, AsterCommand>();

  const safely = (fn: () => boolean): boolean => {
    try {
      return fn();
    } catch {
      return false;
    }
  };

  return {
    register(command) {
      commands.set(command.id, command as AsterCommand);
    },
    unregister(id) {
      commands.delete(id);
    },
    get: (id) => commands.get(id),
    has: (id) => commands.has(id),
    list: () => [...commands.values()],
    run(id: string, args?: unknown): boolean {
      const command = commands.get(id);
      if (!command || editor.isDestroyed() || editor.isReadOnly()) {
        return false;
      }
      return safely(() => command.run(editor, args));
    },
    canRun(id: string, args?: unknown): boolean {
      const command = commands.get(id);
      if (!command || editor.isDestroyed() || editor.isReadOnly()) {
        return false;
      }
      return command.canRun ? safely(() => command.canRun!(editor, args)) : true;
    },
    isActive(id: string, args?: unknown): boolean {
      const command = commands.get(id);
      if (!command || editor.isDestroyed()) {
        return false;
      }
      return command.isActive ? safely(() => command.isActive!(editor, args)) : false;
    },
  };
}
