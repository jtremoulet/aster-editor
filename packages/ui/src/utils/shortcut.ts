/**
 * Mise en forme lisible d'un raccourci Tiptap/ProseMirror (`Mod-Shift-7`) selon la
 * plateforme : `Ctrl+Shift+7` sur Windows/Linux, `⇧⌘7` sur macOS.
 */

/** Détecte macOS depuis `navigator.platform`, surchargeable pour les tests. */
export function isMacPlatform(platform?: string): boolean {
  const value = platform ?? (typeof navigator === 'undefined' ? '' : (navigator.platform ?? ''));
  return /mac|iphone|ipad|ipod/i.test(value);
}

const MAC_MODIFIERS: Readonly<Record<string, string>> = {
  mod: '⌘',
  cmd: '⌘',
  meta: '⌘',
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
};

const PC_MODIFIERS: Readonly<Record<string, string>> = {
  mod: 'Ctrl',
  cmd: 'Ctrl',
  meta: 'Win',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
};

/** Ordre canonique des modificateurs sur macOS : ⌃ ⌥ ⇧ ⌘. */
const MAC_ORDER = ['⌃', '⌥', '⇧', '⌘'];

/** Clés spéciales dont le nom est raccourci pour l'affichage. */
const KEY_NAMES: Readonly<Record<string, string>> = {
  enter: '↵',
  escape: 'Esc',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
  space: 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
};

/**
 * Convertit `Mod-b` en `Ctrl+B` ou `⌘B`. Retourne une chaîne vide pour une entrée vide.
 * La touche finale est mise en majuscule si c'est un caractère seul.
 */
export function formatShortcut(shortcut: string | undefined, mac = isMacPlatform()): string {
  if (!shortcut) return '';
  const parts = shortcut.split('-').filter((p) => p.length > 0);
  if (parts.length === 0) return '';
  const key = parts[parts.length - 1] ?? '';
  const modifiers = parts.slice(0, -1).map((p) => p.toLowerCase());
  const table = mac ? MAC_MODIFIERS : PC_MODIFIERS;
  const mods = modifiers.map((m) => table[m] ?? capitalize(m));
  const keyLabel = KEY_NAMES[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);
  if (mac) {
    const sorted = [...mods].sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    return sorted.join('') + keyLabel;
  }
  return [...mods, keyLabel].join('+');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
