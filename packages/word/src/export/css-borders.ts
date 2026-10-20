import { parseColor } from './css-colors';
import { parsePoints } from './css-lengths';

/**
 * Bordures CSS (`border`, `border-<côté>`, propriétés longues, `padding-<côté>` pour
 * l'espace texte-trait) → bordures du contrat. Module de `css.ts` (ré-exporté par lui) :
 * découpage L45, aucune logique modifiée.
 */

/** Styles de trait du contrat de mise en page (`BlockBorder.style`). */
export type CssBorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';

/**
 * Bordure CSS lue : style, épaisseur en points, couleur `RRGGBB` et, si le contrat l'a
 * sérialisé (`padding-<côté>: Npt`, `BlockBorder.spacePt`), l'espace texte-trait en points.
 */
export interface CssBorder {
  readonly style: CssBorderStyle;
  readonly widthPt: number;
  readonly color: string;
  readonly spacePt?: number;
}

/** Côtés d'une bordure de bloc ou de cellule. */
export type CssBorderSide = 'top' | 'right' | 'bottom' | 'left';

/** Côtés dans l'ordre de sérialisation du contrat. */
export const CSS_BORDER_SIDES: readonly CssBorderSide[] = ['top', 'right', 'bottom', 'left'];

/** Mots-clés `border-style` CSS → style du contrat ; les autres (`groove`…) deviennent `solid`. */
function borderStyleKeyword(word: string): CssBorderStyle | null {
  switch (word) {
    case 'solid':
    case 'groove':
    case 'ridge':
    case 'inset':
    case 'outset':
      return 'solid';
    case 'dashed':
    case 'dotted':
    case 'double':
      return word;
    default:
      return null;
  }
}

/** Épaisseurs nommées de `border-width`, en points (valeurs usuelles des navigateurs). */
const BORDER_WIDTH_KEYWORDS: Readonly<Record<string, number>> = {
  thin: 0.75,
  medium: 2.25,
  thick: 3.75,
};

/**
 * Raccourci `border` / `border-<côté>` CSS (`1pt solid #000000`, dans n'importe quel
 * ordre, couleur `#hex`, `rgb()` ou nom) → bordure, `undefined` si la valeur est illisible,
 * `null` pour `none` / `hidden` / `0` (bordure explicitement absente). Une épaisseur
 * absente vaut `medium`, un style absent `solid`, une couleur absente noir.
 */
export function parseBorder(value: string | undefined): CssBorder | null | undefined {
  if (!value) return undefined;
  const raw = value.trim().toLowerCase();
  if (raw === '' || raw === 'none' || raw === 'hidden' || raw === '0') return null;
  // Les espaces d'un `rgb(r, g, b)` ne séparent pas des mots : on les retire avant la découpe.
  const tokens = raw.replace(
    /\(\s*([^)]*?)\s*\)/g,
    (_, inner: string) => `(${inner.replace(/\s+/g, '')})`,
  );
  let style: CssBorderStyle | null = null;
  let widthPt: number | null = null;
  let color: string | null = null;
  for (const token of tokens.split(/\s+/)) {
    const keyword = borderStyleKeyword(token);
    if (keyword) {
      style = keyword;
      continue;
    }
    const named = BORDER_WIDTH_KEYWORDS[token];
    if (named !== undefined) {
      widthPt = named;
      continue;
    }
    const points = parsePoints(token);
    if (points !== null) {
      widthPt = points;
      continue;
    }
    const parsed = parseColor(token);
    if (parsed) color = parsed;
    else if (token === 'transparent') return null;
  }
  if (widthPt !== null && widthPt <= 0) return null;
  if (style === null && widthPt === null && color === null) return undefined;
  return { style: style ?? 'solid', widthPt: widthPt ?? 2.25, color: color ?? '000000' };
}

/**
 * Bordures d'un `style` inline, côté par côté : raccourci `border` (tous les côtés) puis
 * `border-<côté>`, puis les propriétés longues `border-<côté>-width|style|color` qui
 * complètent ou corrigent. Un côté absent de la map n'est pas déclaré ; `null` le déclare
 * explicitement sans bordure (`border-top: none`, ou le `0pt solid transparent` que le
 * lecteur émet pour un `nil` explicite). `padding-<côté>` donne l'espace texte-trait
 * (`w:space`) d'un côté bordé.
 */
export function parseBorders(
  style: ReadonlyMap<string, string>,
): ReadonlyMap<CssBorderSide, CssBorder | null> {
  const result = new Map<CssBorderSide, CssBorder | null>();
  const all = parseBorder(style.get('border'));
  for (const side of CSS_BORDER_SIDES) {
    let border: CssBorder | null | undefined = all;
    const space = parsePoints(style.get(`padding-${side}`));
    if (border && space !== null && space >= 0) border = { ...border, spacePt: space };
    const own = parseBorder(style.get(`border-${side}`));
    if (own !== undefined)
      border = own && space !== null && space >= 0 ? { ...own, spacePt: space } : own;
    const width = parsePoints(style.get(`border-${side}-width`));
    const styleWord = style.get(`border-${side}-style`)?.trim().toLowerCase();
    const colorValue = parseColor(style.get(`border-${side}-color`));
    if (width !== null || styleWord !== undefined || colorValue) {
      if (styleWord === 'none' || styleWord === 'hidden' || (width !== null && width <= 0)) {
        border = null;
      } else {
        const base: CssBorder = border ?? { style: 'solid', widthPt: 2.25, color: '000000' };
        border = {
          style: (styleWord ? borderStyleKeyword(styleWord) : null) ?? base.style,
          widthPt: width ?? base.widthPt,
          color: colorValue ?? base.color,
          ...(space !== null && space >= 0 ? { spacePt: space } : {}),
        };
      }
    }
    if (border !== undefined) result.set(side, border);
  }
  return result;
}
