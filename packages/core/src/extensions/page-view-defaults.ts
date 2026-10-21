import type { DocumentLayout } from '../api/index.js';
import { LAYOUT_NUMBER_LIMIT, roundLayoutNumber } from './layout-css.js';

/**
 * Défauts de paragraphe et police du document à l'écran (session 5, L52, retour POC
 * n° 2) : `DocumentLayout.defaultParagraph` et `defaultFont` deviennent des variables CSS
 * sur l'hôte de la vue page, que `ui/themes/page.css` applique **en repli** aux blocs
 * sans valeur propre (un paragraphe avec `style="line-height: …"` garde la sienne). Hors
 * vue page, rien ne change : les variables ne sont posées qu'avec la classe
 * `aster--page-view`, et retirées avec elle.
 *
 *   --aster-page-font-family             police par défaut (`defaultFont.family`)
 *   --aster-page-font-size               corps par défaut, en pt (`defaultFont.sizePt`)
 *   --aster-page-default-line-height     interligne : nombre (multiple) ou `Npt` (exact)
 *   --aster-page-default-spacing-before  espacement avant, en pt
 *   --aster-page-default-spacing-after   espacement après, en pt
 *
 * La classe `aster--page-defaults` accompagne les variables d'espacement : sans elle, la
 * feuille garde l'espacement web de `base.css` (0,75 em entre blocs).
 */

/** Classe posée sur l'hôte quand le document a un espacement de paragraphe par défaut. */
export const PAGE_DEFAULTS_CLASS = 'aster--page-defaults';

/** Variables CSS des défauts du document, toutes optionnelles, dans l'ordre. */
export const PAGE_DEFAULT_CSS_VARIABLES = [
  '--aster-page-font-family',
  '--aster-page-font-size',
  '--aster-page-default-line-height',
  '--aster-page-default-spacing-before',
  '--aster-page-default-spacing-after',
] as const;

export type PageDefaultCssVariable = (typeof PAGE_DEFAULT_CSS_VARIABLES)[number];

/** Valeurs des variables de défauts, seules les connues sont présentes. */
export type PageDefaultsCssValues = Partial<Record<PageDefaultCssVariable, string>>;

/** Nombre fini, positif ou nul (ou strictement positif) et borné, sinon `null`. */
function boundedNumber(value: unknown, strict: boolean): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value > LAYOUT_NUMBER_LIMIT) {
    return null;
  }
  if (strict ? value <= 0 : value < 0) {
    return null;
  }
  return roundLayoutNumber(value);
}

/**
 * Nom de police en valeur CSS : entre guillemets doubles (les noms Word ont des espaces,
 * `Times New Roman`), guillemets et antislashs retirés, vide → `null`. Jamais de `var()`,
 * `url()` ni de point-virgule : un nom hostile ne peut pas sortir de la déclaration.
 */
function cssFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const family = value.replace(/["'\\;{}()]/g, '').trim();
  return family === '' ? null : `"${family}"`;
}

/**
 * Valeurs des variables de défauts pour une mise en page, variable absente quand le
 * document ne dit rien (le CSS retombe alors sur le thème). `lineHeightPt` l'emporte sur
 * `lineHeight`, comme pour un paragraphe.
 */
export function pageDefaultsCssValues(
  layout: DocumentLayout | undefined | null,
): PageDefaultsCssValues {
  const values: PageDefaultsCssValues = {};
  const font = layout?.defaultFont;
  const family = cssFontFamily(font?.family);
  if (family !== null) values['--aster-page-font-family'] = family;
  const size = boundedNumber(font?.sizePt, true);
  if (size !== null) values['--aster-page-font-size'] = `${size}pt`;
  const paragraph = layout?.defaultParagraph;
  const exact = boundedNumber(paragraph?.lineHeightPt, true);
  const multiple = boundedNumber(paragraph?.lineHeight, true);
  if (exact !== null) values['--aster-page-default-line-height'] = `${exact}pt`;
  else if (multiple !== null) values['--aster-page-default-line-height'] = String(multiple);
  const before = boundedNumber(paragraph?.spacingBeforePt, false);
  if (before !== null) values['--aster-page-default-spacing-before'] = `${before}pt`;
  const after = boundedNumber(paragraph?.spacingAfterPt, false);
  if (after !== null) values['--aster-page-default-spacing-after'] = `${after}pt`;
  return values;
}

/** Vrai si les valeurs portent un espacement par défaut (classe `aster--page-defaults`). */
export function hasDefaultSpacing(values: PageDefaultsCssValues): boolean {
  return (
    values['--aster-page-default-spacing-before'] !== undefined ||
    values['--aster-page-default-spacing-after'] !== undefined
  );
}
