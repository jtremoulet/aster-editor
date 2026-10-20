import type { Document as DocxDocument, ISectionOptions } from 'docx';
import { ROOT_SCOPE, convertChildren } from './blocks';
import type { ExportContext } from './context';
import type { DocxModule } from './docx-module';
import { buildFootnotes, collectFootnotes } from './footnotes';
import { buildFooter, buildHeader } from './header-footer';
import { sanitizeXmlText } from './sanitize';
import {
  buildCharacterStyles,
  buildDefaultStyles,
  buildNumbering,
  buildParagraphStyles,
  resolveHeadingNumbering,
  resolvePageLayout,
} from './styles';
import { buildToc } from './toc';
import type { DocxExportOptions, DocxExportWarning } from './types';
import { resolveVariableSettings } from './variables';

/** Résultat de la construction : le document `docx` prêt à empaqueter et ses avertissements. */
export interface BuiltDocx {
  readonly document: DocxDocument;
  readonly warnings: readonly DocxExportWarning[];
}

/**
 * Construit le `Document` docx à partir d'un `Document` DOM déjà parsé. Sépare le
 * parsing (injectable) de la conversion pour que les tests puissent fournir un DOM
 * et inspecter les avertissements sans empaqueter. Les notes de bas de page sont
 * collectées (et retirées du corps) avant la conversion, pour que leurs appels
 * trouvent leur identifiant Word.
 */
export async function buildDocx(
  dom: Document,
  docx: DocxModule,
  options: DocxExportOptions,
): Promise<BuiltDocx> {
  const warnings: DocxExportWarning[] = [];
  const layout = resolvePageLayout(options, warnings);
  const ctx: ExportContext = {
    docx,
    fetchImage: options.fetchImage,
    maxImageWidth: layout.contentWidthPx,
    warnings,
    lists: [],
    variables: resolveVariableSettings(options.variables),
    footnotes: new Map(),
    footnoteCalls: new Set(),
  };
  await collectFootnotes(dom.body, ctx);
  let children = await convertChildren(dom.body, ROOT_SCOPE, ctx);
  if (options.toc) children = [...buildToc(options.toc, ctx), ...children];
  // Word exige au moins un paragraphe par section.
  if (children.length === 0) children = [new docx.Paragraph({ children: [] })];
  const header = await buildHeader(options.header, ctx, options.parse);
  const footer = await buildFooter(options.footer, ctx, options.parse);
  const headingNumbering = resolveHeadingNumbering(options.numberedHeadings);
  const footnotes = buildFootnotes(ctx);
  const section: ISectionOptions = {
    properties: {
      page: {
        size: {
          width: layout.width,
          height: layout.height,
          ...(layout.orientation === 'landscape'
            ? { orientation: docx.PageOrientation.LANDSCAPE }
            : {}),
        },
        margin: layout.margins,
      },
    },
    ...(header ? { headers: { default: header } } : {}),
    ...(footer ? { footers: { default: footer } } : {}),
    children,
  };
  const document = new docx.Document({
    // Les propriétés vont dans `docProps/core.xml` : même règle XML que le corps.
    title: options.title === undefined ? undefined : sanitizeXmlText(options.title),
    creator: options.creator === undefined ? undefined : sanitizeXmlText(options.creator),
    // Les références de numérotation sont connues après la conversion : une par liste.
    numbering: buildNumbering(docx, ctx.lists, headingNumbering),
    styles: {
      default: buildDefaultStyles(options, headingNumbering),
      paragraphStyles: buildParagraphStyles(Boolean(options.toc)),
      characterStyles: buildCharacterStyles(),
    },
    // La table des matières est un champ : Word propose de le mettre à jour à l'ouverture.
    ...(options.toc ? { features: { updateFields: true } } : {}),
    ...(footnotes ? { footnotes } : {}),
    sections: [section],
  });
  return { document, warnings: ctx.warnings };
}
