import { allNamed, childNamed, childrenNamed, wordAttribute } from '../preprocess/xml-utils';
import type { ThemeFonts } from './properties';
import type { DocxPackage, HeadingLevel } from './types';
import { fontName } from './units';

/**
 * Lecture de la partie `styles.xml` et du thème : définitions de styles (`w:style`),
 * niveau de titre d'après le nom, polices du thème. Module de `styles.ts` : découpage
 * L45, aucune logique modifiée.
 */

export type StyleType = 'paragraph' | 'character' | 'table' | 'numbering';

export interface StyleDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: StyleType;
  readonly basedOn?: string;
  readonly link?: string;
  readonly isDefault: boolean;
  readonly pPr: Element | null;
  readonly rPr: Element | null;
  readonly tblPr: Element | null;
  readonly tcPr: Element | null;
  /** `w:tblStylePr` d'un style de tableau (formats conditionnels), vide sinon. */
  readonly tblStylePrs: readonly Element[];
}

const HEADING_PATTERN = /^(?:heading|titre|überschrift|título|titolo)\s*([1-6])$/i;

/** Niveau de titre d'après l'identifiant ou le nom localisé d'un style (`Heading 2`, `Titre 2`). */
export function headingLevelOfName(value: string): HeadingLevel | undefined {
  const match = HEADING_PATTERN.exec(value.trim());
  return match ? (Number(match[1]) as HeadingLevel) : undefined;
}

/** Définition d'un `w:style`, `null` sans identifiant ou d'un type inconnu. */
export function readStyle(element: Element): StyleDefinition | null {
  const id = wordAttribute(element, 'styleId');
  const type = wordAttribute(element, 'type') || 'paragraph';
  if (!id || !isStyleType(type)) return null;
  const name = childNamed(element, 'name');
  const basedOn = childNamed(element, 'basedOn');
  const link = childNamed(element, 'link');
  return {
    id,
    name: name ? wordAttribute(name, 'val') : '',
    type,
    basedOn: basedOn ? wordAttribute(basedOn, 'val') || undefined : undefined,
    link: link ? wordAttribute(link, 'val') || undefined : undefined,
    isDefault:
      wordAttribute(element, 'default') === '1' || wordAttribute(element, 'default') === 'true',
    pPr: childNamed(element, 'pPr'),
    rPr: childNamed(element, 'rPr'),
    tblPr: childNamed(element, 'tblPr'),
    tcPr: childNamed(element, 'tcPr'),
    tblStylePrs: type === 'table' ? childrenNamed(element, 'tblStylePr') : [],
  };
}

function isStyleType(value: string): value is StyleType {
  return (
    value === 'paragraph' || value === 'character' || value === 'table' || value === 'numbering'
  );
}

/** Polices latines `majorFont` / `minorFont` du thème (`theme1.xml`), vides sans thème. */
export async function readThemeFonts(pkg: DocxPackage): Promise<ThemeFonts> {
  const path = (await pkg.related(pkg.mainPart, '/theme')) ?? 'word/theme/theme1.xml';
  const doc = await pkg.part(path);
  if (!doc) return {};
  const latin = (scheme: string): string | undefined => {
    const element = allNamed(doc, scheme)[0];
    const font = element ? childNamed(element, 'latin') : null;
    return fontName(font?.getAttribute('typeface'));
  };
  return { major: latin('majorFont'), minor: latin('minorFont') };
}

/** Partie `styles.xml` (relation `/styles`, sinon le nom usuel), `null` si absente. */
export async function readStylesPart(pkg: DocxPackage): Promise<Document | null> {
  const path = (await pkg.related(pkg.mainPart, '/styles')) ?? 'word/styles.xml';
  return pkg.part(path);
}
