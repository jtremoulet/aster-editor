/**
 * Nettoie le HTML produit par Tiptap pour obtenir une sortie sémantique et stable.
 *
 * Tiptap ajoute aux tables un `<colgroup>`, un `style="min-width"` et des
 * `colspan="1" rowspan="1"` destinés au redimensionnement en édition. C'est du
 * bruit pour le stockage et ça rend les diffs illisibles. On le retire ici, le
 * schéma le recrée à la relecture : `setHTML(getHTML())` reste idempotent.
 */
export function normalizeOutputHtml(html: string): string {
  if (!html.includes('<table')) {
    return html;
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;

  for (const colgroup of root.querySelectorAll('table > colgroup')) {
    colgroup.remove();
  }
  for (const table of root.querySelectorAll('table')) {
    const style = table.getAttribute('style') ?? '';
    const cleaned = style
      .split(';')
      .map((rule) => rule.trim())
      .filter((rule) => rule !== '' && !rule.startsWith('min-width'))
      .join('; ');
    if (cleaned === '') {
      table.removeAttribute('style');
    } else {
      table.setAttribute('style', cleaned);
    }
  }
  for (const cell of root.querySelectorAll('td, th')) {
    if (cell.getAttribute('colspan') === '1') {
      cell.removeAttribute('colspan');
    }
    if (cell.getAttribute('rowspan') === '1') {
      cell.removeAttribute('rowspan');
    }
  }
  return template.innerHTML;
}
