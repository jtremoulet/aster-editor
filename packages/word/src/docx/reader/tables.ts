import { childrenNamed } from '../preprocess/xml-utils';
import type { ConverterContext, TableBlock } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L25. Rend lignes et cellules sans largeur,
 * bordure, fond ni fusion ; le contenu des cellules passe par `ctx.convert.blocks`.
 */
export async function convertTable(table: Element, ctx: ConverterContext): Promise<TableBlock> {
  const rows: string[] = [];
  for (const tr of childrenNamed(table, 'tr')) {
    const cells: string[] = [];
    for (const tc of childrenNamed(tr, 'tc')) {
      const blocks = await ctx.convert.blocks(tc, ctx);
      const inner = ctx.convert.render(blocks, ctx) || '<p></p>';
      cells.push(`<td>${inner}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return { kind: 'table', html: `<table><tbody>${rows.join('')}</tbody></table>` };
}
