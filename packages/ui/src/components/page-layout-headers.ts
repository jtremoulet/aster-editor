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
 * type est absent (en-tête retiré), un contenu inchangé garde la référence lue.
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
   * Valeurs à écrire dans la section : un jeu absent quand tous ses champs visibles sont
   * vides (en-tête retiré), un contenu **inchangé** rendu par la même référence que celle
   * lue (l'export dans le gabarit compare les HTML, une normalisation inutile ne doit pas
   * régénérer une partie), `titlePage` vrai ou absent.
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
 * la section en a déjà un). Un type décoché n'est pas écrit à l'application.
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
  const evenPages = createCheckbox(
    t('ui.pageLayout.evenPages'),
    hasType(section.headers, 'even') || hasType(section.footers, 'even'),
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
      { className: `aster-dialog__field aster-page-layout__${kind}` },
      HEADER_FOOTER_TYPES.map((type) => fields[kind][type].wrapper),
    ),
  );

  /** Affiche les champs `first` / `even` selon les cases. */
  const sync = (): void => {
    for (const kind of KINDS) {
      fields[kind].first.wrapper.toggleAttribute('hidden', !titlePage.input.checked);
      fields[kind].even.wrapper.toggleAttribute('hidden', !evenPages.input.checked);
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

  /** Contenu d'un type : la référence lue si inchangée, sinon le HTML normalisé, `null` si vide. */
  const contentOf = (
    kind: HeaderFooterKind,
    type: HeaderFooterType,
  ): HeaderFooterContent | null => {
    const html = fields[kind][type].getHtml();
    if (html === '') return null;
    const original = section[kind]?.[type];
    return original && normalizeFieldHtml(original.html) === html ? original : { html };
  };

  const read = (): HeaderFooterValues => {
    const values: { -readonly [K in keyof HeaderFooterValues]: HeaderFooterValues[K] } = {};
    const types: HeaderFooterType[] = ['default'];
    if (titlePage.input.checked) types.push('first');
    if (evenPages.input.checked) types.push('even');
    for (const kind of KINDS) {
      const set: { -readonly [K in HeaderFooterType]?: HeaderFooterContent } = {};
      for (const type of types) {
        const content = contentOf(kind, type);
        if (content) set[type] = content;
      }
      if (Object.keys(set).length === 0) continue;
      // Jeu inchangé type par type : la référence lue est rendue telle quelle.
      const original = section[kind];
      const unchanged =
        original !== undefined &&
        HEADER_FOOTER_TYPES.every((type) => (set[type] ?? null) === (original[type] ?? null));
      values[kind] = unchanged ? original : set;
    }
    if (titlePage.input.checked) values.titlePage = true;
    return values;
  };

  return { element, fields, titlePage: titlePage.input, evenPages: evenPages.input, read };
}
