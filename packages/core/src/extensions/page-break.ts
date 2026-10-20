import { HorizontalRule } from '@tiptap/extension-horizontal-rule';

/**
 * Séparateur horizontal qui sait aussi être un saut de page : `<hr data-page-break>`.
 * L'import Word produit cette forme pour `w:br w:type="page"`, l'export Word la relit
 * en saut de page, la vue page la rend comme une coupure de feuille. Sans cet attribut,
 * le `HorizontalRule` de Tiptap le perdait à `setHTML(getHTML())`.
 */
export const AsterHorizontalRule = HorizontalRule.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      pageBreak: {
        default: false,
        parseHTML: (element: HTMLElement) => element.hasAttribute('data-page-break'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes['pageBreak'] === true ? { 'data-page-break': '' } : {},
      },
    };
  },
});
