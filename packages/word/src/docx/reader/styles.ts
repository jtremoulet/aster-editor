import { childNamed, wordAttribute } from '../preprocess/xml-utils';
import type { DocxPackage, HeadingLevel, ResolvedParagraphProps, StyleResolver } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L24. Ne résout que le niveau de titre depuis
 * l'identifiant de style direct (`Heading1`…`Heading6`), sans héritage ni `docDefaults`.
 */

const HEADING_STYLE = /^(?:Heading|Titre)([1-6])$/i;

function headingLevelOf(styleId: string | undefined): HeadingLevel | undefined {
  const match = styleId ? HEADING_STYLE.exec(styleId) : null;
  return match ? (Number(match[1]) as HeadingLevel) : undefined;
}

/** Crée le résolveur de styles du document. Signature figée : L24 garde ce nom et ces paramètres. */
export async function createStyleResolver(_pkg: DocxPackage): Promise<StyleResolver> {
  return {
    paragraph(pPr) {
      const pStyle = pPr ? childNamed(pPr, 'pStyle') : null;
      const styleId = pStyle ? wordAttribute(pStyle, 'val') || undefined : undefined;
      const props: ResolvedParagraphProps = { styleId, runDefaults: {} };
      const headingLevel = headingLevelOf(styleId);
      return headingLevel ? { ...props, headingLevel } : props;
    },
    run(_rPr, paragraph) {
      return paragraph.runDefaults;
    },
    tableStyle() {
      return null;
    },
    defaultFont() {
      return {};
    },
  };
}
