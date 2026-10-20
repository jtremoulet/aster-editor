import type { DocumentLayout, HeaderFooterSet, SectionLayout } from '@aster-editor/core';

/**
 * Règle unique « quelle `SectionLayout` pour quel segment » (R43-01, R43-04), partagée par
 * l'export neuf (`sections.ts`) et la greffe dans le gabarit (`writer/graft-sections.ts`),
 * pour que les deux chemins lisent la même entrée du contrat. Les segments sont numérotés
 * par leur **position** (1..k), jamais par l'attribut du `<hr data-section-break="n">` :
 * le core garantit `n` = position, et un attribut altéré (`0`, `abc`, ordre `3-1`) ne doit
 * pas faire diverger l'export neuf de la greffe. Sans dépendance vers la lib `docx` ni
 * vers le DOM : importable des deux côtés.
 */

/**
 * `SectionLayout` du segment `index` (0-based) sur `count` : `layout.sections[index]` pour
 * un segment intermédiaire ; pour le dernier, `layout.sections[count - 1]` seulement si la
 * liste compte autant de sections que de segments, sinon `undefined` (les champs de premier
 * niveau du `layout` font foi, comportement 0.5).
 */
export function sectionLayoutOf(
  layout: DocumentLayout | undefined,
  index: number,
  count: number,
): SectionLayout | undefined {
  const sections = layout?.sections ?? [];
  if (index < count - 1) return sections[index];
  return sections.length === count ? sections[count - 1] : undefined;
}

/** En-têtes et pieds demandés pour une section (`undefined` = rien de demandé). */
export interface SectionHeaderFooterSets {
  readonly headers: HeaderFooterSet | undefined;
  readonly footers: HeaderFooterSet | undefined;
}

/**
 * En-têtes et pieds que le contrat demande pour le segment `index` : ceux de sa
 * `SectionLayout` ; pour le dernier segment, à défaut, ceux de premier niveau
 * (`layout.headers` / `layout.footers`, qui recopient la dernière section). L'export neuf
 * les construit, la greffe en décide (et le `template-section-missing`) avec la même règle.
 */
export function sectionHeaderFooterSets(
  layout: DocumentLayout | undefined,
  index: number,
  count: number,
): SectionHeaderFooterSets {
  const section = sectionLayoutOf(layout, index, count);
  const last = index >= count - 1;
  return {
    headers: section?.headers ?? (last ? layout?.headers : undefined),
    footers: section?.footers ?? (last ? layout?.footers : undefined),
  };
}
