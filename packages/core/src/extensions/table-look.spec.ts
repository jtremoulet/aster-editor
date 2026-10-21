import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TABLE_LOOK_FLAGS } from '../api';
import {
  TABLE_LOOK_ATTRIBUTE,
  isTableLookFlag,
  parseTableLook,
  sanitizeTableLook,
  tableLookValue,
} from './table-look';
import { tableLayoutHtmlAttributes } from './table-layout';
import { bodyHtml, findNodePos, mountEditor, type MountedEditor } from '../testing/mount';

/** `setHTML(getHTML())` doit redonner exactement le même HTML (sans le paragraphe final). */
function expectIdempotent(mounted: MountedEditor): string {
  const html = bodyHtml(mounted.editor);
  mounted.editor.setHTML(html);
  expect(bodyHtml(mounted.editor)).toBe(html);
  return html;
}

function tableAttrs(mounted: MountedEditor): Record<string, unknown> {
  const pos = findNodePos(mounted.editor, 'table');
  return mounted.editor.tiptap.state.doc.nodeAt(pos)?.attrs ?? {};
}

const CELL = '<tbody><tr><td><p>a</p></td></tr></tbody>';

describe('TableLook (session 4, L49)', () => {
  describe('helpers purs', () => {
    it('parseTableLook ignore les drapeaux inconnus, la casse approximative et les doublons', () => {
      expect(TABLE_LOOK_ATTRIBUTE).toBe('data-docx-look');
      expect(parseTableLook('firstRow firstColumn noVBand')).toEqual({
        firstRow: true,
        firstColumn: true,
        noVBand: true,
      });
      expect(parseTableLook('  noVBand   firstRow  firstRow ')).toEqual({
        firstRow: true,
        noVBand: true,
      });
      expect(parseTableLook('FirstRow firstrow NOVBAND bogus lastRow')).toEqual({ lastRow: true });
      expect(parseTableLook('bogus')).toBeNull();
      expect(parseTableLook('')).toBeNull();
      expect(parseTableLook(null)).toBeNull();
      expect(parseTableLook(undefined)).toBeNull();
      expect(isTableLookFlag('noHBand')).toBe(true);
      expect(isTableLookFlag('nohband')).toBe(false);
      expect(isTableLookFlag(3)).toBe(false);
    });

    it('tableLookValue sérialise les drapeaux à vrai dans l’ordre du contrat, null sans drapeau', () => {
      expect(tableLookValue({ noVBand: true, firstRow: true, firstColumn: true })).toBe(
        'firstRow firstColumn noVBand',
      );
      expect(tableLookValue({ firstRow: false, lastRow: true, bogus: true })).toBe('lastRow');
      expect(tableLookValue({ firstRow: 'yes', lastRow: 1 })).toBeNull();
      expect(tableLookValue({})).toBeNull();
      expect(tableLookValue(null)).toBeNull();
      expect(tableLookValue(undefined)).toBeNull();
      expect(tableLookValue('firstRow')).toBeNull();
      const all = Object.fromEntries(TABLE_LOOK_FLAGS.map((flag) => [flag, true]));
      expect(tableLookValue(all)).toBe('firstRow lastRow firstColumn lastColumn noHBand noVBand');
      expect(sanitizeTableLook({ noHBand: true, firstRow: false })).toEqual({ noHBand: true });
      expect(sanitizeTableLook({ firstRow: false })).toBeNull();
    });

    it('tableLayoutHtmlAttributes émet data-docx-look en dernier', () => {
      expect(
        Object.entries(
          tableLayoutHtmlAttributes({
            width: '100%',
            docxStyle: 'TableGrid',
            align: 'center',
            look: { noVBand: true, firstRow: true },
          }),
        ),
      ).toEqual([
        ['style', 'width: 100%'],
        ['data-docx-style', 'TableGrid'],
        ['data-align', 'center'],
        ['data-docx-look', 'firstRow noVBand'],
      ]);
      expect(tableLayoutHtmlAttributes({ look: {} })).toEqual({});
      expect(tableLayoutHtmlAttributes({ look: null })).toEqual({});
    });
  });

  describe('attribut look de la table', () => {
    let mounted: MountedEditor;

    beforeEach(() => {
      mounted = mountEditor();
    });

    afterEach(() => {
      mounted.cleanup();
    });

    it('relit data-docx-look, le réémet dans l’ordre des drapeaux après data-align, idempotent', () => {
      mounted.editor.setHTML(
        `<table style="width: 100%" data-docx-style="AsterConditional" data-align="center" data-docx-look="noVBand firstRow">${CELL}</table>`,
      );
      expect(tableAttrs(mounted)['look']).toEqual({ firstRow: true, noVBand: true });
      expect(expectIdempotent(mounted)).toBe(
        `<table style="width: 100%" data-docx-style="AsterConditional" data-align="center" data-docx-look="firstRow noVBand">${CELL}</table>`,
      );
    });

    it('drapeaux inconnus ignorés, doublons fusionnés, casse exacte ; aucun drapeau connu → rien', () => {
      mounted.editor.setHTML(
        `<table data-docx-look="firstRow FirstRow bogus firstRow lastColumn">${CELL}</table>`,
      );
      expect(tableAttrs(mounted)['look']).toEqual({ firstRow: true, lastColumn: true });
      expect(expectIdempotent(mounted)).toBe(
        `<table data-docx-look="firstRow lastColumn">${CELL}</table>`,
      );
      mounted.editor.setHTML(`<table data-docx-look="bogus">${CELL}</table>`);
      expect(tableAttrs(mounted)['look']).toBeNull();
      expect(expectIdempotent(mounted)).toBe(`<table>${CELL}</table>`);
      mounted.editor.setHTML(`<table data-docx-look="">${CELL}</table>`);
      expect(tableAttrs(mounted)['look']).toBeNull();
      expect(bodyHtml(mounted.editor)).toBe(`<table>${CELL}</table>`);
    });

    it('un look posé par setNodeMarkup est rendu, un look vide ou à faux n’émet rien', () => {
      mounted.editor.setHTML(`<table>${CELL}</table>`);
      const pos = findNodePos(mounted.editor, 'table');
      const node = mounted.editor.tiptap.state.doc.nodeAt(pos);
      mounted.editor.tiptap.view.dispatch(
        mounted.editor.tiptap.state.tr.setNodeMarkup(pos, undefined, {
          ...node?.attrs,
          look: { lastRow: true, firstRow: false, noHBand: true },
        }),
      );
      expect(bodyHtml(mounted.editor)).toBe(
        `<table data-docx-look="lastRow noHBand">${CELL}</table>`,
      );
      expectIdempotent(mounted);
      mounted.editor.tiptap.view.dispatch(
        mounted.editor.tiptap.state.tr.setNodeMarkup(pos, undefined, {
          ...node?.attrs,
          look: { firstRow: false },
        }),
      );
      expect(bodyHtml(mounted.editor)).toBe(`<table>${CELL}</table>`);
    });

    it('la vue d’édition porte data-docx-look et le retire quand l’attribut disparaît', () => {
      const editedTable = (): HTMLElement | null =>
        mounted.editor.contentElement.querySelector<HTMLElement>('.tableWrapper table');
      mounted.editor.setHTML(`<table data-docx-look="firstRow noVBand">${CELL}</table>`);
      expect(editedTable()?.getAttribute('data-docx-look')).toBe('firstRow noVBand');
      const pos = findNodePos(mounted.editor, 'table');
      const node = mounted.editor.tiptap.state.doc.nodeAt(pos);
      mounted.editor.tiptap.view.dispatch(
        mounted.editor.tiptap.state.tr.setNodeMarkup(pos, undefined, {
          ...node?.attrs,
          look: null,
        }),
      );
      expect(editedTable()?.getAttribute('data-docx-look')).toBeNull();
      expect(bodyHtml(mounted.editor)).toBe(`<table>${CELL}</table>`);
    });
  });
});
