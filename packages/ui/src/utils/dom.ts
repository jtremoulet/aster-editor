/**
 * Mini-helpers DOM pour construire l'UI sans framework. Pas de `innerHTML` avec des
 * données utilisateur : tout texte passe par `textContent`.
 */

/** Attributs acceptés par `el` : chaînes uniquement, `undefined` ignoré. */
export type ElementAttributes = Readonly<Record<string, string | undefined>>;

/** Options de création d'un élément. */
export interface ElementOptions {
  className?: string;
  attrs?: ElementAttributes;
  text?: string;
}

/** Crée un élément avec classes, attributs et enfants (nœuds ou textes). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value !== undefined) node.setAttribute(name, value);
    }
  }
  if (options.text !== undefined) node.textContent = options.text;
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * Remplace le contenu d'un conteneur d'icône par le SVG fourni. Les SVG viennent du jeu
 * d'icônes interne (constantes), jamais de l'utilisateur : `innerHTML` est sûr ici.
 */
export function setIcon(target: HTMLElement, svg: string): void {
  target.innerHTML = svg;
}

/** Vide un élément de tous ses enfants. */
export function clear(target: HTMLElement): void {
  while (target.firstChild) target.removeChild(target.firstChild);
}

/** Vrai si l'élément est désactivé (attribut `disabled` ou `aria-disabled`). */
export function isDisabled(node: HTMLElement): boolean {
  return (
    (node instanceof HTMLButtonElement && node.disabled) ||
    node.getAttribute('aria-disabled') === 'true'
  );
}

/** Liste des éléments actifs correspondant au sélecteur, dans l'ordre du DOM. */
export function enabledElements(root: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (node) => !isDisabled(node),
  );
}

/**
 * Gestion du roving tabindex sur une liste d'éléments : un seul est tabbable, les
 * flèches déplacent le focus, Home/End vont aux extrémités. Retourne l'index ciblé ou
 * `null` si la touche n'est pas gérée.
 */
export function rovingIndexFor(
  key: string,
  current: number,
  count: number,
  orientation: 'horizontal' | 'vertical' | 'both' = 'horizontal',
): number | null {
  if (count === 0) return null;
  const next = ['ArrowRight', 'ArrowDown'];
  const prev = ['ArrowLeft', 'ArrowUp'];
  const horizontal = orientation !== 'vertical';
  const vertical = orientation !== 'horizontal';
  const accepts = (k: string): boolean =>
    (horizontal && (k === 'ArrowRight' || k === 'ArrowLeft')) ||
    (vertical && (k === 'ArrowDown' || k === 'ArrowUp'));
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (!accepts(key)) return null;
  if (next.includes(key)) return (current + 1) % count;
  if (prev.includes(key)) return (current - 1 + count) % count;
  return null;
}
