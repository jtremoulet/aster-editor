import type { DocumentLayout, HeaderFooterSet, SectionLayout } from '../api/index.js';
import { sanitizeHeaderFooterHtml } from './header-footer-sanitize.js';

/**
 * Variantes d'en-tête et de pied d'une page (session 5, L52, retour POC n° 3). Word
 * choisit le jeu selon la page : `first` sur la première page d'une section `titlePage`,
 * `even` sur les pages paires quand le document distingue pages paires et impaires,
 * `default` sinon. L'hôte (page 1, dernière page) et chaque coupure de la pagination
 * passent par ici pour que l'écran suive le document.
 */

/** Quelle page un en-tête ou un pied habille. */
export interface HeaderFooterPage {
  /** Numéro (1-based) de la page dans le document, pour la parité (`even`). */
  readonly pageNumber: number;
  /** Vrai si c'est la première page de sa section (`first` quand la section est `titlePage`). */
  readonly firstOfSection: boolean;
}

/** Première page d'un document : page 1, première de la section 1. */
export const FIRST_PAGE: HeaderFooterPage = Object.freeze({ pageNumber: 1, firstOfSection: true });

/**
 * HTML **assaini** de l'en-tête (`headers`) ou du pied (`footers`) d'une section pour une
 * page donnée, `''` s'il n'y en a pas. Règles de Word : sur la première page d'une section
 * `titlePage`, c'est `first` qui compte ; sur une page paire, `even` s'il existe ; `default`
 * partout ailleurs. Écart assumé avec Word : un `first` absent retombe sur `default` (Word
 * laisse la page vide) pour qu'un intégrateur qui ne renseigne que `default` sur un
 * document `titlePage` voie son en-tête, le lecteur `.docx` héritant de toute façon
 * `first` type par type quand le document en a un.
 */
export function headerFooterHtmlFor(
  section: SectionLayout,
  kind: 'headers' | 'footers',
  page: HeaderFooterPage,
): string {
  const set: HeaderFooterSet | undefined = section[kind];
  let html: string | undefined;
  if (page.firstOfSection && section.titlePage === true && set?.first) {
    html = set.first.html;
  } else if (page.pageNumber % 2 === 0 && set?.even) {
    html = set.even.html;
  } else {
    html = set?.default?.html;
  }
  return sanitizeHeaderFooterHtml(typeof html === 'string' ? html : '');
}

/**
 * Vrai si la section (1-based) s'ouvre sans changer de page (`start: 'continuous'`) : sa
 * première page est alors partagée avec la section précédente, et la première coupure qui
 * porte son numéro ouvre en réalité sa deuxième page (approximation : le `data-section-start`
 * posé sur le `hr` n'est pas relu ici, seule la mise en page compte).
 */
export function isContinuousSection(layout: DocumentLayout, section: number): boolean {
  const sections: unknown = layout.sections;
  const known: unknown = Array.isArray(sections) ? sections[section - 1] : undefined;
  return (
    typeof known === 'object' && known !== null && (known as SectionLayout).start === 'continuous'
  );
}
