import type { Document as DocxDocument } from 'docx';
import { ROOT_SCOPE, convertChildren } from './blocks';
import type { ExportContext } from './context';
import type { DocxModule } from './docx-module';
import { sanitizeXmlText } from './sanitize';
import {
  PAGE_MARGIN,
  buildCharacterStyles,
  buildNumbering,
  buildParagraphStyles,
  contentWidthPx,
  pageDimensions,
} from './styles';
import type { DocxExportOptions, DocxExportWarning } from './types';

/** Résultat de la construction : le document `docx` prêt à empaqueter et ses avertissements. */
export interface BuiltDocx {
  readonly document: DocxDocument;
  readonly warnings: readonly DocxExportWarning[];
}

/**
 * Construit le `Document` docx à partir d'un `Document` DOM déjà parsé. Sépare le
 * parsing (injectable) de la conversion pour que les tests puissent fournir un DOM
 * et inspecter les avertissements sans empaqueter.
 */
export async function buildDocx(
  dom: Document,
  docx: DocxModule,
  options: DocxExportOptions,
): Promise<BuiltDocx> {
  const pageSize = options.pageSize ?? 'A4';
  const ctx: ExportContext = {
    docx,
    fetchImage: options.fetchImage,
    maxImageWidth: contentWidthPx(pageSize),
    warnings: [],
    lists: [],
  };
  let children = await convertChildren(dom.body, ROOT_SCOPE, ctx);
  // Word exige au moins un paragraphe par section.
  if (children.length === 0) children = [new docx.Paragraph({ children: [] })];
  const page = pageDimensions(pageSize);
  const document = new docx.Document({
    // Les propriétés vont dans `docProps/core.xml` : même règle XML que le corps.
    title: options.title === undefined ? undefined : sanitizeXmlText(options.title),
    creator: options.creator === undefined ? undefined : sanitizeXmlText(options.creator),
    // Les références de numérotation sont connues après la conversion : une par liste.
    numbering: buildNumbering(docx, ctx.lists),
    styles: {
      paragraphStyles: buildParagraphStyles(),
      characterStyles: buildCharacterStyles(),
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: page.width, height: page.height },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
            },
          },
        },
        children,
      },
    ],
  });
  return { document, warnings: ctx.warnings };
}
