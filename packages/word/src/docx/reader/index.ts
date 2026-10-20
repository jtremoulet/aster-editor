import type { DocumentLayout, SectionLayout } from '@aster-editor/core';
import type { DocxImportWarning, DocxLostObject } from '../types';
import { childNamed } from '../preprocess/xml-utils';
import { readEffectiveHeadersFooters, type HeadersFootersResult } from './headers';
import { escapeHtml } from './html';
import { createImageConverter } from './images';
import { createNumberingResolver, registerListItem, renderBlocks } from './lists';
import { detectLost } from './lost';
import { createNoteRegistry } from './notes';
import { openPackage } from './package';
import { convertParagraph } from './paragraphs';
import { readDocumentLang, readSectionLayout, readSectionProperties } from './sections';
import { createStyleResolver } from './styles';
import { convertTable } from './tables';
import type {
  Block,
  BlockConverters,
  ConverterContext,
  ContextPatch,
  RawBlock,
  ReaderOptions,
  ReaderResult,
} from './types';

/**
 * Lecteur OOXML d'Aster (chemin `fidelity: 'styled'`). Orchestre les modules du dossier :
 * ouvre le paquet, construit les résolveurs (styles, numérotation, images, notes), parcourt
 * le corps bloc par bloc en marquant les fins de section, rend les listes, ajoute les
 * notes, lit la mise en page de chaque section et celle de la dernière au premier niveau.
 */

/** Saut de section du contrat : `n` est l'index (à partir de 1) de la section qui se termine. */
export function sectionBreakHtml(section: number): string {
  return `<hr data-section-break="${String(section)}">`;
}

/** `w:sectPr` porté par le `w:pPr` d'un paragraphe (fin de section), `null` sinon. */
function paragraphSectPr(paragraph: Element): Element | null {
  const pPr = childNamed(paragraph, 'pPr');
  return pPr ? childNamed(pPr, 'sectPr') : null;
}

/** Fins de section rencontrées dans le corps, dans l'ordre : le `w:sectPr` et le bloc de saut émis. */
interface SectionCollector {
  readonly ends: { readonly sectPr: Element; readonly block: RawBlock }[];
}

/**
 * Enfants bloc d'un conteneur Word. `w:sdt` et `w:customXml` (balises XML personnalisées,
 * bibliographies) sont traversés, les signets et `w:proofErr` ignorés. Chaque paragraphe
 * numéroté est enregistré dans l'ordre du document (`registerListItem`), pour que la
 * numérotation continue à travers les cellules, rendues avant le corps.
 *
 * Avec un collecteur (corps du document, y compris à travers `w:sdt` / `w:customXml`), un
 * paragraphe dont le `w:pPr` porte un `w:sectPr` termine une section : le paragraphe est
 * rendu s'il a du contenu (sinon il n'est qu'un porteur, forme fréquente de Word, et ne
 * laisse pas de `<p></p>` parasite), puis un `<hr data-section-break="n">` est émis.
 */
