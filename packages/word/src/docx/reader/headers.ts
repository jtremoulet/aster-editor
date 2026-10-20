import type { HeaderFooterSet } from '@aster-editor/core';
import type { ConverterContext } from './types';

export interface HeadersFootersResult {
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
  readonly titlePage?: boolean;
}

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L25. Ne lit aucune partie d'en-tête ni de pied.
 * L25 suit les `w:headerReference` / `w:footerReference` du `sectPr` (types `default`,
 * `first`, `even`), convertit chaque partie avec `ctx.convert` dans un contexte dérivé
 * (`part`, `where`), et pose `titlePage` depuis `w:titlePg`.
 */
export async function readHeadersFooters(
  _sectPr: Element | null,
  _ctx: ConverterContext,
): Promise<HeadersFootersResult> {
  return {};
}
