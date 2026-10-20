import { afterEach, describe, expect, it } from 'vitest';
import type { AsterEditor, DocumentLayout, PageViewOptions } from '../api';
import { AsterEditorImpl } from '../editor/aster-editor';
import {
  PAGE_FOOTER_CLASS,
  PAGE_HEADER_CLASS,
  PAGE_VIEW_CLASS,
  PAGE_VIEW_CSS_VARIABLES,
  pageViewCssValues,
  resolvePageMetrics,
  sanitizeHeaderFooterHtml,
} from './page-view';
import { mountEditor, type MountedEditor } from '../testing/mount';

/** L'implémentation interne, qui porte `setPageView` et `getLayout` (hors contrat). */
function impl(editor: AsterEditor): AsterEditorImpl {
  if (!(editor instanceof AsterEditorImpl)) {
    throw new Error('AsterEditorImpl attendu');
  }
  return editor;
}

/** Valeurs des variables CSS posées sur l'hôte, dans l'ordre. */
function cssVariables(host: HTMLElement): string[] {
  return PAGE_VIEW_CSS_VARIABLES.map((name) => host.style.getPropertyValue(name));
}

const LAYOUT: DocumentLayout = {
  page: {
    size: 'Letter',
    orientation: 'landscape',
    margins: { topMm: 20, rightMm: 15, bottomMm: 20, leftMm: 15 },
  },
  headers: { default: { html: '<p class="h">En-tête <strong>gras</strong></p>' } },
  footers: { default: { html: '<p>Pied</p>' } },
};

