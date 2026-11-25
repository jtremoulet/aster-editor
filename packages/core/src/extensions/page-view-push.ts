import type { SectionLayout } from '../api/index.js';
import { headerFooterHtmlFor, type HeaderFooterPage } from './page-view-variants.js';
import type { PageMetrics } from './page-view.js';

/**
 * En-tête ou pied plus haut que sa marge (retour utilisateurs 0.7 : « l'en-tête et le pied
 * se superposent parfois au texte »). Word ne laisse jamais un en-tête recouvrir le corps :
 * quand l'en-tête, posé à `headerMm` du bord, descend plus bas que la marge haute, il
 * **pousse** le corps, qui commence alors à `headerMm + hauteur de l'en-tête`. Même règle
 * pour le pied et la marge basse.
 *
 * La vue page fait de même : la hauteur de chaque en-tête et pied est mesurée dans le DOM
 * (seul moyen de connaître la hauteur d'un HTML), et les marges haute et basse **affichées**
 * sont agrandies d'autant. Elles alimentent les variables `--aster-page-margin-top` /
 * `-bottom`, donc à la fois la feuille, la bande d'en-tête et la pagination (moins de lignes
 * par page, comme dans Word). La mise en page du document (`getLayout()`, export) n'est
 * jamais modifiée.
 *
 * Approximation : une section prend la plus haute de ses variantes (`default`, `first`,
 * `even`) sur toutes ses pages, là où Word pousse page par page.
 */

/** Pixels CSS par millimètre (96 px par pouce). */
const PX_PER_MM = 96 / 25.4;

/** Part de la hauteur de page qu'une marge poussée ne dépasse pas : le corps garde de la place. */
const MAX_PUSHED_MARGIN_RATIO = 0.4;

/** Pages représentatives des trois variantes : première de section, paire, impaire courante. */
const VARIANT_PAGES: readonly HeaderFooterPage[] = [
  { pageNumber: 1, firstOfSection: true },
  { pageNumber: 2, firstOfSection: false },
  { pageNumber: 3, firstOfSection: false },
];

/** Mesure la hauteur en mm d'un HTML d'en-tête ou de pied composé sur `widthMm`. */
export type HeaderFooterMeasure = (
  kind: 'headers' | 'footers',
  html: string,
  widthMm: number,
) => number;

/** Hauteur de la plus haute variante d'en-tête ou de pied de la section, 0 sans contenu. */
function tallestVariantMm(
  section: SectionLayout,
  kind: 'headers' | 'footers',
  widthMm: number,
  measure: HeaderFooterMeasure,
): number {
  const variants = new Set(VARIANT_PAGES.map((page) => headerFooterHtmlFor(section, kind, page)));
  let tallest = 0;
  for (const html of variants) {
    if (html === '') continue;
    const height = measure(kind, html, widthMm);
    if (Number.isFinite(height) && height > tallest) tallest = height;
  }
  return tallest;
}

/**
 * Métriques **affichées** d'une section : celles du document, avec la marge haute portée à
 * `marginHeaderMm + hauteur de l'en-tête` et la marge basse à `marginFooterMm + hauteur du
 * pied` quand ils dépassent. Bornées à 40 % de la hauteur de page. Fonction pure : la
 * mesure est injectée.
 */
export function pushPageMetrics(
  metrics: PageMetrics,
  section: SectionLayout,
  measure: HeaderFooterMeasure,
): PageMetrics {
  const widthMm = Math.max(10, metrics.widthMm - metrics.marginLeftMm - metrics.marginRightMm);
  const limit = metrics.heightMm * MAX_PUSHED_MARGIN_RATIO;
  const pushed = (margin: number, distance: number, kind: 'headers' | 'footers'): number => {
    const height = tallestVariantMm(section, kind, widthMm, measure);
    if (height <= 0) return margin;
    return Math.max(margin, Math.min(distance + height, Math.max(margin, limit)));
  };
  const marginTopMm = pushed(metrics.marginTopMm, metrics.marginHeaderMm, 'headers');
  const marginBottomMm = pushed(metrics.marginBottomMm, metrics.marginFooterMm, 'footers');
  if (marginTopMm === metrics.marginTopMm && marginBottomMm === metrics.marginBottomMm) {
    return metrics;
  }
  return { ...metrics, marginTopMm, marginBottomMm };
}

