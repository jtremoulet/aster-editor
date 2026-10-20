import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AsterEditor, DocumentLayout } from '../api';
import { AsterEditorImpl } from '../editor/aster-editor';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { SECTION_COMMAND_IDS } from '../commands/sections';
import { PAGE_VIEW_CSS_VARIABLES, resolveSectionLayout } from './page-view';
import {
  MAX_SECTION_NUMBER,
  SECTION_BREAK_ATTRIBUTE,
  SECTION_BREAK_CLASS,
  SECTION_START_ATTRIBUTE,
  SET_CONTENT_META,
  findSectionBreaks,
  getSections,
  sanitizeSectionNumber,
  sectionBreakAttrs,
} from './section-break';
import { findNodePos, mountEditor, selectRange, type MountedEditor } from '../testing/mount';

const TWO_BREAKS = '<p>a</p><hr data-section-break="1"><p>b</p><hr data-section-break="2"><p>c</p>';

/** L'implémentation interne, qui porte `setPageView` et `getSectionLayout` (hors contrat). */
function impl(editor: AsterEditor): AsterEditorImpl {
  if (!(editor instanceof AsterEditorImpl)) {
    throw new Error('AsterEditorImpl attendu');
  }
  return editor;
}

/** Numéros `section` des sauts de premier niveau, dans l'ordre. */
function numbers(mounted: MountedEditor): number[] {
  return findSectionBreaks(mounted.editor.tiptap.state.doc).map(
    ({ node }) => sectionBreakAttrs(node).section,
  );
}

/** Les `hr` de saut de section rendus par le NodeView, dans l'ordre. */
function breakElements(mounted: MountedEditor): HTMLElement[] {
  return Array.from(
    mounted.editor.contentElement.querySelectorAll<HTMLElement>(`hr.${SECTION_BREAK_CLASS}`),
  );
}

/**
 * Frappe une touche par le vrai chemin de ProseMirror (`handleKeyDown` des plugins), et
 * rend vrai si un keymap l'a consommée (voir `tab.spec.ts`).
 */
function pressKey(mounted: MountedEditor, key: string): boolean {
  const { view } = mounted.editor.tiptap;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  return view.someProp('handleKeyDown', (handler) => handler(view, event)) === true;
}

/** Place le curseur dans le premier paragraphe dont le texte est `text`. */
function cursorIn(mounted: MountedEditor, text: string): void {
  let target = -1;
  mounted.editor.tiptap.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isTextblock && node.textContent === text) {
      target = pos + 1;
    }
    return target < 0;
  });
  if (target < 0) {
    throw new Error(`paragraphe ${text} introuvable`);
  }
  selectRange(mounted.editor, target, target);
}

const SECTIONS_LAYOUT: DocumentLayout = {
  page: { size: 'A4', orientation: 'portrait' },
  headers: { default: { html: '<p>Dernier</p>' } },
  sections: [
    {
      page: { size: 'A4', margins: { topMm: 10 } },
      headers: { default: { html: '<p>Premier</p>' } },
    },
    { page: { size: 'A4', orientation: 'landscape' }, start: 'continuous' },
    {
      page: { size: 'A4', orientation: 'portrait' },
      headers: { default: { html: '<p>Dernier</p>' } },
    },
  ],
};