describe('vue page', () => {
  let mounted: MountedEditor;

  afterEach(() => {
    mounted?.cleanup();
  });

  describe('resolvePageMetrics', () => {
    it('A4 portrait et marges 25,4 mm par défaut', () => {
      expect(resolvePageMetrics(undefined)).toEqual({
        widthMm: 210,
        heightMm: 297,
        marginTopMm: 25.4,
        marginRightMm: 25.4,
        marginBottomMm: 25.4,
        marginLeftMm: 25.4,
      });
      expect(resolvePageMetrics({})).toEqual(resolvePageMetrics(null));
    });

    it.each([
      ['A3', 297, 420],
      ['A4', 210, 297],
      ['A5', 148, 210],
      ['Letter', 215.9, 279.4],
      ['Legal', 215.9, 355.6],
    ] as const)('%s : %s × %s mm, inversé en paysage', (size, width, height) => {
      expect(resolvePageMetrics({ page: { size } })).toMatchObject({
        widthMm: width,
        heightMm: height,
      });
      expect(resolvePageMetrics({ page: { size, orientation: 'landscape' } })).toMatchObject({
        widthMm: height,
        heightMm: width,
      });
    });

    it('format libre, marges partielles et valeurs absurdes', () => {
      expect(
        resolvePageMetrics({
          page: { size: { widthMm: 100, heightMm: 50 }, margins: { topMm: 10, leftMm: -1 } },
        }),
      ).toEqual({
        widthMm: 100,
        heightMm: 50,
        marginTopMm: 10,
        marginRightMm: 25.4,
        marginBottomMm: 25.4,
        marginLeftMm: 25.4,
      });
      expect(
        resolvePageMetrics({ page: { size: { widthMm: 0, heightMm: Number.NaN } } }),
      ).toMatchObject({
        widthMm: 210,
        heightMm: 297,
      });
      expect(pageViewCssValues(resolvePageMetrics({ page: { size: 'Letter' } }))).toEqual([
        '215.9mm',
        '279.4mm',
        '25.4mm',
        '25.4mm',
        '25.4mm',
        '25.4mm',
      ]);
    });
  });

  describe('sanitizeHeaderFooterHtml', () => {
    it('garde texte et balises simples, retire script, style, iframe et on*', () => {
      expect(
        sanitizeHeaderFooterHtml(
          '<p class="a" style="color: red" onclick="x()">Bonjour <strong>toi</strong>' +
            '<script>alert(1)</script><style>p{}</style><iframe src="x"></iframe>' +
            '<img src="javascript:alert(1)" onerror="x()" alt="i"> <a href="javascript:x" title="t">lien</a>' +
            '<custom-tag>texte</custom-tag><!-- commentaire --></p>',
        ),
      ).toBe(
        '<p class="a" style="color: red">Bonjour <strong>toi</strong><img alt="i"> <a title="t">lien</a>texte</p>',
      );
    });

    it('accepte href http/https/mailto/ancre, src data:image, data-* et refuse url() dans style', () => {
      expect(
        sanitizeHeaderFooterHtml(
          '<a href="https://example.com" target="_blank" rel="noopener">a</a>' +
            '<a href="mailto:x@y.z">m</a><a href="#top">t</a><a href="/rel">r</a>' +
            '<img src="data:image/png;base64,AAAA" width="10" height="5">' +
            '<img src="data:text/html,x"><span data-aster-variable="nom" style="background: url(x)">{{nom}}</span>',
        ),
      ).toBe(
        '<a href="https://example.com" target="_blank" rel="noopener">a</a>' +
          '<a href="mailto:x@y.z">m</a><a href="#top">t</a><a href="/rel">r</a>' +
          '<img src="data:image/png;base64,AAAA" width="10" height="5">' +
          '<img><span data-aster-variable="nom">{{nom}}</span>',
      );
      expect(sanitizeHeaderFooterHtml('')).toBe('');
      expect(sanitizeHeaderFooterHtml('texte nu')).toBe('texte nu');
    });

    it('garde tables et listes', () => {
      const html =
        '<table><tbody><tr><td colspan="2">a</td></tr></tbody></table><ul><li>x</li></ul><ol start="2"><li>y</li></ol><hr><br>';
      expect(sanitizeHeaderFooterHtml(html)).toBe(html);
    });
  });

  describe('sur l’éditeur', () => {
    it('inactive par défaut : ni classe, ni variables, ni conteneurs, getLayout null', () => {
      mounted = mountEditor();
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(false);
      expect(mounted.element.getAttribute('style')).toBeNull();
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)).toBeNull();
      expect(impl(mounted.editor).getLayout()).toBeNull();
    });

    it('pageView: true pose la classe, les variables A4 et des conteneurs vides', () => {
      mounted = mountEditor({ pageView: true });
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
      expect(cssVariables(mounted.element)).toEqual([
        '210mm',
        '297mm',
        '25.4mm',
        '25.4mm',
        '25.4mm',
        '25.4mm',
      ]);
      const header = mounted.element.querySelector<HTMLElement>(`.${PAGE_HEADER_CLASS}`);
      const footer = mounted.element.querySelector<HTMLElement>(`.${PAGE_FOOTER_CLASS}`);
      expect(header?.innerHTML).toBe('');
      expect(footer?.innerHTML).toBe('');
      expect(header?.getAttribute('contenteditable')).toBe('false');
      expect(header?.nextSibling).toBe(mounted.editor.contentElement);
      expect(footer?.previousSibling).toBe(mounted.editor.contentElement);
      expect(impl(mounted.editor).getLayout()).toEqual({});
    });

    it('pageView avec layout : variables calculées, en-têtes et pieds rendus et assainis', () => {
      const options: PageViewOptions = {
        layout: {
          ...LAYOUT,
          headers: { default: { html: '<p onclick="x()">H</p><script>bad()</script>' } },
        },
      };
      mounted = mountEditor({ pageView: options });
      expect(cssVariables(mounted.element)).toEqual([
        '279.4mm',
        '215.9mm',
        '20mm',
        '15mm',
        '20mm',
        '15mm',
      ]);
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)?.innerHTML).toBe('<p>H</p>');
      expect(mounted.element.querySelector(`.${PAGE_FOOTER_CLASS}`)?.innerHTML).toBe('<p>Pied</p>');
      expect(mounted.element.querySelector('script')).toBeNull();
      expect(impl(mounted.editor).getLayout()).toBe(options.layout);
    });

    it('showHeadersFooters: false ne crée aucun conteneur', () => {
      mounted = mountEditor({ pageView: { layout: LAYOUT, showHeadersFooters: false } });
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)).toBeNull();
      expect(mounted.element.querySelector(`.${PAGE_FOOTER_CLASS}`)).toBeNull();
    });

    it('setPageView remplace puis retire la vue page, sans toucher au contenu', () => {
      mounted = mountEditor({ content: '<p>x</p>' });
      const editor = impl(mounted.editor);
      editor.setPageView({ layout: LAYOUT });
      expect(mounted.element.querySelectorAll(`.${PAGE_HEADER_CLASS}`)).toHaveLength(1);
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)?.textContent).toBe(
        'En-tête gras',
      );
      editor.setPageView(true);
      expect(mounted.element.querySelectorAll(`.${PAGE_HEADER_CLASS}`)).toHaveLength(1);
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)?.innerHTML).toBe('');
      expect(cssVariables(mounted.element)[0]).toBe('210mm');
      editor.setPageView(false);
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(false);
      expect(mounted.element.getAttribute('style')).toBeNull();
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)).toBeNull();
      expect(mounted.element.querySelector(`.${PAGE_FOOTER_CLASS}`)).toBeNull();
      expect(editor.getLayout()).toBeNull();
      expect(editor.getHTML()).toBe('<p>x</p>');
      editor.setPageView(false);
    });

    it('setReadOnly ne touche pas à la vue page', () => {
      mounted = mountEditor({ pageView: { layout: LAYOUT } });
      mounted.editor.setReadOnly(true);
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)).not.toBeNull();
      mounted.editor.setReadOnly(false);
      expect(mounted.element.querySelector(`.${PAGE_FOOTER_CLASS}`)).not.toBeNull();
    });

    it('destroy retire classe, variables et conteneurs', () => {
      mounted = mountEditor({ pageView: { layout: LAYOUT } });
      const editor = impl(mounted.editor);
      editor.destroy();
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(false);
      expect(mounted.element.getAttribute('style')).toBeNull();
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)).toBeNull();
      expect(mounted.element.querySelector(`.${PAGE_FOOTER_CLASS}`)).toBeNull();
      expect(editor.getLayout()).toBeNull();
      // Après destroy, setPageView est un no-op.
      editor.setPageView(true);
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(false);
    });
  });
});
