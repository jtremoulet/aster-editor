import type { DocumentLayout } from '@aster-editor/core';
import type { StyleResolver } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L25. Ne lit ni `w:pgSz`, ni `w:pgMar`, ni
 * `w:cols`, ni la langue : seule la police par défaut résolue est reportée.
 * L25 produit `page` (format nommé si les dimensions correspondent à ±1 mm, sinon
 * `PageDimensions`), `orientation`, `margins` (twips → mm), `columns`, `lang`
 * (`w:lang` des `docDefaults`), `defaultFont`.
 */
export function readSectionLayout(_sectPr: Element | null, styles: StyleResolver): DocumentLayout {
  const font = styles.defaultFont();
  return font.family || font.sizePt ? { defaultFont: font } : {};
}
