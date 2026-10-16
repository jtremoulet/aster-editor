import type { FileChild } from 'docx';
import type { ExportContext } from './context';
import { sanitizeXmlText } from './sanitize';
import { HEADING_LEVELS, STYLE_IDS } from './styles';
import type { DocxTocOptions } from './types';

/** Profondeur de titres par défaut de la table des matières. */
const DEFAULT_TOC_LEVELS = 3;

/**
 * Table des matières en tête du corps : un titre optionnel (style `TOC Heading`, hors
 * des niveaux de titre pour ne pas se lister lui-même) et le champ `TOC \h \o "1-n"`,
 * prérempli par `docx` depuis les titres du document. Les numéros de page restent
 * vides jusqu'à ce que Word mette le champ à jour : le document demande cette mise
 * à jour à l'ouverture (`w:updateFields`).
 */
export function buildToc(option: boolean | DocxTocOptions, ctx: ExportContext): FileChild[] {
  if (!option) return [];
  const options = option === true ? {} : option;
  const { Paragraph, TableOfContents, TextRun } = ctx.docx;
  const raw = options.levels;
  const levels =
    raw === undefined || !Number.isFinite(raw)
      ? DEFAULT_TOC_LEVELS
      : Math.min(HEADING_LEVELS, Math.max(1, Math.round(raw)));
  const children: FileChild[] = [];
  const title = options.title === undefined ? '' : sanitizeXmlText(options.title).trim();
  if (title !== '') {
    children.push(
      new Paragraph({ style: STYLE_IDS.tocHeading, children: [new TextRun({ text: title })] }),
    );
  }
  children.push(
    new TableOfContents(title || 'TOC', {
      hyperlink: true,
      headingStyleRange: `1-${String(levels)}`,
    }),
  );
  return children;
}