describe('SectionBreak', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>a</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('sérialisation HTML', () => {
    it.each([
      ['un saut', '<p>a</p><hr data-section-break="1"><p>b</p>'],
      ['numéro quelconque gardé tel quel', '<p>a</p><hr data-section-break="2"><p>b</p>'],
      ['deux sauts', TWO_BREAKS],
      [
        'avec un saut de page et un séparateur',
        '<p>a</p><hr data-page-break=""><hr data-section-break="1"><hr><p>b</p>',
      ],
    ])('%s : rendu exact et idempotence stricte', (_name, html) => {
      mounted.editor.setHTML(html);
      expect(mounted.editor.getHTML()).toBe(html);
      mounted.editor.setHTML(mounted.editor.getHTML());
      expect(mounted.editor.getHTML()).toBe(html);
    });

    it('est un nœud sectionBreak distinct du horizontalRule, et le hr nu reste un horizontalRule', () => {
      mounted.editor.setHTML('<p>a</p><hr data-section-break="3"><hr><p>b</p>');
      const json = mounted.editor.getJSON();
      expect(json.content?.[1]).toEqual({ type: 'sectionBreak', attrs: { section: 3 } });
      expect(json.content?.[2]).toMatchObject({ type: 'horizontalRule' });
    });

    it('un numéro invalide retombe sur 1, à l’analyse comme au rendu', () => {
      mounted.editor.setHTML(
        '<p>a</p><hr data-section-break="abc"><hr data-section-break="0"><p>b</p>',
      );
      // Deux sauts adjacents reçoivent un paragraphe entre eux (R41-03) ; les numéros
      // chargés sont gardés tels quels, ici tous deux ramenés à 1.
      expect(mounted.editor.getHTML()).toBe(
        '<p>a</p><hr data-section-break="1"><p></p><hr data-section-break="1"><p>b</p>',
      );
      mounted.editor.setJSON({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
          { type: 'sectionBreak', attrs: { section: -2 } },
          { type: 'paragraph' },
        ],
      });
      expect(mounted.editor.getHTML()).toBe('<p>a</p><hr data-section-break="1"><p></p>');
      expect(sanitizeSectionNumber('7')).toBe(7);
      expect(sanitizeSectionNumber(2.5)).toBe(1);
      expect(sanitizeSectionNumber(null)).toBe(1);
    });

    it('un saut final est toujours suivi d’un paragraphe (TrailingNode)', () => {
      mounted.editor.setHTML('<p>a</p><hr data-section-break="1">');
      expect(mounted.editor.getHTML()).toBe('<p>a</p><hr data-section-break="1"><p></p>');
      expect(mounted.editor.tiptap.state.doc.lastChild?.type.name).toBe('paragraph');
    });

    it('getText ignore les sauts, getHTML resolve les laisse', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      expect(mounted.editor.getText()).toBe('a\nb\nc');
      expect(mounted.editor.getHTML({ variables: 'resolve' })).toBe(TWO_BREAKS);
    });
  });

  describe('getSections', () => {
    it('un document sans saut est la section 1 entière', () => {
      expect(getSections(mounted.editor)).toEqual([
        { from: 0, to: mounted.editor.tiptap.state.doc.content.size, section: 1 },
      ]);
    });

    it('découpe le document aux sauts de premier niveau, numéros positionnels', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      // `<p>a</p>` = 3, `<hr>` = 1.
      expect(getSections(mounted.editor)).toEqual([
        { from: 0, to: 3, section: 1 },
        { from: 4, to: 7, section: 2 },
        { from: 8, to: 11, section: 3 },
      ]);
      // Les numéros sont ceux de la position, pas de l'attribut.
      mounted.editor.setHTML('<p>a</p><hr data-section-break="5"><p>b</p>');
      expect(getSections(mounted.editor).map((range) => range.section)).toEqual([1, 2]);
    });

    it('ignore un saut imbriqué dans une citation, ramené à un hr simple (R41-08)', () => {
      mounted.editor.setHTML(
        '<blockquote><p>a</p><hr data-section-break="1"><p>b</p></blockquote>',
      );
      expect(getSections(mounted.editor)).toHaveLength(1);
      expect(mounted.editor.getHTML()).toBe('<blockquote><p>a</p><hr><p>b</p></blockquote><p></p>');
    });
  });

  describe('invariants du plugin (R41)', () => {
    /** Position du début du texte du premier bloc dont le contenu est `text`. */
    function startOf(text: string): number {
      let target = -1;
      mounted.editor.tiptap.state.doc.descendants((node, pos) => {
        if (target < 0 && node.isTextblock && node.textContent === text) {
          target = pos + 1;
        }
        return target < 0;
      });
      if (target < 0) {
        throw new Error(`bloc ${text} introuvable`);
      }
      return target;
    }

    it('R41-01 : un collage de plage qui remplace un saut par un autre renumérote (même nombre de sauts)', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      // Du début de `b` au début de `c` : la plage avale le saut 2, le collage en apporte un 9.
      mounted.editor.tiptap.commands.insertContentAt(
        { from: startOf('b'), to: startOf('c') },
        '<p>x</p><hr data-section-break="9"><p>y</p>',
      );
      expect(numbers(mounted)).toEqual([1, 2]);
      expect(mounted.editor.getHTML()).toBe(
        '<p>a</p><hr data-section-break="1"><p>x</p><hr data-section-break="2"><p>y</p><p>c</p>',
      );
      expect(breakElements(mounted).map((el) => el.getAttribute(SECTION_BREAK_ATTRIBUTE))).toEqual([
        '1',
        '2',
      ]);
    });

    it('R41-01 : déplacer un saut en une transaction (forme d’un drop) ou changer son attribut renumérote', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      const [first] = findSectionBreaks(mounted.editor.tiptap.state.doc);
      if (!first) {
        throw new Error('saut attendu');
      }
      const { state, view } = mounted.editor.tiptap;
      const tr = state.tr.delete(first.pos, first.pos + first.node.nodeSize);
      tr.insert(tr.doc.content.size, first.node.type.create(first.node.attrs));
      view.dispatch(tr);
      expect(mounted.editor.getHTML()).toBe(
        '<p>a</p><p>b</p><hr data-section-break="1"><p>c</p><hr data-section-break="2"><p></p>',
      );
      expect(getSections(mounted.editor).map((range) => range.section)).toEqual([1, 2, 3]);
      expect(breakElements(mounted).map((el) => el.getAttribute(SECTION_BREAK_ATTRIBUTE))).toEqual([
        '1',
        '2',
      ]);
      // Un changement d'attribut seul est ramené à 1..n lui aussi.
      const pos = findNodePos(mounted.editor, 'sectionBreak');
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { section: 42 }));
      expect(numbers(mounted)).toEqual([1, 2]);
    });

    it('R41-02 : Ctrl+A puis collage d’un HTML numéroté 7, 8 renumérote ; setHTML / setJSON gardent 7, 8', () => {
      mounted.editor.setHTML('<p>a</p><p>b</p>');
      mounted.editor.tiptap.commands.selectAll();
      mounted.editor.insertHTML(
        '<p>x</p><hr data-section-break="7"><p>y</p><hr data-section-break="8"><p>z</p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p>x</p><hr data-section-break="1"><p>y</p><hr data-section-break="2"><p>z</p>',
      );
      // Même forme de pas qu'un setContent (remplacement de 0 à la fin) : une édition.
      const size = mounted.editor.tiptap.state.doc.content.size;
      mounted.editor.tiptap.commands.insertContentAt(
        { from: 0, to: size },
        '<p>x</p><hr data-section-break="7"><p>y</p>',
      );
      expect(numbers(mounted)).toEqual([1]);
      // Seule la méta posée par replaceContent fait garder la numérotation reçue.
      const loaded = (section: number) =>
        mounted.editor.tiptap.schema.nodeFromJSON({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
            { type: 'sectionBreak', attrs: { section } },
            { type: 'paragraph' },
          ],
        }).content;
      const { view } = mounted.editor.tiptap;
      view.dispatch(
        view.state.tr
          .replaceWith(0, view.state.doc.content.size, loaded(7))
          .setMeta(SET_CONTENT_META, true),
      );
      expect(numbers(mounted)).toEqual([7]);
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, loaded(8)));
      expect(numbers(mounted)).toEqual([1]);
      mounted.editor.setHTML(
        '<p>x</p><hr data-section-break="7"><p>y</p><hr data-section-break="8"><p>z</p>',
      );
      expect(numbers(mounted)).toEqual([7, 8]);
      mounted.editor.setJSON(mounted.editor.getJSON());
      expect(numbers(mounted)).toEqual([7, 8]);
    });

    it('R41-06 : un numéro hors borne retombe sur 1 au rendu, setHTML(getHTML()) reste stable', () => {
      for (const section of [1e21, Number.MAX_SAFE_INTEGER + 2, 2 ** 53, MAX_SECTION_NUMBER + 1]) {
        mounted.editor.setJSON({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
            { type: 'sectionBreak', attrs: { section } },
            { type: 'paragraph' },
          ],
        });
        const first = mounted.editor.getHTML();
        expect(first).toBe('<p>a</p><hr data-section-break="1"><p></p>');
        mounted.editor.setHTML(first);
        expect(mounted.editor.getHTML()).toBe(first);
      }
      expect(MAX_SECTION_NUMBER).toBe(10_000);
      expect(sanitizeSectionNumber(MAX_SECTION_NUMBER)).toBe(MAX_SECTION_NUMBER);
      expect(sanitizeSectionNumber(MAX_SECTION_NUMBER + 1)).toBe(1);
      expect(sanitizeSectionNumber('1e+21')).toBe(1);
      mounted.editor.setHTML(`<p>a</p><hr data-section-break="${MAX_SECTION_NUMBER}"><p>b</p>`);
      expect(numbers(mounted)).toEqual([MAX_SECTION_NUMBER]);
    });

    it('R41-08 : un saut imbriqué (cellule, citation) redevient un hr simple, au chargement comme à l’édition', () => {
      mounted.editor.setHTML(
        '<table><tbody><tr><td><p>x</p><hr data-section-break="1"><p>y</p></td></tr></tbody></table><blockquote><p>q</p><hr data-section-break="1"></blockquote><p>c</p>',
      );
      const loaded =
        '<table><tbody><tr><td><p>x</p><hr><p>y</p></td></tr></tbody></table><blockquote><p>q</p><hr></blockquote><p>c</p>';
      expect(mounted.editor.getHTML()).toBe(loaded);
      expect(getSections(mounted.editor)).toHaveLength(1);
      expect(mounted.editor.commands.canRun('section.removeBreak')).toBe(false);
      expect(mounted.editor.commands.canRun('section.renumber')).toBe(false);
      // Un vrai saut après `c` est numéroté 1 : les « 1 » imbriqués d'avant ne comptent pas.
      cursorIn(mounted, 'c');
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        loaded.replace('<p>c</p>', '<p>c</p><hr data-section-break="1"><p></p>'),
      );
      // À l'édition : un saut inséré dans une cellule ne survit pas à la transaction.
      cursorIn(mounted, 'y');
      mounted.editor.tiptap.commands.insertContent('<hr data-section-break="5">');
      expect(numbers(mounted)).toEqual([1]);
      expect(mounted.editor.getHTML().match(/data-section-break/g)).toHaveLength(1);
      expect(mounted.editor.getHTML()).toContain('<td><p>x</p><hr><hr><p>y</p></td>');
    });
  });

  describe('commandes section.*', () => {
    it('sont enregistrées, hors contrat, avec leurs libellés fr et en', () => {
      expect(SECTION_COMMAND_IDS).toEqual([
        'section.insertBreak',
        'section.removeBreak',
        'section.renumber',
      ]);
      for (const id of SECTION_COMMAND_IDS) {
        expect(mounted.editor.commands.has(id)).toBe(true);
        expect(mounted.editor.commands.get(id)?.labelKey).toBe(`command.${id}`);
        expect(fr[`command.${id}`]).toBeTruthy();
        expect(en[`command.${id}`]).toBeTruthy();
      }
    });

    it('insertBreak insère après le bloc courant, numérote et place le curseur dans le bloc suivant', () => {
      mounted.editor.setHTML('<p>a</p><p>b</p>');
      cursorIn(mounted, 'a');
      expect(mounted.editor.commands.canRun('section.insertBreak')).toBe(true);
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><hr data-section-break="1"><p>b</p>');
      expect(mounted.editor.tiptap.state.selection.$from.parent.textContent).toBe('b');
      // Au milieu : le nouveau saut prend le numéro suivant et les suivants sont décalés.
      cursorIn(mounted, 'a');
      mounted.editor.tiptap.commands.insertContentAt(0, '<p>z</p>');
      cursorIn(mounted, 'z');
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p>z</p><hr data-section-break="1"><p>a</p><hr data-section-break="2"><p>b</p>',
      );
      expect(numbers(mounted)).toEqual([1, 2]);
    });

    it('insertBreak en fin de document crée le paragraphe suivant', () => {
      cursorIn(mounted, 'a');
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><hr data-section-break="1"><p></p>');
      expect(mounted.editor.tiptap.state.selection.from).toBe(5);
    });

    it('insertBreak depuis un bloc de liste ou de cellule insère après le bloc de premier niveau', () => {
      mounted.editor.setHTML('<ul><li><p>un</p></li><li><p>deux</p></li></ul><p>b</p>');
      cursorIn(mounted, 'un');
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<ul><li><p>un</p></li><li><p>deux</p></li></ul><hr data-section-break="1"><p>b</p>',
      );
    });

    it('insertBreak refuse quand la sélection est un saut', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'sectionBreak'));
      expect(mounted.editor.commands.canRun('section.insertBreak')).toBe(false);
      expect(mounted.editor.commands.run('section.insertBreak')).toBe(false);
      expect(mounted.editor.getHTML()).toBe(TWO_BREAKS);
    });

    it('removeBreak retire le saut sélectionné et renumérote', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'sectionBreak'));
      expect(mounted.editor.commands.run('section.removeBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p>b</p><hr data-section-break="1"><p>c</p>');
    });

    it('removeBreak sans sélection de saut retire celui qui clôt la section courante, sinon le dernier', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      cursorIn(mounted, 'a');
      expect(mounted.editor.commands.run('section.removeBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p>b</p><hr data-section-break="1"><p>c</p>');
      cursorIn(mounted, 'c');
      expect(mounted.editor.commands.run('section.removeBreak')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p>b</p><p>c</p>');
      expect(mounted.editor.commands.canRun('section.removeBreak')).toBe(false);
      expect(mounted.editor.commands.run('section.removeBreak')).toBe(false);
    });

    it('removeBreak { section } vise le saut par son numéro', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      expect(mounted.editor.commands.canRun('section.removeBreak', { section: 2 })).toBe(true);
      expect(mounted.editor.commands.canRun('section.removeBreak', { section: 9 })).toBe(false);
      expect(mounted.editor.commands.run('section.removeBreak', { section: 2 })).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><hr data-section-break="1"><p>b</p><p>c</p>');
    });

    it('renumber remet 1..n dans l’ordre et rend false s’il n’y a rien à faire', () => {
      mounted.editor.setHTML(
        '<p>a</p><hr data-section-break="4"><p>b</p><hr data-section-break="2"><p>c</p>',
      );
      expect(numbers(mounted)).toEqual([4, 2]);
      expect(mounted.editor.commands.run('section.renumber')).toBe(true);
      expect(numbers(mounted)).toEqual([1, 2]);
      expect(mounted.editor.commands.run('section.renumber')).toBe(false);
      mounted.editor.setHTML('<p>a</p>');
      expect(mounted.editor.commands.canRun('section.renumber')).toBe(false);
    });

    it('les commandes sont refusées en lecture seule', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      mounted.editor.setReadOnly(true);
      expect(mounted.editor.commands.canRun('section.insertBreak')).toBe(false);
      expect(mounted.editor.commands.run('section.removeBreak')).toBe(false);
      expect(mounted.editor.getHTML()).toBe(TWO_BREAKS);
    });
  });

  describe('suppression au clavier et renumérotation automatique', () => {
    it('Backspace au début du bloc suivant supprime le saut, comme un horizontalRule, et renumérote', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      cursorIn(mounted, 'b');
      expect(pressKey(mounted, 'Backspace')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p>b</p><hr data-section-break="1"><p>c</p>');
      // Même geste sur un `horizontalRule` : comportement identique.
      mounted.editor.setHTML('<p>a</p><hr><p>b</p>');
      cursorIn(mounted, 'b');
      expect(pressKey(mounted, 'Backspace')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p>b</p>');
    });

    it('Delete à la fin du bloc précédent supprime le saut et renumérote', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      selectRange(mounted.editor, 2, 2);
      expect(pressKey(mounted, 'Delete')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>a</p><p>b</p><hr data-section-break="1"><p>c</p>');
    });

    it('Backspace sur un saut sélectionné le supprime', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      const pos = findNodePos(mounted.editor, 'sectionBreak');
      mounted.editor.tiptap.commands.setNodeSelection(pos);
      expect(mounted.editor.tiptap.state.selection).toBeInstanceOf(NodeSelection);
      expect(pressKey(mounted, 'Backspace')).toBe(true);
      expect(numbers(mounted)).toEqual([1]);
    });

    it('une suppression de plage qui avale un saut renumérote aussi', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      // De la fin de `a` au début de `b` : le premier saut disparaît.
      mounted.editor.tiptap.commands.deleteRange({ from: 2, to: 5 });
      expect(mounted.editor.getHTML()).toBe('<p>ab</p><hr data-section-break="1"><p>c</p>');
    });

    it('un chargement complet garde la numérotation reçue, une frappe ne la touche pas', () => {
      mounted.editor.setHTML('<p>a</p><hr data-section-break="7"><p>b</p>');
      cursorIn(mounted, 'b');
      mounted.editor.tiptap.commands.insertContent('x');
      expect(mounted.editor.getHTML()).toBe('<p>a</p><hr data-section-break="7"><p>xb</p>');
    });

    it('undo après une suppression rend le saut et sa numérotation en une étape', () => {
      // Chargement hors historique : la suppression est la seule étape annulable.
      mounted.editor.setHTML(TWO_BREAKS, false);
      cursorIn(mounted, 'b');
      expect(pressKey(mounted, 'Backspace')).toBe(true);
      expect(numbers(mounted)).toEqual([1]);
      expect(mounted.editor.commands.run('undo')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(TWO_BREAKS);
      expect(mounted.editor.commands.canRun('undo')).toBe(false);
    });
  });

  describe('vue page par section (L41-D)', () => {
    it('resolveSectionLayout : sections[n - 1], sinon le premier niveau', () => {
      expect(resolveSectionLayout(SECTIONS_LAYOUT, 2)).toBe(SECTIONS_LAYOUT.sections?.[1]);
      const plain: DocumentLayout = { page: { size: 'A5' }, columns: 2, lang: 'fr-FR' };
      expect(resolveSectionLayout(plain, 1)).toEqual({ page: { size: 'A5' }, columns: 2 });
      expect(resolveSectionLayout(plain, 3)).toEqual({ page: { size: 'A5' }, columns: 2 });
      expect(resolveSectionLayout({}, 1)).toEqual({});
      // Hors plage avec des sections : le premier niveau, copie de la dernière section.
      expect(resolveSectionLayout(SECTIONS_LAYOUT, 9)).toEqual({
        page: SECTIONS_LAYOUT.page,
        headers: SECTIONS_LAYOUT.headers,
      });
    });

    it('getSectionLayout : null hors vue page, section n sinon, repli premier niveau', () => {
      const editor = impl(mounted.editor);
      expect(editor.getSectionLayout(1)).toBeNull();
      editor.setPageView({ layout: SECTIONS_LAYOUT });
      expect(editor.getSectionLayout(2)).toBe(SECTIONS_LAYOUT.sections?.[1]);
      editor.setPageView({ layout: { page: { size: 'Letter' } } });
      expect(editor.getSectionLayout(1)).toEqual({ page: { size: 'Letter' } });
      expect(editor.getSectionLayout(4)).toEqual({ page: { size: 'Letter' } });
    });

    it('l’hôte porte les variables et l’en-tête de la section 1, pas du premier niveau', () => {
      const editor = impl(mounted.editor);
      editor.setPageView({ layout: SECTIONS_LAYOUT });
      expect(mounted.element.style.getPropertyValue('--aster-page-margin-top')).toBe('10mm');
      expect(mounted.element.style.getPropertyValue('--aster-page-width')).toBe('210mm');
      expect(mounted.element.querySelector('.aster-page-header')?.innerHTML).toBe('<p>Premier</p>');
    });

    it('chaque hr reçoit les variables --aster-page-* et data-section-start de la section suivante', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      const editor = impl(mounted.editor);
      const [first, second] = breakElements(mounted);
      expect(first?.getAttribute(SECTION_BREAK_ATTRIBUTE)).toBe('1');
      expect(first?.getAttribute('style')).toBeNull();
      expect(first?.hasAttribute(SECTION_START_ATTRIBUTE)).toBe(false);

      editor.setPageView({ layout: SECTIONS_LAYOUT });
      // Section 2 : A4 paysage, continue.
      expect(first?.style.getPropertyValue('--aster-page-width')).toBe('297mm');
      expect(first?.style.getPropertyValue('--aster-page-height')).toBe('210mm');
      expect(first?.getAttribute(SECTION_START_ATTRIBUTE)).toBe('continuous');
      // Section 3 : A4 portrait, saut de page par défaut.
      expect(second?.style.getPropertyValue('--aster-page-width')).toBe('210mm');
      expect(second?.getAttribute(SECTION_START_ATTRIBUTE)).toBe('nextPage');
      for (const name of PAGE_VIEW_CSS_VARIABLES) {
        expect(second?.style.getPropertyValue(name)).toMatch(/^\d+(?:\.\d+)?mm$/);
      }
      // Le HTML exporté n'en porte rien.
      expect(mounted.editor.getHTML()).toBe(TWO_BREAKS);

      // Retrait de la vue page : tout disparaît du hr.
      editor.setPageView(false);
      expect(first?.getAttribute('style')).toBeNull();
      expect(first?.hasAttribute(SECTION_START_ATTRIBUTE)).toBe(false);
    });

    it('sans layout.sections, le hr ne porte aucune variable même en vue page', () => {
      mounted.editor.setHTML(TWO_BREAKS);
      impl(mounted.editor).setPageView({ layout: { page: { size: 'Letter' } } });
      const [first] = breakElements(mounted);
      expect(first?.getAttribute('style')).toBeNull();
    });

    it('un saut inséré en vue page active reçoit ses variables, et suit sa renumérotation', () => {
      mounted.editor.setHTML('<p>a</p><p>b</p>');
      impl(mounted.editor).setPageView({ layout: SECTIONS_LAYOUT });
      cursorIn(mounted, 'a');
      mounted.editor.commands.run('section.insertBreak');
      const [first] = breakElements(mounted);
      expect(first?.getAttribute(SECTION_BREAK_ATTRIBUTE)).toBe('1');
      expect(first?.style.getPropertyValue('--aster-page-width')).toBe('297mm');
      // Un saut inséré avant renumérote celui-ci en 2 → variables de la section 3.
      mounted.editor.tiptap.commands.insertContentAt(0, '<p>z</p>');
      cursorIn(mounted, 'z');
      mounted.editor.commands.run('section.insertBreak');
      const elements = breakElements(mounted);
      expect(elements.map((el) => el.getAttribute(SECTION_BREAK_ATTRIBUTE))).toEqual(['1', '2']);
      expect(elements[1]?.style.getPropertyValue('--aster-page-width')).toBe('210mm');
      expect(elements[1]?.getAttribute(SECTION_START_ATTRIBUTE)).toBe('nextPage');
    });
  });
});
