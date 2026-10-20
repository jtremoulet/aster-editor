/**
 * Jeu d'icônes SVG inline maison, licence MIT. Chaque icône est un SVG 20×20 dessiné en
 * `currentColor` pour hériter de la couleur du bouton. Les chaînes sont des constantes
 * contrôlées par le paquet : leur injection via `innerHTML` est sûre.
 */

/** Enveloppe un contenu dans un SVG 20×20 en trait (`stroke="currentColor"`). */
function stroke(content: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    content +
    '</svg>'
  );
}

/** Enveloppe un contenu dans un SVG 20×20 en aplat (`fill="currentColor"`). */
function fill(content: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" ' +
    'fill="currentColor" aria-hidden="true" focusable="false">' +
    content +
    '</svg>'
  );
}

/** Texte centré en police à empattements, pour les marks typographiques (B, I, U…). */
function glyph(text: string, x: number, y: number, size: number, extra = ''): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Georgia, serif" font-size="${size}" ${extra}>${text}</text>`;
}

/**
 * Chiffre de liste numérotée : petit, gras, en sans-serif (les chiffres Georgia ont des
 * descendantes qui se chevauchent à cette taille). Baselines à 4,5 d'écart pour trois
 * lignes de `LIST_LINES` centrées à 5,5 / 10 / 14,5 : chaque chiffre (≈ 3,3 de haut) reste
 * centré sur sa ligne et le dernier ne dépasse pas sous la grille.
 */
function listDigit(text: string, y: number): string {
  return `<text x="4.5" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="4.6" font-weight="bold">${text}</text>`;
}

/** Trois lignes horizontales de départ `xs` et largeurs `ws`, pour l'alignement. */
function lines(
  xs: readonly [number, number, number],
  ws: readonly [number, number, number],
): string {
  const [a, b, c] = xs;
  const [wa, wb, wc] = ws;
  return stroke(`<path d="M${a} 5h${wa}M${b} 10h${wb}M${c} 15h${wc}"/>`);
}

const TABLE_FRAME = '<rect x="3" y="4" width="14" height="12" rx="1.5"/>';
const TABLE_GRID = '<path d="M3 8.5h14M3 12.5h14M8 8.5V16M12.5 8.5V16"/>';
const LIST_LINES = '<path d="M8 4.7h9v1.6H8zM8 9.2h9v1.6H8zM8 13.7h9v1.6H8z"/>';
/** Paire d'accolades ouvrante / fermante, base des icônes de variables. */
const BRACES =
  '<path d="M7 3H6.5A2 2 0 0 0 4.5 5v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2H7"/>' +
  '<path d="M13 3h.5a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2H13"/>';

