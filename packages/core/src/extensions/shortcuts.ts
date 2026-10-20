import { Extension } from '@tiptap/core';
import type { AsterCommand, CommandRegistry, HeadingLevel } from '../api';

/** Liaison clavier → commande Aster, avec arguments fixes éventuels. */
export interface ShortcutBinding {
  readonly keys: string;
  readonly id: string;
  readonly args?: unknown;
}

const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/**
 * Liaisons qui ne tiennent pas dans le champ `shortcut` d'une commande : les
 * niveaux de titre (une commande, six raccourcis) et le second raccourci de
 * `redo` (`Mod-y`, habitude Windows).
 */
export const EXTRA_SHORTCUT_BINDINGS: readonly ShortcutBinding[] = [
  ...HEADING_LEVELS.map((level) => ({ keys: `Mod-Alt-${level}`, id: 'heading', args: { level } })),
  { keys: 'Mod-y', id: 'redo' },
];

/**
 * Construit la table des liaisons à partir du champ `shortcut` des commandes,
 * complétée par `EXTRA_SHORTCUT_BINDINGS`. Une commande custom qui déclare un
 * `shortcut` est donc automatiquement câblée.
 */
export function collectShortcutBindings(commands: readonly AsterCommand[]): ShortcutBinding[] {
  const bindings: ShortcutBinding[] = [];
  for (const command of commands) {
    if (command.shortcut) {
      bindings.push({ keys: command.shortcut, id: command.id });
    }
  }
  const ids = new Set(commands.map((command) => command.id));
  for (const extra of EXTRA_SHORTCUT_BINDINGS) {
    if (ids.has(extra.id)) {
      bindings.push(extra);
    }
  }
  return bindings;
}

/** Dépendances de l'extension clavier, fournies par l'éditeur au montage. */
export interface ShortcutsExtensionOptions {
  /** Registre par lequel passe chaque raccourci, pour honorer les commandes remplacées. */
  readonly registry: CommandRegistry;
  /** Liaisons calculées au montage par `collectShortcutBindings`, commandes désactivées comprises. */
  readonly bindings: readonly ShortcutBinding[];
  /** Identifiants désactivés : leur raccourci est avalé, pas seulement ignoré. */
  readonly disabled: ReadonlySet<string>;
}

/**
 * Extension clavier d'Aster. Priorité haute pour passer avant les keymaps Tiptap :
 *
 * - commande désactivée → le raccourci est consommé sans effet, sinon la liaison
 *   native de Tiptap (`Mod-b` → gras) continuerait de marcher ;
 * - commande active → elle passe par le registre, donc une commande standard
 *   remplacée par l'intégrateur est honorée au clavier aussi. Si le registre
 *   répond `false`, la touche suit son cours normal.
 */
export function createShortcutsExtension(options: ShortcutsExtensionOptions): Extension {
  return Extension.create({
    name: 'asterShortcuts',
    priority: 1000,
    addKeyboardShortcuts() {
      const shortcuts: Record<string, () => boolean> = {};
      for (const binding of options.bindings) {
        if (options.disabled.has(binding.id)) {
          shortcuts[binding.keys] = () => true;
        } else {
          shortcuts[binding.keys] = () => options.registry.run(binding.id, binding.args);
        }
      }
      return shortcuts;
    },
  });
}
