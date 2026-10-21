import type { DocumentLayout, PageSizeName } from '@aster-editor/core';
import type {
  DocxExportOptions,
  DocxExportWarning,
  DocxPageOrientation,
  DocxPageSize,
} from './types.js';

/**
 * Mise en page : formats, marges et largeur utile en twips, depuis `options.page` et le
 * contrat `DocumentLayout`. Module de `styles.ts` (ré-exporté par lui) : découpage L45,
 * aucune logique modifiée.
 */

/** Dimensions de page en twips (1/20 de point). */
export interface PageDimensions {
  readonly width: number;
  readonly height: number;
}

/** A4 = 210 × 297 mm, Letter = 8,5 × 11 pouces. */
export function pageDimensions(size: DocxPageSize): PageDimensions {
  return size === 'LETTER' ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 };
}

/** Formats nommés du contrat de mise en page (`PageSizeName`), en twips portrait. */
const NAMED_PAGE_SIZES: Readonly<Record<PageSizeName, PageDimensions>> = {
  A3: { width: 16838, height: 23811 },
  A4: { width: 11906, height: 16838 },
  A5: { width: 8391, height: 11906 },
  Letter: { width: 12240, height: 15840 },
  Legal: { width: 12240, height: 20160 },
};

/** `DocumentLayout.page.size` → dimensions portrait en twips, `null` si absent ou invalide. */
function layoutPageDimensions(
  size: NonNullable<DocumentLayout['page']>['size'],
): PageDimensions | null {
  if (size === undefined) return null;
  if (typeof size === 'string') return NAMED_PAGE_SIZES[size] ?? null;
  const { widthMm, heightMm } = size;
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
    return null;
  }
  return { width: mmToTwips(widthMm), height: mmToTwips(heightMm) };
}

/** Marge de page par défaut (1 pouce), en twips. */
export const PAGE_MARGIN = 1440;

/** Millimètres → twips (1 pouce = 25,4 mm = 1440 twips). */
export function mmToTwips(mm: number): number {
  return Math.round((mm * 1440) / 25.4);
}

/** Marges de page en twips. */
export interface PageMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Mise en page résolue : dimensions portrait (docx les inverse lui-même en paysage), marges, largeur utile. */
export interface PageLayout extends PageDimensions {
  /** Format nommé de l'option, `A4` pour un format du contrat (`A3`, `Legal`, libre…). */
  readonly size: DocxPageSize;
  readonly orientation: DocxPageOrientation;
  readonly margins: PageMargins;
  /** Distance du bord à l'en-tête et au pied, en twips (708 par défaut, comme Word). */
  readonly headerDistance: number;
  readonly footerDistance: number;
  /** Largeur utile en pixels à 96 dpi, plafond des images et des tables. */
  readonly contentWidthPx: number;
}

/** Distance par défaut du bord de page à l'en-tête ou au pied, en twips (1,25 cm). */
export const HEADER_DISTANCE = 708;

/** Zone utile minimale laissée par les marges, en twips (1 cm), dans chaque sens. */
export const MIN_CONTENT_EXTENT = mmToTwips(10);

/**
 * Marge en twips depuis une valeur en mm, défaut si absente. Une valeur négative ou
 * non finie prend aussi le défaut, avec avertissement `page-margins-clamped` : Word
 * refuse un `w:pgMar` négatif.
 */
function marginTwips(
  name: keyof PageMargins,
  mm: number | undefined,
  warnings: DocxExportWarning[],
): number {
  if (mm === undefined) return PAGE_MARGIN;
  if (!Number.isFinite(mm) || mm < 0) {
    warnings.push({
      code: 'page-margins-clamped',
      message: `Marge ${name} invalide (${String(mm)} mm), défaut de 25,4 mm appliqué`,
    });
    return PAGE_MARGIN;
  }
  return mmToTwips(mm);
}

/**
 * Réduit deux marges opposées, à proportion, pour laisser au moins `MIN_CONTENT_EXTENT`
 * sur `extent` (largeur ou hauteur de page), avec avertissement : des marges qui se
 * recouvrent donnent une zone de texte négative que Word refuse d'afficher.
 */
function clampMargins(
  first: number,
  second: number,
  extent: number,
  axis: string,
  warnings: DocxExportWarning[],
): [number, number] {
  const available = extent - MIN_CONTENT_EXTENT;
  const total = first + second;
  if (total <= available) return [first, second];
  const scale = available / total;
  warnings.push({
    code: 'page-margins-clamped',
    message: `Marges ${axis} (${String(total)} twips) plus grandes que la page : réduites pour laisser 1 cm utile`,
  });
  return [Math.floor(first * scale), Math.floor(second * scale)];
}

/** Distance d'en-tête ou de pied en twips depuis `layout.page.margins`, défaut si absente ou invalide. */
function distanceTwips(mm: number | undefined): number {
  if (mm === undefined || !Number.isFinite(mm) || mm < 0) return HEADER_DISTANCE;
  return mmToTwips(mm);
}

/**
 * `options.page` (et `pageSize` en repli), complété champ par champ par `options.layout`
 * (contrat `DocumentLayout`, en général celui de l'import) → mise en page. En paysage, la
 * largeur utile est celle du grand côté : `docx` inverse `w:w`/`w:h` quand
 * `w:orient="landscape"`, on lui donne donc toujours les dimensions portrait. Les marges
 * invalides ou qui ne laissent pas 1 cm utile sont corrigées et signalées dans `warnings`.
 */
export function resolvePageLayout(
  options: DocxExportOptions,
  warnings: DocxExportWarning[] = [],
): PageLayout {
  const page = options.layout?.page;
  const size = options.page?.size ?? options.pageSize ?? 'A4';
  const fromLayout =
    options.page?.size || options.pageSize ? null : layoutPageDimensions(page?.size);
  const orientation = options.page?.orientation ?? page?.orientation ?? 'portrait';
  const { width, height } = fromLayout ?? pageDimensions(size);
  const horizontal = orientation === 'landscape' ? height : width;
  const vertical = orientation === 'landscape' ? width : height;
  const requested = options.page?.margins;
  const layoutMargins = page?.margins;
  const [left, right] = clampMargins(
    marginTwips('left', requested?.left ?? layoutMargins?.leftMm, warnings),
    marginTwips('right', requested?.right ?? layoutMargins?.rightMm, warnings),
    horizontal,
    'gauche + droite',
    warnings,
  );
  const [top, bottom] = clampMargins(
    marginTwips('top', requested?.top ?? layoutMargins?.topMm, warnings),
    marginTwips('bottom', requested?.bottom ?? layoutMargins?.bottomMm, warnings),
    vertical,
    'haut + bas',
    warnings,
  );
  const margins: PageMargins = { top, right, bottom, left };
  const usable = horizontal - margins.left - margins.right;
  return {
    size,
    orientation,
    width,
    height,
    margins,
    headerDistance: distanceTwips(layoutMargins?.headerMm),
    footerDistance: distanceTwips(layoutMargins?.footerMm),
    contentWidthPx: Math.max(1, Math.floor((usable / 1440) * 96)),
  };
}

/**
 * Largeur utile de la page en pixels à 96 dpi : plafond des images pour qu'elles ne
 * débordent jamais de la zone de texte (portrait, marges par défaut).
 */
export function contentWidthPx(size: DocxPageSize): number {
  return Math.floor(((pageDimensions(size).width - 2 * PAGE_MARGIN) / 1440) * 96);
}
