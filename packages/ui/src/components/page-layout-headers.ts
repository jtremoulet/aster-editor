import type { HeaderFooterContent, HeaderFooterSet, SectionLayout } from '@aster-editor/core';
import { el } from '../utils/dom.js';
import { createCheckbox } from './paragraph-layout.js';
import { createRichField, normalizeFieldHtml, type RichField } from './rich-field.js';

/**
 * Section « En-tête et pied » du dialogue « Mise en page » (session 5, L54, retour POC
 * n° 8) : pour la section du curseur, un champ par type d'en-tête et de pied (`default`
 * toujours, `first` si « Première page différente », `even` si « Pages paires
 * différentes »). Chaque champ est un éditeur de texte riche **minimal** (`rich-field.ts`,
 * sans Tiptap : le dialogue est vanilla) dont la valeur est le HTML assaini et normalisé.
 * `read()` rend ce qu'il faut écrire dans la section : un type vidé est absent, un jeu sans
 * type est absent (en-tête retiré), un champ intact ou masqué garde la référence lue
 * (R52-02, R52-03).
 */

/** Types d'un jeu d'en-têtes ou de pieds, dans l'ordre d'affichage. */
export const HEADER_FOOTER_TYPES = ['default', 'first', 'even'] as const;

export type HeaderFooterType = (typeof HEADER_FOOTER_TYPES)[number];

/** Les deux jeux d'une section. */
export type HeaderFooterKind = 'headers' | 'footers';

const KINDS: readonly HeaderFooterKind[] = ['headers', 'footers'];

/** Clé i18n du libellé de chaque champ (`ui.pageLayout.<clé>`). */
const FIELD_LABEL_KEYS: Readonly<
  Record<HeaderFooterKind, Readonly<Record<HeaderFooterType, string>>>
> = {
  headers: {
    default: 'ui.pageLayout.header',
    first: 'ui.pageLayout.headerFirst',
    even: 'ui.pageLayout.headerEven',
  },
  footers: {
    default: 'ui.pageLayout.footer',
    first: 'ui.pageLayout.footerFirst',
    even: 'ui.pageLayout.footerEven',
  },
};

/** Jeux et case « Première page différente » lus dans la section du dialogue. */
export interface HeaderFooterValues {
  readonly headers?: HeaderFooterSet;
  readonly footers?: HeaderFooterSet;
  readonly titlePage?: boolean;
}

/** Section « En-tête et pied » montée. */
export interface HeaderFooterSection {
  readonly element: HTMLElement;
  /** Champs riches par jeu et par type, pour les tests et le focus. */
  readonly fields: Readonly<
    Record<HeaderFooterKind, Readonly<Record<HeaderFooterType, RichField>>>
  >;
  readonly titlePage: HTMLInputElement;
  readonly evenPages: HTMLInputElement;
  /**
   * Valeurs à écrire dans la section : un jeu absent quand tous ses types sont vides
   * (en-tête retiré), un jeu dont aucun champ n'a été modifié rendu par la **même
   * référence** que celle lue (l'export dans le gabarit compare les HTML, une
   * normalisation inutile ne doit pas régénérer une partie, R52-02), un type masqué
   * conservé tel quel (R52-03), `titlePage` vrai ou absent.
   */
  read(): HeaderFooterValues;
}

/** Options de la section « En-tête et pied ». */
export interface HeaderFooterSectionOptions {
  readonly section: SectionLayout;
  readonly suffix: string;
  readonly t: (key: string) => string;
}

/** Vrai si un jeu porte un contenu de ce type (HTML non vide une fois normalisé). */
function hasType(set: HeaderFooterSet | undefined, type: HeaderFooterType): boolean {
  const html = set?.[type]?.html;
  return typeof html === 'string' && normalizeFieldHtml(html) !== '';
}

/**
 * Monte la section « En-tête et pied » d'une section du document : deux colonnes (en-tête,
 * pied) de champs riches, la case « Première page différente » (`titlePage`, affiche les
 * champs `first`) et « Pages paires différentes » (affiche les champs `even`, cochée si
 * la section en a déjà un).
 *
 * Un type masqué n'est pas réécrit mais **conservé** : comme Word, décocher « Première
 * page différente » garde la partie `first` et seul `titlePage` porte le choix (la vue
 * page et l'export l'ignorent sans `titlePage`, le lecteur `.docx` la lit sans `w:titlePg`,
 * R52-03). Aucun drapeau de mise en page ne porte le choix « pages paires » : décocher la
 * case (quand elle était cochée à l'ouverture) retire les `even`, c'est la seule façon de
 * les retirer sans vider le champ.
 */
