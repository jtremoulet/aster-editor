import type { Document as DocxDocument, ISectionOptions } from 'docx';
import type { NumberingResolver } from '../docx/reader/types';
import { ROOT_SCOPE, convertChildren } from './blocks';
import type { ExportContext, ListDefinition } from './context';
import type { DocxModule } from './docx-module';
import { buildFootnotes, collectFootnotes } from './footnotes';
import { sanitizeXmlText } from './sanitize';
import { buildSection, resolveSection, splitSections } from './sections';
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
 * les options explicites primant champ par champ ; le corps est découpé en sections aux
 * `<hr data-section-break>` (`sections.ts`, segments numérotés par position), la dernière
 * portant la mise en page de premier niveau du `layout`.
 */
export async function buildDocx(
  dom: Document,
  docx: DocxModule,
  options: DocxExportOptions,
  target: BuildTarget = { template: false },
): Promise<BuiltDocx> {
  const warnings: DocxExportWarning[] = [];
  // Largeur utile de la dernière section (plafond des images) ; ses avertissements de
  // marges sont émis par la résolution de la section elle-même, pas ici.
  const layout = resolvePageLayout(options);
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
  // Une section par segment du corps (sauts `<hr data-section-break>`), dans l'ordre.
  const segments = splitSections(dom.body);
  const sections: ISectionOptions[] = [];
  let even = false;
  for (const [index, segment] of segments.entries()) {
    let children = await convertChildren(segment.container, ROOT_SCOPE, ctx);
    if (index === 0 && options.toc) children = [...buildToc(options.toc, ctx), ...children];
    const resolved = resolveSection(options, index, segments.length, warnings);
    const built = await buildSection(resolved, children, index, segments.length, options, ctx);
    sections.push(built.section);
    even = even || built.even;
  }
  const footnotes = buildFootnotes(ctx);
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
    ...(even ? { evenAndOddHeaderAndFooters: true } : {}),
    ...(footnotes ? { footnotes } : {}),
    sections,
  });
  return { document, warnings: ctx.warnings, lists: ctx.lists };
}