/** Hauteurs déjà mesurées, par hôte : la pagination redemande les mêmes à chaque frappe. */
const MEASURED = new WeakMap<HTMLElement, Map<string, number>>();

/** Nombre de mesures gardées par hôte avant de repartir d'un cache vide. */
const MAX_MEASURED_ENTRIES = 200;

/** Variables de l'hôte dont dépend la hauteur d'un texte : police, corps, interligne. */
const FONT_VARIABLES = [
  '--aster-page-font-family',
  '--aster-page-font-size',
  '--aster-page-default-line-height',
] as const;

/**
 * Mesure réelle dans le DOM de l'hôte de la vue page. Un témoin invisible reçoit la classe
 * de l'en-tête ou du pied (mêmes police, corps, interligne et marges de paragraphe que le
 * vrai, posés par `themes/page.css`), sans sa hauteur maximale ni son rognage, à la largeur
 * utile de la page. Sans moteur de rendu (jsdom), la hauteur vaut 0 : rien n'est poussé.
 *
 * Une image pas encore chargée mesure 0 : quand toutes ont fini de charger, le témoin est
 * remesuré et, si la hauteur a changé, `onInvalidate` appelé pour que l'appelant repose ses
 * marges. Une hauteur nulle (hôte masqué) n'est jamais mise en cache.
 */
export function createDomHeaderFooterMeasure(
  host: HTMLElement,
  classNames: { readonly headers: string; readonly footers: string },
  onInvalidate?: () => void,
): HeaderFooterMeasure {
  return (kind, html, widthMm) => {
    let cache = MEASURED.get(host);
    if (!cache) {
      cache = new Map();
      MEASURED.set(host, cache);
    }
    const fonts = FONT_VARIABLES.map((name) => host.style.getPropertyValue(name)).join('|');
    const key = `${kind}|${widthMm}|${fonts}|${html}`;
    const known = cache.get(key);
    if (known !== undefined) return known;

    const probe = document.createElement('div');
    probe.className = classNames[kind];
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;top:0;right:auto;bottom:auto;' +
      'left:0;transform:none;max-width:none;max-height:none;overflow:visible;padding:0;' +
      `width:${widthMm}mm;`;
    probe.innerHTML = html;
    /** Hauteur du témoin en mm, arrondie au centième supérieur (une marge trop courte d'un cheveu rognerait la ligne). */
    const measureProbe = (): number => {
      host.append(probe);
      const heightPx = probe.getBoundingClientRect().height;
      probe.remove();
      return Math.ceil((heightPx / PX_PER_MM) * 100) / 100;
    };
    const heightMm = measureProbe();
    // Hôte masqué ou hors document (onglet caché, éditeur pas encore monté) : la hauteur
    // vaut 0 sans que ce soit la vraie. Elle n'est pas retenue, la prochaine demande remesure.
    if (heightMm > 0) {
      // La clé porte le HTML affiché, donc la valeur des variables : une valeur saisie au
      // fil de la frappe ne doit pas faire grossir le cache sans fin.
      if (cache.size >= MAX_MEASURED_ENTRIES) cache.clear();
      cache.set(key, heightMm);
    }

    // Images pas encore chargées : elles mesurent 0. Le **même** témoin est remesuré quand
    // toutes ont fini (ses images sont alors chargées, sans nouvelle requête ni boucle), la
    // mesure retenue, puis l'appelant prévenu pour qu'il repose ses marges.
    const pending = Array.from(probe.querySelectorAll('img')).filter((image) => !image.complete);
    let remaining = pending.length;
    const settle = (): void => {
      remaining -= 1;
      if (remaining > 0) return;
      const settled = measureProbe();
      if (settled <= 0 || settled === MEASURED.get(host)?.get(key)) return;
      MEASURED.get(host)?.set(key, settled);
      onInvalidate?.();
    };
    for (const image of pending) {
      image.addEventListener('load', settle, { once: true });
      image.addEventListener('error', settle, { once: true });
    }
    return heightMm;
  };
}
