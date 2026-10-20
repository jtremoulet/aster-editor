/**
 * Style map mammoth d'Aster. Syntaxe mammoth : `p[style-name='X'] => tag:fresh`.
 *
 * mammoth matche `style-name` sur le nom déclaré dans `styles.xml` du document, qui est
 * localisé par Word (« Titre 1 » en français, « Heading 1 » en anglais), tandis que
 * `p.StyleId` matche l'identifiant interne (`Heading1`, `Titre1`…) qui reste souvent
 * anglais même sur un Word français. On couvre donc les deux. Les règles utilisateur
 * sont ajoutées après et mammoth garde la première qui matche, la map Aster est donc
 * prioritaire.
 */

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/** Titres anglais, français et identifiants internes → `h1..h6`. */
const HEADINGS: readonly string[] = HEADING_LEVELS.flatMap((level) => [
  `p[style-name='Heading ${level}'] => h${level}:fresh`,
  `p[style-name='heading ${level}'] => h${level}:fresh`,
  `p[style-name='Titre ${level}'] => h${level}:fresh`,
  `p[style-name='titre ${level}'] => h${level}:fresh`,
  `p.Heading${level} => h${level}:fresh`,
  `p.Titre${level} => h${level}:fresh`,
]);

/** Titre de document (`Title`/`Titre`) → `h1`, pas de niveau 0 dans le schéma Tiptap. */
const TITLE: readonly string[] = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Titre'] => h1:fresh",
  'p.Title => h1:fresh',
  'p.Titre => h1:fresh',
];

/** Citations → `blockquote`, fusionnées quand elles se suivent (pas de `:fresh`). */
const QUOTES: readonly string[] = [
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Citation'] => blockquote > p:fresh",
  "p[style-name='Citation intense'] => blockquote > p:fresh",
  'p.Quote => blockquote > p:fresh',
  'p.IntenseQuote => blockquote > p:fresh',
];

/** Code → `pre`, lignes consécutives fusionnées dans un seul bloc. */
const CODE: readonly string[] = [
  "p[style-name='Code'] => pre:separator('\\n')",
  "p[style-name='HTML Preformatted'] => pre:separator('\\n')",
  "p[style-name='Préformaté HTML'] => pre:separator('\\n')",
  "p.HTMLPreformatted => pre:separator('\\n')",
  "r[style-name='Code'] => code",
  "r[style-name='HTML Code'] => code",
];

/** Styles de caractères et propriétés de run. */
const RUNS: readonly string[] = [
  "r[style-name='Strong'] => strong",
  "r[style-name='Fort'] => strong",
  "r[style-name='Emphasis'] => em",
  "r[style-name='Accentuation'] => em",
  'u => u',
  'strike => s',
  'highlight => mark',
];

/**
 * Style map Aster, dans l'ordre de priorité. `List Paragraph` n'y figure pas : la
 * numérotation native de mammoth (`w:numPr`) produit déjà `ul`/`ol` imbriqués, et
 * `Hyperlink` est géré nativement par mammoth en `<a href>`.
 */
export const ASTER_STYLE_MAP: readonly string[] = [
  ...TITLE,
  ...HEADINGS,
  ...QUOTES,
  ...CODE,
  ...RUNS,
];

/**
 * Construit la style map passée à mammoth : la map Aster d'abord, les règles de
 * l'intégrateur ensuite. Les lignes vides ou commentées (`#`) sont ignorées.
 */
export function buildStyleMap(userStyleMap: readonly string[] = []): string[] {
  const user = userStyleMap
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  return [...ASTER_STYLE_MAP, ...user];
}
