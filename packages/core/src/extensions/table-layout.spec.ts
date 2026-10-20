import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_COLSPAN,
  MAX_ROWSPAN,
  TABLE_ALIGN_ATTRIBUTE,
  cellLayoutDeclarations,
  isCellPadding,
  isCellVerticalAlign,
  isTableAlign,
  parseCellPadding,
  parseSpan,
  parseTableAlign,
  parseTableWidth,
  tableAlignFallbackStyle,
  tableLayoutDeclarations,
} from './table-layout';
import { bodyHtml, findNodePos, mountEditor, type MountedEditor } from '../testing/mount';

/** `setHTML(getHTML())` doit redonner exactement le même HTML (sans le paragraphe final). */
function expectIdempotent(mounted: MountedEditor): string {
  const html = bodyHtml(mounted.editor);
  mounted.editor.setHTML(html);
  expect(bodyHtml(mounted.editor)).toBe(html);
  return html;
}

/** Attributs du premier nœud du type donné (le parcours s'arrête au premier trouvé). */
function attrsOf(mounted: MountedEditor, typeName: string): Record<string, unknown> {
  let found: Record<string, unknown> | null = null;
  mounted.editor.tiptap.state.doc.descendants((node) => {
    if (found) {
      return false;
    }
    if (node.type.name === typeName) {
      found = node.attrs;
      return false;
    }
    return true;
  });
  return found ?? {};
}

const BORDER = { side: 'top', style: 'solid', widthPt: 1, color: '#000000' } as const;

