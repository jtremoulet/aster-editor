/** Helpers DOM partagés par les passes, sans dépendance au `document` global. */

/** Espace insécable, que Word utilise pour remplir des paragraphes visuellement vides. */
const NBSP = String.fromCharCode(0xa0);

/** Vrai si le nœud est un élément dont le tag (insensible à la casse) est dans `tags`. */
export function isElement(
  node: Node | null | undefined,
  ...tags: readonly string[]
): node is Element {
  if (!node || node.nodeType !== 1) return false;
  if (tags.length === 0) return true;
  const tag = (node as Element).tagName.toLowerCase();
  return tags.includes(tag);
}

/**
 * Variante sans garde de type pour un élément déjà typé : évite que TypeScript réduise
 * la branche `else` à `never`.
 */
export function hasTag(element: Element, ...tags: readonly string[]): boolean {
  return tags.includes(element.tagName.toLowerCase());
}

/** Vrai si le nœud est un texte composé uniquement d'espaces, ou un commentaire. */
export function isIgnorableNode(node: Node): boolean {
  if (node.nodeType === 8) return true;
  return node.nodeType === 3 && (node.textContent ?? '').trim() === '';
}

/** Vrai si un élément n'a aucun contenu textuel ni élément porteur de sens (image, saut). */
export function isEmptyBlock(element: Element): boolean {
  if (element.querySelector('img, br, hr, table, ul, ol')) return false;
  return (element.textContent ?? '').split(NBSP).join(' ').trim() === '';
}

/**
 * Enveloppe les enfants inline consécutifs d'un conteneur dans des `<p>`, en laissant
 * les blocs tels quels. Ex. `<li>texte<ul>…</ul></li>` → `<li><p>texte</p><ul>…</ul></li>`.
 */
export function wrapInlineChildren(container: Element, blockTags: readonly string[]): void {
  const doc = container.ownerDocument;
  const children = Array.from(container.childNodes);
  let bucket: Node[] = [];

  const flush = (before: Node | null): void => {
    const meaningful = bucket.filter((node) => !isIgnorableNode(node));
    if (meaningful.length > 0) {
      const p = doc.createElement('p');
      for (const node of bucket) p.appendChild(node);
      container.insertBefore(p, before);
    } else {
      for (const node of bucket) node.parentNode?.removeChild(node);
    }
    bucket = [];
  };

  for (const child of children) {
    if (isElement(child, ...blockTags)) {
      flush(child);
    } else {
      bucket.push(child);
    }
  }
  flush(null);
}
