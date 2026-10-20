import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PARAGRAPH_LAYOUT_ATTR_NAMES, type ParagraphLayoutAttrs } from '../api';
import {
  normalizeParagraphLayoutValue,
  parseLineHeight,
  parseParagraphLayout,
  renderParagraphLayout,
} from './paragraph-layout';
import {
  bodyHtml,
  findNodePos,
  mountEditor,
  selectFirstBlock,
  type MountedEditor,
} from '../testing/mount';

/** Attributs du premier bloc du document. */
function firstBlockAttrs(mounted: MountedEditor): Record<string, unknown> {
  return mounted.editor.tiptap.state.doc.firstChild?.attrs ?? {};
}

/** Attributs de mise en page du premier bloc, sans les autres (`textAlign`, `level`…). */
function firstLayoutAttrs(mounted: MountedEditor): Record<string, unknown> {
  const attrs = firstBlockAttrs(mounted);
  const layout: Record<string, unknown> = {};
  for (const name of PARAGRAPH_LAYOUT_ATTR_NAMES) {
    if (attrs[name] !== null) {
      layout[name] = attrs[name];
    }
  }
  return layout;
}

/** `setHTML(getHTML())` doit redonner exactement le même HTML. */
function expectIdempotent(mounted: MountedEditor): string {
  const html = mounted.editor.getHTML();
  mounted.editor.setHTML(html);
  expect(mounted.editor.getHTML()).toBe(html);
  return html;
}

/** Chaque attribut seul : HTML d'entrée canonique et attributs attendus. */
const SINGLE_ATTRIBUTE_CASES: readonly [string, string, ParagraphLayoutAttrs][] = [
  ['lineHeight', '<p style="line-height: 1.15">x</p>', { lineHeight: 1.15 }],
  ['lineHeightPt', '<p style="line-height: 14pt">x</p>', { lineHeightPt: 14 }],
  ['spacingBeforePt', '<p style="margin-top: 6pt">x</p>', { spacingBeforePt: 6 }],
  ['spacingAfterPt', '<p style="margin-bottom: 6pt">x</p>', { spacingAfterPt: 6 }],
  ['indentLeftPt', '<p style="margin-left: 36pt">x</p>', { indentLeftPt: 36 }],
  ['indentRightPt', '<p style="margin-right: 0pt">x</p>', { indentRightPt: 0 }],
  ['indentFirstLinePt', '<p style="text-indent: -18pt">x</p>', { indentFirstLinePt: -18 }],
  [
    'borders',
    '<p style="border-bottom: 1pt solid #000000">x</p>',
    { borders: [{ side: 'bottom', style: 'solid', widthPt: 1, color: '#000000' }] },
  ],
  [
    'borders between',
    '<p data-border-between="0.5pt dotted #ff0000">x</p>',
    { borders: [{ side: 'between', style: 'dotted', widthPt: 0.5, color: '#ff0000' }] },
  ],
  ['shading', '<p style="background-color: #eeeeee">x</p>', { shading: '#eeeeee' }],
  ['keepWithNext', '<p data-keep-next="">x</p>', { keepWithNext: true }],
  ['pageBreakBefore', '<p data-page-break-before="">x</p>', { pageBreakBefore: true }],
  ['docxStyle', '<p data-docx-style="Normal">x</p>', { docxStyle: 'Normal' }],
];

const FULL_PARAGRAPH =
  '<p style="line-height: 1.15; margin-top: 6pt; margin-bottom: 6pt; margin-left: 36pt; ' +
  'margin-right: 0pt; text-indent: 18pt; border-bottom: 1pt solid #000000; ' +
  'background-color: #eeeeee" data-docx-style="Normal" data-keep-next="" data-page-break-before="">x</p>';

