import { formatShortcut, isMacPlatform } from '../utils/shortcut';

/**
 * Texte d'infobulle d'un bouton : `libellé (raccourci)` avec le raccourci rendu lisible
 * selon la plateforme (`Mod-b` → `Ctrl+B` ou `⌘B`). Sans raccourci, le libellé seul.
 */
export function tooltipText(label: string, shortcut?: string, mac = isMacPlatform()): string {
  const keys = formatShortcut(shortcut, mac);
  return keys ? `${label} (${keys})` : label;
}

/**
 * Applique l'infobulle sur un élément : `title` natif (visible au survol, lu par les
 * lecteurs d'écran en complément) et `aria-label` avec le libellé seul, pour que la
 * navigation au clavier annonce un nom court. Le choix du `title` natif évite un DOM
 * supplémentaire et reste stylable via `--aster-*` dans les navigateurs qui le permettent.
 */
export function applyTooltip(target: HTMLElement, label: string, shortcut?: string): void {
  target.setAttribute('aria-label', label);
  target.setAttribute('title', tooltipText(label, shortcut));
}