async function convertContainer(
  container: Element,
  ctx: ConverterContext,
  sections: SectionCollector | null,
): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const child of Array.from(container.children)) {
    switch (child.localName) {
      case 'p': {
        const block = await ctx.convert.paragraph(child, ctx);
        const sectPr = sections ? paragraphSectPr(child) : null;
        if (!sectPr || !block.isEmpty) {
          registerListItem(block, ctx);
          blocks.push(block);
        }
        if (sectPr && sections) {
          const breakBlock: RawBlock = {
            kind: 'raw',
            html: sectionBreakHtml(sections.ends.length + 1),
          };
          sections.ends.push({ sectPr, block: breakBlock });
          blocks.push(breakBlock);
        }
        break;
      }
      case 'tbl':
        blocks.push(await ctx.convert.table(child, ctx));
        break;
      case 'sdt': {
        const content = childNamed(child, 'sdtContent');
        if (content) blocks.push(...(await convertContainer(content, ctx, sections)));
        break;
      }
      case 'customXml':
        blocks.push(...(await convertContainer(child, ctx, sections)));
        break;
      case 'customXmlPr':
      case 'sectPr':
      case 'bookmarkStart':
      case 'bookmarkEnd':
      case 'proofErr':
      case 'commentRangeStart':
      case 'commentRangeEnd':
      case 'permStart':
      case 'permEnd':
      case 'tcPr':
      case 'tblPr':
      case 'tblGrid':
      case 'trPr':
      case 'sdtPr':
      case 'sdtEndPr':
      case 'pPr':
        break;
      default: {
        const lost = detectLost(child, ctx);
        if (lost) {
          ctx.lost.push(lost);
          ctx.warnings.push({
            code: 'object-lost',
            message: `Objet non représentable ignoré (${lost.kind})${lost.detail ? ` : ${lost.detail}` : ''}.`,
          });
          if (lost.text) blocks.push({ kind: 'raw', html: `<p>${escapeHtml(lost.text)}</p>` });
        }
      }
    }
  }
  return blocks;
}

/**
 * Point d'entrée figé de `BlockConverters.blocks` : cellules, notes, en-têtes (sans
 * sections). Exporté pour l'ouverture du gabarit (`writer/template.ts`), qui relit les
 * en-têtes et pieds exactement comme l'import.
 */
export async function convertBlocks(container: Element, ctx: ConverterContext): Promise<Block[]> {
  return convertContainer(container, ctx, null);
}

/** Dérive un contexte pour une autre partie ou un autre conteneur, sans recréer les résolveurs. */
export function deriveContext(ctx: ConverterContext, patch: ContextPatch): ConverterContext {
  return { ...ctx, ...patch };
}

/**
 * Corps converti : ses blocs et les `w:sectPr` de toutes ses sections dans l'ordre (ceux
 * des `w:pPr` puis le final). Sans `w:sectPr` final (paquet mal formé), la dernière fin de
 * section rencontrée est la dernière section : son saut est retiré, jamais émis pour la
 * dernière section.
 */
async function convertBody(
  body: Element,
  ctx: ConverterContext,
): Promise<{ readonly blocks: Block[]; readonly sectPrs: Element[] }> {
  const collector: SectionCollector = { ends: [] };
  const blocks = await convertContainer(body, ctx, collector);
  const sectPrs = collector.ends.map((end) => end.sectPr);
  const finalSectPr = childNamed(body, 'sectPr');
  if (finalSectPr) {
    sectPrs.push(finalSectPr);
  } else {
    const last = collector.ends[collector.ends.length - 1];
    const index = last ? blocks.indexOf(last.block) : -1;
    if (index >= 0) blocks.splice(index, 1);
  }
  return { blocks, sectPrs };
}

/**
 * `layout.sections` : chaque `w:sectPr` dans l'ordre, avec ses en-têtes et pieds effectifs
 * (hérités de la section précédente type par type) et ses propriétés propres.
 */
async function readSections(
  sectPrs: readonly Element[],
  ctx: ConverterContext,
  warnings: DocxImportWarning[],
): Promise<{ readonly sections: SectionLayout[]; readonly headersFooters: HeadersFootersResult }> {
  const effective = await readEffectiveHeadersFooters(sectPrs, ctx);
  const sections = sectPrs.map((sectPr, index): SectionLayout => ({
    ...readSectionProperties(sectPr, warnings),
    ...effective[index],
  }));
  // Premier niveau (compatibilité 0.5) : jeu effectif de la dernière section, et première
  // page différente dès qu'une section la déclare (décision L25, fixture 16).
  const last = effective[effective.length - 1];
  const titlePage = effective.some((section) => section.titlePage);
  return {
    sections,
    headersFooters: {
      ...(last?.headers ? { headers: last.headers } : {}),
      ...(last?.footers ? { footers: last.footers } : {}),
      ...(titlePage ? { titlePage: true } : {}),
    },
  };
}