const ICONS: Readonly<Record<string, string>> = {
  bold: fill(glyph('B', 10, 15, 15, 'font-weight="bold"')),
  italic: fill(glyph('I', 10, 15, 15, 'font-style="italic"')),
  underline: fill(glyph('U', 10, 13, 13) + '<path d="M4 16.5h12v1.5H4z"/>'),
  strike: fill(glyph('S', 10, 15, 15) + '<path d="M3 9.5h14v1.4H3z"/>'),
  subscript: fill(glyph('x', 8, 14, 13) + glyph('2', 15, 17, 8)),
  superscript: fill(glyph('x', 8, 15, 13) + glyph('2', 15, 8, 8)),
  code: stroke('<path d="M7 6l-4 4 4 4M13 6l4 4-4 4"/>'),
  highlight: stroke('<path d="M4 16h12M8 13l-2-2 7-7 2 2-7 7zM6 11l-1 3 3-1"/>'),
  'clear-formatting': stroke('<path d="M5 4h10M10 4l-3 10M5 14h5M13 12l4 4M17 12l-4 4"/>'),
  paragraph: stroke('<path d="M15 4H8.5a3 3 0 0 0 0 6H11M11 4v12M14 4v12"/>'),
  heading: fill(glyph('H', 10, 15, 14, 'font-weight="bold"')),
  'heading-1': fill(glyph('H', 7, 15, 13, 'font-weight="bold"') + glyph('1', 15, 15, 9)),
  'heading-2': fill(glyph('H', 7, 15, 13, 'font-weight="bold"') + glyph('2', 15, 15, 9)),
  'heading-3': fill(glyph('H', 7, 15, 13, 'font-weight="bold"') + glyph('3', 15, 15, 9)),
  'heading-4': fill(glyph('H', 7, 15, 13, 'font-weight="bold"') + glyph('4', 15, 15, 9)),
  'heading-5': fill(glyph('H', 7, 15, 13, 'font-weight="bold"') + glyph('5', 15, 15, 9)),
  'heading-6': fill(glyph('H', 7, 15, 13, 'font-weight="bold"') + glyph('6', 15, 15, 9)),
  blockquote: fill('<path d="M4 5h4v5H6v2h2v2H4zM11 5h4v5h-2v2h2v2h-4z"/>'),
  'code-block': stroke(TABLE_FRAME + '<path d="M8 8l-2 2 2 2M12 8l2 2-2 2"/>'),
  'horizontal-rule': stroke('<path d="M6 5h8M6 15h8" stroke-opacity="0.4"/><path d="M3 10h14"/>'),
  'hard-break': stroke('<path d="M4 6h10a2 2 0 0 1 0 4H6M8 8l-2 2 2 2M4 15h12"/>'),
  'bullet-list': fill(
    '<circle cx="4.5" cy="5.5" r="1.5"/><circle cx="4.5" cy="10" r="1.5"/><circle cx="4.5" cy="14.5" r="1.5"/>' +
      LIST_LINES,
  ),
  'ordered-list': fill(
    listDigit('1', 7.1) + listDigit('2', 11.6) + listDigit('3', 16.1) + LIST_LINES,
  ),
  'task-list': stroke(
    '<rect x="3" y="4" width="5" height="5" rx="1"/><path d="M4.2 6.5l1.3 1.3 2-2.3M11 6.5h6M11 13.5h6"/><rect x="3" y="11" width="5" height="5" rx="1"/>',
  ),
  indent: stroke('<path d="M3 5h14M9 10h8M9 15h8M3 8.5l2.5 1.5L3 11.5"/>'),
  outdent: stroke('<path d="M3 5h14M9 10h8M9 15h8M6 8.5L3.5 10 6 11.5"/>'),
  'align-left': lines([3, 3, 3], [14, 9, 12]),
  'align-center': lines([3, 5.5, 4], [14, 9, 12]),
  'align-right': lines([3, 8, 5], [14, 9, 12]),
  'align-justify': lines([3, 3, 3], [14, 14, 14]),
  'link-set': stroke(
    '<path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1"/>',
  ),
  'link-unset': stroke(
    '<path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1M4 4l12 12"/>',
  ),
  'image-insert': stroke(
    TABLE_FRAME + '<circle cx="7.5" cy="8" r="1.5"/><path d="M17 13l-4-4-6 6"/>',
  ),
  'image-upload': stroke(TABLE_FRAME + '<path d="M10 14V8M7.5 10.5L10 8l2.5 2.5"/>'),
  'image-set-attributes': stroke(TABLE_FRAME + '<path d="M6 13l3-3 2 2 3-3 2 2"/>'),
  'table-insert': stroke(TABLE_FRAME + TABLE_GRID),
  'table-delete': stroke(
    '<path d="M3 10V5.5A1.5 1.5 0 0 1 4.5 4H17v6M3 8.5h14M8 8.5V12"/><path d="M11 12l5 5M16 12l-5 5"/>',
  ),
  'table-add-row-before': stroke(
    '<rect x="3" y="9" width="14" height="7" rx="1"/><path d="M3 12.5h14M8 9v7M12.5 9v7M10 2v5M7.5 4.5h5"/>',
  ),
  'table-add-row-after': stroke(
    '<rect x="3" y="4" width="14" height="7" rx="1"/><path d="M3 7.5h14M8 4v7M12.5 4v7M10 13v5M7.5 15.5h5"/>',
  ),
  'table-delete-row': stroke(
    TABLE_FRAME + '<path d="M3 8.5h14M3 12.5h14"/><path d="M6 10.5h8" stroke-width="2.6"/>',
  ),
  'table-add-column-before': stroke(
    '<rect x="9" y="3" width="7" height="14" rx="1"/><path d="M12.5 3v14M9 8h7M9 12.5h7M2 10h5M4.5 7.5v5"/>',
  ),
  'table-add-column-after': stroke(
    '<rect x="4" y="3" width="7" height="14" rx="1"/><path d="M7.5 3v14M4 8h7M4 12.5h7M13 10h5M15.5 7.5v5"/>',
  ),
  'table-delete-column': stroke(
    TABLE_FRAME + '<path d="M8 4v12M12.5 4v12"/><path d="M10.25 7v6" stroke-width="2.6"/>',
  ),
  'table-merge-cells': stroke(
    TABLE_FRAME + '<path d="M3 10h4M13 10h4M8.5 8l2 2-2 2M11.5 8l-2 2 2 2"/>',
  ),
  'table-split-cell': stroke(
    TABLE_FRAME +
      '<path d="M10 4v12M7 10H4.5M6 8.5L4.5 10 6 11.5M13 10h2.5M14 8.5l1.5 1.5-1.5 1.5"/>',
  ),
  'table-toggle-header-row': stroke(
    TABLE_FRAME +
      TABLE_GRID +
      '<path d="M3 4.5h14v4H3z" fill="currentColor" fill-opacity="0.35" stroke="none"/>',
  ),
  'table-toggle-header-column': stroke(
    TABLE_FRAME +
      '<path d="M3 8.5h14M3 12.5h14M8 4V16M12.5 4V16"/>' +
      '<path d="M3.5 4h4.5v12H3.5z" fill="currentColor" fill-opacity="0.35" stroke="none"/>',
  ),
  'text-color': fill(glyph('A', 10, 13, 13) + '<path d="M3 15.5h14V18H3z"/>'),
  'background-color': stroke(
    '<path d="M4 13l7-7 4 4-7 7H4zM9 8l4 4"/><circle cx="16" cy="14.5" r="1.5" fill="currentColor"/>',
  ),
  'font-family': fill(glyph('Aa', 10, 15, 13)),
  'font-size': fill(glyph('A', 7, 15, 14) + glyph('A', 15, 15, 9)),
  undo: stroke('<path d="M7 5L3 9l4 4M3 9h8a5 5 0 0 1 0 10"/>'),
  redo: stroke('<path d="M13 5l4 4-4 4M17 9H9a5 5 0 0 0 0 10"/>'),
  'select-all': stroke(
    '<rect x="3" y="3" width="14" height="14" rx="1.5" stroke-dasharray="3 2"/><path d="M6 10l3 3 5-6"/>',
  ),
  'chevron-down': stroke('<path d="M6 8l4 4 4-4"/>'),
  check: stroke('<path d="M4 10.5l4 4 8-9"/>'),
  close: stroke('<path d="M5 5l10 10M15 5L5 15"/>'),
  none: stroke('<circle cx="10" cy="10" r="7"/><path d="M5 15L15 5"/>'),
  // Widgets de la toolbar sans commande du core : recherche, vue source, plein écran,
  // caractères spéciaux, impression.
  search: stroke('<circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5L17 17"/>'),
  'search-previous': stroke('<path d="M6 12l4-4 4 4"/>'),
  'search-next': stroke('<path d="M6 8l4 4 4-4"/>'),
  source: stroke('<path d="M6 6l-4 4 4 4M14 6l4 4-4 4M12 4l-4 12"/>'),
  fullscreen: stroke('<path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/>'),
  'fullscreen-exit': stroke('<path d="M8 3v5H3M12 3v5h5M17 12h-5v5M3 12h5v5"/>'),
  'special-chars': fill(glyph('Ω', 10, 15, 14)),
  print: stroke(
    '<path d="M6 7V3h8v4M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14"/>' +
      '<rect x="6" y="11" width="8" height="6" rx="1"/>',
  ),
  // Variables (champs de fusion) : accolades `{{ }}`, variantes insérer / supprimer.
  variable: stroke(BRACES),
  'variable-insert': stroke(BRACES + '<path d="M10 7.5v5M7.5 10h5"/>'),
  'variable-remove': stroke(BRACES + '<path d="M8 8l4 4M12 8l-4 4"/>'),
  // Bulles contextuelles, menu `/`, sommaire et reproduction de mise en forme.
  edit: stroke(
    '<path d="M4 16h3l8.5-8.5a1.5 1.5 0 0 0 0-2.1l-.9-.9a1.5 1.5 0 0 0-2.1 0L4 13v3zM11 6l3 3"/>',
  ),
  trash: stroke('<path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6M8.5 9v4.5M11.5 9v4.5"/>'),
  slash: stroke('<path d="M13 3L7 17"/>'),
  outline: stroke(
    '<path d="M4 5h3M9 5h7M6 10h3M11 10h5M4 15h3M9 15h7"/><circle cx="4.5" cy="10" r="0.6" fill="currentColor"/>',
  ),
  'format-painter': stroke(
    '<path d="M4 4h10v3H4zM14 5.5h2.5v4.5H10v2"/><rect x="8" y="11.5" width="4" height="5.5" rx="1"/>',
  ),
  'page-break': stroke(
    '<path d="M4 3h12v4H4zM4 13h12v4H4z"/><path d="M3 10h2M7 10h2M11 10h2M15 10h2" stroke-dasharray="2 2"/>',
  ),
  // Mise en page (session 3, L26) : interligne, espacement, retraits, bordures, casse,
  // style de souligné, mise en page du document ; commandes `paragraph.*Layout` du core.
  'line-spacing': stroke(
    '<path d="M9 5h8M9 10h8M9 15h8"/><path d="M4.5 4v12M2.5 6l2-2 2 2M2.5 14l2 2 2-2"/>',
  ),
  'paragraph-spacing': stroke(
    '<path d="M3 8h14M3 12h14"/><path d="M10 2v3M8.5 3.5L10 2l1.5 1.5M10 18v-3M8.5 16.5L10 18l1.5-1.5"/>',
  ),
  'indent-increase': stroke('<path d="M3 4h14M9 8h8M9 12h8M3 16h14M3 8l3 2-3 2"/>'),
  'indent-decrease': stroke('<path d="M3 4h14M9 8h8M9 12h8M3 16h14M6 8l-3 2 3 2"/>'),
  'paragraph-borders': stroke(
    '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M6 7.5h8M6 10h8M6 12.5h5" stroke-opacity="0.5"/>',
  ),
  'paragraph-set-layout': stroke(
    '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M6 7h8M6 10h8M6 13h5"/>',
  ),
  'paragraph-unset-layout': stroke(
    '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M6 7h8M6 10h5"/><path d="M12 12l4 4M16 12l-4 4"/>',
  ),
  caps: fill(glyph('A', 6.5, 15, 14, 'font-weight="bold"') + glyph('a', 14, 15, 10)),
  'underline-style': fill(
    glyph('U', 10, 12, 12) +
      '<path d="M4 15.5h2M7.5 15.5h2M11 15.5h2M14.5 15.5h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  ),
  'page-layout': stroke(
    '<path d="M5 2.5h7l3 3v12H5z"/><path d="M12 2.5v3h3"/><path d="M7.5 9h5M7.5 11.5h5M7.5 14h3" stroke-opacity="0.5"/>',
  ),
};

/** Icône de repli visible (point d'interrogation) pour un nom inconnu. */
const FALLBACK_ICON = stroke(
  '<circle cx="10" cy="10" r="7"/><path d="M7.8 8a2.2 2.2 0 1 1 3.2 2c-.7.4-1 .8-1 1.5M10 14.5h.01"/>',
);

/** Noms d'icônes disponibles, utile pour les tests et la doc. */
export const ICON_NAMES: readonly string[] = Object.keys(ICONS);

/**
 * Retourne le SVG inline d'une icône. Un nom inconnu retourne une icône de repli
 * visible plutôt qu'une chaîne vide, pour que l'oubli se voie en démo. Passe par
 * `hasIcon` : `ICONS['constructor']` ou `ICONS['toString']` renverraient sinon une
 * fonction héritée de `Object.prototype`, injectée telle quelle dans le DOM.
 */
export function getIcon(name: string): string {
  return hasIcon(name) ? (ICONS[name] ?? FALLBACK_ICON) : FALLBACK_ICON;
}

/** Vrai si l'icône existe dans le jeu (propriété propre, jamais héritée du prototype). */
export function hasIcon(name: string): boolean {
  return Object.hasOwn(ICONS, name);
}

/**
 * Nom d'icône par convention pour un identifiant de commande : les `.` et le camelCase
 * deviennent des tirets (`table.insert` → `table-insert`, `alignLeft` → `align-left`).
 */
export function iconNameForCommand(commandId: string): string {
  return commandId
    .replace(/\./g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
