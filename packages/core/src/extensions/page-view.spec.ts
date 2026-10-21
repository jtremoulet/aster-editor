import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AsterEditor, DocumentLayout, PageViewOptions, SectionLayout } from '../api/index.js';
import { AsterEditorImpl } from '../editor/aster-editor.js';
import * as sanitizeModule from './header-footer-sanitize.js';
import {
  FIRST_PAGE,
  MAX_PAGE_MM,
  MAX_SANITIZE_DEPTH,
  PAGE_DEFAULTS_CLASS,
  PAGE_DEFAULT_CSS_VARIABLES,
  PAGE_FOOTER_CLASS,
  PAGE_HEADER_CLASS,
  PAGE_VIEW_CLASS,
  PAGE_VIEW_CSS_VARIABLES,
  PAGE_WIDTH_MAX_CSS_VARIABLE,
  bodySectionCount,
  headerFooterHtmlFor,
  isContinuousSection,
  maxSectionWidthMm,
  pageDefaultsCssValues,
  pageViewCssValues,
  resolvePageMetrics,
  resolveSectionLayout,
  sanitizeHeaderFooterHtml,
  setHostLastPage,
} from './page-view.js';
import { mountEditor, type MountedEditor } from '../testing/mount.js';

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
    it('A4 portrait, marges 25,4 mm et en-tête / pied à 12,7 mm par défaut', () => {
      expect(resolvePageMetrics(undefined)).toEqual({
        widthMm: 210,
        heightMm: 297,
        marginTopMm: 25.4,
        marginRightMm: 25.4,
        marginBottomMm: 25.4,
        marginLeftMm: 25.4,
        marginHeaderMm: 12.7,
        marginFooterMm: 12.7,
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
        marginHeaderMm: 12.7,
        marginFooterMm: 12.7,
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
        '12.7mm',
        '12.7mm',
      ]);
    });

    it('R26 (dette core) : headerMm / footerMm du layout, repli 12,7 mm', () => {
      const metrics = resolvePageMetrics({
        page: { margins: { headerMm: 10, footerMm: -3 } },
      });
      expect(metrics.marginHeaderMm).toBe(10);
      expect(metrics.marginFooterMm).toBe(12.7);
      expect(pageViewCssValues(metrics).slice(6)).toEqual(['10mm', '12.7mm']);
      expect(PAGE_VIEW_CSS_VARIABLES.slice(6)).toEqual([
        '--aster-page-margin-header',
        '--aster-page-margin-footer',
      ]);
    });

    it('R23-05 : bornes 0 à 10 000 mm, jamais Infinitymm', () => {
      expect(MAX_PAGE_MM).toBe(10_000);
      // Preuve du relecteur : `1e308 * 100` déborde en Infinity au formatage.
      const huge = resolvePageMetrics({
        page: {
          size: { widthMm: 1e308, heightMm: 297 },
          margins: { topMm: 1e308, headerMm: Number.POSITIVE_INFINITY },
        },
      });
      expect(huge).toMatchObject({ widthMm: 210, marginTopMm: 25.4, marginHeaderMm: 12.7 });
      const values = pageViewCssValues(huge);
      expect(values.some((value) => /infinity|nan/i.test(value))).toBe(false);
      // Borne incluse : 10 000 mm passe, 10 000,01 mm retombe sur le défaut.
      expect(
        resolvePageMetrics({
          page: { size: { widthMm: MAX_PAGE_MM, heightMm: MAX_PAGE_MM + 0.01 } },
        }),
      ).toMatchObject({ widthMm: 10_000, heightMm: 297 });
      expect(
        resolvePageMetrics({ page: { margins: { leftMm: MAX_PAGE_MM + 1 } } }).marginLeftMm,
      ).toBe(25.4);
      // Même un `PageMetrics` forgé hors de `resolvePageMetrics` ne produit pas `Infinitymm`.
      for (const value of pageViewCssValues({
        ...huge,
        widthMm: Number.POSITIVE_INFINITY,
        heightMm: Number.NaN,
      })) {
        expect(value).toMatch(/^\d+(?:\.\d+)?mm$/);
      }
    });
  });

  describe('sanitizeHeaderFooterHtml', () => {
    it('R30-13 : vit dans header-footer-sanitize.ts, réexporté à l’identique par page-view.ts', () => {
      expect(sanitizeHeaderFooterHtml).toBe(sanitizeModule.sanitizeHeaderFooterHtml);
      expect(MAX_SANITIZE_DEPTH).toBe(sanitizeModule.MAX_SANITIZE_DEPTH);
    });

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

    /** Protocole de l'attribut `href` du premier lien, relu par le parseur d'URL de jsdom. */
    const linkProtocol = (html: string): string | null => {
      const div = document.createElement('div');
      div.innerHTML = sanitizeHeaderFooterHtml(html);
      const link = div.querySelector('a');
      return link?.hasAttribute('href') ? link.protocol : null;
    };

    it('R23-01 : retire href dont le schéma est masqué par un caractère de contrôle ou un blanc', () => {
      // Preuve du relecteur : trois vecteurs lus `javascript:` par le navigateur.
      for (const vector of [
        'java\tscript:alert(1)',
        'java\nscript:alert(1)',
        '\u0001javascript:alert(1)',
      ]) {
        expect(sanitizeHeaderFooterHtml(`<a href="${vector}">x</a>`), JSON.stringify(vector)).toBe(
          '<a>x</a>',
        );
        expect(linkProtocol(`<a href="${vector}">x</a>`)).toBeNull();
      }
      expect(sanitizeHeaderFooterHtml('<a href="&#9;javascript:x">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHeaderFooterHtml('<a href=" java script : x">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHeaderFooterHtml('<img src="\u0001data:text/html,x">')).toBe('<img>');
      expect(sanitizeHeaderFooterHtml('<a href="vbscript:x">x</a>')).toBe('<a>x</a>');
    });

    it('R23-01 : allowlist http / https / mailto / tel et relatif, refus de // et \\\\', () => {
      expect(
        sanitizeHeaderFooterHtml(
          '<a href="tel:+33600000000">t</a><a href="page.html?a=1">r</a>' +
            '<a href="HTTPS://example.com/x">u</a><a href="ht\ttps://example.com">s</a>',
        ),
      ).toBe(
        '<a href="tel:+33600000000">t</a><a href="page.html?a=1">r</a>' +
          '<a href="HTTPS://example.com/x">u</a><a href="ht\ttps://example.com">s</a>',
      );
      // Un blanc au milieu d'un schéma sûr reste sûr : le navigateur lit `https:`.
      expect(linkProtocol('<a href="ht\ttps://example.com">s</a>')).toBe('https:');
      // … mais un schéma inconnu une fois les blancs retirés (`htps:`) est refusé.
      expect(sanitizeHeaderFooterHtml('<a href="h\ttps://example.com">s</a>')).toBe('<a>s</a>');
      // Dette R23 n° 1 : les URL relatives au protocole (et leur variante `\\`) sont refusées.
      expect(sanitizeHeaderFooterHtml('<a href="//evil.example/x">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHeaderFooterHtml('<a href="\\\\evil.example/x">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHeaderFooterHtml('<a href="/\\evil.example/x">x</a>')).toBe('<a>x</a>');
      expect(sanitizeHeaderFooterHtml('<a href="/rel">r</a>')).toBe('<a href="/rel">r</a>');
    });

    it('R23-08 : style refusé si échappement CSS, url() masqué ou fonction chargeant une ressource', () => {
      // Preuve du relecteur : `\75rl(` et `ur\l(` sont lus `url(` par le CSS.
      expect(
        sanitizeHeaderFooterHtml('<p style="background:\\75rl(https://evil.example/x)">x</p>'),
      ).toBe('<p>x</p>');
      expect(
        sanitizeHeaderFooterHtml('<p style="background:ur\\l(https://evil.example/x)">x</p>'),
      ).toBe('<p>x</p>');
      expect(sanitizeHeaderFooterHtml('<p style="background:ur/**/l(x)">x</p>')).toBe('<p>x</p>');
      expect(sanitizeHeaderFooterHtml('<p style="background:url&#40;x)">x</p>')).toBe('<p>x</p>');
      expect(sanitizeHeaderFooterHtml('<p style="background:URL (x)">x</p>')).toBe('<p>x</p>');
      expect(
        sanitizeHeaderFooterHtml('<p style="background:-webkit-image-set(&quot;x&quot; 1x)">x</p>'),
      ).toBe('<p>x</p>');
      expect(sanitizeHeaderFooterHtml('<p style="content:image(x)">x</p>')).toBe('<p>x</p>');
      expect(sanitizeHeaderFooterHtml('<p style="behavior: x">x</p>')).toBe('<p>x</p>');
      // Les styles Word usuels passent.
      expect(
        sanitizeHeaderFooterHtml(
          '<p style="color: #ff0000; font-family: \'Times New Roman\'; text-align: center">x</p>',
        ),
      ).toBe(
        '<p style="color: #ff0000; font-family: \'Times New Roman\'; text-align: center">x</p>',
      );
    });

    it(
      'R23-03 : assainissement itératif, imbrication plafonnée à MAX_SANITIZE_DEPTH',
      { timeout: 60_000 },
      () => {
        expect(MAX_SANITIZE_DEPTH).toBe(64);
        // Preuve du relecteur : 8 000 `<div>` imbriqués faisaient déborder la pile d'appels.
        const html = '<div>'.repeat(8000) + 'x' + '</div>'.repeat(8000);
        let result = '';
        expect(() => {
          result = sanitizeHeaderFooterHtml(html);
        }).not.toThrow();
        expect(result).toBe('<div>'.repeat(64) + 'x' + '</div>'.repeat(64));
        // Les attributs des éléments déballés disparaissent avec eux ; le texte reste.
        const deep =
          '<span>'.repeat(70) + '<b onclick="x()" class="k">y</b>' + '</span>'.repeat(70);
        expect(sanitizeHeaderFooterHtml(deep)).toBe(
          '<span>'.repeat(64) + 'y' + '</span>'.repeat(64),
        );
        // Balise inconnue au-delà du plafond : déballée aussi, sans commentaire ni script.
        const mixed =
          '<custom>'.repeat(100) + '<!-- c --><script>bad()</script>z' + '</custom>'.repeat(100);
        expect(sanitizeHeaderFooterHtml(mixed)).toBe('z');
      },
    );
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
        '12.7mm',
        '12.7mm',
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
        '12.7mm',
        '12.7mm',
      ]);
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)?.innerHTML).toBe('<p>H</p>');
      expect(mounted.element.querySelector(`.${PAGE_FOOTER_CLASS}`)?.innerHTML).toBe('<p>Pied</p>');
      expect(mounted.element.querySelector('script')).toBeNull();
      expect(impl(mounted.editor).getLayout()).toBe(options.layout);
    });

    it('R26 (dette core) : headerMm / footerMm posés en --aster-page-margin-header / -footer', () => {
      mounted = mountEditor({
        pageView: { layout: { page: { margins: { headerMm: 8, footerMm: 6.5 } } } },
      });
      expect(mounted.element.style.getPropertyValue('--aster-page-margin-header')).toBe('8mm');
      expect(mounted.element.style.getPropertyValue('--aster-page-margin-footer')).toBe('6.5mm');
      impl(mounted.editor).setPageView(false);
      expect(mounted.element.getAttribute('style')).toBeNull();
    });

    it('R23-03 : une mise en page qui lève au montage est ignorée, l’éditeur reste entier', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        // Le seul chemin qui lit la mise en page hors du core : un accesseur hostile.
        const layout: DocumentLayout = {
          headers: {
            default: {
              get html(): string {
                throw new Error('en-tête hostile');
              },
            },
          },
        };
        let ready = false;
        mounted = mountEditor({ content: '<p>x</p>', pageView: { layout } });
        mounted.editor.on('ready', () => {
          ready = true;
        });
        await Promise.resolve();
        expect(ready).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        // Rien de posé à moitié : ni classe, ni variables, ni conteneur orphelin.
        expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(false);
        expect(mounted.element.getAttribute('style')).toBeNull();
        expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)).toBeNull();
        expect(mounted.element.querySelector(`.${PAGE_FOOTER_CLASS}`)).toBeNull();
        expect(impl(mounted.editor).getLayout()).toBeNull();
        expect(mounted.editor.getHTML()).toBe('<p>x</p>');
        // L'éditeur est utilisable, y compris pour activer une vue page saine ensuite.
        impl(mounted.editor).setPageView(true);
        expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
      } finally {
        warn.mockRestore();
      }
    });

    it('L52 (retour n° 3) : l’en-tête de l’hôte est `first` sur une section 1 titlePage, le pied suit la dernière page connue', () => {
      const layout: DocumentLayout = {
        titlePage: true,
        headers: { default: { html: '<p>Tête</p>' }, first: { html: '<p>Première</p>' } },
        footers: {
          default: { html: '<p>Pied</p>' },
          first: { html: '<p>Pied première</p>' },
          even: { html: '<p>Pied pair</p>' },
        },
      };
      mounted = mountEditor({ pageView: { layout } });
      const header = mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`);
      const footer = mounted.element.querySelector(`.${PAGE_FOOTER_CLASS}`);
      expect(header?.innerHTML).toBe('<p>Première</p>');
      // Sans pagination connue, une seule section : la feuille est la page 1, première.
      expect(footer?.innerHTML).toBe('<p>Pied première</p>');
      const content = mounted.editor.contentElement;
      setHostLastPage(content, { pageNumber: 2, firstOfSection: false });
      expect(footer?.innerHTML).toBe('<p>Pied pair</p>');
      setHostLastPage(content, { pageNumber: 3, firstOfSection: false });
      expect(footer?.innerHTML).toBe('<p>Pied</p>');
      setHostLastPage(content, null);
      expect(footer?.innerHTML).toBe('<p>Pied première</p>');
      // `titlePage` sans `first` : repli sur `default` (écart assumé avec Word, qui laisse vide).
      impl(mounted.editor).setPageView({
        layout: { titlePage: true, headers: { default: { html: '<p>Tête</p>' } } },
      });
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête</p>');
      // Sans `titlePage`, `first` est ignoré.
      impl(mounted.editor).setPageView({ layout: { ...layout, titlePage: false } });
      expect(mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`)?.innerHTML).toBe('<p>Tête</p>');
    });

    it('L52 : headerFooterHtmlFor choisit first / even / default et assainit', () => {
      const section: SectionLayout = {
        titlePage: true,
        headers: {
          default: { html: '<p>D<script>x()</script></p>' },
          first: { html: '<p>F</p>' },
          even: { html: '<p>E</p>' },
        },
      };
      expect(headerFooterHtmlFor(section, 'headers', FIRST_PAGE)).toBe('<p>F</p>');
      expect(
        headerFooterHtmlFor(section, 'headers', { pageNumber: 2, firstOfSection: false }),
      ).toBe('<p>E</p>');
      expect(
        headerFooterHtmlFor(section, 'headers', { pageNumber: 3, firstOfSection: false }),
      ).toBe('<p>D</p>');
      // Page paire **et** première de sa section : `first` l'emporte.
      expect(headerFooterHtmlFor(section, 'headers', { pageNumber: 2, firstOfSection: true })).toBe(
        '<p>F</p>',
      );
      expect(headerFooterHtmlFor(section, 'footers', FIRST_PAGE)).toBe('');
      expect(headerFooterHtmlFor({}, 'headers', FIRST_PAGE)).toBe('');
      // `titlePage` sans `first` : `default` (repli), jamais `even`, même si la première page
      // de la section est paire (R52-05) ; `even` sur les autres pages paires.
      const noFirst: SectionLayout = {
        titlePage: true,
        headers: { default: { html: '<p>D</p>' }, even: { html: '<p>E</p>' } },
      };
      expect(headerFooterHtmlFor(noFirst, 'headers', FIRST_PAGE)).toBe('<p>D</p>');
      expect(headerFooterHtmlFor(noFirst, 'headers', { pageNumber: 2, firstOfSection: true })).toBe(
        '<p>D</p>',
      );
      expect(
        headerFooterHtmlFor(noFirst, 'headers', { pageNumber: 2, firstOfSection: false }),
      ).toBe('<p>E</p>');
      // Sans `default` non plus : rien (Word laisse la page vide), pas `even`.
      const evenOnly: SectionLayout = { titlePage: true, headers: { even: { html: '<p>E</p>' } } };
      expect(
        headerFooterHtmlFor(evenOnly, 'headers', { pageNumber: 2, firstOfSection: true }),
      ).toBe('');
      expect(isContinuousSection({ sections: [{}, { start: 'continuous' }] }, 2)).toBe(true);
      expect(isContinuousSection({ sections: [{}, { start: 'nextPage' }] }, 2)).toBe(false);
      expect(isContinuousSection({}, 1)).toBe(false);
    });

    it('L52 (retour n° 2) : defaultParagraph et defaultFont posent les variables de défauts, retirées avec la vue', () => {
      const layout: DocumentLayout = {
        defaultFont: { family: 'Times New Roman', sizePt: 11 },
        defaultParagraph: { lineHeight: 1.15, spacingAfterPt: 8 },
      };
      mounted = mountEditor({ pageView: { layout } });
      const host = mounted.element;
      expect(host.style.getPropertyValue('--aster-page-font-family')).toBe('"Times New Roman"');
      expect(host.style.getPropertyValue('--aster-page-font-size')).toBe('11pt');
      expect(host.style.getPropertyValue('--aster-page-default-line-height')).toBe('1.15');
      expect(host.style.getPropertyValue('--aster-page-default-spacing-before')).toBe('');
      expect(host.style.getPropertyValue('--aster-page-default-spacing-after')).toBe('8pt');
      expect(host.classList.contains(PAGE_DEFAULTS_CLASS)).toBe(true);
      // Les huit variables de page restent celles d'avant, dans l'ordre.
      expect(cssVariables(host)).toHaveLength(8);
      // `lineHeightPt` l'emporte ; sans espacement, pas de classe ; valeurs absurdes ignorées.
      impl(mounted.editor).setPageView({
        layout: {
          defaultFont: { family: '', sizePt: -2 },
          defaultParagraph: { lineHeight: 1.5, lineHeightPt: 14, spacingBeforePt: Number.NaN },
        },
      });
      expect(host.style.getPropertyValue('--aster-page-font-family')).toBe('');
      expect(host.style.getPropertyValue('--aster-page-font-size')).toBe('');
      expect(host.style.getPropertyValue('--aster-page-default-line-height')).toBe('14pt');
      expect(host.style.getPropertyValue('--aster-page-default-spacing-after')).toBe('');
      expect(host.classList.contains(PAGE_DEFAULTS_CLASS)).toBe(false);
      // Nom de police hostile : guillemets, parenthèses et point-virgule retirés.
      expect(
        pageDefaultsCssValues({ defaultFont: { family: 'Arial"; color: red; url(x)' } }),
      ).toEqual({ '--aster-page-font-family': '"Arial color: red urlx"' });
      expect(pageDefaultsCssValues(undefined)).toEqual({});
      expect(
        pageDefaultsCssValues({ defaultParagraph: { spacingBeforePt: 0, spacingAfterPt: 6.004 } }),
      ).toEqual({
        '--aster-page-default-spacing-before': '0pt',
        '--aster-page-default-spacing-after': '6pt',
      });
      // R52-06 : la borne est testée sur la valeur arrondie. `0.004` arrondit à `0` : un
      // interligne, un interligne exact ou un corps nul sont rejetés ; un espacement nul
      // reste permis ; `0.005` arrondit à `0.01`, accepté.
      expect(pageDefaultsCssValues({ defaultParagraph: { lineHeight: 0.004 } })).toEqual({});
      expect(pageDefaultsCssValues({ defaultParagraph: { lineHeightPt: 0.001 } })).toEqual({});
      expect(pageDefaultsCssValues({ defaultFont: { sizePt: 0.004 } })).toEqual({});
      expect(
        pageDefaultsCssValues({ defaultParagraph: { lineHeightPt: 0.001, lineHeight: 1.5 } }),
      ).toEqual({ '--aster-page-default-line-height': '1.5' });
      expect(pageDefaultsCssValues({ defaultParagraph: { spacingBeforePt: 0.004 } })).toEqual({
        '--aster-page-default-spacing-before': '0pt',
      });
      expect(pageDefaultsCssValues({ defaultFont: { sizePt: 0.005 } })).toEqual({
        '--aster-page-font-size': '0.01pt',
      });
      // Retrait : plus de variable, plus de classe, `style` nettoyé.
      impl(mounted.editor).setPageView(false);
      for (const name of PAGE_DEFAULT_CSS_VARIABLES) {
        expect(host.style.getPropertyValue(name)).toBe('');
      }
      expect(host.classList.contains(PAGE_DEFAULTS_CLASS)).toBe(false);
      expect(host.getAttribute('style')).toBeNull();
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

  describe('sections hostiles (R41-05)', () => {
    const TWO_SECTIONS: DocumentLayout = {
      sections: [{ page: { size: 'A5' } }, { page: { size: 'A3' } }],
    };

    it('resolveSectionLayout et maxSectionWidthMm ignorent un sections qui n’est pas un tableau', () => {
      const text: DocumentLayout = { page: { size: 'A5' }, sections: 'abc' as never };
      expect(resolveSectionLayout(text, 1)).toEqual({ page: { size: 'A5' } });
      expect(maxSectionWidthMm(text)).toBeNull();
      const arrayLike: DocumentLayout = { sections: { length: 2, 0: {} } as never };
      expect(resolveSectionLayout(arrayLike, 1)).toEqual({});
      expect(maxSectionWidthMm(arrayLike)).toBeNull();
      // Une entrée qui n'est pas un objet vaut une entrée absente : repli premier niveau.
      const entries: DocumentLayout = { page: { size: 'Legal' }, sections: ['x', null] as never };
      expect(resolveSectionLayout(entries, 1)).toEqual({ page: { size: 'Legal' } });
      expect(resolveSectionLayout(entries, 2)).toEqual({ page: { size: 'Legal' } });
      expect(maxSectionWidthMm(entries)).toBe(215.9);
      expect(maxSectionWidthMm(TWO_SECTIONS)).toBe(297);
    });

    it('R44-05 : bodySectionCount compte les sauts de premier niveau du corps, borné par les sections', () => {
      const three: DocumentLayout = { sections: [{}, {}, {}] };
      const content = document.createElement('div');
      expect(bodySectionCount(three, content)).toBe(1);
      expect(bodySectionCount(three, null)).toBe(1);
      content.innerHTML = '<p>a</p><hr data-section-break="1"><p>b</p>';
      expect(bodySectionCount(three, content)).toBe(2);
      // Un saut imbriqué ne compte pas ; au-delà des sections déclarées, borné.
      content.innerHTML =
        '<p>a</p><hr data-section-break="1"><blockquote><hr data-section-break="9"></blockquote><p>b</p><hr data-section-break="2"><p>c</p><hr data-section-break="3"><p>d</p>';
      expect(bodySectionCount(three, content)).toBe(3);
      expect(bodySectionCount({ page: { size: 'A5' } }, content)).toBe(1);
      expect(bodySectionCount({ sections: 'x' as never }, content)).toBe(1);
      // La largeur maximale suit la même borne.
      const widths: DocumentLayout = {
        sections: [{ page: { size: 'A5' } }, { page: { size: 'A3' } }, { page: { size: 'A4' } }],
      };
      expect(maxSectionWidthMm(widths, 1)).toBe(148);
      expect(maxSectionWidthMm(widths, 2)).toBe(297);
      expect(maxSectionWidthMm(widths, 9)).toBe(297);
      expect(maxSectionWidthMm(widths, 0)).toBe(148);
      expect(maxSectionWidthMm(widths)).toBe(297);
    });

    it('setPageView avec un sections texte ne lève pas et remplace la vue sans sections', () => {
      mounted = mountEditor({ content: '<p>a</p><hr data-section-break="1"><p>b</p>' });
      const editor = impl(mounted.editor);
      editor.setPageView({ layout: TWO_SECTIONS });
      expect(cssVariables(mounted.element)[0]).toBe('148mm');
      expect(mounted.element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE)).toBe('297mm');
      const text: DocumentLayout = { sections: 'abc' as never };
      expect(() => editor.setPageView({ layout: text })).not.toThrow();
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
      expect(cssVariables(mounted.element)[0]).toBe('210mm');
      expect(mounted.element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE)).toBe('');
      expect(editor.getLayout()).toBe(text);
      expect(editor.getSectionLayout(1)).toEqual({});
      expect(mounted.element.querySelector('hr')?.getAttribute('style')).toBeNull();
    });

    it('une mise en page qui lève laisse la vue page précédente en place et relaie l’erreur', () => {
      mounted = mountEditor({ content: '<p>a</p>' });
      const editor = impl(mounted.editor);
      editor.setPageView({ layout: TWO_SECTIONS });
      const hostile: DocumentLayout = {
        get sections(): readonly never[] {
          throw new Error('sections hostiles');
        },
      };
      expect(() => editor.setPageView({ layout: hostile })).toThrow('sections hostiles');
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
      expect(cssVariables(mounted.element)[0]).toBe('148mm');
      // Corps sans saut : seule la section 1 (A5) compte pour la largeur maximale (R44-05).
      expect(mounted.element.style.getPropertyValue(PAGE_WIDTH_MAX_CSS_VARIABLE)).toBe('148mm');
      expect(mounted.element.querySelectorAll(`.${PAGE_HEADER_CLASS}`)).toHaveLength(1);
      expect(mounted.element.querySelectorAll(`.${PAGE_FOOTER_CLASS}`)).toHaveLength(1);
      expect(editor.getLayout()).toBe(TWO_SECTIONS);
      // Sans vue page avant l'appel, l'erreur remonte et rien n'est posé.
      editor.setPageView(false);
      expect(() => editor.setPageView({ layout: hostile })).toThrow('sections hostiles');
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(false);
      expect(mounted.element.getAttribute('style')).toBeNull();
      expect(editor.getLayout()).toBeNull();
    });
  });
});