describe('ParagraphLayout', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>x</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('helpers purs', () => {
    it('parseLineHeight distingue multiple, pourcentage et points', () => {
      expect(parseLineHeight('1.15')).toEqual({ lineHeight: 1.15, lineHeightPt: null });
      expect(parseLineHeight('150%')).toEqual({ lineHeight: 1.5, lineHeightPt: null });
      expect(parseLineHeight('14pt')).toEqual({ lineHeight: null, lineHeightPt: 14 });
      expect(parseLineHeight('16px')).toEqual({ lineHeight: null, lineHeightPt: 12 });
      expect(parseLineHeight('normal')).toEqual({ lineHeight: null, lineHeightPt: null });
      expect(parseLineHeight(null)).toEqual({ lineHeight: null, lineHeightPt: null });
    });

    it('parseParagraphLayout lit tout, renderParagraphLayout réécrit tout', () => {
      const element = document.createElement('p');
      element.setAttribute(
        'style',
        'text-align: center; line-height: 14pt; margin-top: 6pt; border: 1pt solid #000; background-color: rgb(238,238,238)',
      );
      element.setAttribute('data-keep-next', '');
      element.setAttribute('data-docx-style', 'Heading1');
      element.setAttribute('data-border-between', '1pt dashed #0000ff');
      const attrs = parseParagraphLayout(element);
      expect(attrs.lineHeightPt).toBe(14);
      expect(attrs.lineHeight).toBeNull();
      expect(attrs.spacingBeforePt).toBe(6);
      expect(attrs.borders?.map((border) => border.side)).toEqual([
        'top',
        'right',
        'bottom',
        'left',
        'between',
      ]);
      expect(attrs.shading).toBe('#eeeeee');
      expect(attrs.keepWithNext).toBe(true);
      expect(attrs.pageBreakBefore).toBeNull();
      expect(attrs.docxStyle).toBe('Heading1');
      expect(renderParagraphLayout(attrs)).toEqual({
        style:
          'line-height: 14pt; margin-top: 6pt; border-top: 1pt solid #000000; ' +
          'border-right: 1pt solid #000000; border-bottom: 1pt solid #000000; ' +
          'border-left: 1pt solid #000000; background-color: #eeeeee',
        'data-border-between': '1pt dashed #0000ff',
        'data-docx-style': 'Heading1',
        'data-keep-next': '',
      });
      expect(renderParagraphLayout({})).toEqual({});
    });

    it('lineHeightPt l’emporte sur lineHeight au rendu', () => {
      expect(renderParagraphLayout({ lineHeight: 1.5, lineHeightPt: 12 })).toEqual({
        style: 'line-height: 12pt',
      });
      expect(renderParagraphLayout({ lineHeight: 1.5 })).toEqual({ style: 'line-height: 1.5' });
    });

    it('normalizeParagraphLayoutValue normalise chaque famille d’attribut', () => {
      expect(normalizeParagraphLayoutValue('spacingBeforePt', 6.789)).toBe(6.79);
      expect(normalizeParagraphLayoutValue('shading', '#ABC')).toBe('#aabbcc');
      expect(normalizeParagraphLayoutValue('keepWithNext', true)).toBe(true);
      expect(normalizeParagraphLayoutValue('borders', null)).toBeNull();
      expect(normalizeParagraphLayoutValue('borders', undefined)).toBeUndefined();
    });

    it('R23-06 : null, false, vide effacent ; une valeur invalide est ignorée (undefined)', () => {
      // Effacement explicite.
      expect(normalizeParagraphLayoutValue('spacingBeforePt', null)).toBeNull();
      expect(normalizeParagraphLayoutValue('docxStyle', '')).toBeNull();
      expect(normalizeParagraphLayoutValue('shading', '')).toBeNull();
      expect(normalizeParagraphLayoutValue('keepWithNext', false)).toBeNull();
      expect(normalizeParagraphLayoutValue('borders', [])).toBeNull();
      // Invalide : à ignorer, jamais à effacer.
      expect(normalizeParagraphLayoutValue('spacingBeforePt', '6')).toBeUndefined();
      expect(normalizeParagraphLayoutValue('lineHeight', 'abc')).toBeUndefined();
      expect(normalizeParagraphLayoutValue('lineHeight', Number.NaN)).toBeUndefined();
      expect(normalizeParagraphLayoutValue('lineHeight', 1e307)).toBeUndefined();
      expect(normalizeParagraphLayoutValue('shading', 'pas-une-couleur')).toBeUndefined();
      expect(normalizeParagraphLayoutValue('shading', 12)).toBeUndefined();
      expect(normalizeParagraphLayoutValue('docxStyle', 5)).toBeUndefined();
      expect(normalizeParagraphLayoutValue('keepWithNext', 1)).toBeUndefined();
      expect(normalizeParagraphLayoutValue('borders', [{}])).toBeUndefined();
      expect(normalizeParagraphLayoutValue('borders', 'x')).toBeUndefined();
    });

    it('R23-05 : parseLineHeight refuse un multiple hors bornes', () => {
      expect(parseLineHeight('99999999999')).toEqual({ lineHeight: null, lineHeightPt: null });
      expect(parseLineHeight('99999999999%')).toEqual({ lineHeight: null, lineHeightPt: null });
      expect(parseLineHeight('100000000pt')).toEqual({ lineHeight: null, lineHeightPt: null });
    });
  });

  describe('parse et rendu', () => {
    it.each(SINGLE_ATTRIBUTE_CASES)(
      '%s seul : parse, rendu exact, idempotence',
      (_name, html, expected) => {
        mounted.editor.setHTML(html);
        expect(firstLayoutAttrs(mounted)).toEqual(expected);
        expect(mounted.editor.getHTML()).toBe(html);
        expectIdempotent(mounted);
      },
    );

    it('cumul de tous les attributs : rendu exact dans l’ordre du contrat, idempotent', () => {
      mounted.editor.setHTML(FULL_PARAGRAPH);
      expect(mounted.editor.getHTML()).toBe(FULL_PARAGRAPH);
      expectIdempotent(mounted);
      expect(firstLayoutAttrs(mounted)).toEqual({
        lineHeight: 1.15,
        spacingBeforePt: 6,
        spacingAfterPt: 6,
        indentLeftPt: 36,
        indentRightPt: 0,
        indentFirstLinePt: 18,
        borders: [{ side: 'bottom', style: 'solid', widthPt: 1, color: '#000000' }],
        shading: '#eeeeee',
        keepWithNext: true,
        pageBreakBefore: true,
        docxStyle: 'Normal',
      });
    });

    it('text-align vient en premier, puis la mise en page ; aussi sur un <h2>', () => {
      const html =
        '<h2 style="text-align: center; margin-top: 12pt; margin-bottom: 3pt" data-docx-style="Heading2" data-keep-next="">T</h2>';
      mounted.editor.setHTML(html);
      expect(bodyHtml(mounted.editor)).toBe(html);
      expect(firstBlockAttrs(mounted)).toMatchObject({
        level: 2,
        textAlign: 'center',
        spacingBeforePt: 12,
        spacingAfterPt: 3,
        docxStyle: 'Heading2',
        keepWithNext: true,
      });
      expectIdempotent(mounted);
      // L'ordre est stable quel que soit l'ordre d'entrée.
      mounted.editor.setHTML('<p style="margin-top: 6pt; text-align: right">x</p>');
      expect(mounted.editor.getHTML()).toBe('<p style="text-align: right; margin-top: 6pt">x</p>');
    });

    it('relit les variantes : px, raccourci border, rgb(), data-keep-next nu, %', () => {
      mounted.editor.setHTML(
        '<p style="line-height: 150%; margin-top: 8px; border: 1px solid rgb(255, 0, 0); background-color: #ABC" data-keep-next data-page-break-before>x</p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p style="line-height: 1.5; margin-top: 6pt; border-top: 0.75pt solid #ff0000; ' +
          'border-right: 0.75pt solid #ff0000; border-bottom: 0.75pt solid #ff0000; ' +
          'border-left: 0.75pt solid #ff0000; background-color: #aabbcc" data-keep-next="" data-page-break-before="">x</p>',
      );
      expectIdempotent(mounted);
    });

    it('un paragraphe sans mise en page ne porte ni style ni data-*', () => {
      mounted.editor.setHTML('<p>x</p><h1>T</h1>');
      expect(bodyHtml(mounted.editor)).toBe('<p>x</p><h1>T</h1>');
      for (const name of PARAGRAPH_LAYOUT_ATTR_NAMES) {
        expect(firstBlockAttrs(mounted)[name]).toBeNull();
      }
    });

    it('un style inconnu est ignoré sans casser le reste', () => {
      mounted.editor.setHTML('<p style="letter-spacing: 1pt; margin-top: 6pt; color: red">x</p>');
      expect(mounted.editor.getHTML()).toBe('<p style="margin-top: 6pt">x</p>');
    });

    it('getText et getHTML({ variables: resolve }) ne changent pas', () => {
      mounted.editor.setHTML(
        '<p style="margin-top: 6pt">Bonjour <span data-aster-variable="nom">{{nom}}</span></p>',
      );
      mounted.editor.variables.setValues({ nom: 'Joris' });
      expect(mounted.editor.getText()).toBe('Bonjour Joris');
      expect(mounted.editor.getHTML({ variables: 'resolve' })).toBe(
        '<p style="margin-top: 6pt">Bonjour Joris</p>',
      );
    });

    it('survit à un aller-retour JSON', () => {
      mounted.editor.setHTML(FULL_PARAGRAPH);
      const json = mounted.editor.getJSON();
      mounted.editor.setHTML('<p>autre</p>');
      mounted.editor.setJSON(json);
      expect(mounted.editor.getHTML()).toBe(FULL_PARAGRAPH);
    });
  });

  describe('commande paragraph.setLayout', () => {
    it('fusionne les attributs, null efface, le reste est conservé', () => {
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.canRun('paragraph.setLayout', { spacingBeforePt: 6 })).toBe(
        true,
      );
      expect(mounted.editor.commands.run('paragraph.setLayout', { spacingBeforePt: 6 })).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p style="margin-top: 6pt">x</p>');
      expect(
        mounted.editor.commands.run('paragraph.setLayout', {
          spacingAfterPt: 4.5,
          shading: '#ABCDEF',
          keepWithNext: true,
        }),
      ).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p style="margin-top: 6pt; margin-bottom: 4.5pt; background-color: #abcdef" data-keep-next="">x</p>',
      );
      expect(mounted.editor.commands.run('paragraph.setLayout', { spacingBeforePt: null })).toBe(
        true,
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p style="margin-bottom: 4.5pt; background-color: #abcdef" data-keep-next="">x</p>',
      );
      expectIdempotent(mounted);
    });

    it('s’applique à chaque paragraphe et titre de la sélection, cellules comprises', () => {
      mounted.editor.setHTML(
        '<h2>T</h2><p>a</p><table><tbody><tr><td><p>b</p></td></tr></tbody></table><p>c</p>',
      );
      mounted.editor.commands.run('selectAll');
      expect(mounted.editor.commands.run('paragraph.setLayout', { indentLeftPt: 12 })).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe(
        '<h2 style="margin-left: 12pt">T</h2><p style="margin-left: 12pt">a</p>' +
          '<table><tbody><tr><td><p style="margin-left: 12pt">b</p></td></tr></tbody></table>' +
          '<p style="margin-left: 12pt">c</p>',
      );
    });

    it('un curseur suffit : le paragraphe courant est visé', () => {
      mounted.editor.setHTML('<p>un</p><p>deux</p>');
      mounted.editor.tiptap.commands.setTextSelection(7);
      expect(mounted.editor.commands.run('paragraph.setLayout', { lineHeight: 2 })).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>un</p><p style="line-height: 2">deux</p>');
    });

    it('rend false sans attribut utile, avec une valeur invalide ou sans bloc texte', () => {
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run('paragraph.setLayout', {})).toBe(false);
      expect(
        mounted.editor.commands.run('paragraph.setLayout', { nope: 1 } as ParagraphLayoutAttrs),
      ).toBe(false);
      // Même valeur qu'avant : rien ne change, false.
      mounted.editor.commands.run('paragraph.setLayout', { spacingBeforePt: 6 });
      expect(mounted.editor.commands.run('paragraph.setLayout', { spacingBeforePt: 6 })).toBe(
        false,
      );
      mounted.editor.setHTML('<img src="https://example.com/a.png">');
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'image'));
      expect(mounted.editor.commands.canRun('paragraph.setLayout', { spacingBeforePt: 6 })).toBe(
        false,
      );
      expect(mounted.editor.commands.run('paragraph.setLayout', { spacingBeforePt: 6 })).toBe(
        false,
      );
    });

    it('est une étape d’historique annulable', () => {
      selectFirstBlock(mounted.editor);
      mounted.editor.commands.run('paragraph.setLayout', { spacingBeforePt: 6 });
      expect(mounted.editor.commands.run('undo')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>x</p>');
    });

    it('R23-06 : une valeur invalide est ignorée et ne vide pas l’attribut existant', () => {
      const html = '<p style="margin-top: 6pt; line-height: 1.5">x</p>';
      mounted.editor.setHTML(html);
      selectFirstBlock(mounted.editor);
      const expected = '<p style="line-height: 1.5; margin-top: 6pt">x</p>';
      expect(mounted.editor.getHTML()).toBe(expected);
      for (const args of [
        { lineHeight: 'abc' },
        { lineHeight: Number.NaN },
        { lineHeight: 1e307 },
        { shading: 'pas-une-couleur' },
        { borders: [{}] },
        { spacingBeforePt: '12' },
      ] as unknown as ParagraphLayoutAttrs[]) {
        expect(
          mounted.editor.commands.canRun('paragraph.setLayout', args),
          JSON.stringify(args),
        ).toBe(false);
        expect(mounted.editor.commands.run('paragraph.setLayout', args), JSON.stringify(args)).toBe(
          false,
        );
        expect(mounted.editor.getHTML()).toBe(expected);
      }
      // Un argument invalide à côté d'un valide : le valide s'applique, l'invalide est ignoré.
      expect(
        mounted.editor.commands.run('paragraph.setLayout', {
          lineHeight: 'abc',
          spacingAfterPt: 3,
        } as unknown as ParagraphLayoutAttrs),
      ).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p style="line-height: 1.5; margin-top: 6pt; margin-bottom: 3pt">x</p>',
      );
      // `null` seul efface, comme avant ; `{}` reste sondable par la toolbar.
      expect(mounted.editor.commands.canRun('paragraph.setLayout', {})).toBe(true);
      expect(mounted.editor.commands.run('paragraph.setLayout', { lineHeight: null })).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p style="margin-top: 6pt; margin-bottom: 3pt">x</p>');
    });

    it('R23-05 : un nombre hors bornes est refusé, jamais sérialisé en Infinity', () => {
      selectFirstBlock(mounted.editor);
      expect(mounted.editor.commands.run('paragraph.setLayout', { spacingBeforePt: 1e307 })).toBe(
        false,
      );
      expect(mounted.editor.getHTML()).toBe('<p>x</p>');
      // Posé en force par `setJSON` : rien d'émis plutôt qu'`Infinitypt`.
      mounted.editor.setJSON({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { spacingBeforePt: 1e307, lineHeight: Number.POSITIVE_INFINITY },
            content: [{ type: 'text', text: 'x' }],
          },
        ],
      });
      expect(mounted.editor.getHTML()).toBe('<p>x</p>');
      expect(mounted.editor.getHTML()).not.toContain('Infinity');
    });
  });

  describe('commande paragraph.unsetLayout', () => {
    beforeEach(() => {
      mounted.editor.setHTML(FULL_PARAGRAPH);
      selectFirstBlock(mounted.editor);
    });

    it('efface les attributs nommés seulement', () => {
      expect(
        mounted.editor.commands.run('paragraph.unsetLayout', {
          attrs: ['borders', 'shading', 'keepWithNext', 'pageBreakBefore', 'docxStyle'],
        }),
      ).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p style="line-height: 1.15; margin-top: 6pt; margin-bottom: 6pt; margin-left: 36pt; margin-right: 0pt; text-indent: 18pt">x</p>',
      );
    });

    it('efface tout sans argument, et rend false s’il n’y a plus rien à effacer', () => {
      expect(mounted.editor.commands.canRun('paragraph.unsetLayout', undefined)).toBe(true);
      expect(mounted.editor.commands.run('paragraph.unsetLayout', undefined)).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>x</p>');
      expect(mounted.editor.commands.run('paragraph.unsetLayout', undefined)).toBe(false);
      expect(mounted.editor.commands.run('paragraph.unsetLayout', { attrs: [] })).toBe(false);
    });

    it('ignore les noms inconnus et garde text-align', () => {
      mounted.editor.commands.run('alignCenter');
      expect(
        mounted.editor.commands.run('paragraph.unsetLayout', {
          attrs: ['textAlign', 'level'] as unknown as readonly 'lineHeight'[],
        }),
      ).toBe(false);
      expect(mounted.editor.commands.run('paragraph.unsetLayout', undefined)).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p style="text-align: center">x</p>');
    });
  });
});