describe('TableLayout', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor();
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('helpers purs', () => {
    it('parseTableWidth accepte % et pt, ignore px et auto', () => {
      expect(parseTableWidth('100%')).toBe('100%');
      expect(parseTableWidth(' 450pt ')).toBe('450pt');
      expect(parseTableWidth('450.555pt')).toBe('450.56pt');
      expect(parseTableWidth('600px')).toBeNull();
      expect(parseTableWidth('auto')).toBeNull();
      expect(parseTableWidth('0%')).toBeNull();
      expect(parseTableWidth(null)).toBeNull();
    });

    it('parseCellPadding applique les règles d’expansion CSS', () => {
      expect(parseCellPadding('2pt')).toEqual([2, 2, 2, 2]);
      expect(parseCellPadding('2pt 4pt')).toEqual([2, 4, 2, 4]);
      expect(parseCellPadding('1pt 2pt 3pt')).toEqual([1, 2, 3, 2]);
      expect(parseCellPadding('1pt 2pt 3pt 4pt')).toEqual([1, 2, 3, 4]);
      expect(parseCellPadding('4px 0')).toEqual([3, 0, 3, 0]);
      expect(parseCellPadding('1em')).toBeNull();
      expect(parseCellPadding('1pt 2pt 3pt 4pt 5pt')).toBeNull();
      expect(parseCellPadding('')).toBeNull();
      expect(isCellPadding([1, 2, 3, 4])).toBe(true);
      expect(isCellPadding([1, 2, 3])).toBe(false);
      expect(isCellVerticalAlign('middle')).toBe(true);
      expect(isCellVerticalAlign('baseline')).toBe(false);
    });

    it('déclarations de table et de cellule dans l’ordre du contrat', () => {
      expect(tableLayoutDeclarations({ width: '100%', borders: [BORDER] })).toEqual([
        'width: 100%',
        'border-top: 1pt solid #000000',
      ]);
      expect(tableLayoutDeclarations({})).toEqual([]);
      expect(
        cellLayoutDeclarations({
          borders: [BORDER],
          shading: '#EEE',
          verticalAlign: 'middle',
          paddingPt: [2, 4, 2, 4],
        }),
      ).toEqual([
        'border-top: 1pt solid #000000',
        'background-color: #eeeeee',
        'vertical-align: middle',
        'padding: 2pt 4pt 2pt 4pt',
      ]);
      expect(cellLayoutDeclarations({ verticalAlign: 'nope', paddingPt: [1] })).toEqual([]);
      // R23-05 : un padding hors bornes n'est pas émis.
      expect(cellLayoutDeclarations({ paddingPt: [1e307, 0, 0, 0] })).toEqual([]);
    });

    it('parseSpan borne colspan à 63 et rowspan à 1000, 1 pour tout ce qui n’est pas un entier', () => {
      expect(MAX_COLSPAN).toBe(63);
      expect(MAX_ROWSPAN).toBe(1000);
      expect(parseSpan('2', MAX_COLSPAN)).toBe(2);
      expect(parseSpan('63', MAX_COLSPAN)).toBe(63);
      expect(parseSpan('64', MAX_COLSPAN)).toBe(63);
      expect(parseSpan('1000000', MAX_COLSPAN)).toBe(63);
      expect(parseSpan('5000', MAX_ROWSPAN)).toBe(1000);
      expect(parseSpan('0', MAX_COLSPAN)).toBe(1);
      expect(parseSpan('-3', MAX_COLSPAN)).toBe(1);
      expect(parseSpan('abc', MAX_COLSPAN)).toBe(1);
      expect(parseSpan('', MAX_COLSPAN)).toBe(1);
      expect(parseSpan(null, MAX_COLSPAN)).toBe(1);
      expect(parseSpan('2.9', MAX_COLSPAN)).toBe(2);
    });
  });

  describe('table', () => {
    it.each([
      ['width %', '<table style="width: 100%"><tbody><tr><td><p>a</p></td></tr></tbody></table>'],
      ['width pt', '<table style="width: 450pt"><tbody><tr><td><p>a</p></td></tr></tbody></table>'],
      [
        'borders',
        '<table style="border-top: 1pt solid #000000; border-bottom: 0.5pt dashed #ff0000"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      ],
      [
        'docxStyle',
        '<table data-docx-style="TableGrid"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      ],
      [
        'cumul',
        '<table style="width: 100%; border-top: 1pt solid #000000" data-docx-style="TableGrid"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      ],
    ])('%s : rendu exact et idempotence', (_name, html) => {
      mounted.editor.setHTML(html);
      expect(bodyHtml(mounted.editor)).toBe(html);
      expectIdempotent(mounted);
    });

    it('relit l’attribut width="100%" et le raccourci border', () => {
      mounted.editor.setHTML(
        '<table width="100%" style="border: 1px solid #000"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expect(attrsOf(mounted, 'table')).toMatchObject({ width: '100%' });
      expect(bodyHtml(mounted.editor)).toBe(
        '<table style="width: 100%; border-top: 0.75pt solid #000000; border-right: 0.75pt solid #000000; ' +
          'border-bottom: 0.75pt solid #000000; border-left: 0.75pt solid #000000"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
    });

    it('une table nue reste nue', () => {
      mounted.editor.setHTML('<table><tbody><tr><td><p>a</p></td></tr></tbody></table>');
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expect(attrsOf(mounted, 'table')).toMatchObject({
        width: null,
        borders: null,
        docxStyle: null,
      });
    });

    it('la largeur calculée depuis colwidth reste émise avec des bordures, mais cède à width', () => {
      mounted.editor.setHTML(
        '<table style="border-top: 1pt solid #000000"><tbody><tr><td colwidth="100"><p>a</p></td><td colwidth="100"><p>b</p></td></tr></tbody></table>',
      );
      const sized = bodyHtml(mounted.editor);
      expect(sized).toBe(
        '<table style="width: 200px; border-top: 1pt solid #000000"><tbody><tr><td colwidth="100"><p>a</p></td><td colwidth="100"><p>b</p></td></tr></tbody></table>',
      );
      expectIdempotent(mounted);
      mounted.editor.setHTML(
        '<table style="width: 100%; border-top: 1pt solid #000000"><tbody><tr><td colwidth="100"><p>a</p></td><td colwidth="100"><p>b</p></td></tr></tbody></table>',
      );
      expect(bodyHtml(mounted.editor)).toBe(
        '<table style="width: 100%; border-top: 1pt solid #000000"><tbody><tr><td colwidth="100"><p>a</p></td><td colwidth="100"><p>b</p></td></tr></tbody></table>',
      );
      expectIdempotent(mounted);
      // Colonnes partiellement dimensionnées : min-width retiré par le normaliseur, bordure gardée.
      mounted.editor.setHTML(
        '<table style="border-top: 1pt solid #000000"><tbody><tr><td colwidth="100"><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
      );
      expect(bodyHtml(mounted.editor)).toBe(
        '<table style="border-top: 1pt solid #000000"><tbody><tr><td colwidth="100"><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
      );
    });

    it('le DOM d’édition garde le wrapper, le colgroup et le style de mise en page', () => {
      mounted.editor.setHTML(
        '<table style="width: 100%; border-top: 1pt solid #000000"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      const table = mounted.editor.contentElement.querySelector<HTMLElement>('.tableWrapper table');
      expect(table).not.toBeNull();
      expect(table?.querySelector('colgroup')).not.toBeNull();
      expect(table?.style.borderTop).toContain('solid');
      expect(table?.getAttribute('data-docx-style')).toBeNull();
      // Un changement d'attribut (ici le fond d'une bordure) est reflété sans remonter la vue.
      mounted.editor.commands.run('selectAll');
      const pos = findNodePos(mounted.editor, 'table');
      const node = mounted.editor.tiptap.state.doc.nodeAt(pos);
      mounted.editor.tiptap.view.dispatch(
        mounted.editor.tiptap.state.tr.setNodeMarkup(pos, undefined, {
          ...node?.attrs,
          borders: [{ side: 'bottom', style: 'dashed', widthPt: 2, color: '#ff0000' }],
          docxStyle: 'TableGrid',
        }),
      );
      const updated =
        mounted.editor.contentElement.querySelector<HTMLElement>('.tableWrapper table');
      expect(updated?.style.borderTop).toBe('');
      expect(updated?.style.borderBottom).toContain('dashed');
      expect(updated?.getAttribute('data-docx-style')).toBe('TableGrid');
    });

    it('R23-10 : le DOM d’édition garde la largeur du contrat tant qu’aucune colonne n’est redimensionnée', () => {
      const editedTable = (): HTMLElement | null =>
        mounted.editor.contentElement.querySelector<HTMLElement>('.tableWrapper table');
      mounted.editor.setHTML(
        '<table style="width: 100%; border-top: 1pt solid #000000"><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
      );
      expect(editedTable()?.style.width).toBe('100%');
      expect(editedTable()?.style.borderTop).toContain('solid');
      expect(editedTable()?.style.minWidth).toBe('96px');
      mounted.editor.setHTML(
        '<table style="width: 450pt"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expect(editedTable()?.style.width).toBe('450pt');
      // Dès qu'une colonne porte un `colwidth`, la largeur calculée par Tiptap prime.
      mounted.editor.setHTML(
        '<table style="width: 450pt"><tbody><tr><td colwidth="100"><p>a</p></td></tr></tbody></table>',
      );
      expect(editedTable()?.style.width).toBe('100px');
      // Et le passage de l'un à l'autre par une mise à jour du nœud suit la même règle.
      mounted.editor.commands.run('selectAll');
      const pos = findNodePos(mounted.editor, 'table');
      const node = mounted.editor.tiptap.state.doc.nodeAt(pos);
      mounted.editor.tiptap.view.dispatch(
        mounted.editor.tiptap.state.tr.setNodeMarkup(pos, undefined, {
          ...node?.attrs,
          width: '80%',
        }),
      );
      expect(editedTable()?.style.width).toBe('100px');
      // Sans largeur de contrat, rien ne change par rapport à Tiptap.
      mounted.editor.setHTML('<table><tbody><tr><td><p>a</p></td></tr></tbody></table>');
      expect(editedTable()?.style.width).toBe('');
      expect(editedTable()?.style.minWidth).toBe('48px');
      // `getHTML()` reste celui du contrat dans tous les cas.
      mounted.editor.setHTML(
        '<table style="width: 100%"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expect(bodyHtml(mounted.editor)).toBe(
        '<table style="width: 100%"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
    });

    it('R25-01 (relais) : colspan et rowspan sont bornés à l’analyse, un colspan géant ne tue plus le processus', () => {
      const started = performance.now();
      mounted.editor.setHTML(
        '<table><tbody><tr><td colspan="1000000" rowspan="5000"><p>a</p></td></tr></tbody></table>',
      );
      const elapsed = performance.now() - started;
      expect(elapsed).toBeLessThan(200);
      // `rowspan` est borné à 1 000 à l'analyse (voir `parseSpan`), puis prosemirror-tables
      // le ramène au nombre de lignes de la table (`fixTables`) : une ligne ici.
      expect(attrsOf(mounted, 'tableCell')).toMatchObject({ colspan: 63, rowspan: 1 });
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td colspan="63"><p>a</p></td></tr></tbody></table>',
      );
      expectIdempotent(mounted);
      mounted.editor.setHTML(
        '<table><tbody><tr><td rowspan="5000"><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td></tr></tbody></table>',
      );
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td rowspan="2"><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td></tr></tbody></table>',
      );
      // Valeurs non numériques, nulles ou négatives : 1 (attribut omis au rendu).
      mounted.editor.setHTML(
        '<table><tbody><tr><td colspan="abc" rowspan="0"><p>a</p></td><th colspan="-2"><p>b</p></th></tr></tbody></table>',
      );
      expect(attrsOf(mounted, 'tableCell')).toMatchObject({ colspan: 1, rowspan: 1 });
      expect(attrsOf(mounted, 'tableHeader')).toMatchObject({ colspan: 1, rowspan: 1 });
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td><p>a</p></td><th><p>b</p></th></tr></tbody></table>',
      );
      // Une fusion ordinaire reste intacte.
      mounted.editor.setHTML(
        '<table><tbody><tr><td colspan="2"><p>a</p></td></tr><tr><td><p>b</p></td><td><p>c</p></td></tr></tbody></table>',
      );
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td colspan="2"><p>a</p></td></tr><tr><td><p>b</p></td><td><p>c</p></td></tr></tbody></table>',
      );
    });
  });

  describe('align (session 4, L41-C)', () => {
    /** Élément `<table>` du premier tableau rendu dans `getHTML()`. */
    const outputTable = (): HTMLElement | null => {
      const template = document.createElement('template');
      template.innerHTML = bodyHtml(mounted.editor);
      return template.content.querySelector('table');
    };

    it('helpers purs : parseTableAlign, isTableAlign, tableAlignFallbackStyle', () => {
      const table = document.createElement('table');
      expect(parseTableAlign(table)).toBeNull();
      table.setAttribute('style', 'margin-left: auto; margin-right: auto');
      expect(parseTableAlign(table)).toBe('center');
      table.setAttribute('style', 'margin-left: AUTO');
      expect(parseTableAlign(table)).toBe('right');
      table.setAttribute('style', 'margin-right: auto');
      expect(parseTableAlign(table)).toBeNull();
      table.setAttribute(TABLE_ALIGN_ATTRIBUTE, 'Right');
      expect(parseTableAlign(table)).toBe('right');
      // Attribut inconnu : on retombe sur le style (ici `margin-right: auto` seul, rien).
      table.setAttribute(TABLE_ALIGN_ATTRIBUTE, 'justify');
      expect(parseTableAlign(table)).toBeNull();
      table.setAttribute('style', 'margin-left: auto');
      expect(parseTableAlign(table)).toBe('right');
      expect(isTableAlign('center')).toBe(true);
      expect(isTableAlign('middle')).toBe(false);
      expect(tableAlignFallbackStyle('center')).toBe('margin: 0 auto');
      expect(tableAlignFallbackStyle('right')).toBe('margin-left: auto');
      expect(tableAlignFallbackStyle('left')).toBeNull();
      expect(tableAlignFallbackStyle(null)).toBeNull();
    });

    it.each([
      ['center', '<table data-align="center"><tbody><tr><td><p>a</p></td></tr></tbody></table>'],
      ['right', '<table data-align="right"><tbody><tr><td><p>a</p></td></tr></tbody></table>'],
      ['left', '<table data-align="left"><tbody><tr><td><p>a</p></td></tr></tbody></table>'],
      [
        'après style et data-docx-style',
        '<table style="width: 450pt; border-top: 1pt solid #000000" data-docx-style="TableGrid" data-align="center"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      ],
    ])('%s : rendu exact (data-align seul) et idempotence', (_name, html) => {
      mounted.editor.setHTML(html);
      expect(bodyHtml(mounted.editor)).toBe(html);
      expectIdempotent(mounted);
    });

    it('relit l’ancienne forme margin auto et ne la réémet pas en style', () => {
      mounted.editor.setHTML(
        '<table style="margin-left: auto; margin-right: auto; width: 50%"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expect(attrsOf(mounted, 'table')).toMatchObject({ align: 'center', width: '50%' });
      expect(bodyHtml(mounted.editor)).toBe(
        '<table style="width: 50%" data-align="center"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expectIdempotent(mounted);
      mounted.editor.setHTML(
        '<table style="margin-left: auto"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expect(outputTable()?.getAttribute(TABLE_ALIGN_ATTRIBUTE)).toBe('right');
      expect(outputTable()?.getAttribute('style')).toBeNull();
    });

    it('une valeur inconnue est ignorée, align null n’émet rien', () => {
      mounted.editor.setHTML(
        '<table data-align="justify"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expect(attrsOf(mounted, 'table')).toMatchObject({ align: null });
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
    });

    it('la vue d’édition porte data-align et le CSS de repli, retirés quand l’attribut disparaît', () => {
      const editedTable = (): HTMLElement | null =>
        mounted.editor.contentElement.querySelector<HTMLElement>('.tableWrapper table');
      mounted.editor.setHTML(
        '<table style="width: 100%" data-align="center"><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      );
      expect(editedTable()?.getAttribute(TABLE_ALIGN_ATTRIBUTE)).toBe('center');
      expect(editedTable()?.style.marginLeft).toBe('auto');
      expect(editedTable()?.style.marginRight).toBe('auto');
      expect(editedTable()?.style.width).toBe('100%');
      const update = (align: string | null): void => {
        const pos = findNodePos(mounted.editor, 'table');
        const node = mounted.editor.tiptap.state.doc.nodeAt(pos);
        mounted.editor.tiptap.view.dispatch(
          mounted.editor.tiptap.state.tr.setNodeMarkup(pos, undefined, { ...node?.attrs, align }),
        );
      };
      update('right');
      expect(editedTable()?.style.marginLeft).toBe('auto');
      expect(editedTable()?.style.marginRight).toBe('');
      expect(editedTable()?.getAttribute(TABLE_ALIGN_ATTRIBUTE)).toBe('right');
      update(null);
      expect(editedTable()?.style.marginLeft).toBe('');
      expect(editedTable()?.getAttribute(TABLE_ALIGN_ATTRIBUTE)).toBeNull();
      expect(editedTable()?.style.width).toBe('100%');
    });
  });

  describe('cellules', () => {
    it.each([
      [
        'bordures',
        '<table><tbody><tr><td style="border-top: 0.5pt solid #000000; border-bottom: 0.5pt solid #000000"><p>a</p></td></tr></tbody></table>',
      ],
      [
        'bordures avec spacePt (padding-<côté>) puis padding composite, qui prime en CSS (session 4)',
        '<table><tbody><tr><td style="border-top: 0.5pt solid #000000; border-left: 0.5pt solid #000000; padding-top: 2pt; padding-left: 1pt; padding: 0pt 5.4pt 0pt 5.4pt"><p>a</p></td></tr></tbody></table>',
      ],
      [
        'fond',
        '<table><tbody><tr><td style="background-color: #d9d9d9"><p>a</p></td></tr></tbody></table>',
      ],
      [
        'alignement vertical',
        '<table><tbody><tr><td style="vertical-align: middle"><p>a</p></td></tr></tbody></table>',
      ],
      [
        'marges internes',
        '<table><tbody><tr><td style="padding: 2pt 4pt 2pt 4pt"><p>a</p></td></tr></tbody></table>',
      ],
      [
        'th avec tout',
        '<table><tbody><tr><th style="border-top: 1pt solid #000000; background-color: #eeeeee; vertical-align: bottom; padding: 0pt 5.4pt 0pt 5.4pt"><p>a</p></th></tr></tbody></table>',
      ],
      [
        'text-align Tiptap en premier, colspan et colwidth gardés (largeur calculée par Tiptap)',
        '<table style="width: 170px"><tbody><tr><td colspan="2" colwidth="80,90" style="text-align: center; background-color: #eeeeee"><p>a</p></td></tr>' +
          '<tr><td colwidth="80"><p>b</p></td><td colwidth="90"><p>c</p></td></tr></tbody></table>',
      ],
    ])('%s : rendu exact et idempotence', (_name, html) => {
      mounted.editor.setHTML(html);
      expect(bodyHtml(mounted.editor)).toBe(html);
      expectIdempotent(mounted);
    });

    it('arbitrage spacePt / paddingPt : chacun à sa place, un padding-* sans bordure est ignoré', () => {
      mounted.editor.setHTML(
        '<table><tbody><tr><td style="border-bottom: 1pt solid #000000; padding-bottom: 3pt; padding-top: 9pt; padding: 2pt"><p>a</p></td></tr></tbody></table>',
      );
      expect(attrsOf(mounted, 'tableCell')).toMatchObject({
        borders: [{ side: 'bottom', style: 'solid', widthPt: 1, color: '#000000', spacePt: 3 }],
        paddingPt: [2, 2, 2, 2],
      });
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td style="border-bottom: 1pt solid #000000; padding-bottom: 3pt; padding: 2pt 2pt 2pt 2pt"><p>a</p></td></tr></tbody></table>',
      );
      expectIdempotent(mounted);
      expect(
        cellLayoutDeclarations({
          borders: [{ side: 'top', style: 'solid', widthPt: 1, color: '#000000', spacePt: 2 }],
          paddingPt: [1, 1, 1, 1],
        }),
      ).toEqual(['border-top: 1pt solid #000000', 'padding-top: 2pt', 'padding: 1pt 1pt 1pt 1pt']);
    });

    it('relit les variantes : raccourci border, padding court, rgb()', () => {
      mounted.editor.setHTML(
        '<table><tbody><tr><td style="border: 1px solid rgb(0, 0, 0); padding: 2pt 4pt; background-color: #EEE"><p>a</p></td></tr></tbody></table>',
      );
      expect(attrsOf(mounted, 'tableCell')).toMatchObject({
        shading: '#eeeeee',
        paddingPt: [2, 4, 2, 4],
        verticalAlign: null,
      });
      expect(bodyHtml(mounted.editor)).toBe(
        '<table><tbody><tr><td style="border-top: 0.75pt solid #000000; border-right: 0.75pt solid #000000; ' +
          'border-bottom: 0.75pt solid #000000; border-left: 0.75pt solid #000000; background-color: #eeeeee; ' +
          'padding: 2pt 4pt 2pt 4pt"><p>a</p></td></tr></tbody></table>',
      );
      expectIdempotent(mounted);
    });

    it('les commandes de table (insertion, fusion) et le redimensionnement restent intacts', () => {
      mounted.editor.setHTML('<p>x</p>');
      mounted.editor.focus('end');
      expect(
        mounted.editor.commands.run('table.insert', { rows: 1, cols: 2, withHeaderRow: true }),
      ).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe(
        '<p>x</p><table><tbody><tr><th><p></p></th><th><p></p></th></tr></tbody></table>',
      );
      expect(mounted.editor.commands.canRun('table.addRowAfter')).toBe(true);
      expect(mounted.editor.commands.run('table.addRowAfter')).toBe(true);
      expect(mounted.editor.commands.run('table.deleteRow')).toBe(true);
      expect(mounted.editor.commands.run('table.delete')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe('<p>x</p>');
    });
  });

  describe('image', () => {
    it('height en attribut est conservé et idempotent, width et align aussi', () => {
      // L'image d'Aster est un bloc : pas de `<p>` autour.
      const html =
        '<img src="https://example.com/a.png" alt="a" width="120" height="80" data-align="center">';
      mounted.editor.setHTML(html);
      expect(bodyHtml(mounted.editor)).toBe(html);
      mounted.editor.setHTML(bodyHtml(mounted.editor));
      expect(bodyHtml(mounted.editor)).toBe(html);
    });
  });
});
