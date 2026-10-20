/**
 * Assainissement du texte destiné au XML du .docx. La lib `docx` n'échappe que
 * `& " ' < >` : un caractère de contrôle (U+0000-U+0008, U+000B, U+000C, U+000E-U+001F)
 * ou un non-caractère (U+FFFE, U+FFFF) écrit tel quel rend `document.xml` invalide et
 * Word refuse d'ouvrir le fichier. Seuls `\t`, `\n` et `\r` sont des `Char` XML 1.0.
 */

/** Plages (incluses) des caractères que la production `Char` de XML 1.0 interdit. */
const INVALID_XML_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x0008],
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0xfffe, 0xffff],
];

/** Échappement `\uXXXX` d'un code, pour composer la classe de caractères sans caractère littéral. */
function unicodeEscape(code: number): string {
  return `\\u${code.toString(16).padStart(4, '0')}`;
}

/**
 * Regex des caractères interdits, construite depuis les plages : ni caractère de
 * contrôle littéral dans la source, ni littéral de regex que le lint refuserait.
 */
const INVALID_XML_CHARS = new RegExp(
  `[${INVALID_XML_RANGES.map(([from, to]) => `${unicodeEscape(from)}-${unicodeEscape(to)}`).join('')}]`,
  'g',
);

/**
 * Retire d'une chaîne tout caractère que XML 1.0 n'accepte pas, sans toucher au reste
 * (tabulations, sauts de ligne, NBSP et Unicode étendu sont conservés). À appliquer à
 * tout texte issu du HTML avant de le confier à `docx` : runs, `alt`/`title` d'image,
 * `href` de lien, propriétés du document.
 */
export function sanitizeXmlText(text: string): string {
  return text.replace(INVALID_XML_CHARS, '');
}