/** Saut de section rendu, tel que `sectionBreakHtml` l'écrit. */
const SECTION_BREAK = /<hr data-section-break="\d+">/;

/**
 * Garde commune « chaque section se termine par un bloc éditable » (R42-01), miroir de
 * ce que le `core` impose au chargement : `TrailingNode` (`StarterKit`, `notAfter: []`)
 * ajoute un `<p></p>` après tout dernier bloc qui n'est pas un paragraphe (saut de
 * section, tableau, liste, titre, saut de page, notes), et `ensureSectionBlocks`
 * (R41-03) un paragraphe avant un saut en tête de document ou entre deux sauts
 * adjacents. Pour que `setHTML(getHTML())` rende le HTML de l'import à l'identique, le
 * lecteur émet ces `<p></p>` lui-même, en `keep` comme en `drop` (où le paragraphe vide
 * porteur ou suivant un saut final a été retiré ; `stripEmptyParagraphs` les conserve).
 * Un corps vide reste vide.
 */
export function ensureEditableBlocks(html: string): string {
  if (html === '') return html;
  const out: string[] = [];
  let sectionOpen = true;
  for (const piece of html.split(new RegExp(`(${SECTION_BREAK.source})`, 'g'))) {
    if (piece === '') continue;
    if (SECTION_BREAK.test(piece)) {
      if (sectionOpen) out.push('<p></p>');
      sectionOpen = true;
    } else {
      sectionOpen = false;
    }
    out.push(piece);
  }
  const joined = out.join('');
  return joined.endsWith('</p>') ? joined : `${joined}<p></p>`;
}

/**
 * Lit un `.docx` (octets déjà prétraités pour les variables) et rend le HTML stylé, la mise
 * en page, les objets perdus et les avertissements. Ne lève que si la partie principale
 * est absente ou illisible.
 */
export async function readDocx(buffer: ArrayBuffer, options: ReaderOptions): Promise<ReaderResult> {
  const pkg = await openPackage(buffer, options.parseXml);
  const main = await pkg.part(pkg.mainPart);
  if (!main) {
    throw new Error(`partie principale ${pkg.mainPart} absente ou illisible`);
  }
  const body = childNamed(main.documentElement, 'body');
  if (!body) {
    throw new Error(`partie principale ${pkg.mainPart} sans élément body`);
  }

  const warnings: DocxImportWarning[] = [];
  const lost: DocxLostObject[] = [];
  const [styles, numbering, notes] = await Promise.all([
    createStyleResolver(pkg),
    createNumberingResolver(pkg),
    createNoteRegistry(pkg, options),
  ]);
  const convert: BlockConverters = {
    paragraph: convertParagraph,
    table: convertTable,
    blocks: convertBlocks,
    render: renderBlocks,
  };
  const ctx: ConverterContext = {
    pkg,
    part: pkg.mainPart,
    where: 'body',
    styles,
    numbering,
    images: createImageConverter(pkg, options),
    notes,
    convert,
    options,
    warnings,
    lost,
    tableStyle: null,
  };

  const { blocks, sectPrs } = await convertBody(body, ctx);
  const bodyHtml = renderBlocks(blocks, ctx);
  const notesHtml = options.footnotes ? await notes.render(ctx) : '';
  const lang = await readDocumentLang(pkg);
  const { sections, headersFooters } = await readSections(sectPrs, ctx, warnings);
  const last = sections[sections.length - 1];
  const layout: DocumentLayout = {
    ...(last?.page ? { page: last.page } : {}),
    ...(last?.columns !== undefined ? { columns: last.columns } : {}),
    ...readSectionLayout(null, styles, lang),
    ...headersFooters,
    ...(sections.length > 0 ? { sections } : {}),
  };

  return { html: ensureEditableBlocks(bodyHtml + notesHtml), layout, lost, warnings };
}
