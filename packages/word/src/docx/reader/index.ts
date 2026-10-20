import type { DocumentLayout } from '@aster-editor/core';
import type { DocxImportWarning, DocxLostObject } from '../types';
import { childNamed } from '../preprocess/xml-utils';
import { readHeadersFooters } from './headers';
import { escapeHtml } from './html';
import { createImageConverter } from './images';
import { createNumberingResolver, renderBlocks } from './lists';
import { detectLost } from './lost';
import { createNoteRegistry } from './notes';
import { openPackage } from './package';
import { convertParagraph } from './paragraphs';
import { readSectionLayout } from './sections';
import { createStyleResolver } from './styles';
import { convertTable } from './tables';
import type {
  Block,
  BlockConverters,
  ConverterContext,
  ContextPatch,
  ReaderOptions,
  ReaderResult,
} from './types';

/**
 * Lecteur OOXML d'Aster (chemin `fidelity: 'styled'`). Orchestre les modules du dossier :
 * ouvre le paquet, construit les résolveurs (styles, numérotation, images, notes), parcourt
 * le corps bloc par bloc, rend les listes, ajoute les notes, lit la mise en page et les
 * en-têtes et pieds de la dernière section. Figé en phase 0 : les lots L24 et L25
 * remplacent les modules, pas cet orchestrateur.
 */

/** Enfants bloc d'un conteneur Word. `w:sdt` est traversé, les signets et `w:proofErr` ignorés. */
async function convertBlocks(container: Element, ctx: ConverterContext): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const child of Array.from(container.children)) {
    switch (child.localName) {
      case 'p':
        blocks.push(await ctx.convert.paragraph(child, ctx));
        break;
      case 'tbl':
        blocks.push(await ctx.convert.table(child, ctx));
        break;
      case 'sdt': {
        const content = childNamed(child, 'sdtContent');
        if (content) blocks.push(...(await convertBlocks(content, ctx)));
        break;
      }
      case 'sectPr':
      case 'bookmarkStart':
      case 'bookmarkEnd':
      case 'proofErr':
      case 'commentRangeStart':
      case 'commentRangeEnd':
      case 'permStart':
      case 'permEnd':
      // Propriétés des conteneurs traversés (cellule, contrôle de contenu, tableau) : pas des blocs.
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

/** Dérive un contexte pour une autre partie ou un autre conteneur, sans recréer les résolveurs. */
export function deriveContext(ctx: ConverterContext, patch: ContextPatch): ConverterContext {
  return { ...ctx, ...patch };
}

/** `w:sectPr` final du corps (mise en page de la dernière section), `null` s'il manque. */
function finalSectPr(body: Element): Element | null {
  return childNamed(body, 'sectPr');
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

  const blocks = await convertBlocks(body, ctx);
  const sectPr = finalSectPr(body);
  const bodyHtml = renderBlocks(blocks, ctx);
  const notesHtml = options.footnotes ? await notes.render(ctx) : '';
  const headersFooters = await readHeadersFooters(sectPr, ctx);
  const layout: DocumentLayout = { ...readSectionLayout(sectPr, styles), ...headersFooters };

  return { html: bodyHtml + notesHtml, layout, lost, warnings };
}
