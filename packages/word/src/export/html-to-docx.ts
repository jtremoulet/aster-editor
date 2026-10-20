import type { Document as DocxDocument, ISectionOptions } from 'docx';
import type { NumberingResolver } from '../docx/reader/types';
import { ROOT_SCOPE, convertChildren } from './blocks';
import type { ExportContext, ListDefinition } from './context';
import type { DocxModule } from './docx-module';
import { buildFootnotes, collectFootnotes } from './footnotes';
import { buildFooters, buildHeaders } from './header-footer';
import { sanitizeXmlText } from './sanitize';
import {
  GENERATED_STYLE_IDS,
  STYLE_IDS,
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
  /** Listes rencontrées, une numérotation chacune : la greffe dans le gabarit s'en sert. */
  readonly lists: readonly ListDefinition[];
}

/**
 * Cible de la construction : export neuf (`template: false`) ou corps destiné à être
 * greffé dans un gabarit, dont `styleIds` sont les styles définis (le corps peut alors
 * les référencer par `data-docx-style` et réutiliser ses numérotations).
 */
export interface BuildTarget {
  readonly template: boolean;
  readonly styleIds?: ReadonlySet<string>;
  /** Largeur utile de la page du gabarit en pixels (plafond des images), sinon celle des options. */
  readonly contentWidthPx?: number;
  /** Numérotations du gabarit, pour le niveau des listes `data-docx-num-id`. */
  readonly numbering?: NumberingResolver;
}

/** Styles que le document final définit : ceux de l'export neuf plus ceux du gabarit. */
function knownStyles(options: DocxExportOptions, target: BuildTarget): ReadonlySet<string> {
  const ids = new Set<string>(GENERATED_STYLE_IDS);
  if (options.toc) ids.add(STYLE_IDS.tocHeading);
  for (const id of target.styleIds ?? []) ids.add(id);
  return ids;
}

/**
 * Construit le `Document` docx à partir d'un `Document` DOM déjà parsé. Sépare le
 * parsing (injectable) de la conversion pour que les tests puissent fournir un DOM
 * et inspecter les avertissements sans empaqueter. Les notes de bas de page sont
 * collectées (et retirées du corps) avant la conversion, pour que leurs appels
 * trouvent leur identifiant Word. La mise en page vient de `options.layout` (contrat),
 * les options explicites primant champ par champ.
 */
export async function buildDocx(
  dom: Document,
  docx: DocxModule,
  options: DocxExportOptions,
  target: BuildTarget = { template: false },
): Promise<BuiltDocx> {
  const warnings: DocxExportWarning[] = [];
  const layout = resolvePageLayout(options, warnings);
  const headingNumbering = resolveHeadingNumbering(options.numberedHeadings);
  const ctx: ExportContext = {
    docx,
    fetchImage: options.fetchImage,
    maxImageWidth: target.contentWidthPx ?? layout.contentWidthPx,
    warnings,
    lists: [],
    variables: resolveVariableSettings(options.variables),
    footnotes: new Map(),
    footnoteCalls: new Set(),
    knownStyles: knownStyles(options, target),
    template: target.template,
    templateNumbering: target.numbering ?? null,
    // Dans le gabarit, la numérotation des titres ne peut pas vivre dans ses styles.
    headingNumbering: target.template ? headingNumbering : null,
  };
  await collectFootnotes(dom.body, ctx);
  let children = await convertChildren(dom.body, ROOT_SCOPE, ctx);
  if (options.toc) children = [...buildToc(options.toc, ctx), ...children];
  // Word exige au moins un paragraphe par section.
  if (children.length === 0) children = [new docx.Paragraph({ children: [] })];
  const headers = await buildHeaders(options, ctx);
  const footers = await buildFooters(options, ctx);
  const footnotes = buildFootnotes(ctx);
  const columns = options.layout?.columns;
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
        margin: {
          ...layout.margins,
          header: layout.headerDistance,
          footer: layout.footerDistance,
        },
      },
      ...(options.layout?.titlePage ? { titlePage: true } : {}),
      ...(columns !== undefined && Number.isFinite(columns) && columns >= 2
        ? { column: { count: Math.min(45, Math.floor(columns)), equalWidth: true } }
        : {}),
    },
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(Object.keys(footers).length > 0 ? { footers } : {}),
    children,
  };
  const document = new docx.Document({
    // Les propriétés vont dans `docProps/core.xml` : même règle XML que le corps.
    title: options.title === undefined ? undefined : sanitizeXmlText(options.title),
    creator: options.creator === undefined ? undefined : sanitizeXmlText(options.creator),
    // Les références de numérotation sont connues après la conversion : une par liste.
    numbering: buildNumbering(docx, ctx.lists, headingNumbering, !target.template),
    styles: {
      default: buildDefaultStyles(options, target.template ? null : headingNumbering),
      paragraphStyles: buildParagraphStyles(Boolean(options.toc)),
      characterStyles: buildCharacterStyles(),
    },
    // La table des matières est un champ : Word propose de le mettre à jour à l'ouverture.
    ...(options.toc ? { features: { updateFields: true } } : {}),
    // Les en-têtes et pieds de pages paires ne s'affichent qu'avec ce réglage.
    ...(headers.even || footers.even ? { evenAndOddHeaderAndFooters: true } : {}),
    ...(footnotes ? { footnotes } : {}),
    sections: [section],
  });
  return { document, warnings: ctx.warnings, lists: ctx.lists };
}