export function createHeaderFooterSection(
  options: HeaderFooterSectionOptions,
): HeaderFooterSection {
  const { section, suffix, t } = options;
  const titlePage = createCheckbox(
    t('ui.pageLayout.titlePage'),
    section.titlePage === true,
    'aster-page-layout__title-page',
  );
  const evenInitially = hasType(section.headers, 'even') || hasType(section.footers, 'even');
  const evenPages = createCheckbox(
    t('ui.pageLayout.evenPages'),
    evenInitially,
    'aster-page-layout__even-pages',
  );

  const createField = (kind: HeaderFooterKind, type: HeaderFooterType): RichField =>
    createRichField({
      id: `aster-page-layout-${kind}-${type}-${suffix}`,
      label: t(FIELD_LABEL_KEYS[kind][type]),
      html: section[kind]?.[type]?.html ?? '',
      className: `aster-page-layout__${kind}-${type}`,
    });
  const createColumn = (kind: HeaderFooterKind): Record<HeaderFooterType, RichField> => ({
    default: createField(kind, 'default'),
    first: createField(kind, 'first'),
    even: createField(kind, 'even'),
  });
  const fields = { headers: createColumn('headers'), footers: createColumn('footers') };
  const columns = KINDS.map((kind) =>
    el(
      'div',
      {
        className: `aster-dialog__field aster-page-layout__column aster-page-layout__column--${kind}`,
      },
      HEADER_FOOTER_TYPES.map((type) => fields[kind][type].wrapper),
    ),
  );

  /** Vrai si les champs de ce type sont masqués (case décochée). */
  const isHidden = (type: HeaderFooterType): boolean =>
    (type === 'first' && !titlePage.input.checked) || (type === 'even' && !evenPages.input.checked);

  /** Affiche les champs `first` / `even` selon les cases. */
  const sync = (): void => {
    for (const kind of KINDS) {
      fields[kind].first.wrapper.toggleAttribute('hidden', isHidden('first'));
      fields[kind].even.wrapper.toggleAttribute('hidden', isHidden('even'));
    }
  };
  titlePage.input.addEventListener('change', sync);
  evenPages.input.addEventListener('change', sync);
  sync();

  const element = el(
    'div',
    {
      className: 'aster-dialog__field aster-page-layout__headers',
      attrs: { role: 'group', 'aria-label': t('ui.pageLayout.headersFooters') },
    },
    [
      el('span', { className: 'aster-dialog__label', text: t('ui.pageLayout.headersFooters') }),
      el('p', { className: 'aster-page-layout__hint', text: t('ui.pageLayout.headersHint') }),
      el('div', { className: 'aster-dialog__checks' }, [titlePage.wrapper, evenPages.wrapper]),
      el('div', { className: 'aster-dialog__row' }, columns),
    ],
  );

  /**
   * Contenu d'un type : la référence lue si le champ est masqué ou intact (jamais
   * renormalisée, R52-02 / R52-03), sinon le HTML normalisé de la saisie — ou la référence
   * lue si la saisie lui est équivalente —, `null` si vide.
   */
  const contentOf = (
    kind: HeaderFooterKind,
    type: HeaderFooterType,
  ): HeaderFooterContent | null => {
    const original = section[kind]?.[type];
    const field = fields[kind][type];
    if (isHidden(type) || !field.isModified()) return original ?? null;
    const html = field.getHtml();
    if (html === '') return null;
    return original && normalizeFieldHtml(original.html) === html ? original : { html };
  };

  const read = (): HeaderFooterValues => {
    const values: { -readonly [K in keyof HeaderFooterValues]: HeaderFooterValues[K] } = {};
    // « Pages paires différentes » décochée par l'utilisateur : les `even` sont retirés.
    const dropEven = evenInitially && !evenPages.input.checked;
    for (const kind of KINDS) {
      const original = section[kind];
      const set: { -readonly [K in HeaderFooterType]?: HeaderFooterContent } = {};
      for (const type of HEADER_FOOTER_TYPES) {
        if (type === 'even' && dropEven) continue;
        const content = contentOf(kind, type);
        if (content) set[type] = content;
      }
      // Jeu inchangé type par type : la référence lue est rendue telle quelle.
      const unchanged =
        original !== undefined &&
        HEADER_FOOTER_TYPES.every((type) => (set[type] ?? null) === (original[type] ?? null));
      if (unchanged) values[kind] = original;
      else if (Object.keys(set).length > 0) values[kind] = set;
    }
    if (titlePage.input.checked) values.titlePage = true;
    return values;
  };

  return { element, fields, titlePage: titlePage.input, evenPages: evenPages.input, read };
}
